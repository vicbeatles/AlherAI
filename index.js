import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { alherData } from "./alherData.js";

const app = express();
app.use(bodyParser.json());

let botPausado = false; // Bandera global

function generarPrompt(message) {
  const contexto = JSON.stringify(alherData, null, 2);
  return `Eres un asistente virtual del Grupo Educativo Alher.
Usa la información de forma completa y precisa para responder de manera cordial y clara a preguntas de padres de familia, alumnos o prospectos.
Si no hay respuesta en los datos, responde educadamente que no puedes responder, sugiriendo contactar al plantel adecuado.

INFORMACION DE ALHER:
${contexto}

PREGUNTA DEL USUARIO: ${message}`;
}

// ✅ Verificación del webhook
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

// ✅ Recepción de mensajes
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];

    // 🔹 Detección de eventos standby (agente humano activo)
    if (entry?.standby) {
      botPausado = true;
      console.log("🧍‍♂️ Se detectó actividad humana, bot en pausa.");
      return res.sendStatus(200);
    }

    const event = entry?.messaging?.[0];
    if (!event) return res.sendStatus(200);

    // 🔹 Si el mensaje es un eco del bot, no hacer nada
    if (event.message?.is_echo) return res.sendStatus(200);

    // 🔹 Si hay un mensaje de un humano y el bot está pausado, no responder
    if (botPausado) {
      console.log("🤖 Bot pausado, no responde hasta reactivación manual.");
      return res.sendStatus(200);
    }

    const senderId = event.sender.id;
    const message = event.message?.text;
    if (!message) return res.sendStatus(200);

    console.log(`📩 Mensaje recibido de ${senderId}: ${message}`);

    const prompt = generarPrompt(message);

    // 🔹 Consulta a la API de Groq
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { role: "system", content: "Eres un asistente amigable que responde mensajes del Colegio Alher de forma clara y cordial." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content ||
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

// ✅ Endpoint manual para reactivar el bot
app.get("/reactivar-bot", (req, res) => {
  botPausado = false;
  console.log("🚀 Bot reactivado manualmente.");
  res.send("Bot reactivado.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Bot Messenger con Groq activo en puerto ${PORT}`));
