const express = require('express');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const bodyParser = require('body-parser');
const cors = require('cors');
const {
  default: makeWASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3000;
const SESS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======== AJAX route: Generate pairing code ========
app.post('/pair', async (req, res) => {
  try {
    const rawNumber = (req.body.number || '').trim();
    if (!rawNumber) return res.status(400).json({ error: 'Missing number' });

    const phone = rawNumber.replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'Invalid number' });

    const sessionId = `${Date.now()}_${phone}`;
    const sessionFolder = path.join(SESS_DIR, sessionId);
    fs.mkdirSync(sessionFolder, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 13] }));

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      browser: ['SessionGenWeb', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // 🟩 Generate pairing code
    const pairCode = await sock.requestPairingCode(phone);

    // Respond instantly with JSON (to display on the page)
    res.json({ pairCode, sessionId });

    // When connection completes, export the session
    sock.ev.on('connection.update', async (update) => {
      if (update.connection === 'open') {
        const credsPath = path.join(sessionFolder, 'creds.json');
        if (!fs.existsSync(credsPath)) return;

        const credsJson = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        const exportObj = { creds: credsJson, keys: {} };

        const keysDir = path.join(sessionFolder, 'keys');
        if (fs.existsSync(keysDir)) {
          const walk = (dir, out) => {
            for (const f of fs.readdirSync(dir)) {
              const fp = path.join(dir, f);
              const stat = fs.statSync(fp);
              if (stat.isDirectory()) {
                out[f] = {};
                walk(fp, out[f]);
              } else {
                try {
                  out[f] = JSON.parse(fs.readFileSync(fp, 'utf8'));
                } catch {
                  out[f] = fs.readFileSync(fp).toString('base64');
                }
              }
            }
          };
          walk(keysDir, exportObj.keys);
        }

        fs.writeFileSync(path.join(sessionFolder, 'session.json'), JSON.stringify(exportObj, null, 2));
        fs.writeFileSync(path.join(sessionFolder, 'session.b64'), Buffer.from(JSON.stringify(exportObj)).toString('base64'));

        // send to user’s WhatsApp
        const targetJid = `${phone}@s.whatsapp.net`;
        try {
          await sock.sendMessage(targetJid, {
            text: '✅ Session ready! You can now use it to deploy your bot.'
          });
          await sock.sendMessage(targetJid, {
            text: 'Base64 Session:\n```\n' + fs.readFileSync(path.join(sessionFolder, 'session.b64'), 'utf8') + '\n```'
          });
        } catch (err) {
          console.error('Failed to send session via WhatsApp:', err);
        }
      }
    });

  } catch (err) {
    console.error('Pair error', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Download endpoints
app.get('/download/:sessionId/:file', (req, res) => {
  const file = path.join(SESS_DIR, req.params.sessionId, req.params.file);
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  res.download(file);
});

app.listen(PORT, () => console.log(`🌐 Website running on port ${PORT}`));
