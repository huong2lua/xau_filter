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

function parseSignal(text = "") {
  const tf = text.match(/\b(5m|15m)\b/i)?.[1]?.toLowerCase() ?? null;
  const side = text.match(/\b(BUY|SELL)\b/i)?.[1]?.toUpperCase() ?? null;
  return { tf, side };
}

function isFromChannel(msg, channelId) {
  return msg?.chat?.id === channelId;
}

function getText(msg) {
  return typeof msg?.text === "string" ? msg.text : "";
}

async function getPreviousMessageText(channelId, currentMessageId) {
  const list = await userClient.getMessages(channelId, {
    limit: 1,
    offsetId: currentMessageId, // lấy message trước message_id này
  });

  const prev = list?.[0];
  // gramjs message text có thể nằm ở `.message`
  return typeof prev?.message === "string" ? prev.message : "";
}

async function safeForward(ctx, toChannelId, fromChannelId, messageId) {
  await ctx.telegram.forwardMessage(toChannelId, fromChannelId, messageId);
}

/* ================= HANDLER ================= */

bot.on("channel_post", async (ctx) => {
  const msg = ctx.channelPost;

  // chỉ nghe CHANNEL_A
  if (!isFromChannel(msg, CHANNEL_A)) return;

  const text = getText(msg);
  if (!text) return;

  const current = parseSignal(text);
  if (current.tf !== "15m" || !current.side) return;

  try {
    const prevText = await getPreviousMessageText(CHANNEL_A, msg.message_id);
    if (!prevText) return;

    const prev = parseSignal(prevText);

    const isMatch = prev.tf === "5m" && prev.side === current.side;
    if (!isMatch) return;

    await safeForward(ctx, CHANNEL_B, CHANNEL_A, msg.message_id);
    console.log(`🔥 Forwarded M15 ${current.side} | msgId=${msg.message_id}`);
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
    // gramjs có disconnect, nếu version bạn dùng có:
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
