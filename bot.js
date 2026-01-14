const { Telegraf } = require("telegraf");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const dotenv = require("dotenv");

dotenv.config();

/* ================= USER ACCOUNT ================= */

const cfg = {
  apiId: process.env.A_ID,
  apiHash: process.env.A_HASH,
  session: process.env.A_SS,
};

const myClient = new TelegramClient(
  new StringSession(cfg.session),
  Number(cfg.apiId),
  cfg.apiHash,
  { connectionRetries: 5 }
);

(async () => {
  await myClient.connect();
  console.log("👤 User account connected");
})();

/* ================= BOT ================= */

const bot = new Telegraf(process.env.BOT_TOKEN);

const CHANNEL_A = -1003256916567;
const CHANNEL_B = -1003479291587;

/* ================= PARSE ================= */

function parseSignal(text = "") {
  const tf = text.match(/\b(5m|15m)\b/i)?.[1]?.toLowerCase();
  const side = text.match(/\b(BUY|SELL)\b/i)?.[1]?.toUpperCase();
  return { tf, side };
}

/* ================= LISTEN ================= */

bot.on("channel_post", async (ctx) => {
  const msg = ctx.channelPost;

  if (msg.chat.id !== CHANNEL_A) return;
  if (!msg.text) return;

  const current = parseSignal(msg.text);
  if (current.tf !== "15m" || !current.side) return;

  try {
    // 👉 DÙNG USER ACCOUNT ĐỌC MESSAGE TRƯỚC ĐÓ
    const prevMessages = await myClient.getMessages(CHANNEL_A, {
      limit: 1,
      offsetId: msg.message_id,
    });

    if (!prevMessages || prevMessages.length === 0) return;

    const prevText = prevMessages[0].message;
    if (!prevText) return;

    const prev = parseSignal(prevText);

    if (prev.tf === "5m" && prev.side === current.side) {
      // 👉 BOT forward
      await ctx.telegram.forwardMessage(
        CHANNEL_B,
        CHANNEL_A,
        msg.message_id
      );

      console.log(`🔥 Forwarded M15 ${current.side}`);
    }
  } catch (err) {
    console.log("Error:", err.message);
  }
});

/* ================= START ================= */

bot.launch();
console.log("🤖 Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
