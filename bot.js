const { Telegraf } = require("telegraf");
const dotenv = require("dotenv");

dotenv.config();

console.log("PRODUCT", process.env.PRODUCT)

const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== CHANNEL IDS =====
const CHANNEL_A = -1003256916567;
const CHANNEL_B = -1003479291587;

// ===== PARSE SIGNAL =====
function parseSignal(text = "") {
  const tf = text.match(/\b(5m|15m)\b/i)?.[1]?.toLowerCase();
  const side = text.match(/\b(BUY|SELL)\b/i)?.[1]?.[0]?.toUpperCase();
  return { tf, side };
}

// ===== LISTEN CHANNEL =====
bot.on("channel_post", async (ctx) => {
  const msg = ctx.channelPost;
  console.log("msg.chat.id", msg.chat.id);

  if (msg.chat.id !== CHANNEL_A) return;
  if (!msg.text) return;

  const current = parseSignal(msg.text);

  if (current.tf !== "15m" || !current.side) return;

  try {
    for (let i = 1; i <= 3; i++) {
      const prevMsg = await ctx.telegram.getMessage(
        CHANNEL_A,
        msg.message_id - i
      );

      if (!prevMsg?.text) continue;

      const prev = parseSignal(prevMsg.text);

      if (prev.tf === "5m" && prev.side === current.side) {
        await ctx.telegram.forwardMessage(
          CHANNEL_B,
          CHANNEL_A,
          msg.message_id
        );
        console.log(`Forwarded M15 ${current.side}`);
        break;
      }
    }
  } catch (err) {
    console.log("Error:", err.message);
  }
});

// ===== START =====
bot.launch();
console.log("🤖 Bot is running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
