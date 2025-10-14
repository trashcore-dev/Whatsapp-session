const express = require('express');
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, jidDecode, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public','index.html')));

const CODES_FILE = './codes.json';
if (!fs.existsSync(CODES_FILE)) fs.writeFileSync(CODES_FILE, JSON.stringify({}));

// Load codes
function loadCodes() {
  return JSON.parse(fs.readFileSync(CODES_FILE));
}

function saveCodes(codes) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes));
}

// Generate 8-digit code
function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Endpoint to request a new code
app.get('/request-code', (req, res) => {
  const code = generateCode();
  const codes = loadCodes();
  codes[code] = { used: false };
  saveCodes(codes);
  res.json({ code });
});

// Endpoint to check code status
app.post('/validate-code', (req, res) => {
  const { code, whatsapp } = req.body;
  const codes = loadCodes();
  if (codes[code] && !codes[code].used) {
    codes[code].used = true;
    codes[code].whatsapp = whatsapp;
    saveCodes(codes);
    res.json({ success: true, msg: 'Code registered! Await session ID.' });
  } else {
    res.json({ success: false, msg: 'Invalid or used code.' });
  }
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

  // When a message arrives
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message) return;

    const text = m.message.conversation || m.message.extendedTextMessage?.text;
    if (!text) return;

    const codes = loadCodes();

    // Check if the message matches a pairing code
    if (codes[text] && !codes[text].sent) {
      const target = m.key.remoteJid; // Send session to sender
      const sessionId = JSON.stringify(sock.authState?.creds || {});
      await sock.sendMessage(target, { text: `✅ Your session ID:\n${sessionId}` });
      codes[text].sent = true;
      saveCodes(codes);
      console.log(`Sent session to ${target} for code ${text}`);
    }
  });

})();
app.listen(3000, () => console.log('Server running on http://localhost:3000'));
