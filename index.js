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
// ROOT
// ==========================
app.get("/", (req, res) => {
  res.json({
    engine: "Planova Core Engine",
    status: "running"
  });
});

// ==========================
// CHECK IP
// ==========================
app.get("/checkip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    res.json({ server_ip: data.ip });
  } catch (err) {
    res.json({ error: "Gagal cek IP" });
  }
});

// ==========================
// REAL IP
// ==========================
app.get("/realip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    res.json({ outbound_ip: data.ip });
  } catch (err) {
    res.json({ error: "Gagal cek outbound IP" });
  }
});

// ==========================
// DEBUG NEOXR (PENTING)
// ==========================
app.get("/debug-neoxr", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=test&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const text = await response.text();

    console.log("=== RAW NeoXR Response ===");
    console.log(text);
    console.log("==========================");

    res.json({
      raw_response: text
    });

  } catch (err) {
    res.json({ error: err.message });
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

  if (/siapa kamu|kamu siapa|nama kamu/.test(clean)) {
    return `Saya adalah ${AI_NAME}.`;
  }

  if (/developer kamu|siapa developer kamu|siapa pembuat kamu/.test(clean)) {
    return `Developer saya adalah ${DEVELOPER}.`;
  }

  return null;
}

// ==========================
// API
// ==========================
app.post("/api", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.json({ status: false, msg: "Message kosong" });
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
`;

  try {

    // Log outbound IP sebelum call NeoXR
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipData = await ipRes.json();
    console.log("Outbound IP before NeoXR call:", ipData.ip);

    const response = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(
        systemPrompt + "\nUser: " + message
      )}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const rawText = await response.text();

    console.log("=== NeoXR Response ===");
    console.log(rawText);
    console.log("======================");

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.json({
        status: false,
        msg: "NeoXR response bukan JSON",
        raw: rawText
      });
    }

    let reply =
      data?.data?.message ||
      data?.result ||
      data?.msg ||
      rawText;

    reply = reply.replace(/chatgpt|openai|gpt-?\d*/gi, AI_NAME);

    res.json({
      status: true,
      engine: "Planova Core Engine",
      result: reply
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.json({ status: false, msg: "Server error" });
  }
});

// ==========================
// PORT
// ==========================
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🔥 Planova Core Engine running on port ${PORT}`);
});
