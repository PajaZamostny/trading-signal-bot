const express = require("express");
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Send message to Telegram
async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    }),
  });
  return res.json();
}

// Analyze signal with Claude AI
async function analyzeWithClaude(ticker, price, extra) {
  const prompt = `Jsi zkuĹĄeny trader. Analyzuj tuto situaci a dej konkretni doporuceni.

Instrument: ${ticker}
Cena: ${price}
Dalsi info: ${extra || "zadne"}
Cas: ${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}

Zlato (XAUUSD) reaguje na: DXY (inverzne), real yields, geopolitiku, Fed.
Stribro (XAGUSD) sleduje zlato + prumyslova poptavka.
Bitcoin reaguje na: risk sentiment, likviditu, makro.
Indexy (SPX, NAS) reagujĂ­ na: earnings, Fed, ekonomicka data.

Odpovez POUZE v tomto formatu bez emoji:

SIGNAL: LONG nebo SHORT nebo CEKEJ
ENTRY: cislo
SL: cislo
TP1: cislo
TP2: cislo
RR: cislo jako 1:2.5
TIMEFRAME: napr 4H swing
DUVOD: 2-3 vety konkretne proc
RIZIKO: NIZKE nebo STREDNI nebo VYSOKE`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) {
    throw new Error("API error: " + JSON.stringify(data));
  }
  return data.content[0].text;
}

// Format message for Telegram (no emoji to avoid encoding issues)
function formatMessage(analysis, ticker, price) {
  const time = new Date().toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });

  const signalMatch = analysis.match(/SIGNAL:\s*(LONG|SHORT|CEKEJ)/i);
  const signal = signalMatch ? signalMatch[1].toUpperCase() : "?";

  let signalLabel = "SIGNAL";
  if (signal === "LONG") signalLabel = "LONG [kupovat]";
  if (signal === "SHORT") signalLabel = "SHORT [prodat]";
  if (signal === "CEKEJ") signalLabel = "CEKEJ [zadny vstup]";

  return `<b>${ticker} - ${signalLabel}</b> | ${time}

<b>Alert cena:</b> ${price}

${analysis}

---
Toto neni financni poradenstvi. Vzdycky pouzi vlastni uvazek.`;
}

// Main webhook endpoint
app.post("/webhook", async (req, res) => {
  console.log("Alert prijat:", JSON.stringify(req.body));
  try {
    const alertData = req.body;
    res.json({ status: "ok" });

    await sendTelegram(`<b>Alert prijat!</b>\nAnalizuji ${alertData.ticker || "instrument"}...`);

    const ticker = alertData.ticker || "UNKNOWN";
    const price = alertData.close || alertData.price || "?";
    const analysis = await analyzeWithClaude(ticker, price, alertData.alert_type);
    const message = formatMessage(analysis, ticker, price);
    await sendTelegram(message);
  } catch (error) {
    console.error("Chyba:", error);
    await sendTelegram(`Chyba: ${error.message}`);
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Trading Signal Bot bezi!", time: new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) });
});

// Manual analysis
app.get("/analyze/:ticker/:price", async (req, res) => {
  const { ticker, price } = req.params;
  try {
    const analysis = await analyzeWithClaude(ticker, price, "manualni pozadavek");
    const message = formatMessage(analysis, ticker, price);
    await sendTelegram(message);
    res.json({ status: "ok", sent: true });
  } catch (error) {
    console.error("Chyba:", error);
    res.json({ status: "error", error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server bezi na portu ${PORT}`);
});
