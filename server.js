const express = require('express');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const app = express();

// Serve the entire public folder as static
app.use(express.static(path.join(__dirname, 'public')));

// Root route sends index.html from public folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Pairing API
app.get('/pairing', async (req, res) => {
  const number = req.query.number;
  if (!number) return res.status(400).json({ error: 'Missing number' });

  try {
    const { state, saveCreds } = await useMultiFileAuthState('./session');

    const sock = makeWASocket({
      printQRInTerminal: false,
      auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    const pairCode = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));

    res.json({ pairCode });

    // Close socket after sending code
    setTimeout(() => sock.logout(), 5000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
