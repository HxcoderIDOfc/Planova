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
// SIMPLE CACHE
// ==========================
const searchCache = new Map();

// ==========================
// ROOT
// ==========================
app.get("/", (req, res) => {
  res.json({
    engine: "AI Mood Smart Realtime",
    moods: ["serius","santai","fun"],
    status: "running"
  });
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

  const results = data.data?.slice(0,3) || [];

  const formatted = results.map(r => ({
    title: r.title,
    snippet: r.snippet,
    link: r.link
  }));

  searchCache.set(query, formatted);
  return formatted;
}

// ==========================
// MOOD DETECTOR
// ==========================
function detectMood(text){
  const lower = text.toLowerCase();

  if (
    lower.includes("hukum") ||
    lower.includes("undang") ||
    lower.includes("penjelasan ilmiah") ||
    lower.includes("analisis") ||
    lower.includes("skripsi")
  ) return "serius";

  if (
    lower.includes("jokes") ||
    lower.includes("lucu") ||
    lower.includes("gombal") ||
    lower.includes("ngakak")
  ) return "fun";

  return "santai";
}

// ==========================
// MOOD PROMPT
// ==========================
function buildSystemPrompt(mood){
  if(mood === "serius"){
    return `
Kamu adalah AI profesional dan serius.
Jawabanmu formal, jelas, dan informatif.
Gunakan bahasa yang rapi dan sistematis.
Jika ada hasil pencarian internet, gunakan itu.
Jangan pernah mengatakan bahwa kamu tidak bisa mengakses internet.
`;
  }

  if(mood === "fun"){
    return `
Kamu adalah AI santai dan fun.
Boleh bercanda ringan dan pakai gaya ngobrol.
Tetap informatif dan tidak berlebihan.
Gunakan hasil pencarian jika ada.
Jangan pernah mengatakan bahwa kamu tidak bisa mengakses internet.
`;
  }

  return `
Kamu adalah AI pintar dan santai.
Jawaban natural seperti teman ngobrol.
Boleh sedikit humor ringan kalau cocok.
Gunakan hasil pencarian jika ada.
Jangan pernah mengatakan bahwa kamu tidak bisa mengakses internet.
`;
}

// ==========================
// CHAT API WITH MOOD
// ==========================
app.post("/api/chat", async (req, res) => {
  const message = req.body.message;

  if (!message) {
    return res.json({ status:false, msg:"Message kosong" });
  }

  try {

    const mood = detectMood(message);
    const systemPrompt = buildSystemPrompt(mood);

    // ===== FIRST RESPONSE =====
    const firstResponse = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(systemPrompt + "\nUser: " + message)}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const firstData = await firstResponse.json();

    let reply =
      firstData?.data?.message ||
      firstData?.result ||
      firstData?.msg ||
      "";

    const lowerReply = reply.toLowerCase();
    const lowerQuestion = message.toLowerCase();

    const needSearch =
      lowerQuestion.includes("sekarang") ||
      lowerQuestion.includes("2026") ||
      lowerQuestion.includes("hari ini") ||
      lowerQuestion.includes("terbaru") ||
      lowerReply.includes("tidak dapat") ||
      lowerReply.includes("tidak bisa") ||
      lowerReply.includes("tidak memiliki informasi terbaru");

    if (!needSearch) {
      return res.json({
        status:true,
        mood,
        search_used:false,
        result: reply
      });
    }

    // ===== SEARCH =====
    const searchResults = await searchOnline(message);

    if (!searchResults || searchResults.length === 0) {
      return res.json({
        status:true,
        mood,
        search_used:false,
        result: reply
      });
    }

    const snippets = searchResults
      .map(r => `${r.title}\n${r.snippet}`)
      .join("\n\n");

    const finalPrompt = `
${systemPrompt}

Gunakan informasi berikut untuk menjawab:

${snippets}

Pertanyaan:
${message}
`;

    const finalResponse = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(finalPrompt)}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const finalData = await finalResponse.json();

    let finalReply =
      finalData?.data?.message ||
      finalData?.result ||
      finalData?.msg ||
      reply;

    // HARD FILTER
    finalReply = finalReply.replace(/tidak bisa mengakses internet/gi, "");
    finalReply = finalReply.replace(/tidak dapat melakukan pencarian langsung di internet/gi, "");

    res.json({
      status:true,
      mood,
      search_used:true,
      sources: searchResults,
      result: finalReply
    });

  } catch (err) {
    console.error(err);
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
    res.json({ status:false, msg:"Gagal generate image" });
  }
});

// ==========================
// PORT
// ==========================
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🔥 AI Mood Smart running on port ${PORT}`);
});
