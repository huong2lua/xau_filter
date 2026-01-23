const dotenv = require("dotenv");
const { Telegraf } = require("telegraf");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

dotenv.config();

/* ================= ENV + CONFIG ================= */

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const cfg = {
  apiId: Number(mustEnv("A_ID")),
  apiHash: mustEnv("A_HASH"),
  session: mustEnv("A_SS"),
  botToken: mustEnv("BOT_TOKEN"),
};

const CHANNEL_A = -1003256916567;
const CHANNEL_B = -1003479291587;

/* ================= TELEGRAM CLIENTS ================= */

const userClient = new TelegramClient(
  new StringSession(cfg.session),
  cfg.apiId,
  cfg.apiHash,
  { connectionRetries: 5 }
);

const bot = new Telegraf(cfg.botToken);

/* ================= HELPERS ================= */

// Parse only what you need: timeframe + side
function parseSignal(text = "") {
  const tf = text.match(/\b(5m|15m)\b/i)?.[1]?.toLowerCase() ?? null;
  const side = text.match(/\b(BUY|SELL)\b/i)?.[1]?.toUpperCase() ?? null;
  return { tf, side };
}

function isFromChannel(msg, channelId) {
  return msg?.chat?.id === channelId;
}

// IMPORTANT: support both text and caption (photo/video/document captions)
function getText(msg) {
  if (typeof msg?.text === "string") return msg.text;
  if (typeof msg?.caption === "string") return msg.caption;
  return "";
}

/**
 * Scan backward to find the nearest previous "5m" signal (ignore other TFs / noise).
 * - offsetId = currentMessageId: fetch messages before current
 * - lookback: how many previous messages to inspect
 */
async function getPrevious5mSignal(channelId, currentMessageId, lookback = 30) {
  const list = await userClient.getMessages(channelId, {
    limit: lookback,
    offsetId: currentMessageId,
  });

  for (const m of list || []) {
    // gramjs message text is in `.message`
    const t = typeof m?.message === "string" ? m.message : "";
    if (!t) continue;

    const p = parseSignal(t);
    if (p.tf === "5m" && p.side) {
      return {
        tf: p.tf,
        side: p.side,
        text: t,
        messageId: m.id,
        date: m.date,
      };
    }
  }
  return null;
}

async function safeForward(ctx, toChannelId, fromChannelId, messageId) {
  await ctx.telegram.forwardMessage(toChannelId, fromChannelId, messageId);
}

/* ================= HANDLER ================= */

bot.on("channel_post", async (ctx) => {
  const msg = ctx.channelPost;

  // only listen CHANNEL_A
  if (!isFromChannel(msg, CHANNEL_A)) return;

  const text = getText(msg);
  if (!text) return;

  const current = parseSignal(text);

  // only process 15m signals that have BUY/SELL
  if (current.tf !== "15m" || !current.side) return;

  try {
    // NEW: find nearest previous 5m signal (skip 4h/others in between)
    const prev5m = await getPrevious5mSignal(CHANNEL_A, msg.message_id, 2);
    if (!prev5m) return;

    const isMatch = prev5m.side === current.side;
    if (!isMatch) return;

    await safeForward(ctx, CHANNEL_B, CHANNEL_A, msg.message_id);

    console.log(
      `🔥 Forwarded M15 ${current.side} | msgId=${msg.message_id} | matched prev5m msgId=${prev5m.messageId}`
    );
  } catch (err) {
    console.error("Handler error:", err?.message || err);
  }
});

/* ================= START / STOP ================= */

async function start() {
  await userClient.connect();
  console.log("👤 User account connected");

  bot.launch();
  console.log("🤖 Bot is running...");
}

async function shutdown(signal) {
  try {
    console.log(`🛑 Shutting down (${signal})...`);
    bot.stop(signal);

    if (typeof userClient.disconnect === "function") {
      await userClient.disconnect();
    }
  } catch (e) {
    console.error("Shutdown error:", e?.message || e);
  } finally {
    process.exit(0);
  }
}

start().catch((e) => {
  console.error("Startup error:", e?.message || e);
  process.exit(1);
});

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
