import makeWASocket, {
    DisconnectReason,
    jidNormalizedUser,
    prepareWAMessageMedia,
    useMultiFileAuthState
} from "@whiskeysockets/baileys";
import { sendButtons } from 'baileys_helpers'
import {sendInteractiveMessage} from "baileys_helper/helpers/buttons.js";
import fs from "fs";
import path from "path";
import {games} from "./games.js";
import {isValidEmail} from "./helper.js";

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxKA5iW4i-duFJfl0zsxDD3u7aPsHUq38oNGpbUaIsb9DiGBb02kJjG63dEjze1aIBp/exec'
const PHONE_NUMBER = '380965576269' // только цифры, с кодом страны, без +
let index_game = 0

const bot = {
    connect: async () => {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

        const sock = makeWASocket({
            auth: state
            // printQRInTerminal убран — он deprecated и не нужен для pairing code
        })

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update

            // qr всё равно "срабатывает" в режиме pairing code — используем это
            // как триггер для запроса кода, если устройство ещё не зарегистрировано
            if (qr && !sock.authState.creds.registered) {
                try {
                    const code = await sock.requestPairingCode(PHONE_NUMBER)
                    console.log(`\n🔑 Pairing code: ${code}\n`)
                    console.log('Откройте WhatsApp → Настройки → Связанные устройства → Привязать устройство → "Привязать по номеру телефона" и введите этот код.')
                } catch (err) {
                    console.error('❌ Не удалось получить pairing code:', err)
                }
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log('connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
                if (shouldReconnect) {
                    setTimeout(() => bot.connect(), 3000);
                }
            } else if (connection === 'open') {
                console.log('opened connection')
                console.log('sock.user:', JSON.stringify(sock.user, undefined, 2))
            }
        })

        sock.ev.on('creds.update', saveCreds)

        return sock
    },
    sendLead: async (data) => {
        console.log(data)
        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify({email: data})
            });

            const result = await response.json();

            if (result.ok) {
                console.log('Данные успешно отправлены:', result);
            } else {
                console.error('Ошибка в скрипте:', result.error);
            }
        } catch (error) {
            console.error('Ошибка запроса:', error);
        }
    },
    next: async (sock, remoteJid) => {
        try {
            index_game++;

            if(index_game > games.length) {
                index_game = 0
            }

            const game = games[index_game]

            const imagePath = path.resolve(`./image/${game.image}`);

            if (!fs.existsSync(imagePath)) {
                console.error('❌ Картинка не найдена:', imagePath);
                return;
            }

            const mediaMessage = await prepareWAMessageMedia(
                { image: fs.readFileSync(imagePath) },
                { upload: sock.waUploadToServer }
            );

            const interactiveMessage = {
                header: {
                    hasMediaAttachment: true,
                    imageMessage: mediaMessage.imageMessage
                },
                body: {
                    text: game.title
                },
                footer: {
                    text: 'Меню управления'
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Game",
                                url: game.link
                            })
                        },
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

            await sendInteractiveMessage(sock, remoteJid, { interactiveMessage });

            console.log('✅ Сообщение с картинкой и кнопками успешно отправлено!');
        } catch (error) {
            console.error('❌ Ошибка при отправке:', error);
        }
    },
    previous: async (sock, remoteJid) => {
        try {
            index_game--;

            if(index_game === -1){
                index_game = 0
            }

            const game = games[index_game]

            const imagePath = path.resolve(`./image/${game.image}`);

            if (!fs.existsSync(imagePath)) {
                console.error('❌ Картинка не найдена:', imagePath);
                return;
            }

            const mediaMessage = await prepareWAMessageMedia(
                { image: fs.readFileSync(imagePath) },
                { upload: sock.waUploadToServer }
            );

            const interactiveMessage = {
                header: {
                    hasMediaAttachment: true,
                    imageMessage: mediaMessage.imageMessage
                },
                body: {
                    text: game.title
                },
                footer: {
                    text: 'Меню управления'
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Game",
                                url: game.link
                            })
                        },
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

            await sendInteractiveMessage(sock, remoteJid, { interactiveMessage });

            console.log('✅ Сообщение с картинкой и кнопками успешно отправлено!');
        } catch (error) {
            console.error('❌ Ошибка при отправке:', error);
        }
    },
    showGame: async (sock, remoteJid) => {
        try {
            const game = games[0]
            const imagePath = path.resolve(`./image/${game.image}`);

            if (!fs.existsSync(imagePath)) {
                console.error('❌ Картинка не найдена:', imagePath);
                return;
            }

            const mediaMessage = await prepareWAMessageMedia(
                { image: fs.readFileSync(imagePath) },
                { upload: sock.waUploadToServer }
            );

            const interactiveMessage = {
                header: {
                    hasMediaAttachment: true,
                    imageMessage: mediaMessage.imageMessage
                },
                body: {
                    text: game.title
                },
                footer: {
                    text: 'Меню управления'
                },
                nativeFlowMessage: {
                    buttons: [
                        {
                            name: 'open_game',
                            buttonParamsJson: JSON.stringify({
                                display_text: "Open Game",
                                url: game.link
                            })
                        },
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

            await sendInteractiveMessage(sock, remoteJid, { interactiveMessage });

            console.log('✅ Сообщение с картинкой и кнопками успешно отправлено!');
        } catch (error) {
            console.error('❌ Ошибка при отправке:', error);
        }
    },
    showProposal: () => {},
    welcomeMessage: async (sock, remoteJid, msg) => {
        const text = msg.message.extendedTextMessage?.text || msg.message.conversation;
        console.log("msg: ", msg);

        if (isValidEmail(text)) {
            await bot.sendLead(text);

            try {
                await sendButtons(sock, remoteJid, {
                    text: 'Thank you! Your email has been saved.\n\nWhat would you like to see in our catalogue?',
                    buttons: [
                        { id: 'games', text: 'Show games' },
                        { id: 'proposal', text: 'Show proposals' },
                    ]
                });
            } catch (error) {
                console.error('[Error send buttons]: ', error);
            }
        } else {
            await sock.sendMessage(remoteJid, {
                text: 'Hello! Welcome to domenBot 👋\n\nPlease enter your email address to continue:'
            });
        }
    },
    watchMessage: (sock) => {
        sock.ev.on('messages.upsert', async (event) => {
            try{
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
                        case 'next':
                            await  bot.next(sock, chatJid)
                            break
                        case 'previous':
                            await bot.previous(sock, chatJid)
                            break
                        default:
                            await  bot.welcomeMessage(sock, chatJid, msg)
                            break
                    }
                }
            } catch (error) {
                console.error('[Error send buttons]: ', error);
            }

        })
    }
}

export  { bot }