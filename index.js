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
// SIMPLE MEMORY CACHE
// ==========================
const searchCache = new Map();

// ==========================
// ROOT
// ==========================
app.get("/", (req, res) => {
  res.json({
    engine: "AI Hybrid Smart",
    features: ["chat","image","auto-search","cache"],
    status: "running"
  });
});

// ==========================
// CHECK IPV4
// ==========================
app.get("/checkip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json();
    res.json({ ipv4: data.ip });
  } catch (err) {
    res.json({ error: "Gagal cek IPv4" });
  }
});

// ==========================
// CHECK IPV6
// ==========================
app.get("/checkip6", async (req, res) => {
  try {
    const response = await fetch("https://api64.ipify.org?format=json");
    const data = await response.json();
    res.json({ ipv6: data.ip });
  } catch (err) {
    res.json({ error: "Gagal cek IPv6" });
  }
});

// ==========================
// DEBUG CHAT
// ==========================
app.get("/debug-chat", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=test&session=${SESSION}&apikey=${NEOXR_KEY}`
    );
    const raw = await response.text();
    res.json({ raw_response: raw });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==========================
// DEBUG IMAGE
// ==========================
app.get("/debug-image", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/bardimg?q=test&apikey=${NEOXR_KEY}`
    );
    const raw = await response.text();
    res.json({ raw_response: raw });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ==========================
// SEARCH FUNCTION
// ==========================
async function searchOnline(query) {

  if (searchCache.has(query)) {
    return searchCache.get(query);
  }

  const response = await fetch(
    `https://api.neoxr.eu/api/google?q=${encodeURIComponent(query)}&apikey=${NEOXR_KEY}`
  );

  const data = await response.json();

  if (!data.status) return null;

  const results = data.data?.slice(0, 3) || [];

  const formatted = results.map((r, i) => ({
    title: r.title,
    snippet: r.snippet,
    link: r.link
  }));

  searchCache.set(query, formatted);

  return formatted;
}

// ==========================
// AUTO SMART CHAT API
// ==========================
app.post("/api/chat", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.json({ status:false, msg:"Message kosong" });
  }

  try {

    // 1️⃣ Jawaban normal dulu
    const firstResponse = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(message)}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const firstData = await firstResponse.json();

    let reply =
      firstData?.data?.message ||
      firstData?.result ||
      firstData?.msg ||
      "";

    const lowerReply = reply.toLowerCase();
    const lowerQuestion = message.toLowerCase();

    // 2️⃣ Deteksi butuh search
    const needSearch =
      lowerQuestion.includes("sekarang") ||
      lowerQuestion.includes("hari ini") ||
      lowerQuestion.includes("terbaru") ||
      lowerQuestion.includes("update") ||
      lowerQuestion.includes("berapa harga") ||
      lowerReply.includes("tidak tahu") ||
      lowerReply.includes("tidak memiliki informasi terbaru");

    if (!needSearch) {
      return res.json({
        status:true,
        result: reply,
        search_used:false
      });
    }

    // 3️⃣ Search online
    const searchResults = await searchOnline(message);

    if (!searchResults || searchResults.length === 0) {
      return res.json({
        status:true,
        result: reply,
        search_used:false
      });
    }

    const snippets = searchResults
      .map(r => `${r.title}\n${r.snippet}`)
      .join("\n\n");

    // 4️⃣ Kirim ulang ke AI dengan data terbaru
    const finalPrompt = `
Berikut hasil pencarian terbaru dari internet:

${snippets}

Gunakan informasi di atas untuk menjawab pertanyaan berikut secara akurat dan jelas:

${message}
`;

    const finalResponse = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(finalPrompt)}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const finalData = await finalResponse.json();

    const finalReply =
      finalData?.data?.message ||
      finalData?.result ||
      finalData?.msg ||
      reply;

    res.json({
      status:true,
      result: finalReply,
      search_used:true,
      sources: searchResults
    });

  } catch (err) {
    console.error("Chat Error:", err);
    res.json({ status:false, msg:"Server error" });
  }
});

// ==========================
// IMAGE API
// ==========================
app.post("/api/image", async (req, res) => {
  const prompt = req.body.prompt;

  if (!prompt) {
    return res.json({ status:false, msg:"Prompt kosong" });
  }

  try {
    const response = await fetch(
      `https://api.neoxr.eu/api/bardimg?q=${encodeURIComponent(prompt)}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();

    const imageUrl =
      data?.data ||
      data?.result ||
      data?.url ||
      null;

    res.json({
      status:true,
      image:imageUrl
    });

  } catch (err) {
    console.error("Image Error:", err);
    res.json({ status:false, msg:"Gagal generate image" });
  }
});

// ==========================
// PORT
// ==========================
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🔥 AI Hybrid Smart running on port ${PORT}`);
});
