import makeWASocket, {DisconnectReason, jidNormalizedUser, useMultiFileAuthState} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { sendButtons } from 'baileys_helpers'

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
                    this.connect()
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
    showGame: () => {},
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

            await  this.welcomeMessage(sock, event.messages[0].key.remoteJid)

            for (const msg of event.messages) {
                const chatJid = msg.key.remoteJid

                const btnId = msg.message.buttonsResponseMessage?.selectedButtonId
                    || msg.message.templateButtonReplyMessage?.selectedId

                switch (btnId){
                    case 'proposal':
                        this.showProposal()
                        break
                    case 'games':
                        this.showGame()
                        break
                    default:
                        await  this.welcomeMessage(sock, chatJid)
                        break
                }
            }
        })
    }
}

export  { bot }