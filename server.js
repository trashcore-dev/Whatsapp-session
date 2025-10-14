const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static('public')); // serve index.html

const PORT = process.env.PORT || 3000;

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

// helper to generate a random id for temp folders
const makeid = (length = 6) => {
    let result = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
};

app.post('/request-code', async (req, res) => {
    const phone = req.body.phone;
    if (!phone) return res.json({ error: 'Phone number is required' });

    const cleanPhone = phone.replace(/\D/g, '');
    const id = makeid();
    const tempFolder = path.join(__dirname, 'temp', id);
    fs.mkdirSync(tempFolder, { recursive: true });

    async function generatePairCode() {
        const { state, saveCreds } = await useMultiFileAuthState(tempFolder);

        try {
            const sock = makeWASocket({
                printQRInTerminal: false,
                logger: pino({ level: 'fatal' }),
                auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })) },
                browser: Browsers.macOS('Chrome')
            });

            sock.ev.on('creds.update', saveCreds);

            // Generate pairing code if not registered
            if (!sock.authState.creds.registered) {
                await delay(1000);
                const code = await sock.requestPairingCode(cleanPhone);

                if (!res.headersSent) res.json({ code });

                sock.ev.on('connection.update', async (update) => {
                    const { connection, lastDisconnect } = update;

                    if (connection === 'open') {
                        // read creds.json and send session ID
                        const credsPath = path.join(tempFolder, 'creds.json');
                        await delay(1000);
                        const data = fs.readFileSync(credsPath);
                        const sessionID = Buffer.from(data).toString('base64');

                        try {
                            await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: `✅ Your session ID:\n\n${sessionID}` });
                        } catch (e) {
                            console.error('Failed to send session ID:', e.message);
                        }

                        // Cleanup
                        await delay(100);
                        await sock.ws.close();
                        removeFile(tempFolder);
                    } else if (connection === 'close' && lastDisconnect && lastDisconnect.error?.output?.statusCode !== 401) {
                        // reconnect
                        await delay(5000);
                        generatePairCode();
                    }
                });
            }
        } catch (err) {
            console.error('Error generating pair code:', err);
            removeFile(tempFolder);
            if (!res.headersSent) res.json({ error: 'Service Currently Unavailable' });
        }
    }

    generatePairCode();
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
