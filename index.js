import express from "express";

const app = express();
app.use(express.json({ limit: "10mb" }));

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
const RATE_LIMIT = 30;
const OWNER_NUMBER = "6285624128286";

// ==========================
// RATE LIMIT SYSTEM
// ==========================
const rateLimitMap = new Map();

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
// SMART COMMAND DETECTOR
// ==========================
function detectSystemCommand(text, user){

  const t = text.toLowerCase()

  if(t.includes("mode cs")){
    return "Halo 👋 Selamat datang di Shehost Support.\nSilakan kirim kebutuhan Anda 😊"
  }

  if(
    t.includes("siapa kamu") ||
    t.includes("nama kamu") ||
    t.includes("kamu siapa")
  ){
    return "Saya adalah Shehost 🤖\nDeveloper saya adalah Hendra."
  }

  if(
    t.includes("download tiktok") ||
    t.includes("download youtube") ||
    t.includes("download yt") ||
    t.includes("download instagram") ||
    t.includes("download ig") ||
    t.includes("bisa download") ||
    t.includes("bantu download")
  ){
    return "Bisa 🔥 Silakan kirim linknya ya."
  }

  if(user === OWNER_NUMBER && t === "ping"){
    return "Pong 🏓 Bot aktif."
  }

  return null
}

// ==========================
// ROOT DEBUG
// ==========================
app.get("/", async (req, res) => {

  const ipv4 = await fetch("https://api.ipify.org?format=json")
    .then(r=>r.json()).catch(()=>null);

  const ipv6 = await fetch("https://api64.ipify.org?format=json")
    .then(r=>r.json()).catch(()=>null);

  res.json({
    engine: "Shehost AI Engine Clean Mode",
    status: "running",
    bot_name: "Shehost",
    developer: "Hendra",
    outbound_ipv4: ipv4?.ip || null,
    outbound_ipv6: ipv6?.ip || null,
    timestamp: new Date().toISOString()
  });
});

// ==========================
// UNIVERSAL CHAT API
// ==========================
app.post("/api", async (req,res)=>{

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const message = req.body.message;
  const user = req.body.user || null;

  if(!checkRateLimit(ip)){
    return res.json({ status:false, msg:"Rate limit aktif..." });
  }

  if(!message){
    return res.json({ status:false, msg:"Message kosong" });
  }

  try{

    // ==========================
    // 1️⃣ SYSTEM COMMAND FIRST
    // ==========================
    const systemReply = detectSystemCommand(message, user)

    if(systemReply){
      return res.json({
        status:true,
        mode:"system",
        result: systemReply
      })
    }

    // ==========================
    // 2️⃣ DEFAULT AI
    // ==========================
    if(!NEOXR_KEY){
      return res.json({ status:false, msg:"API Key belum diset di server." });
    }

    const finalPrompt = `
Kamu adalah asisten AI bernama Shehost.
Developer kamu adalah Hendra.
Jika ditanya soal download media, jawab bahwa kamu bisa membantu dan minta kirim linknya.
Jangan menyebut Meta, OpenAI, atau Neoxr.

Pertanyaan:
${message}
`

    const response = await fetch(
      `https://api.neoxr.eu/api/meta?id=1&q=${encodeURIComponent(finalPrompt)}&apikey=${NEOXR_KEY}`
    );

    const data = await response.json().catch(()=>null);

    const reply =
      data?.data?.message ||
      data?.data ||
      data?.result ||
      data?.msg ||
      "Tidak ada jawaban.";

    res.json({
      status:true,
      mode:"ai",
      result: reply
    });

  }catch(err){
    res.json({ 
      status:false, 
      msg: err.message || "Server error"
    });
  }

});

// ==========================
const PORT = process.env.PORT || 8000;
app.listen(PORT, ()=>{
  console.log("🚀 Shehost AI Engine Clean Mode running on port " + PORT);
});
