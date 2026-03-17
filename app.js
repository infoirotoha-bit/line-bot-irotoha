const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const ACCESS_TOKEN = "cuXlAbmvPG8M5ftYXkCK+26YTwmtxAy166O/24uFtQdLNb/RrEnOK0wnm68oUBr1pfWi9Eogw7i9MPLbfo4kgVNr50HTpLxkx0pAqhV6PJxzay/+v5rmzZCzqE5r5+wbN2NkJirideotgGxoYqnaxgdB04t89/1O/w1cDnyilFU=";

app.post("/webhook", async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type === "message") {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: "LINE連携成功🔥"
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`
          }
        }
      );
    }
  }

  res.sendStatus(200);
});

app.listen(3000);
