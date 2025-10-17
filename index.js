import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { alherData } from "./alherData.js"; // Asegúrate de tener este archivo con todos los datos

const app = express();
app.use(bodyParser.json());

// Función para generar el prompt completo con contexto
function generarPrompt(message) {
  // Convertimos los datos a texto legible para la IA
  const contexto = JSON.stringify(alherData, null, 2);

  return `Eres un asistente virtual del Grupo Educativo Alher.
Usa la información de forma completa y precisa para responder de manera cordial y clara a preguntas de padres de familia, alumnos o prospectos.
Si no hay respuesta en los datos, responde educadamente que no puedes responder, sugiriendo contactar al plantel adecuado.

INFORMACION DE ALHER:
${contexto}

PREGUNTA DEL USUARIO: ${message}`;
}

// CONEXION
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

// MANEJO DE DATOS
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

    // Generamos prompt con toda la información de Alher
    const prompt = generarPrompt(message);

    // Llamada a Groq
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Eres un asistente amigable que responde mensajes del Colegio Alher de forma clara y cordial." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    console.log("📡 Data de Groq:", data);

    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "No entendí bien tu mensaje. Prueba de nuevo.";

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
