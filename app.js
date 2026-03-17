const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;      // LINE Channel Access Token
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;  // OpenAI API Key

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

async function createPersonalityAnalysis(birthDate) {
  const prompt = `
あなたは日本語でやさしく丁寧に性格分析をする占いアシスタントです。
以下の生年月日の人について、前向きで読みやすい性格分析を作成してください。

生年月日: ${birthDate.original}

ルール:
- 日本語で自然に書く
- 250〜400文字程度
- 以下の構成で出力
1. 性格の核
2. 強み
3. 恋愛傾向
4. 仕事傾向
5. 一言アドバイス
- 見出しを入れる
- 絵文字は少しだけ使ってよい
- 改行を適度に入れる
- 「断定しすぎない、やさしい表現」にする
`;

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

  // Responses APIの返答からテキストを安全に拾う
  let text =
    response.data?.output_text ||
    response.data?.output?.map(item =>
      item?.content?.map(c => c?.text).join("")
    ).join("\n") ||
    "分析結果の生成に失敗しました。もう一度お試しください。";

  text = String(text).replace(/\\n/g, "\n").trim();
  return text;
}

async function replyToLine(replyToken, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages: [
        {
          type: "text",
          text
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

  // LINEには先に200を返す
  res.sendStatus(200);

  for (const event of events) {
    try {
      if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken) {
        continue;
      }

      const userMessage = event.message.text.trim();
      const birthDate = parseBirthDate(userMessage);

      if (!birthDate) {
        await replyToLine(
          event.replyToken,
          "生年月日を送ってください✨\n\n例：1990/04/11\nまたは\n1990年4月11日"
        );
        continue;
      }

      const analysis = await createPersonalityAnalysis(birthDate);
      await replyToLine(event.replyToken, analysis);

    } catch (error) {
      console.error("Webhook error:", error?.response?.data || error.message);
      try {
        await replyToLine(
          event.replyToken,
          "申し訳ありません。分析中にエラーが発生しました。少し時間をおいてもう一度お試しください。"
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
