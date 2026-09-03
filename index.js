import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    jidNormalizedUser,
    generateWAMessageFromContent,
    proto
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import baileys_helper  from 'baileys_helper';

// ── Настройка тестового режима ────────────────────────────────────────────
// true  -> бот будет реагировать на сообщения, которые вы сами пишете себе
//          в чате "Вы" (Message Yourself), удобно для тестирования без
//          второго номера
// false -> обычное поведение, бот игнорирует свои же исходящие сообщения
const SELF_CHAT_TEST_MODE = process.env.SELF_TEST === '1'


// Маркер, чтобы бот не отвечал сам себе бесконечно в self-chat режиме
const BOT_REPLY_MARKER = '🤖'

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

    const sock = makeWASocket({
        auth: state
    })

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) {
            qrcode.generate(qr, { small: true })
        }
        if (connection === 'close') {
            const shouldReconnect =
                (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect)
            if (shouldReconnect) {
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('opened connection')
            console.log('sock.user:', JSON.stringify(sock.user, undefined, 2))
            if (SELF_CHAT_TEST_MODE) {
                console.log('⚠️  SELF_CHAT_TEST_MODE включён: бот будет отвечать на сообщения в чате "Вы"')
            }
        }
    })

    sock.ev.on('messages.upsert', async (event) => {
        // DEBUG: печатаем вообще любое событие messages.upsert, ещё до всех фильтров.
        // Если этот блок молчит совсем — проблема не в фильтрах, а в том, что
        // событие вообще не долетает (см. пояснение под кодом).
        console.log('--- messages.upsert event, type:', event.type, '---')

        if (event.type !== 'notify') return

        const myJid = jidNormalizedUser(sock.user.id)
        // В новых версиях протокола self-chat может приходить как @lid,
        // а не как обычный @s.whatsapp.net — поэтому сверяемся ещё и с ним
        const myLid = sock.user.lid ? jidNormalizedUser(sock.user.lid) : null

        for (const m of event.messages) {
            const chatJid = m.key.remoteJid
            const normalizedChatJid = jidNormalizedUser(chatJid)
            const isSelfChat = normalizedChatJid === myJid || (myLid && normalizedChatJid === myLid)

            // DEBUG: показываем, что видит фильтр, для каждого сообщения
            console.log({
                chatJid,
                myJid,
                myLid,
                isSelfChat,
                fromMe: m.key.fromMe,
                text: extractText(m)
            })

            // Обычные чаты: как и раньше, пропускаем свои же исходящие
            // if (m.key.fromMe && !(SELF_CHAT_TEST_MODE && isSelfChat)) {
            //     console.log('пропущено (fromMe и не self-test)')
            //     continue
            // }

            const text = extractText(m)

            // Ответ на нажатие native flow кнопки (если она отрисовалась)
            const interactiveReply = m.message?.interactiveResponseMessage?.nativeFlowResponseMessage
            if (interactiveReply) {
                let paramsObj = {}
                try {
                    paramsObj = JSON.parse(interactiveReply.paramsJson || '{}')
                } catch {}
                console.log('нажата native flow кнопка:', interactiveReply.name, paramsObj)
                await sock.sendMessage(chatJid, { text: `${BOT_REPLY_MARKER} Вы нажали кнопку: ${paramsObj.id || interactiveReply.name}` })
                continue
            }

            // Ответ на выбор из списка (если list-message всё же отрисовался
            // и пользователь выбрал строку)
            const listReply = m.message?.listResponseMessage?.singleSelectReply?.selectedRowId
            if (listReply) {
                console.log('выбрано из списка:', listReply)
                await sock.sendMessage(chatJid, { text: `${BOT_REPLY_MARKER} Вы выбрали в списке: ${listReply}` })
                continue
            }

            // Защита от бесконечного цикла в self-chat:
            // не реагируем на собственные ответы бота
            // if (SELF_CHAT_TEST_MODE && isSelfChat && text?.startsWith(BOT_REPLY_MARKER)) {
            //     console.log('пропущено (это ответ самого бота)')
            //     continue
            // }

            console.log('отвечаю в чат:', chatJid)

            // Реальные кнопки (templateButtons/buttons) WhatsApp давно перестал
            // рендерить для обычных аккаунтов — сообщение либо приходит без
            // кнопок, либо не доставляется вовсе. Поэтому основной канал —
            // текстовое меню с номерами (работает всегда). Дополнительно
            // пробуем list-message: на части клиентов/версий он ещё рисуется,
            // но полагаться только на него нельзя.


            // Дополнительная попытка через native flow кнопки (best-effort,
            // экспериментально — см. комментарий у функции ниже).
            try {
                await sendNativeFlowButtons(sock, chatJid, {
                    body: 'Native flow меню:',
                    footer: 'Мой бот',
                    buttons: [
                        { id: 'nf_site', text: 'Открыть сайт', url: 'https://example.com' },
                        { id: 'nf_yes', text: 'Ответить да' }
                    ]
                })
                console.log('native flow кнопки отправлены (рендер не гарантирован)')
            } catch (err) {
                console.log('native flow кнопки не отправлены:', err.message)
            }

            // Дополнительная попытка через list-message (best-effort).
            // Может не отрисоваться или прийти как пустой текст —
            // это нормально, поэтому оборачиваем в try/catch и не падаем.
            try {
                await baileys_helper.sendButtons(sock, chatJid, {
                    title: 'Header Title',            // optional header
                    text: 'Pick one option below',    // body
                    footer: 'Footer text',            // optional footer
                    buttons: [
                        { id: 'quick_1', text: 'Quick Reply' },       // legacy simple shape auto‑converted
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'Open Site',
                                url: 'https://example.com'
                            })
                        }
                    ]
                });
                console.log('list-message отправлен (доставка/рендер не гарантированы)')
            } catch (err) {
                console.log('list-message не отправлен:', err.message)
            }
        }

    })

    // Save credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds)
}

// Достаём текст из разных типов сообщений (обычный текст, extended text, caption и т.д.)
function extractText(m) {
    const msg = m.message
    if (!msg) return ''
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        ''
    )
}

// ── Ручная отправка native flow кнопок (interactiveMessage) ────────────────
//
// Публичный sock.sendMessage() в этой версии Baileys не принимает
// interactiveMessage напрямую — его нет в типе AnyMessageContent.
// Поэтому собираем сообщение вручную через generateWAMessageFromContent
// и отправляем через sock.relayMessage(), добавляя недостающий бинарный
// узел `bot`, без которого сервер WhatsApp не отрисовывает интерактивные
// элементы в приватных (1:1) чатах.
//
// ВАЖНО: это неофициальный, экспериментальный путь. Формат протокола может
// измениться в любом обновлении WhatsApp без предупреждения, гарантий
// доставки/рендера нет, а сам факт обхода ограничений для обычных аккаунтов
// повышает риск бана номера. Используйте на свой страх и риск, лучше на
// тестовом номере, а не на основном.
async function sendNativeFlowButtons(sock, jid, { body, footer, buttons }) {
    // buttons: [{ id: 'opt_1', text: 'Опция 1' }, { id: 'site', text: 'Открыть сайт', url: 'https://example.com' }]
    const nativeButtons = buttons.map((b) => {
        if (b.url) {
            return {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({ display_text: b.text, url: b.url })
            }
        }
        return {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.text, id: b.id })
        }
    })

    const message = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
                        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || '' }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: nativeButtons
                        })
                    })
                }
            }
        },
        { userJid: jidNormalizedUser(sock.user.id) }
    )

    // Недостающий узел, без которого приватные чаты не рендерят interactiveMessage.
    // Публичный тип MessageRelayOptions поддерживает additionalNodes — используем его.
    const additionalNodes = [
        { tag: 'biz', attrs: {}, content: [{ tag: 'bot', attrs: { biz_bot: '1' }, content: undefined }] }
    ]

    await sock.relayMessage(jid, message.message, {
        messageId: message.key.id,
        additionalNodes
    })
}

connectToWhatsApp()