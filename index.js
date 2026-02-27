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
const PHP_CACHE_API = "https://shehost.my.id/api.php";

// ==========================
// RAM CACHE + RATE LIMIT
// ==========================
const searchCache = new Map();
const rateLimitMap = new Map();
const CACHE_EXPIRE = 1000 * 60 * 60 * 24;
const RATE_LIMIT = 25;

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
// ROOT DEBUG
// ==========================
app.get("/", async (req, res) => {

  const ipv4 = await fetch("https://api.ipify.org?format=json")
    .then(r=>r.json()).catch(()=>null);

  const ipv6 = await fetch("https://api64.ipify.org?format=json")
    .then(r=>r.json()).catch(()=>null);

  res.json({
    engine: "Planova Intelligence Engine 3.1 Ultra Stable",
    status: "running",
    outbound_ipv4: ipv4?.ip || null,
    outbound_ipv6: ipv6?.ip || null,
    timestamp: new Date().toISOString()
  });
});

// ==========================
// RATE LIMIT
// ==========================
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000;

  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);

  const timestamps = rateLimitMap.get(ip).filter(t => now - t < windowMs);

  if (timestamps.length >= RATE_LIMIT) return false;

  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

// ==========================
// MOOD SYSTEM
// ==========================
function detectMood(text){
  const t = text.toLowerCase();
  if (t.match(/hukum|ilmiah|analisis|skripsi|penelitian/)) return "serius";
  if (t.match(/lucu|gombal|jokes|ngakak/)) return "fun";
  return "santai";
}

function buildSystemPrompt(mood){
  if(mood === "serius") return "Jawab profesional dan sistematis.";
  if(mood === "fun") return "Jawab santai dan boleh sedikit bercanda.";
  return "Jawab natural seperti teman ngobrol.";
}

// ==========================
// RANKING SYSTEM
// ==========================
function rankResults(results){

  const trusted = [
    "kompas.com",
    "detik.com",
    "cnnindonesia.com",
    "tempo.co",
    "bbc.com",
    "wikipedia.org"
  ];

  return results.map(r => {

    let score = 0;

    trusted.forEach(d=>{
      if(r.link.includes(d)) score += 6;
    });

    if(r.snippet.length > 120) score += 2;
    if(r.title.length > 20) score += 1;

    return { ...r, score };

  }).sort((a,b)=>b.score - a.score)
    .slice(0,5);
}

// ==========================
// CONFIDENCE SYSTEM
// ==========================
function calculateConfidence(ranked){
  if (!ranked || ranked.length === 0) return 0.4;

  const avg = ranked.reduce((a,b)=>a+b.score,0)/ranked.length;

  let conf = 0.55 + (avg * 0.04);

  if (conf > 0.97) conf = 0.97;

  return Number(conf.toFixed(2));
}

// ==========================
// SEARCH FUNCTION
// ==========================
async function searchOnline(query){

  if (searchCache.has(query)){
    const cached = searchCache.get(query);
    if(Date.now() - cached.timestamp < CACHE_EXPIRE){
      return cached.ranked;
    }
  }

  try{
    const response = await fetch(
      `https://api.neoxr.eu/api/google?q=${encodeURIComponent(query)}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();
    if(!data.status || !data.data) return [];

    const ranked = rankResults(data.data);

    searchCache.set(query,{
      ranked,
      timestamp: Date.now()
    });

    return ranked;
  }catch{
    return [];
  }
}

// ==========================
// AUTONOMOUS MULTI-QUERY
// ==========================
async function autonomousSearch(message){

  const primary = await searchOnline(message);
  const refined = await searchOnline(message + " terbaru 2026 update resmi");

  const combined = [...primary, ...refined];
  const unique = [];
  const seen = new Set();

  for(const r of combined){
    if(!seen.has(r.link)){
      seen.add(r.link);
      unique.push(r);
    }
  }

  return unique.slice(0,5);
}

// ==========================
// CHAT API (ULTRA STABLE)
// ==========================
app.post("/api/chat", async (req,res)=>{

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if(!checkRateLimit(ip)){
    return res.json({ status:false, msg:"Rate limit aktif..." });
  }

  const message = req.body.message;
  if(!message) return res.json({ status:false, msg:"Message kosong" });

  try{

    // MYSQL CACHE
    try{
      const cacheCheck = await fetch(`${PHP_CACHE_API}?question=${encodeURIComponent(message)}`);
      const cacheData = await cacheCheck.json();

      if(cacheData.cached){
        return res.json({
          status:true,
          from_mysql_cache:true,
          confidence:0.99,
          sources:[],
          result: cacheData.answer
        });
      }
    }catch{}

    const mood = detectMood(message);
    const systemPrompt = buildSystemPrompt(mood);

    const rankedResults = await autonomousSearch(message);
    const confidence = calculateConfidence(rankedResults);

    const searchSnippet = rankedResults.map(r =>
      `(${r.score}⭐)\n${r.title}\n${r.snippet}\nSumber: ${r.link}`
    ).join("\n\n");

    const now = new Date();

    const finalPrompt = `
${systemPrompt}

Tanggal: ${now.toLocaleDateString("id-ID")}
Jam: ${now.toLocaleTimeString("id-ID")}

Gunakan referensi berikut untuk menjawab secara akurat.
Jika tidak cukup bukti, katakan informasi belum cukup.

${searchSnippet}

Pertanyaan:
${message}
`;

    let reply = null;

    try{
      const response = await fetch(
        `https://api.neoxr.eu/api/gpt4-session?q=${encodeURIComponent(finalPrompt)}&session=${SESSION}&apikey=${NEOXR_KEY}`
      );

      const raw = await response.text();

      let data;
      try{
        data = JSON.parse(raw);
      }catch{
        data = null;
      }

      reply =
        data?.data?.message ||
        data?.data ||
        data?.result ||
        data?.msg ||
        null;

    }catch{
      reply = null;
    }

    // 🔥 FAIL SAFE MODE
    if(!reply || reply.length < 5){
      if(rankedResults.length > 0){
        reply =
          "Berdasarkan sumber terpercaya:\n\n" +
          rankedResults.map(r =>
            `${r.title}\n${r.snippet}\nSumber: ${r.link}`
          ).join("\n\n");
      }else{
        reply = "Informasi belum cukup ditemukan.";
      }
    }

    reply = reply
      .replace(/tidak bisa mengakses internet/gi,"")
      .replace(/tidak memiliki informasi terbaru/gi,"")
      .trim();

    // SAVE MYSQL
    try{
      await fetch(`${PHP_CACHE_API}?cache=true`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          question: message,
          answer: reply
        })
      });
    }catch{}

    res.json({
      status:true,
      mood,
      confidence,
      autonomous:true,
      ultra_stable:true,
      sources: rankedResults,
      result: reply
    });

  }catch{
    res.json({ status:false, msg:"Server error" });
  }

});

// ==========================
// IMAGE API
// ==========================
app.post("/api/image", async (req,res)=>{

  const prompt = req.body.prompt;
  if(!prompt) return res.json({ status:false, msg:"Prompt kosong" });

  try{
    const response = await fetch(
      `https://api.neoxr.eu/api/bardimg?q=${encodeURIComponent(prompt)}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json();

    const imageUrl =
      data?.data ||
      data?.result ||
      data?.url ||
      null;

    res.json({ status:true, image:imageUrl });

  }catch{
    res.json({ status:false, msg:"Gagal generate image" });
  }
});

// ==========================
const PORT = process.env.PORT || 8000;
app.listen(PORT, ()=>{
  console.log("🚀 Planova Intelligence Engine 3.1 Ultra Stable running on port " + PORT);
});
