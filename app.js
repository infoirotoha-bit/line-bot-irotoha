const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MBTI_TYPES = new Set([
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP"
]);

function parseBirthDate(text) {
  const normalized = String(text)
    .trim()
    .replace(/[年月.\-]/g, "/")
    .replace(/日/g, "")
    .replace(/\s+/g, "");

  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  return { year, month, day, original: `${year}/${month}/${day}` };
}

function parseMbti(text) {
  const normalized = String(text).trim().toUpperCase().replace(/\s+/g, "");
  return MBTI_TYPES.has(normalized) ? normalized : null;
}

async function callOpenAI(prompt) {
  const response = await axios.post(
    "https://api.openai.com/v1/responses",
    {
      model: "gpt-5.4",
      input: prompt
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 60000
    }
  );

  let text =
    response.data?.output_text ||
    response.data?.output
      ?.map(item => item?.content?.map(c => c?.text || "").join(""))
      .join("\n") ||
    "うまく生成できませんでした。もう一度お試しください。";

  return String(text).replace(/\\n/g, "\n").trim();
}

async function createPersonalityAnalysis(birthDate) {
  const prompt = `
あなたは日本語でやさしく丁寧に性格分析をする占いアシスタントです。
以下の生年月日の人について、前向きで読みやすい性格分析を作成してください。

生年月日: ${birthDate.original}

ルール:
- 日本語で自然に書く
- 250〜400文字程度
- 以下の構成で出力
【性格の核】
【強み】
【恋愛傾向】
【仕事傾向】
【一言アドバイス】
- 見出しを入れる
- 絵文字は少しだけ使ってよい
- 改行を適度に入れる
- 断定しすぎない、やさしい表現にする
`;

  return await callOpenAI(prompt);
}

async function createMbtiAnalysis(mbti) {
  const prompt = `
あなたはMBTIの解説が得意な日本語アシスタントです。
以下のMBTIタイプについて、親しみやすく分かりやすい解説を作成してください。

MBTI: ${mbti}

ルール:
- 日本語で自然に書く
- 250〜400文字程度
- 以下の構成で出力
【${mbti}タイプの特徴】
【強み】
【恋愛傾向】
【仕事傾向】
【一言アドバイス】
- 改行をしっかり入れる
- ポジティブで読みやすくする
- 絵文字は少しだけ使ってよい
`;

  return await callOpenAI(prompt);
}

async function createChatReply(userMessage) {
  const prompt = `
あなたはLINEで会話する、やさしく親しみやすい日本語アシスタントです。
相手のメッセージに自然に返答してください。

ユーザーメッセージ:
${userMessage}

ルール:
- 日本語で返す
- 1〜4文程度
- やさしく自然な会話にする
- 必要に応じて少しだけ質問して会話を続ける
- 相手が生年月日やMBTIを送りたくなるように、最後に軽く案内してもよい
`;

  return await callOpenAI(prompt);
}

async function replyToLine(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [
        {
          type: "text",
          text: text.slice(0, 5000)
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
}

app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];
  res.sendStatus(200);

  for (const event of events) {
    try {
      if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) {
        continue;
      }

      const userMessage = event.message.text.trim();
      const birthDate = parseBirthDate(userMessage);
      const mbti = parseMbti(userMessage);

      let replyText = "";

      if (birthDate) {
        replyText = await createPersonalityAnalysis(birthDate);
      } else if (mbti) {
        replyText = await createMbtiAnalysis(mbti);
      } else {
        replyText = await createChatReply(userMessage);
      }

      await replyToLine(event.replyToken, replyText);

    } catch (error) {
      console.error("Webhook error:", error?.response?.data || error.message);
      try {
        await replyToLine(
          event.replyToken,
          "申し訳ありません。処理中にエラーが発生しました。少し時間をおいてもう一度お試しください。"
        );
      } catch (replyError) {
        console.error("Reply error:", replyError?.response?.data || replyError.message);
      }
    }
  }
});

app.get("/", (req, res) => {
  res.send("LINE bot is running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is running");
});
