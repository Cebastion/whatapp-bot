import makeWASocket, {
    DisconnectReason,
    jidNormalizedUser,
    prepareWAMessageMedia,
    useMultiFileAuthState
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { sendButtons } from 'baileys_helpers'
import {sendInteractiveMessage} from "baileys_helper/helpers/buttons.js";
import fs from "fs";
import path from "path";

const bot = {
    connect: async () => {
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
                    bot.connect()
                }
            } else if (connection === 'open') {
                console.log('opened connection')
                console.log('sock.user:', JSON.stringify(sock.user, undefined, 2))
            }
        })

        sock.ev.on('creds.update', saveCreds)

        return sock
    },
    next: () => {},
    previous: () => {},
    showGame: async (sock, remoteJid) => {
        try {
            const imagePath = path.resolve('./image/img.png');

            // Проверяем, существует ли файл
            if (!fs.existsSync(imagePath)) {
                console.error('❌ Картинка не найдена:', imagePath);
                return;
            }

            // 1. Сначала загружаем картинку на сервер WhatsApp и формируем медиа-сообщение
            const mediaMessage = await prepareWAMessageMedia(
                { image: fs.readFileSync(imagePath) },
                { upload: sock.waUploadToServer } // Обязательный параметр для загрузки медиа
            );

            // 2. Формируем интерактивное сообщение с кнопками и картинкой
            const interactiveMessage = {
                header: {
                    hasMediaAttachment: true,
                    imageMessage: mediaMessage.imageMessage // Прикрепляем загруженную картинку
                },
                body: {
                    text: 'Приветствую!\n\nВыберите следующую игру:'
                },
                footer: {
                    text: 'Меню управления'
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'Next game',
                                id: 'next'
                            })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: 'Previous game',
                                id: 'previous'
                            })
                        }
                    ]
                }
            };

            // 3. Отправляем собранное сообщение
            await sendInteractiveMessage(sock, remoteJid, { interactiveMessage });

            console.log('✅ Сообщение с картинкой и кнопками успешно отправлено!');
        } catch (error) {
            console.error('❌ Ошибка при отправке:', error);
        }
    },
    showProposal: () => {},
    welcomeMessage: async  (sock, remoteJid) => {
        try {
            await sendButtons(sock, remoteJid, {
                text: 'Hello! Welcome to domenBot\n' +
                    'What would you like to see in our catalogue?',
                buttons: [
                    { id: 'games', text: 'Show games' },
                    { id: 'proposal', text: 'Show proposals' },
                ]
            })
        } catch(error) {
            console.error('[Error send welcome message]: ', error)
        }
    },
    watchMessage: (sock) => {
        sock.ev.on('messages.upsert', async (event) => {
            if (event.type !== 'notify') return

            for (const msg of event.messages) {
                const chatJid = msg.key.remoteJid

                const btnId = msg.message.buttonsResponseMessage?.selectedButtonId
                    || msg.message.templateButtonReplyMessage?.selectedId

                switch (btnId){
                    case 'proposal':
                        bot.showProposal()
                        break
                    case 'games':
                       await bot.showGame(sock, chatJid)
                        break
                    default:
                        await  bot.welcomeMessage(sock, chatJid)
                        break
                }
            }
        })
    }
}

export  { bot }