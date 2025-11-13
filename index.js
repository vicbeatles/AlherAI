import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { alherData } from "./alherData.js";

const app = express();
app.use(bodyParser.json());

// 🔹 Estado global para controlar si el bot debe responder
let botActivo = true;
let ultimaRespuestaHumana = null;

// 🔹 Función para generar el prompt con datos actualizados
function generarPrompt(message) {
  const contexto = JSON.stringify(alherData, null, 2);
  return `Eres un asistente virtual del Grupo Educativo Alher.
Usa la información de forma completa y precisa para responder de manera cordial y clara a preguntas de padres de familia, alumnos o prospectos.
Si no hay respuesta en los datos, responde educadamente que no puedes responder, sugiriendo contactar al plantel adecuado.

INFORMACION DE ALHER:
${contexto}

PREGUNTA DEL USUARIO: ${message}`;
}

// 🔹 Webhook de verificación
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

// 🔹 Webhook principal
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const event = entry?.messaging?.[0];
    const message = event?.message?.text;
    const senderId = event?.sender?.id;

    // --- 🔸 DETECCIÓN DE RESPUESTA HUMANA ---
    // Si llega un mensaje enviado por alguien del equipo (no usuario del público)
    if (event?.message?.is_echo || event?.message?.from?.id === process.env.PAGE_ID) {
      botActivo = false;
      ultimaRespuestaHumana = new Date();
      console.log("⏸️ Bot pausado: detectada respuesta humana desde la página.");
      return res.sendStatus(200);
    }

    // --- 🔸 Ignorar mensajes sin texto válido ---
    if (!message || !senderId) {
      return res.sendStatus(200);
    }

    // --- 🔸 Si el bot está pausado ---
    if (!botActivo) {
      const minutosDesdeUltimaHumana = (new Date() - ultimaRespuestaHumana) / 60000;
      // Reactivar automáticamente después de 10 minutos sin intervención humana
      if (minutosDesdeUltimaHumana > 10) {
        botActivo = true;
        console.log("▶️ Bot reactivado automáticamente tras 10 minutos sin intervención humana.");
      } else {
        console.log("🤫 Bot en pausa, no se enviará respuesta automática.");
        return res.sendStatus(200);
      }
    }

    console.log(`📩 Mensaje recibido de ${senderId}: ${message}`);

    // Generar prompt con información de Alher
    const prompt = generarPrompt(message);

    // 🔹 Llamada a Groq
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Eres un asistente amigable que responde mensajes de Grupo Educativo Alher de forma clara, amigable y cordial." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "No entendí bien tu mensaje. Prueba de nuevo.";

    // 🔹 Enviar respuesta a Messenger
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

// 🔹 Servidor activo
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot Messenger Alher activo en puerto ${PORT}`));
