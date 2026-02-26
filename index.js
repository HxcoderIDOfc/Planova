import express from "express";

const app = express();
app.use(express.json());

// ==========================
// CORS
// ==========================
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ===== CONFIG =====
const NEOXR_KEY = process.env.NEOXR_KEY;
const SESSION = "1727468410446638";

const AI_NAME = "Planova AI";
const DEVELOPER = "Planova";

// ==========================
// ROOT ROUTE
// ==========================
app.get("/", (req, res) => {
  res.json({
    engine: "Planova Core Engine",
    status: "running"
  });
});

// ==========================
// CHECK IP (Simple)
// ==========================
app.get("/checkip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();

    res.json({
      server_ip: data.ip,
      message: "Masukkan IP ini ke whitelist NeoXR"
    });

  } catch (err) {
    res.json({ error: "Gagal cek IP server" });
  }
});

// ==========================
// REAL IP DEBUG (PENTING)
// ==========================
app.get("/realip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();

    res.json({
      outbound_ip: data.ip,
      note: "IP ini yang digunakan server saat keluar request"
    });

  } catch (err) {
    res.json({ error: "Gagal cek outbound IP" });
  }
});

// ==========================
// NORMALIZE
// ==========================
function normalize(text) {
  let clean = text.toLowerCase();
  clean = clean.replace(/[^a-z0-9 ]/g, "");
  clean = clean
    .replace(/opnai|opena i|open ai/g, "openai")
    .replace(/chat gpt|chagpt/g, "chatgpt");
  return clean;
}

// ==========================
// IDENTITY LOCK
// ==========================
function identityCheck(text) {
  const clean = normalize(text);

  if (
    clean.includes("siapa kamu") ||
    clean.includes("kamu siapa") ||
    clean.includes("nama kamu") ||
    clean.includes("chatgpt") ||
    clean.includes("openai")
  ) {
    return `Saya adalah ${AI_NAME}.`;
  }

  if (
    clean.includes("developer") ||
    clean.includes("pembuat") ||
    clean.includes("siapa yang membuat")
  ) {
    return `Developer saya adalah ${DEVELOPER}.`;
  }

  return null;
}

// ==========================
// API ENDPOINT
// ==========================
app.post("/api", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.json({
      status: false,
      msg: "Message kosong"
    });
  }

  const identity = identityCheck(message);
  if (identity) {
    return res.json({
      status: true,
      engine: "Planova Core Engine",
      result: identity
    });
  }

  const systemPrompt = `
Kamu adalah ${AI_NAME}.
Jangan pernah menyebut ChatGPT atau OpenAI.
Jika ditanya identitas, jawab bahwa kamu adalah ${AI_NAME}.
Jawab profesional dan ringkas.
`;

  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(
        systemPrompt + "\nUser: " + message
      )}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();

    let reply =
      data?.data?.message ||
      data?.result ||
      data?.msg ||
      "Tidak ada jawaban.";

    reply = reply.replace(/ChatGPT|OpenAI/gi, AI_NAME);

    res.json({
      status: true,
      engine: "Planova Core Engine",
      result: reply
    });

  } catch (err) {
    res.json({
      status: false,
      msg: "Server error"
    });
  }
});

// ==========================
// PORT (Koyeb)
// ==========================
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🔥 Planova Core Engine running on port ${PORT}`);
});
