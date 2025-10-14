const express = require('express');
const cors = require('cors');
const { default: makeWASocket, fetchLatestBaileysVersion, useSingleFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serve index.html

const PORT = process.env.PORT || 3000;

// Store generated pairing codes and sockets
let sessions = {};

// POST endpoint to request an 8-digit code
app.post('/request-code', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ error: 'Phone number required' });

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const { version } = await fetchLatestBaileysVersion();

    // Generate 8-digit code
    const code = Math.floor(10000000 + Math.random() * 90000000).toString();

    // Create a temporary Baileys socket for this user
    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: { creds: {}, keys: {} }
    });

    // Save socket and code
    sessions[cleanPhone] = { sock, code };

    // Respond with the code
    res.json({ code });

    // Listen for connection update
    sock.ev.on('connection.update', async (update) => {
      if (update.connection === 'open') {
        const sessionId = Buffer.from(JSON.stringify(sock.authState.creds)).toString('base64');

        // Send session ID to the number entered
        try {
          await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: `✅ Your session ID:\n\n${sessionId}` });
        } catch (e) {
          console.error('Failed to send session ID:', e.message);
        }

        console.log(`Session ID sent to ${cleanPhone}`);
        delete sessions[cleanPhone]; // cleanup
      }
      if (update.connection === 'close') {
        delete sessions[cleanPhone];
      }
    });
  } catch (err) {
    console.error(err);
    res.json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
