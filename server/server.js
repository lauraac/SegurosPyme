// server/server.js
import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// === Servir toda la RAÍZ del proyecto ===
const ROOT_DIR = path.resolve(__dirname, ".."); // sube desde /server a la raíz
app.use(express.static(ROOT_DIR));

// Landing en "/"
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "index.html"));
});

// === Rutas explícitas correctas ===
const DASHBOARD_FILE = path.join(ROOT_DIR, "Dashboard", "index.html");
const COTI_FILE = path.join(ROOT_DIR, "cotizacion", "index.html"); // minúsculas

// Mensajes de ayuda si faltan archivos
if (!fs.existsSync(DASHBOARD_FILE)) {
  console.warn("⚠️ No se encontró Dashboard/index.html en:", DASHBOARD_FILE);
}
if (!fs.existsSync(COTI_FILE)) {
  console.warn("⚠️ No se encontró cotizacion/index.html en:", COTI_FILE);
}

// Endpoints explícitos (case-insensitive)
app.get(
  [
    "/dashboard",
    "/Dashboard",
    "/dashboard/index.html",
    "/Dashboard/index.html",
  ],
  (_req, res) => res.sendFile(DASHBOARD_FILE)
);
app.get(
  [
    "/cotizacion",
    "/Cotizacion",
    "/cotizacion/index.html",
    "/Cotizacion/index.html",
  ],
  (_req, res) => res.sendFile(COTI_FILE)
);

// Salud opcional
app.get("/health", (_req, res) => res.send("ok"));

// === OpenAI Assistants ===
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ASSISTANT_ID = process.env.ASSISTANT_ID;

app.post("/api/chat", async (req, res) => {
  const { message, threadId, userName, userCompany } = req.body || {};

  // Instrucciones del modo "Presupuesto rápido"
  const EXTRA_INSTRUCTIONS = `
Eres el Asistente de Presupuestos de SegurosPyme. Responde SIEMPRE en español.

Objetivo (captura exacta de estos 4 datos):
1) cliente (si userName viene en el contexto, úsalo y NO lo vuelvas a pedir),
2) fecha objetivo (puede llegar en cualquier formato entendible en español, y DEBES convertirla tú a formato ISO AAAA-MM-DD en el JSON final),
3) producto (ej. "Seguro de auto cobertura amplia"),
4) precio total (monto y moneda, MXN por defecto si no especifican).
Opcional: detalle/observaciones.

Flujo:
- Pregunta SOLO lo que falte, de uno en uno.
- Si recibes una fecha en formato no ISO, conviértela tú mismo al formato ISO antes de entregarla en el JSON final.
- Resume y pregunta: "¿Confirmas que está correcto? (sí/no)".
- Si el usuario dice "sí / correcto / ok / listo", responde ÚNICAMENTE con un bloque JSON (sin texto extra) en este formato exacto:

\`\`\`json
{
  "event": "presupuesto_ok",
  "cliente": "<nombre>",
  "fecha": "2025-08-30",
  "producto": "<producto>",
  "precio": { "monto": 123456.78, "moneda": "MXN" },
  "detalle": "Breve descripción opcional"
}
\`\`\`

Reglas:
- No imprimas nada antes o después del bloque JSON cuando confirmes.
- No pidas al usuario que convierta fechas: conviértelas tú internamente.
- Si preguntan cosas fuera de Seguros PyME, responde: "Esta consulta no está dentro del alcance del asistente de Seguros PyME."
`;

  // Contexto dinámico
  const CONTEXTO = `El usuario se llama "${userName || "Cliente"}"${
    userCompany ? ` y su empresa es "${userCompany}"` : ""
  }. Salúdalo por su nombre si corresponde y NO le pidas el nombre de nuevo.`;

  try {
    // 1) thread
    const thread = threadId
      ? { id: threadId }
      : await client.beta.threads.create();

    // 2) mensaje del usuario
    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: message || "",
    });

    // 3) ejecutar asistente con instrucciones del modo + contexto
    let run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
      instructions: `${EXTRA_INSTRUCTIONS}\n\nContexto:\n${CONTEXTO}`,
    });

    // 4) esperar a que termine
    while (run.status !== "completed") {
      await new Promise((r) => setTimeout(r, 800));
      run = await client.beta.threads.runs.retrieve(thread.id, run.id);
      if (["failed", "expired", "cancelled"].includes(run.status)) {
        throw new Error(`Run ${run.status}`);
      }
    }

    // 5) última respuesta
    const msgs = await client.beta.threads.messages.list(thread.id, {
      limit: 1,
      order: "desc",
    });
    const reply = msgs.data[0]?.content?.[0]?.text?.value || "(sin respuesta)";
    res.json({ reply, threadId: thread.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("📂 Sirviendo raíz desde:", ROOT_DIR);
  console.log(`✅ http://localhost:${PORT}`);
});
