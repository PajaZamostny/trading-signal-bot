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
async function analyzeWithClaude(alertData) {
  const prompt = `Jsi zkušený trader specializující se na zlato (XAUUSD), stříbro (XAGUSD), Bitcoin (BTCUSD) a indexy (SPX, NAS100, US30).

Přišel alert z TradingView s těmito daty:
- Instrument: ${alertData.ticker || "neznámý"}
- Timeframe: ${alertData.timeframe || "neznámý"}
- Cena: ${alertData.close || alertData.price || "neznámá"}
- Typ alertu: ${alertData.alert_type || alertData.message || "price alert"}
- Čas: ${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}

Analyzuj situaci a odpověz POUZE v tomto formátu (nic jiného nepřidávej):

SIGNAL: [LONG/SHORT/ČEKEJ]
ENTRY: [cena nebo "market"]
SL: [cena stop lossu]
TP1: [první target]
TP2: [druhý target]
RR: [risk/reward ratio]
TIMEFRAME: [doporučený timeframe pro tento trade]
DŮVOD: [2-3 věty vysvětlení - technická situace, makro kontext, proč právě teď]
RIZIKO: [NÍZKÉ/STŘEDNÍ/VYSOKÉ]

Buď konkrétní s čísly. SL a TP urči podle ATR, klíčových levelů a logiky trhu. Pokud situace není vhodná pro vstup, řekni ČEKEJ a vysvětli proč.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  return data.content[0].text;
}

// Format the analysis into a nice Telegram message
function formatMessage(analysis, alertData) {
  const ticker = alertData.ticker || "UNKNOWN";
  const price = alertData.close || alertData.price || "?";
  const time = new Date().toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Parse signal type for emoji
  const signalMatch = analysis.match(/SIGNAL:\s*(LONG|SHORT|ČEKEJ)/i);
  const signal = signalMatch ? signalMatch[1].toUpperCase() : "?";

  let emoji = "⏳";
  if (signal === "LONG") emoji = "🟢";
  if (signal === "SHORT") emoji = "🔴";

  return `${emoji} <b>${ticker} – ${signal}</b> | ${time}

<b>📊 Alert cena:</b> ${price}

${analysis}

──────────────────
⚠️ <i>Toto není finanční poradenství. Vždy použi vlastní úsudek.</i>`;
}

// Main webhook endpoint - TradingView sends alerts here
app.post("/webhook", async (req, res) => {
  console.log("📨 Alert přijat:", JSON.stringify(req.body));

  try {
    const alertData = req.body;

    // Send immediate acknowledgment to TradingView
    res.json({ status: "ok" });

    // Notify that we received alert
    await sendTelegram(
      `📡 <b>Alert přijat!</b>\n🔍 Analyzuji ${alertData.ticker || "instrument"}...`
    );

    // Analyze with Claude
    const analysis = await analyzeWithClaude(alertData);

    // Format and send
    const message = formatMessage(analysis, alertData);
    await sendTelegram(message);
  } catch (error) {
    console.error("Chyba:", error);
    await sendTelegram(`❌ Chyba při zpracování alertu: ${error.message}`);
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "✅ Trading Signal Bot běží!",
    time: new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }),
  });
});

// Manual signal request - send GET request to trigger analysis manually
app.get("/analyze/:ticker/:price", async (req, res) => {
  const { ticker, price } = req.params;
  try {
    const alertData = { ticker, price, alert_type: "manual request" };

    // Call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `Jsi zkušený trader specializující se na zlato (XAUUSD), stříbro (XAGUSD), Bitcoin (BTCUSD) a indexy.

Přišel manuální požadavek na analýzu:
- Instrument: ${ticker}
- Cena: ${price}
- Čas: ${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}

Odpověz POUZE v tomto formátu:

SIGNAL: [LONG/SHORT/ČEKEJ]
ENTRY: [cena nebo "market"]
SL: [cena stop lossu]
TP1: [první target]
TP2: [druhý target]
RR: [risk/reward ratio]
TIMEFRAME: [doporučený timeframe]
DŮVOD: [2-3 věty vysvětlení]
RIZIKO: [NÍZKÉ/STŘEDNÍ/VYSOKÉ]`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!data.content || !data.content[0]) {
      throw new Error("Anthropic API nevrátilo odpověď: " + JSON.stringify(data));
    }

    const analysis = data.content[0].text;
    const message = formatMessage(analysis, alertData);
    await sendTelegram(message);
    res.json({ status: "ok", sent: true });
  } catch (error) {
    console.error("Chyba v /analyze:", error);
    res.json({ status: "error", error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server běží na portu ${PORT}`);
});
