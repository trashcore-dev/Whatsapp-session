const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const log = pino({ level: 'info' });

// Store pending codes
let pendingCodes = {}; // { code: phone }

function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString(); // 8-digit code
}

let sock;
(async () => {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys)
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      log.info('Connection closed, reconnecting...');
    } else if (connection === 'open') {
      log.info('Bot connected!');
    }
  });
})();

// Endpoint to request pairing code
app.post('/request-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const code = generateCode();
    pendingCodes[code] = { phone, sent: false };
    log.info(`Generated code ${code} for phone ${phone}`);

    res.json({ code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Endpoint to simulate linking session ID
app.post('/link-session', async (req, res) => {
  try {
    const { code } = req.body;
    if (!pendingCodes[code]) return res.status(400).json({ error: 'Invalid code' });

    const { phone } = pendingCodes[code];
    const sessionID = `SESSION-${Math.random().toString(36).slice(2, 18)}`; // Example session ID

    // Send session ID to the phone via WhatsApp
    if (sock) {
      await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: `Your session ID is:\n${sessionID}` });
      pendingCodes[code].sent = true;
    }

    res.json({ success: true, sessionID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send session ID' });
  }
});

app.listen(PORT, () => log.info(`Server running on port ${PORT}`));
