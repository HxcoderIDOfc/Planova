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

// ==========================
// ROOT
// ==========================
app.get("/", (req, res) => {
  res.json({
    engine: "AI Service",
    status: "running"
  });
});

// ==========================
// CHECK IP
// ==========================
app.get("/checkip", async (req, res) => {
  try {
    const response = await fetch("https://api64.ipify.org?format=json");
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
    const response = await fetch("https://api64.ipify.org?format=json");
    const data = await response.json();
    res.json({ outbound_ip: data.ip });
  } catch (err) {
    res.json({ error: "Gagal cek outbound IP" });
  }
});

// ==========================
// DEBUG NEOXR
// ==========================
app.get("/debug-neoxr", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/copilot?q=test&apikey=${NEOXR_KEY}`
    );

    const text = await response.text();

    console.log("=== RAW NeoXR Response ===");
    console.log(text);
    console.log("==========================");

    res.json({ raw_response: text });

  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==========================
// CHAT - COPILOT
// ==========================
app.post("/api/chat", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.json({
      status: false,
      msg: "Message kosong"
    });
  }

  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/copilot?q=${encodeURIComponent(message)}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();

    if (!data.status) {
      return res.json(data);
    }

    const reply =
      data?.data ||
      data?.result ||
      data?.msg ||
      "Tidak ada jawaban.";

    res.json({
      status: true,
      result: reply
    });

  } catch (err) {
    console.error("Chat Error:", err);
    res.json({
      status: false,
      msg: "Server error"
    });
  }
});

// ==========================
// IMAGE GENERATOR
// ==========================
app.post("/api/image", async (req, res) => {
  const prompt = req.body.prompt;

  if (!prompt) {
    return res.json({
      status: false,
      msg: "Prompt kosong"
    });
  }

  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/bardimg?q=${encodeURIComponent(prompt)}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();

    if (!data.status) {
      return res.json(data);
    }

    const imageUrl =
      data?.data ||
      data?.result ||
      data?.url ||
      null;

    res.json({
      status: true,
      image: imageUrl
    });

  } catch (err) {
    console.error("Image Error:", err);
    res.json({
      status: false,
      msg: "Gagal generate image"
    });
  }
});

// ==========================
// PORT
// ==========================
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🔥 AI Service running on port ${PORT}`);
});
