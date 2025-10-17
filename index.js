import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "alher-bot-verify";

// Conexión
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado correctamente");
    res.status(200).send(challenge);
  } else {
    console.warn("Verificación de webhook fallida");
    res.sendStatus(403);
  }
});

// Manejo de datos
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const event = entry?.messaging?.[0];
    const senderId = event?.sender?.id;
    const message = event?.message?.text;

    if (message) {
      console.log(`📩 Mensaje recibido: "${message}" de ${senderId}`);

      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            {
              role: "system",
              content:
                "Eres el asistente virtual oficial del Grupo Educativo Alher. " +
                "Tu tono debe ser cordial, claro y profesional. Responde dudas sobre niveles educativos, inscripciones, horarios, ubicación, contacto y servicios del colegio. " +
                "Si no tienes la información exacta, invita amablemente a contactar al número oficial o visitar el sitio web del colegio.",
            },
            { role: "user", content: message },
          ],
        }),
      });

      const data = await response.json();
      console.log("🧠 Data de Groq:", data);

   
      const reply = data?.choices?.[0]?.message?.content || "Lo siento, no entendí bien tu mensaje.";

     
      await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: reply },
        }),
      });

      console.log(`Respuesta enviada: "${reply}"`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook:", err);
    res.sendStatus(500);
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`));
