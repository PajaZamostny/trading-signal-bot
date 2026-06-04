const express = require("express");
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

async function analyzeWithClaude(ticker, price, extra) {
  const prompt = `Jsi AI trading asistent. Tvuj ukol je dat konkretni trading doporuceni na zaklade technicke analyzy.

DULEZITE: Vzdy dej konkretni doporuceni s cislami. Nikdy neodmitej analyzu. Pouzij standardni technickou analyzu a typicke levely pro dany instrument.

Instrument: ${ticker}
Cena: ${price}
Dalsi kontext z alertu: ${extra || "price alert"}
Cas: ${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}

Typicke charakteristiky instrumentu:
- XAUUSD (zlato): volatilita ~$15-30/den, ATR(14) ~$20, swing trady 2-5 dni
- XAGUSD (stribro): volatilita ~$0.3-0.5/den, sleduje zlato
- BTCUSD (bitcoin): volatilita ~2-5%/den, 24/7 trh
- SPX/NAS100/US30: sleduj trend, obchoduj v smeru trendu

Pravidla pro SL a TP:
- SL: 0.5-1x ATR od entry
- TP1: 1.5x SL vzdalenost
- TP2: 2.5x SL vzdalenost
- RR minimum 1:1.5

Odpovez PRESNE v tomto formatu (nic jineho nepridavej):

SIGNAL: LONG nebo SHORT nebo CEKEJ
ENTRY: [cislo]
SL: [cislo]
TP1: [cislo]
TP2: [cislo]
RR: [napr 1:2.0]
TIMEFRAME: [napr 4H swing nebo 1H daytrading]
DUVOD: [2-3 vety - proc tento smer, co naznacuje cena, klic levely]
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
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) {
    throw new Error("API error: " + JSON.stringify(data));
  }
  return data.content[0].text;
}

function formatMessage(analysis, ticker, price) {
  const time = new Date().toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });

  const signalMatch = analysis.match(/SIGNAL:\s*(LONG|SHORT|CEKEJ)/i);
  const signal = signalMatch ? signalMatch[1].toUpperCase() : "?";

  let header = "";
  if (signal === "LONG") header = `<b>*** ${ticker} - LONG (BUY) ***</b>`;
  else if (signal === "SHORT") header = `<b>*** ${ticker} - SHORT (SELL) ***</b>`;
  else header = `<b>${ticker} - CEKEJ</b>`;

  return `${header} | ${time}

<b>Alert cena:</b> ${price}

${analysis}

---
Toto neni financni poradenstvi. Vzdy pouzi vlastni uvazek.`;
}

app.post("/webhook", async (req, res) => {
  console.log("Alert prijat:", JSON.stringify(req.body));
  try {
    const alertData = req.body;
    res.json({ status: "ok" });
    await sendTelegram(`Analyzuji ${alertData.ticker || "instrument"} @ ${alertData.close || alertData.price || "?"}...`);
    const ticker = alertData.ticker || "UNKNOWN";
    const price = alertData.close || alertData.price || "?";
    const analysis = await analyzeWithClaude(ticker, price, alertData.alert_type || alertData.message);
    const message = formatMessage(analysis, ticker, price);
    await sendTelegram(message);
  } catch (error) {
    console.error("Chyba:", error);
    await sendTelegram(`Chyba: ${error.message}`);
  }
});

app.get("/", (req, res) => {
  res.json({ status: "Trading Signal Bot bezi!", time: new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) });
});

app.get("/analyze/:ticker/:price", async (req, res) => {
  const { ticker, price } = req.params;
  try {
    const analysis = await analyzeWithClaude(ticker, price, "manualni test");
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
