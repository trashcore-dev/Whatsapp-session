// server.js
const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (index.html, CSS, etc.)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory store for pairing code
let pairingCode = null;

// Start WhatsApp socket
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    // Listen for QR / pairing code
    sock.ev.on('connection.update', update => {
        if (update.qr) {
            pairingCode = update.qr; // Save QR / pairing code to memory
            console.log('[QR] Pairing code updated');
        }
    });

    return sock;
}

// Start WhatsApp
startWhatsApp().catch(console.error);

// API to get pairing code
app.get('/pairing-code', (req, res) => {
    if (!pairingCode) return res.json({ success: false, code: null });
    res.json({ success: true, code: pairingCode });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
