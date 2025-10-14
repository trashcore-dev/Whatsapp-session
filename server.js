const express = require('express');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, jidDecode, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CODES_FILE = './codes.json';
if (!fs.existsSync(CODES_FILE)) fs.writeFileSync(CODES_FILE, JSON.stringify({}));

function loadCodes() {
  return JSON.parse(fs.readFileSync(CODES_FILE));
}

function saveCodes(codes) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes));
}

function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Request new code for a phone number
app.post('/request-code', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  const code = generateCode();
  const codes = loadCodes();
  codes[code] = { phone, used: false, sent: false };
  saveCodes(codes);

  res.json({ code });
});

// WhatsApp connection
(async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const text = m.message.conversation || m.message.extendedTextMessage?.text;
    if (!text) return;

    const codes = loadCodes();

    // Check if message matches any code
    if (codes[text] && !codes[text].sent) {
      const targetNumber = codes[text].phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      const sessionId = JSON.stringify(sock.authState?.creds || {});
      try {
        await sock.sendMessage(targetNumber, { text: `✅ Your session ID:\n${sessionId}` });
        codes[text].sent = true;
        saveCodes(codes);
        console.log(`Session sent to ${targetNumber} for code ${text}`);
      } catch (err) {
        console.error('Failed to send session ID:', err);
      }
    }
  });

})();

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
