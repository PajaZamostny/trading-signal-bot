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
  const prompt = `Jsi zkuĹĄenĂ˝ trader specializujĂ­cĂ­ se na zlato (XAUUSD), stĹĂ­bro (XAGUSD), Bitcoin (BTCUSD) a indexy (SPX, NAS100, US30).

PĹiĹĄel alert z TradingView s tÄmito daty:
- Instrument: ${alertData.ticker || "neznĂĄmĂ˝"}
- Timeframe: ${alertData.timeframe || "neznĂĄmĂ˝"}
- Cena: ${alertData.close || alertData.price || "neznĂĄmĂĄ"}
- Typ alertu: ${alertData.alert_type || alertData.message || "price alert"}
- Äas: ${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}

Analyzuj situaci a odpovÄz POUZE v tomto formĂĄtu (nic jinĂŠho nepĹidĂĄvej):

SIGNAL: [LONG/SHORT/ÄEKEJ]
ENTRY: [cena nebo "market"]
SL: [cena stop lossu]
TP1: [prvnĂ­ target]
TP2: [druhĂ˝ target]
RR: [risk/reward ratio]
TIMEFRAME: [doporuÄenĂ˝ timeframe pro tento trade]
DĹŽVOD: [2-3 vÄty vysvÄtlenĂ­ - technickĂĄ situace, makro kontext, proÄ prĂĄvÄ teÄ]
RIZIKO: [NĂZKĂ/STĹEDNĂ/VYSOKĂ]

BuÄ konkrĂŠtnĂ­ s ÄĂ­sly. SL a TP urÄi podle ATR, klĂ­ÄovĂ˝ch levelĹŻ a logiky trhu. Pokud situace nenĂ­ vhodnĂĄ pro vstup, Ĺekni ÄEKEJ a vysvÄtli proÄ.`;

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
  const signalMatch = analysis.match(/SIGNAL:\s*(LONG|SHORT|ÄEKEJ)/i);
  const signal = signalMatch ? signalMatch[1].toUpperCase() : "?";

  let emoji = "âł";
  if (signal === "LONG") emoji = "đ˘";
  if (signal === "SHORT") emoji = "đ´";

  return `${emoji} <b>${ticker} â ${signal}</b> | ${time}

<b>đ Alert cena:</b> ${price}

${analysis}

ââââââââââââââââââ
â ď¸ <i>Toto nenĂ­ finanÄnĂ­ poradenstvĂ­. VĹždy pouĹži vlastnĂ­ Ăşsudek.</i>`;
}

// Main webhook endpoint - TradingView sends alerts here
app.post("/webhook", async (req, res) => {
  console.log("đ¨ Alert pĹijat:", JSON.stringify(req.body));

  try {
    const alertData = req.body;

    // Send immediate acknowledgment to TradingView
    res.json({ status: "ok" });

    // Notify that we received alert
    await sendTelegram(
      `đĄ <b>Alert pĹijat!</b>\nđ Analyzuji ${alertData.ticker || "instrument"}...`
    );

    // Analyze with Claude
    const analysis = await analyzeWithClaude(alertData);

    // Format and send
    const message = formatMessage(analysis, alertData);
    await sendTelegram(message);
  } catch (error) {
    console.error("Chyba:", error);
    await sendTelegram(`â Chyba pĹi zpracovĂĄnĂ­ alertu: ${error.message}`);
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "â Trading Signal Bot bÄĹžĂ­!",
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `Jsi zkuĹĄenĂ˝ trader specializujĂ­cĂ­ se na zlato (XAUUSD), stĹĂ­bro (XAGUSD), Bitcoin (BTCUSD) a indexy.

PĹiĹĄel manuĂĄlnĂ­ poĹžadavek na analĂ˝zu:
- Instrument: ${ticker}
- Cena: ${price}
- Äas: ${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}

OdpovÄz POUZE v tomto formĂĄtu:

SIGNAL: [LONG/SHORT/ÄEKEJ]
ENTRY: [cena nebo "market"]
SL: [cena stop lossu]
TP1: [prvnĂ­ target]
TP2: [druhĂ˝ target]
RR: [risk/reward ratio]
TIMEFRAME: [doporuÄenĂ˝ timeframe]
DĹŽVOD: [2-3 vÄty vysvÄtlenĂ­]
RIZIKO: [NĂZKĂ/STĹEDNĂ/VYSOKĂ]`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!data.content || !data.content[0]) {
      throw new Error("Anthropic API nevrĂĄtilo odpovÄÄ: " + JSON.stringify(data));
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
  console.log(`đ Server bÄĹžĂ­ na portu ${PORT}`);
});
