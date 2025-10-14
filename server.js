// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve your HTML

// Utility: remove temp folder
function removeFile(filePath) {
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
}

// POST /request-code
app.post('/request-code', async (req, res) => {
    const phone = req.body.phone?.replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    const id = Date.now().toString();
    const tempDir = path.join(__dirname, 'temp', id);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
            browser: Browsers.macOS('Chrome')
        });

        // Step 1: Request pairing code → triggers WhatsApp notification
        const code = await sock.requestPairingCode(phone);

        // Immediately respond with the code for webpage
        res.json({ code });

        // Step 2: Listen for credentials update and connection open
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                // Device successfully linked
                const data = fs.readFileSync(path.join(tempDir, 'creds.json'));
                const sessionId = Buffer.from(data).toString('base64');

                // Step 3: Send session ID to the linked WhatsApp number
                await sock.sendMessage(phone + '@s.whatsapp.net', {
                    text: `✅ Your bot session is ready!\n\nSession ID:\n${sessionId}`
                });

                // Close socket and cleanup
                await delay(1000);
                await sock.ws.close();
                removeFile(tempDir);
            } else if (connection === 'close' && update.lastDisconnect) {
                console.log('Connection closed, retrying...');
                removeFile(tempDir);
            }
        });
    } catch (err) {
        console.error(err);
        removeFile(tempDir);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to generate code' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
