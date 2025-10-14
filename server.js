const express = require("express");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { PORT } = require("./config");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("views", path.join(__dirname, "views"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");

app.get("/", (req, res) => res.render("index"));

app.post("/pair", async (req, res) => {
  const number = req.body.number;
  if (!number) return res.send("❌ Please provide a valid WhatsApp number.");
  const cleanNumber = number.replace(/[^0-9]/g, "");
  const sessionPath = `./sessions/${cleanNumber}`;
  if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
    },
    browser: ["Render", "Chrome", "5.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered) {
    const pairCode = await sock.requestPairingCode(cleanNumber);
    return res.send(`
      <div style="font-family:sans-serif; text-align:center; margin-top:2rem;">
        <h2>✅ Pairing Code for ${cleanNumber}</h2>
        <h1 style="font-size:2.5rem;color:green">${pairCode}</h1>
        <p>Open WhatsApp → Linked Devices → Link with phone number → Enter the code above.</p>
      </div>
    `);
  }

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      const creds = JSON.stringify(sock.authState.creds, null, 2);
      const filePath = `${sessionPath}/session.json`;
      fs.writeFileSync(filePath, creds);

      sock.sendMessage(`${cleanNumber}@s.whatsapp.net`, {
        text: `✅ *Your WhatsApp Session ID*\n\n\`\`\`${creds}\`\`\`\nKeep this safe and private.`
      });

      res.send(`
        <div style="font-family:sans-serif;text-align:center;margin-top:2rem;">
          <h2>✅ Session generated and sent to your WhatsApp!</h2>
          <p>You can now close this window.</p>
        </div>
      `);

      setTimeout(() => sock.ws.close(), 5000);
    }
  });
});

app.listen(PORT, () => console.log(`🚀 Running on http://localhost:${PORT}`));
