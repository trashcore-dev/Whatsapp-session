const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- Replace this with your number (include country code, no +) ---
const OWNER_NUMBER = "254104245659@s.whatsapp.net"; // Example: 254712345678@s.whatsapp.net

app.get("/", (req, res) => {
  res.send("✅ WhatsApp Session Generator is live! Visit /pair to get your code.");
});

app.get("/pair", async (req, res) => {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "sessions"));
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: true,
      auth: state,
      browser: ["SessionGenerator", "Chrome", "1.0.0"]
    });

    // Generate pairing code if supported
    if (sock.requestPairingCode) {
      const code = await sock.requestPairingCode(OWNER_NUMBER.replace("@s.whatsapp.net", ""));
      console.log(`🔗 Pairing code: ${code}`);
      res.send(`✅ Pairing code generated and sent to terminal. Use code: <b>${code}</b>`);

      // Send message after login
      sock.ev.on("connection.update", async (update) => {
        if (update.connection === "open") {
          const creds = fs.readFileSync(path.join(__dirname, "sessions", "creds.json"), "utf-8");
          await sock.sendMessage(OWNER_NUMBER, {
            text: `✅ Your WhatsApp Session ID (creds.json):\n\n\`\`\`${creds}\`\`\``
          });
          console.log("✅ Session ID sent to your WhatsApp.");
        }
      });
    } else {
      res.send("❌ Pairing code method not supported on this device. Use QR scan instead.");
    }

    sock.ev.on("creds.update", saveCreds);
  } catch (err) {
    console.error("❌ Error creating session:", err);
    res.status(500).send("Error creating session: " + err.message);
  }
});

app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));
