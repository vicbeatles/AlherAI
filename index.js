import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());


app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "alher-bot";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});



app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const event = entry?.messaging?.[0];
    const senderId = event?.sender?.id;
    const message = event?.message?.text;

    if (message) {
      // Llamada al modelo Llama 3 en Groq
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: "groq/llama3-groq-8b-8192-tool-use-preview",

          messages: [
            { role: "system", content: "Eres un asistente amigable que responde mensajes del Colegio Alher." },
            { role: "user", content: message }
          ],
        }),
      });

   
      const choice = data.choices?.[0];
      const reply = choice?.message?.content || choice?.content || choice?.text || "No entendí bien tu mensaje.";


      // Envía la respuesta a Messenger
      await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: reply },
        }),
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(10000, () => console.log("🤖 Bot Messenger con Groq activo"));
