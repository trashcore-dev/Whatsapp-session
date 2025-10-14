const express = require('express');
const cors = require('cors');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static HTML
app.use(express.static(path.join(__dirname)));

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

    // Generate pairing code
    const pairCode = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));

    res.json({ pairCode });

    // Close socket after sending code
    setTimeout(() => sock.logout(), 5000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
