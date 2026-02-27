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

// ==========================
// CONFIG
// ==========================
const NEOXR_KEY = process.env.NEOXR_KEY;
const SESSION = "1727468410446638";
const PHP_CACHE_API = "https://shehost.my.id/api.php"; // GANTI

// ==========================
// RAM CACHE + RATE LIMIT
// ==========================
const searchCache = new Map();
const rateLimitMap = new Map();
const CACHE_EXPIRE = 1000 * 60 * 60 * 24; // 24 JAM
const RATE_LIMIT = 20; // max 20 request per menit

// ==========================
// AUTO CLEANUP RAM CACHE
// ==========================
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRE) {
      searchCache.delete(key);
    }
  }
}, 1000 * 60 * 30);

// ==========================
// ROOT (DEBUG NETWORK MODE)
// ==========================
app.get("/", async (req, res) => {
  try {

    const ipv4Res = await fetch("https://api.ipify.org?format=json");
    const ipv4Data = await ipv4Res.json();

    const ipv6Res = await fetch("https://api64.ipify.org?format=json");
    const ipv6Data = await ipv6Res.json();

    const clientIP =
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress;

    res.json({
      engine: "AI Mood Smart Pro Max",
      status: "running",
      server_outbound_ipv4: ipv4Data.ip,
      server_outbound_ipv6: ipv6Data.ip,
      client_ip: clientIP,
      features: [
        "mood-system",
        "smart-search",
        "mysql-global-cache",
        "cache-expire",
        "rate-limit",
        "anti-duplicate",
        "training-log",
        "image-generator",
        "debug-network"
      ],
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.json({
      engine: "AI Mood Smart Pro Max",
      status: "running",
      error: err.message
    });
  }
});

// ==========================
// RATE LIMIT SYSTEM
// ==========================
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip).filter(
    t => now - t < windowMs
  );

  if (timestamps.length >= RATE_LIMIT) {
    return false;
  }

  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

// ==========================
// SEARCH FUNCTION
// ==========================
async function searchOnline(query) {

  if (searchCache.has(query)) {
    const cached = searchCache.get(query);
    if (Date.now() - cached.timestamp < CACHE_EXPIRE) {
      return cached.data;
    }
  }

  const response = await fetch(
    `https://api.neoxr.eu/api/google?q=${encodeURIComponent(query)}&apikey=${NEOXR_KEY}`
  );

  const data = await response.json();
  if (!data.status) return null;

  const results = data.data?.slice(0, 3) || [];

  const formatted = results.map(r =>
    `${r.title}\n${r.snippet}`
  ).join("\n\n");

  searchCache.set(query, {
    data: formatted,
    timestamp: Date.now()
  });

  return formatted;
}

// ==========================
// MOOD DETECTOR
// ==========================
function detectMood(text){
  const lower = text.toLowerCase();

  if (lower.match(/hukum|analisis|ilmiah|skripsi|penelitian/))
    return "serius";

  if (lower.match(/lucu|jokes|gombal|ngakak|candaan/))
    return "fun";

  return "santai";
}

// ==========================
// PROMPT BUILDER
// ==========================
function buildSystemPrompt(mood){

  if(mood === "serius"){
    return `Jawab secara profesional dan sistematis.`;
  }

  if(mood === "fun"){
    return `Jawab santai dan boleh sedikit bercanda.`;
  }

  return `Jawab natural seperti teman ngobrol.`;
}

// ==========================
// SMART SEARCH DETECTOR
// ==========================
function shouldSearch(message){
  return message.toLowerCase().match(
    /siapa|berapa|kapan|presiden|harga|sekarang|update|terbaru/
  );
}

// ==========================
// CHAT API
// ==========================
app.post("/api/chat", async (req, res) => {

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.json({
      status:false,
      msg:"Terlalu banyak request, tunggu sebentar..."
    });
  }

  const message = req.body.message;
  if (!message) {
    return res.json({ status:false, msg:"Message kosong" });
  }

  try {

    // MYSQL CACHE CHECK
    try {
      const cacheCheck = await fetch(
        `${PHP_CACHE_API}?question=${encodeURIComponent(message)}`
      );

      const cacheData = await cacheCheck.json();

      if (cacheData.cached) {
        await fetch(`${PHP_CACHE_API}?increment=true`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ question: message })
        });

        return res.json({
          status:true,
          from_mysql_cache:true,
          result: cacheData.answer
        });
      }

    } catch(e) {
      console.log("MySQL skip...");
    }

    const mood = detectMood(message);
    const systemPrompt = buildSystemPrompt(mood);

    let searchSnippet = "";

    if (shouldSearch(message)) {
      const result = await searchOnline(message);
      if (result) {
        searchSnippet = `Informasi terbaru:\n${result}`;
      }
    }

    const now = new Date();
    const realtimeInfo = `
Tanggal: ${now.toLocaleDateString("id-ID")}
Jam: ${now.toLocaleTimeString("id-ID")}
`;

    const finalPrompt = `
${systemPrompt}

${realtimeInfo}

${searchSnippet}

Pertanyaan:
${message}
`;

    const response = await fetch(
      `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(finalPrompt)}&session=${SESSION}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();

    let reply =
      data?.data?.message ||
      data?.result ||
      data?.msg ||
      "Tidak ada jawaban.";

    reply = reply
      .replace(/tidak bisa mengakses internet/gi,"")
      .replace(/tidak memiliki informasi terbaru/gi,"")
      .trim();

    try {
      await fetch(`${PHP_CACHE_API}?cache=true`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          question: message,
          answer: reply
        })
      });
    } catch(e){
      console.log("Save cache gagal");
    }

    res.json({
      status:true,
      mood,
      search_used: !!searchSnippet,
      result: reply
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
  console.log(`🔥 AI Pro Max Running on port ${PORT}`);
});
