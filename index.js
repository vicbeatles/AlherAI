import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { alherData } from "./alherData.js";

const app = express();
app.use(bodyParser.json());

// Función para generar el prompt completo con contexto
function generarPrompt(message) {
  const contexto = JSON.stringify(alherData, null, 2);

  return `Eres el asistente virtual oficial del Grupo Educativo Alher.
Tu tarea es responder de forma clara, amable y completa a padres de familia, alumnos o prospectos, usando ÚNICAMENTE la información proporcionada a continuación.
No inventes enlaces, direcciones, teléfonos ni promociones. Si no tienes el dato, indica educadamente que no está disponible y sugiere contactar al plantel correspondiente.

INFORMACIÓN DE ALHER:
${contexto}

PREGUNTA DEL USUARIO: ${message}`;
}

// VERIFICACIÓN DEL WEBHOOK
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = "alher-bot";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// MANEJO DE MENSAJES
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const event = entry?.messaging?.[0];

    if (!event?.message?.text || !event?.sender?.id) {
      return res.sendStatus(200);
    }

    const senderId = event.sender.id;
    const message = event.message.text;

    console.log(`📩 Mensaje recibido de ${senderId}: ${message}`);

    const prompt = generarPrompt(message);

    // Llamada al modelo mejorado de Groq
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "system",
            content:
              "Eres el asistente oficial de Grupo Educativo Alher. NO inventes datos, enlaces, direcciones ni promociones. Usa solo la información disponible en el contexto. Responde siempre en tono amigable, cálido y con lenguaje claro en español neutro.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    console.log("📡 Data de Groq:", data);

    const reply =
      data?.choices?.[0]?.message?.content ||
      "No entendí bien tu mensaje. ¿Podrías reformularlo, por favor?";

    // Enviar respuesta al usuario en Messenger
    await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: senderId },
        message: { text: reply },
      }),
    });

    console.log(`💬 Respuesta enviada a ${senderId}: ${reply}`);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error en webhook:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot Messenger con Groq activo en puerto ${PORT}`));
