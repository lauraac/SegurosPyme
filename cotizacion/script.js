/* ================== Config rápido ================== */
const AUTO_DOWNLOAD_PDF = true;
const AUTO_DOWNLOAD_JSON = false;
/* ===== Identidad visible del asistente ===== */
const AGENT_NAME = "Lia";

/* ================== UI ================== */
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messagesEl = document.getElementById("messages");
const pdfBtn = document.getElementById("pdf-btn");
const backBtn = document.getElementById("back-btn");
const logoutBtn = document.getElementById("logout-btn");
let IS_SENDING = false;

/* ================== Utils ================== */
function slug(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "")
    .toLowerCase();
}
function quotesKey(user, company) {
  return `sp:quotes:${slug(user || "anon")}:${slug(company || "")}`;
}
function quoteStorageKey(user, company) {
  return `sp:lastQuote:${slug(user || "anon")}:${slug(company || "")}`;
}
const BASE = location.hostname.endsWith("github.io")
  ? `/${location.pathname.split("/")[1]}/`
  : "/";

/* ================== Dónde está la API ================== */
const API_URL = "https://seguros-pyme-api.vercel.app/api/chat";

/* Helpers */
function getParam(n) {
  return new URLSearchParams(location.search).get(n);
}
function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function prettyDate(d) {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    return dt.toLocaleDateString();
  }
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : dt.toLocaleDateString();
}
// === Biblioteca de PDFs (por usuario/empresa) ===
const MAX_STORED_PDFS = 8;
const pdfLibKey = (u, c) => `sp:pdfLib:${slug(u)}:${slug(c)}`;

function addPdfToLibrary({ kind, title, filename, dataUrl, meta }) {
  try {
    const key = pdfLibKey(USER_NAME, USER_COMPANY);
    const item = {
      id: crypto.randomUUID?.() || String(Date.now()),
      kind, // "pyme" | "presupuesto" | "pyme_pdf"
      title, // texto visible
      filename, // nombre sugerido
      dataUrl, // "data:application/pdf;base64,...."
      meta: meta || {}, // lo que quieras guardar (input, precios, etc.)
      createdAt: new Date().toISOString(),
    };
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    const next = [item, ...arr].slice(0, MAX_STORED_PDFS);
    localStorage.setItem(key, JSON.stringify(next));
  } catch (e) {
    console.warn("No se pudo guardar PDF en la biblioteca:", e);
  }
}

/* ======= TARIFAS Y COBERTURAS (según tabla) ======= */

/* 1) Tasa base por actividad (tabla “Tarifa base por actividad”) */
const BASE_RATE_BY_ACTIVITY = [
  {
    match: /libreri[aá]s|perfumer[ií]as|[óo]pticas|oficinas|jugueter[ií]as/i,
    rate: 0.8,
  },
  {
    match:
      /minimercados|mini\s*mercados|helader[ií]as|panader[ií]as|indumentaria/i,
    rate: 1.1,
  },
  {
    match: /restaurantes(?!.*freidoras)|gimnasios|tiendas\s+grandes/i,
    rate: 1.6,
  },
  {
    match:
      /talleres\s+mec[aá]nicos|electrodom[eé]sticos|cocinas\s+activas|freidoras/i,
    rate: 2.2,
  },
  {
    match: /inflamables|inundable[s]?|alto|inspecci[oó]n|coberturas altas/i,
    rate: 3.0,
  },
];

const PLAN_MATRIX = {
  Base: [
    "incendio_edificio_contenidos",
    "responsabilidad_civil",
    "limpieza_escombros",
    "robo",
    "cristales", // ← Base también incluye cristales
  ],
  Medio: [
    "incendio_edificio_contenidos",
    "responsabilidad_civil",
    "limpieza_escombros",
    "robo",
    "robo_valores_caja", // ← solo caja
    "perdida_beneficios",
    "cristales",
  ],
  Plus: [
    "incendio_edificio_contenidos",
    "responsabilidad_civil",
    "limpieza_escombros",
    "robo",
    "robo_valores_caja", // caja
    "robo_valores_transito", // + tránsito
    "perdida_beneficios",
    "equipos_electronicos",
    "danios_electricos",
    "danios_agua",
    "cristales",
  ],
};

/* 3) Mapa de recargos por cobertura adicional (porcentaje anual) */
/*    TODO: coloca aquí los números reales de tu documento.
      Solo dejé cristales=0.05% porque te lo confirmaron. Los demás ponlos tú. */
const COVERAGE_SURCHARGE = {
  incendio_edificio_contenidos: 0,
  responsabilidad_civil: 0,
  limpieza_escombros: 0,
  robo: 0,

  // ⚠️ Pon aquí tus % reales
  robo_valores_caja: 0.15, // ej. 0.15%
  robo_valores_transito: 0.15, // ej. 0.15%
  perdida_beneficios: 0.4,
  equipos_electronicos: 0.28,
  danios_electricos: 0.2,
  danios_agua: 0.15,
  cristales: 0.05, // confirmado
};

/* 4) Cómo mapeamos tus “sumas” del chat a coberturas */
function coverageSumaMap(input) {
  return {
    incendio_edificio_contenidos:
      Number(input.sumaContenido || 0) + Number(input.sumaEdificio || 0),
    responsabilidad_civil: 0,
    limpieza_escombros: 0,
    robo: 0,

    robo_valores_caja: Number(input.sumaValoresCaja || 0),
    robo_valores_transito: Number(input.sumaValoresTransito || 0),

    perdida_beneficios: 0,
    equipos_electronicos: Number(input.sumaElectronicos || 0),
    danios_electricos: 0,
    danios_agua: 0,
    cristales: Number(input.sumaCristales || 0),
  };
}

/* 5) Detecta la tasa base por actividad (primer match; si nada, usa 1.6 como “medio”) */
function baseRateForActivity(actividad = "") {
  const t = String(actividad || "");
  for (const row of BASE_RATE_BY_ACTIVITY) {
    if (row.match.test(t)) return row.rate;
  }
  return 1.6; // por defecto “Medio”
}

/* 6) Calcula premio por plan con la fórmula:  Precio = (SA * TasaTotal)/100 */
function computePlanPremiumFromMatrix(planName, input) {
  const inc = PLAN_MATRIX[planName] || [];
  const base = baseRateForActivity(input.actividadPrincipal);

  // ← necesitamos las sumas antes para decidir si recargar o no
  const sumas = coverageSumaMap(input);

  // Recargos solo para coberturas incluidas con suma > 0
  const surcharges = inc.reduce((acc, key) => {
    const recargo = COVERAGE_SURCHARGE[key] || 0;
    const suma = Number(sumas[key] || 0);
    return acc + (suma > 0 ? recargo : 0);
  }, 0);

  const tasaTotal = base + surcharges; // % anual total del plan

  // SA del plan = suma de las sumas de las coberturas incluidas
  const SA = inc.reduce((acc, key) => acc + (Number(sumas[key]) || 0), 0);

  const primaNeta = (SA * tasaTotal) / 100;
  const gastosExpedicion = SA > 0 ? 150 : 0;
  const derechos = 0;
  const iva = (primaNeta + gastosExpedicion + derechos) * 0.16;
  const primaTotal = primaNeta + gastosExpedicion + derechos + iva;

  // Detalle por cobertura (sin prorrateo de prima por cobertura)
  const detalle = inc.map((key) => ({
    clave: key,
    descripcion: key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    suma: Number(sumas[key]) || 0,
    prima: null,
  }));

  return {
    nombrePlan: planName,
    tasaBase: base,
    recargos: surcharges,
    tasaTotal,
    SA,
    coberturas: detalle,
    primaNeta,
    gastosExpedicion,
    derechos,
    iva,
    primaTotal,
  };
}

/* 7) Construye los 3 planes con el esquema nuevo */
function buildPlansFromInput(input) {
  return [
    computePlanPremiumFromMatrix("Base", input),
    computePlanPremiumFromMatrix("Medio", input),
    computePlanPremiumFromMatrix("Plus", input),
  ];
}

/* ================== Sesión ================== */
const qName = getParam("name");
const qCompany = getParam("company");
const USER_NAME = qName ?? localStorage.getItem("userName");
const USER_COMPANY = qCompany ?? localStorage.getItem("userCompany");
const SHOULD_RESET = getParam("new") === "1" || getParam("reset") === "1";

window.addEventListener("DOMContentLoaded", () => {
  if (SHOULD_RESET) {
    resetConversationState(); // limpia threadId, history, PYME_STATE, inputs y botón PDF
    addMessage(
      "Lia",
      "🔄 Nueva cotización iniciada. Dime el nombre del negocio y la actividad."
    );
  }
});

if (!USER_NAME || !USER_COMPANY) {
  window.location.href = "../index.html";
  throw new Error("Sin sesión");
}
if (qName) localStorage.setItem("userName", USER_NAME);
if (qCompany) localStorage.setItem("userCompany", USER_COMPANY);
function threadKey() {
  return `sp:thread:${slug(USER_NAME)}:${slug(USER_COMPANY)}`;
}

/* ================== Estado ================== */
let THREAD_ID = localStorage.getItem(threadKey()) || null;
let miniQuote = null;
if (pdfBtn) pdfBtn.disabled = true;

/* ================== Historial ================== */
const HKEY = `sp:history:${slug(USER_NAME)}:${slug(USER_COMPANY)}`;
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HKEY) || "[]");
  } catch {
    return [];
  }
}
function pushHistory(role, content) {
  const h = getHistory();
  h.push({ role, content });
  localStorage.setItem(HKEY, JSON.stringify(h.slice(-14)));
}
function clearHistory() {
  localStorage.removeItem(HKEY);
}
function resetConversationState() {
  try {
    localStorage.removeItem(threadKey());
    localStorage.removeItem("threadId");
    clearHistory();
    const KEY = `sp:pymeState:${slug(USER_NAME)}:${slug(USER_COMPANY)}`;
    localStorage.removeItem(KEY);
  } catch {}
  THREAD_ID = null;
  PYME_STATE = {};
  LAST_QUESTION = "";
  miniQuote = null;
  window._lastPyME = null;
  CURRENT_INPUT = {
    sumaContenido: null,
    sumaEdificio: null,
    sumaValoresCaja: null,
    sumaValoresTransito: null,
    sumaElectronicos: null,
    sumaCristales: null,
  };
  if (messagesEl) messagesEl.innerHTML = "";
  if (pdfBtn) pdfBtn.disabled = true;
  input?.focus();
}

/* ===== HOTFIX Estado PyME + captura de montos por pregunta ===== */
const PYME_STATE_KEY = `sp:pymeState:${slug(USER_NAME)}:${slug(USER_COMPANY)}`;
let PYME_STATE = (() => {
  try {
    return JSON.parse(localStorage.getItem(PYME_STATE_KEY) || "{}");
  } catch {
    return {};
  }
})();
function savePymeState() {
  try {
    localStorage.setItem(PYME_STATE_KEY, JSON.stringify(PYME_STATE));
  } catch {}
}
function updateStateFromUser(text) {
  const t = String(text || "").trim();
  let m = t.match(
    /(?:mi\s+negocio\s+se\s+llama|se\s+llama|nombre\s*[:=])\s+(.+)/i
  );
  if (m && !PYME_STATE.negocioNombre) {
    PYME_STATE.negocioNombre = m[1].trim().replace(/[."”]+$/, "");
    savePymeState();
  }
  m = t.match(/(?:actividad\s*principal\s*[:=]|actividad\s*[:=])\s+(.+)/i);
  if (m && !PYME_STATE.actividadPrincipal) {
    PYME_STATE.actividadPrincipal = m[1].trim().replace(/[."”]+$/, "");
    savePymeState();
  } else if (
    /^(es|somos|vendo|vendemos|fabricamos|brindo|ofrezco|ofrecemos)\b/i.test(
      t
    ) &&
    !PYME_STATE.actividadPrincipal
  ) {
    PYME_STATE.actividadPrincipal = t.replace(/[."”]+$/, "").trim();
    savePymeState();
  }
}
function buildShortContext() {
  const parts = [
    "Instrucciones: Te llamas 'Lia'. No uses 'Agente Seguros PyME' ni otros nombres. Responde en español.",
  ];
  if (PYME_STATE.negocioNombre)
    parts.push(`Nombre del negocio: ${PYME_STATE.negocioNombre}`);
  if (PYME_STATE.actividadPrincipal)
    parts.push(`Actividad principal: ${PYME_STATE.actividadPrincipal}`);
  return parts.length ? `[[Contexto conocido]]\n${parts.join("\n")}\n\n` : "";
}

/* Captura de montos por pregunta */
let LAST_QUESTION = "";
let CURRENT_INPUT = {
  sumaContenido: null,
  sumaEdificio: null,
  sumaValoresCaja: null,
  sumaValoresTransito: null,
  sumaElectronicos: null,
  sumaCristales: null,
};
function mapQuestionToField(q) {
  const t = (q || "").toLowerCase();
  if (/contenido/.test(t)) return "sumaContenido";
  if (/edificio/.test(t)) return "sumaEdificio";
  if (/valores?\s+en\s+caja/.test(t)) return "sumaValoresCaja";
  if (/valores?\s+en\s+tr[aá]nsito/.test(t)) return "sumaValoresTransito";
  if (/electr[oó]nicos?/.test(t)) return "sumaElectronicos";
  if (/cristales?/.test(t)) return "sumaCristales";
  return null;
}
function tryCaptureAmountFromUserReply(userText) {
  const clean = String(userText || "").replace(/[^\d.,]/g, "");
  if (!clean) return null;
  const normalized = Number(clean.replace(/\./g, "").replace(/,/g, "."));
  if (!isFinite(normalized)) return null;
  const field = mapQuestionToField(LAST_QUESTION);
  if (field) CURRENT_INPUT[field] = normalized;
}
function parseBulkPyMEMessage(raw) {
  const t = String(raw || "");
  const out = {
    negocioNombre: null,
    actividadPrincipal: null,
    sumaContenido: null,
    sumaEdificio: null,
    sumaValoresCaja: null,
    sumaValoresTransito: null,
    sumaElectronicos: null,
    sumaCristales: null,
  };
  let m = t.match(
    /(?:mi\s+negocio\s+se\s+llama|se\s+llama|nombre\s*[:=])\s*([^\n,]+)/i
  );
  if (m) out.negocioNombre = m[1].trim();
  m = t.match(/(?:actividad\s*principal\s*[:=]|actividad\s*[:=])\s*([^\n,]+)/i);
  if (!m)
    m = t.match(
      /\b(es|somos|vendo|vendemos|fabricamos|brindo|ofrezco|ofrecemos)\b(.+)/i
    );
  if (m) out.actividadPrincipal = (m[2] ? m[1] + " " + m[2] : m[1]).trim();
  const grab = (label) => {
    const r = new RegExp(label + "\\s*[:=]?\\s*([\\d.,]+)", "i");
    const mm = t.match(r);
    if (!mm) return null;
    const n = Number(String(mm[1]).replace(/\./g, "").replace(/,/g, "."));
    return isFinite(n) ? n : null;
  };
  out.sumaContenido = grab("Contenido");
  out.sumaEdificio = grab("Edificio");
  out.sumaValoresCaja = grab("Valores?\\s+en\\s+caja");
  out.sumaValoresTransito = grab("Valores?\\s+en\\s*tr[aá]nsito");
  out.sumaElectronicos = grab("Electr[oó]nicos?");
  out.sumaCristales = grab("Cristales?");
  return out;
}

/* ================== Guardado para Panel ================== */
function saveQuoteForDashboard(payload, kind) {
  const wrapped = {
    kind,
    data: payload,
    user: USER_NAME,
    company: USER_COMPANY,
    createdAt: new Date().toISOString(),
  };
  try {
    const LKEY = quoteStorageKey(USER_NAME, USER_COMPANY);
    localStorage.setItem(LKEY, JSON.stringify(wrapped));
    localStorage.setItem(
      quoteStorageKey(USER_NAME, USER_COMPANY),
      JSON.stringify(wrapped)
    );
  } catch (e) {
    console.warn("No se pudo persistir la cotización:", e);
  }
}

/* ================== Chat helpers ================== */
function addMessage(sender, text) {
  if (!text) return;
  const div = document.createElement("div");
  div.className = "text-start text-white mb-2";
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ============= Parser robusto de JSON en la reply ============= */
function extractJsonCandidate(text) {
  if (!text) return null;
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1];
  const s = String(text).trim();
  if (s.startsWith("{") && s.endsWith("}")) return s;
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const big = s.slice(start, end + 1);
    if (/"event"\s*:/.test(big) || /"pyme_fields_ok"\s*:/.test(big)) return big;
  }
  const inline = s.match(
    /\{[\s\S]*?"event"\s*:\s*"(?:presupuesto_ok|pyme_fields_ok|cotizacion_pyme_pdf)"[\s\S]*?\}/i
  );
  if (inline) return inline[0];
  const mini = s.match(/\{[\s\S]*?"pyme_fields_ok"\s*:\s*true[\s\S]*?\}/i);
  if (mini) return mini[0];
  return null;
}
function parseReplyObject(reply) {
  if (reply && typeof reply === "object") return reply;
  const candidate = extractJsonCandidate(String(reply));
  if (!candidate) return null;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    try {
      const fixed = candidate.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"');
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

/* ============= GENERA PDF y activa botón (FALTABA) ============= */
async function processPyMEAndOfferDownload(inputObj, validezDias = 30) {
  const planes = buildPlansFromInput(inputObj);
  const quoteResult = {
    input: inputObj,
    planes,
    validezDias: Number(validezDias || 30),
    fecha: new Date().toISOString().slice(0, 10),
    folio: crypto.randomUUID?.() || String(Date.now()),
  };

  // habilita botón y guarda
  if (pdfBtn) pdfBtn.disabled = false;
  addMessage("Lia", "✅ Cotización armada. Ya puedes descargar el PDF.");

  window._lastPyME = quoteResult;
  saveQuoteForDashboard(quoteResult, "pyme");

  if (AUTO_DOWNLOAD_PDF) {
    try {
      await descargarPDFPyME(quoteResult);
      addMessage(AGENT_NAME, "📄 PDF generado y descargado.");
    } catch (e) {
      console.warn(e);
      addMessage(
        AGENT_NAME,
        "No se pudo descargar automático. Usa el botón **Descargar PDF**."
      );
      if (pdfBtn) pdfBtn.disabled = false;
    }
  }
}

/* ============= Flujo presupuesto (legacy) ============= */
async function tryExtractMiniQuote(text) {
  const obj = parseReplyObject(text);
  if (!obj || obj.event !== "presupuesto_ok") return;

  miniQuote = obj;

  const KEY = quotesKey(USER_NAME, USER_COMPANY);
  const enriched = { ...miniQuote, createdAt: new Date().toISOString() };
  let arr = [];
  try {
    arr = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {}
  arr = [enriched, ...arr].slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(arr));

  if (pdfBtn) pdfBtn.disabled = false;
  addMessage(
    "Sistema",
    "✅ Presupuesto confirmado. Ya puedes descargar el PDF."
  );
  saveQuoteForDashboard(miniQuote, "presupuesto");

  if (AUTO_DOWNLOAD_JSON) {
    const filename = `Presupuesto_${slug(
      miniQuote.cliente || USER_NAME || "cliente"
    )}.json`;
    const blob = new Blob([JSON.stringify(miniQuote, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (AUTO_DOWNLOAD_PDF) {
    try {
      await descargarPDFPresupuesto();
    } catch (e) {
      console.warn(e);
    }
  }
}

/* ============= Flujo PyME (pyme_fields_ok) ============= */
async function tryExtractPymeQuote(text) {
  const obj = parseReplyObject(text);
  if (!obj) return;

  if (obj.pyme_fields_ok === true) {
    const inputObj = buildInputFromState();
    const hasAnySum = [
      inputObj.sumaContenido,
      inputObj.sumaEdificio,
      inputObj.sumaValoresCaja,
      inputObj.sumaValoresTransito,
      inputObj.sumaElectronicos,
      inputObj.sumaCristales,
    ].some((v) => Number(v) > 0);
    if (inputObj.negocioNombre && inputObj.actividadPrincipal && hasAnySum) {
      await processPyMEAndOfferDownload(inputObj, 30);
    } else {
      addMessage(
        AGENT_NAME,
        "Necesito al menos nombre, actividad y alguna suma para generar el PDF."
      );
    }
    return;
  }

  if (obj.event === "pyme_fields_ok") {
    if (obj.elegibilidad && obj.elegibilidad.esElegible === false) {
      addMessage(
        AGENT_NAME,
        `El giro requiere evaluación especial: ${
          obj.elegibilidad?.motivoNoElegible || "—"
        }`
      );
      return;
    }
    await processPyMEAndOfferDownload(obj.input, Number(obj.validezDias || 30));
  }
}

/* ============= Flujo plantilla Lia opcional ============= */
async function tryExtractCotizacionPyMEPDF(text) {
  const obj = parseReplyObject(text);
  if (!obj || obj.event !== "cotizacion_pyme_pdf") return;

  const wrapped = {
    kind: "pyme_pdf",
    data: obj,
    user: USER_NAME,
    company: USER_COMPANY,
    createdAt: new Date().toISOString(),
  };
  saveQuoteForDashboard(wrapped, "pyme_pdf");

  if (pdfBtn) pdfBtn.disabled = false;
  addMessage("Lia", "✅ Cotización generada. Descargando PDF…");
  try {
    await descargarPDFPlantillaLia(obj);
  } catch (e) {
    console.warn(e);
  }
}

/* ===== util ===== */
function buildInputFromState() {
  return {
    negocioNombre: PYME_STATE.negocioNombre || "",
    actividadPrincipal: PYME_STATE.actividadPrincipal || "",
    sumaContenido: Number(CURRENT_INPUT.sumaContenido || 0),
    sumaEdificio: Number(CURRENT_INPUT.sumaEdificio || 0),
    sumaValoresCaja: Number(CURRENT_INPUT.sumaValoresCaja || 0),
    sumaValoresTransito: Number(CURRENT_INPUT.sumaValoresTransito || 0),
    sumaElectronicos: Number(CURRENT_INPUT.sumaElectronicos || 0),
    sumaCristales: Number(CURRENT_INPUT.sumaCristales || 0),
  };
}

/* ============= Sanitiza para mostrar sin JSON ============= */
function sanitizeAssistantReply(text) {
  if (!text) return "";
  let out = String(text);
  out = out.replace(/```[\s\S]*?```/g, "");
  out = out.replace(/\{(?:[^{}]|{[^{}]*})*\}/g, "");
  out = out.replace(/\[(?:[^\[\]]|\[[^\[\]]*\])*\]/g, "");
  out = out.replace(/(^|\n)\s*"[^"\n]+"\s*:\s*[^{}\n]+(?=\n|$)/g, "");
  const hasLetters = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(out);
  if (!hasLetters) return "";
  return out
    .replace(/[{}\[\]]/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/* ================== Envío de mensaje ================== */
async function sendMessage() {
  if (IS_SENDING) return; // 🔒 evita doble envío
  const userMessage = input.value.trim();
  if (!userMessage) return;

  IS_SENDING = true;
  try {
    updateStateFromUser(userMessage);
    tryCaptureAmountFromUserReply(userMessage);

    const bulk = parseBulkPyMEMessage(userMessage);
    if (bulk.negocioNombre) PYME_STATE.negocioNombre = bulk.negocioNombre;
    if (bulk.actividadPrincipal)
      PYME_STATE.actividadPrincipal = bulk.actividadPrincipal;
    if (bulk.negocioNombre || bulk.actividadPrincipal) savePymeState();
    if (bulk.sumaContenido != null)
      CURRENT_INPUT.sumaContenido = bulk.sumaContenido;
    if (bulk.sumaEdificio != null)
      CURRENT_INPUT.sumaEdificio = bulk.sumaEdificio;
    if (bulk.sumaValoresCaja != null)
      CURRENT_INPUT.sumaValoresCaja = bulk.sumaValoresCaja;
    if (bulk.sumaValoresTransito != null)
      CURRENT_INPUT.sumaValoresTransito = bulk.sumaValoresTransito;
    if (bulk.sumaElectronicos != null)
      CURRENT_INPUT.sumaElectronicos = bulk.sumaElectronicos;
    if (bulk.sumaCristales != null)
      CURRENT_INPUT.sumaCristales = bulk.sumaCristales;

    pushHistory("user", userMessage);
    addMessage("Tú", userMessage);
    input.value = "";
    input.focus();

    const hasContext = !!(
      PYME_STATE.negocioNombre || PYME_STATE.actividadPrincipal
    );
    await sendMessageInternal(userMessage, hasContext);
  } finally {
    IS_SENDING = false; // 🔓 libera el envío
  }
}

/* ================== Enviar al backend ================== */
async function sendMessageInternal(userMessage, withContext = false) {
  if (!THREAD_ID && getHistory().length === 0) {
    withContext = false; // chat realmente nuevo
  }
  try {
    const payloadMsg = withContext
      ? buildShortContext() + userMessage
      : userMessage;

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: payloadMsg,
        threadId: THREAD_ID,
        userName: USER_NAME,
        userCompany: USER_COMPANY,
        history: getHistory(),
      }),
    });

    const ctype = res.headers.get("content-type") || "";
    const raw = await res.text();
    if (!res.ok) throw new Error(raw || `HTTP ${res.status}`);
    if (!ctype.includes("application/json"))
      throw new Error("La API no devolvió JSON (revisa CORS o la URL).");

    const data = JSON.parse(raw);
    console.log("RAW REPLY >>>", data.reply);

    if (data.status === "running") {
      THREAD_ID = data.threadId;
      localStorage.setItem(threadKey(), THREAD_ID);
      setTimeout(() => pollThread(THREAD_ID), 1200);
      return;
    }

    THREAD_ID = data.threadId;
    localStorage.setItem(threadKey(), THREAD_ID);

    const shown = sanitizeAssistantReply(data.reply);
    if (shown) {
      addMessage(AGENT_NAME, shown);
      pushHistory("assistant", shown);
      LAST_QUESTION = shown;
    }

    await tryExtractMiniQuote(data.reply);
    await tryExtractPymeQuote(data.reply);
    await tryExtractCotizacionPyMEPDF(data.reply);
  } catch (err) {
    console.error(err);
    addMessage("Lia", `⚠️ ${err.message}`);
  }
}

/* ================== Listeners ================== */
sendBtn?.addEventListener("click", () => sendMessage());
input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

/* ================== PDF ================== */
async function ensureJsPDF() {
  if (window.jspdf?.jsPDF) return true;
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return !!window.jspdf?.jsPDF;
  } catch {
    return false;
  }
}

async function descargarPDFPresupuesto() {
  if (!miniQuote) {
    alert("Aún no confirmas el presupuesto en el chat.");
    return;
  }
  if (!(await ensureJsPDF())) {
    alert("Falta jsPDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const logoUrl = `${BASE}img/pdf.png?v=2`;
  let logoDataUrl = null;
  try {
    const res = await fetch(logoUrl, { cache: "no-store" });
    if (
      res.ok &&
      (res.headers.get("content-type") || "").startsWith("image/")
    ) {
      const blob = await res.blob();
      logoDataUrl = await new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(rd.result);
        rd.onerror = reject;
        rd.readAsDataURL(blob);
      });
    }
  } catch {}

  doc.setFillColor(100, 75, 243);
  doc.rect(0, 0, 595, 90, "F");
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 40, 20, 50, 50);
    } catch {}
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SegurosPyme • Presupuesto", 110, 55);

  doc.setTextColor(34, 40, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  let y = 130;
  putKV("Cliente", miniQuote.cliente || USER_NAME || "—");
  putKV("Fecha objetivo", prettyDate(miniQuote.fecha) || "—");
  if (miniQuote.detalle) putKV("Detalle", miniQuote.detalle);
  y += 10;
  doc.setDrawColor(100, 75, 243);
  doc.setFillColor(246, 245, 255);
  doc.roundedRect(40, y, 515, 90, 8, 8, "FD");
  const monto = miniQuote.precio?.monto ?? 0;
  const moneda = (miniQuote.precio?.moneda || "").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 75, 243);
  doc.setFontSize(26);
  doc.text(`TOTAL: ${money(monto)} ${moneda}`.trim(), 60, y + 58);
  doc.setTextColor(120);
  doc.setFontSize(10);
  doc.text(
    "Documento generado automáticamente. No constituye oferta vinculante.",
    40,
    770 - 40
  );

  try {
    localStorage.setItem("lastQuote", JSON.stringify(miniQuote));
  } catch {}
  const dataUrl = doc.output("datauristring");
  addPdfToLibrary({
    kind: "presupuesto",
    title: `${miniQuote.cliente || USER_NAME} • Presupuesto`,
    filename: `Presupuesto_${slug(
      miniQuote.cliente || USER_NAME || "cliente"
    )}.pdf`,
    dataUrl,
    meta: miniQuote,
  });

  doc.save(
    `Presupuesto_${slug(miniQuote.cliente || USER_NAME || "cliente")}.pdf`
  );

  function putKV(k, v) {
    doc.setFont("helvetica", "normal");
    doc.text(`${k}:`, 40, y);
    doc.setFont("helvetica", "bold");
    const wrap = doc.splitTextToSize(String(v), 420);
    doc.text(wrap, 140, y);
    y += wrap.length * 14 + 6;
  }
}

async function descargarPDFPyME(quoteResult) {
  if (!(await ensureJsPDF())) {
    alert("Falta jsPDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" }); // portrait por default

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const violet = { r: 100, g: 75, b: 243 };

  // ===== Encabezado
  doc.setFillColor(violet.r, violet.g, violet.b);
  doc.rect(0, 0, W, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Lia • Cotización PyME", M, 52);

  // ===== Datos generales
  const { input, planes, fecha, validezDias } = quoteResult;
  doc.setTextColor(34, 40, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let y = 100;
  putKV("Fecha", prettyDate(fecha));
  putKV("Validez", `${Number(validezDias || 30)} días`);
  putKV("Negocio", input.negocioNombre || "—");
  putKV("Actividad", input.actividadPrincipal || "—");

  // ===== Resumen de sumas
  y += 6;
  const boxW = W - M * 2;
  const boxH = 110;
  doc.setDrawColor(violet.r, violet.g, violet.b);
  doc.setFillColor(246, 245, 255);
  doc.roundedRect(M, y, boxW, boxH, 10, 10, "FD");

  let ry = y + 22;
  putRow("Contenido", input.sumaContenido);
  putRow("Edificio", input.sumaEdificio);
  putRow("Valores en caja", input.sumaValoresCaja);
  putRow("Valores en tránsito", input.sumaValoresTransito);
  putRow("Electrónicos", input.sumaElectronicos);
  putRow("Cristales", input.sumaCristales);

  // ===== Tarjetas de planes
  // ===== Tarjetas de planes (vertical: 2 columnas)
  const colGap = 16;
  const cardW = (W - M * 2 - colGap) / 2;
  const startY = y + boxH + 32; // un poco de aire tras el resumen
  const cardH = Math.floor((H - startY - M - colGap) / 2); // altura para 2 filas

  const byName = {};
  planes.forEach((p) => (byName[p.nombrePlan] = p));

  // Fila 1: Base y Medio
  renderPlanCard(byName["Base"], "Plan Base", M, startY, cardW, cardH);
  renderPlanCard(
    byName["Medio"],
    "Plan Medio",
    M + cardW + colGap,
    startY,
    cardW,
    cardH
  );

  // Fila 2: Plus a lo ancho (ocupa ambas columnas)
  renderPlanCard(
    byName["Plus"],
    "Plan Plus",
    M,
    startY + cardH + colGap,
    W - M * 2,
    cardH
  );

  // ===== Nombre correcto y guardado en biblioteca
  const fname = `Cotizacion_PyME_${slug(input.negocioNombre || "negocio")}.pdf`;
  try {
    const dataUrl = doc.output("datauristring");
    addPdfToLibrary({
      kind: "pyme",
      title: `${input.negocioNombre || "Negocio"} • ${prettyDate(fecha)}`,
      filename: fname,
      dataUrl,
      meta: quoteResult,
    });
  } catch (e) {
    console.warn("No se pudo generar dataURL para biblioteca:", e);
  }

  // Descargar
  doc.save(fname);

  // ---------- Helpers ----------
  function putKV(k, v) {
    doc.setFont("helvetica", "normal");
    doc.text(`${k}:`, M, y);
    doc.setFont("helvetica", "bold");
    doc.text(String(v ?? "—"), M + 110, y);
    y += 16;
  }
  function putRow(label, value) {
    doc.setFont("helvetica", "normal");
    doc.text(`${label}:`, M + 18, ry);
    doc.setFont("helvetica", "bold");
    doc.text(money(value || 0), M + 270, ry, { align: "left" });
    ry += 16;
  }
  function renderPlanCard(plan, title, x, y, w, h) {
    const pad = 14;

    // columnas
    const GAP = 16;
    const NUM_COL_W = 78;
    const primaRight = x + w - pad;
    const sumaRight = primaRight - NUM_COL_W - GAP;
    const descLeft = x + pad;
    const descRight = sumaRight - GAP;
    const descWidth = Math.max(90, descRight - descLeft);

    // marco + título
    doc.setDrawColor(223);
    doc.roundedRect(x, y, w, h, 10, 10, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(title, x + pad, y + 22);

    // cabecera
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    let yy = y + 40;
    doc.text("Coberturas:", x + pad, yy);
    yy += 12;

    doc.setFont("helvetica", "bold");
    doc.text("Cobertura", descLeft, yy);
    doc.text("Suma (MXN)", sumaRight, yy, { align: "right" });
    doc.text("Prima (MXN)", primaRight, yy, { align: "right" });
    yy += 11;

    // -------- filas según plan (básicas en una sola línea) --------
    const included = new Set((plan?.coberturas || []).map((c) => c.clave));
    const getSuma = (key) =>
      plan?.coberturas?.find((c) => c.clave === key)?.suma || 0;

    const rows = [];
    rows.push({
      label: "Coberturas básicas (incendio, RC, escombros y robo)",
      sum: getSuma("incendio_edificio_contenidos"),
    });

    if (included.has("robo_valores_caja"))
      rows.push({
        label: "Robo de valores (en caja)",
        sum: getSuma("robo_valores_caja"),
      });

    if (included.has("robo_valores_transito"))
      rows.push({
        label: "Robo de valores en tránsito",
        sum: getSuma("robo_valores_transito"),
      });

    if (included.has("perdida_beneficios"))
      rows.push({
        label: "Pérdida de beneficios",
        sum: getSuma("perdida_beneficios"),
      });

    if (included.has("equipos_electronicos"))
      rows.push({
        label: "Electrónicos",
        sum: getSuma("equipos_electronicos"),
      });

    if (included.has("danios_electricos"))
      rows.push({
        label: "Daños eléctricos",
        sum: getSuma("danios_electricos"),
      });

    if (included.has("danios_agua"))
      rows.push({ label: "Daños por agua", sum: getSuma("danios_agua") });

    if (included.has("cristales"))
      rows.push({ label: "Cristales", sum: getSuma("cristales") });

    // deja espacio para el Resumen y evita que se encime
    const SUMMARY_BLOCK = 6 + 14 + 4 * 13 + 8; // título + 4 líneas
    const maxYY = y + h - SUMMARY_BLOCK;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setLineHeightFactor(1.15);

    let hidden = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lines = doc.splitTextToSize(String(r.label), descWidth);
      const rh = 11 * lines.length + 4;

      if (yy + rh > maxYY) {
        hidden = rows.length - i;
        break;
      }

      doc.text(lines, descLeft, yy);
      doc.text(r.sum > 0 ? money(r.sum) : "—", sumaRight, yy, {
        align: "right",
      });
      doc.text("—", primaRight, yy, { align: "right" }); // prima por cobertura no se prorratea
      yy += rh;
    }

    if (hidden > 0) {
      yy += 6;
      doc.setFont("helvetica", "italic");
      doc.text(`… +${hidden} coberturas más`, descLeft, yy);
      doc.setFont("helvetica", "normal");
    }

    // -------- Resumen (totales del plan) --------
    yy = Math.max(yy + 8, y + h - (4 * 13 + 20));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Resumen:", x + pad, yy);
    yy += 13;

    doc.setFont("helvetica", "normal");
    const putSum = (label, value) => {
      doc.text(label, x + pad, yy);
      doc.text(money(value || 0), primaRight, yy, { align: "right" });
      yy += 13;
    };
    putSum("Prima Neta", plan?.primaNeta);
    putSum("Gastos de Expedición", plan?.gastosExpedicion);
    putSum("IVA", plan?.iva);
    putSum("Prima Total", plan?.primaTotal);
  }
}

async function descargarPDFPlantillaLia(payload) {
  if (!(await ensureJsPDF())) {
    alert("Falta jsPDF.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFillColor(104, 79, 243);
  doc.rect(0, 0, 595, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("COTIZACIÓN", 440, 55, { align: "right" });

  doc.setFontSize(10);
  doc.text(`N°. ${payload.folio || "-"}`, 40, 30);
  doc.text("FECHA COTIZACIÓN", 40, 46);
  doc.text(
    String(
      prettyDate(
        payload.fechaCotizacion || new Date().toISOString().slice(0, 10)
      )
    ),
    40,
    60
  );

  doc.setTextColor(34, 40, 49);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("AGENTE", 40, 110);
  doc.text("EMPRESA", 320, 110);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(payload?.agente?.nombre || "Lia", 40, 126);
  doc.text(payload?.empresa?.nombre || "-", 320, 126);

  doc.setFontSize(10);
  doc.text(payload?.empresa?.domicilio || "", 320, 142);

  const startY = 180;
  const colX = { tipo: 40, cob: 160, base: 360, medio: 430, plus: 500 };
  const rowH = 24;

  function drawCellText(text, x, y, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(String(text), x, y);
  }
  function drawHeader() {
    doc.setFillColor(104, 79, 243);
    doc.setTextColor(255, 255, 255);
    doc.rect(40, startY - 20, 515, 24, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Tipo de cobertura", colX.tipo, startY - 4);
    doc.text("Cobertura", colX.cob, startY - 4);
    doc.text("Plan\nBase", colX.base, startY - 4);
    doc.text("Plan\nMedio", colX.medio, startY - 4);
    doc.text("Plan\nPlus", colX.plus, startY - 4);
    doc.setTextColor(34, 40, 49);
  }
  drawHeader();

  let y = startY + 6;
  const filas = [
    {
      tipo: "Cobertura base",
      items: [
        "Incendio edificio y contenidos",
        "Responsabilidad Civil",
        "Gastos de limpieza y remoción de escombros",
        "Robo",
      ],
    },
    {
      tipo: "Coberturas adicionales",
      items: [
        "Robo de valores (en caja y tránsito)",
        "Pérdida de beneficios",
        "Equipos electrónicos",
        "Daños eléctricos",
        "Daños por agua",
        "Cristales (por m²)",
      ],
    },
  ];
  const inPlan = (plan, label) =>
    Array.isArray(payload?.planes?.[plan]) &&
    payload.planes[plan].includes(label);
  const check = "X";

  filas.forEach((grupo) => {
    drawCellText(grupo.tipo, colX.tipo, y, true);
    grupo.items.forEach((lab, idx) => {
      if (idx !== 0) y += rowH;
      drawCellText(lab, colX.cob, y);
      drawCellText(inPlan("base", lab) ? check : "", colX.base, y);
      drawCellText(inPlan("medio", lab) ? check : "", colX.medio, y);
      drawCellText(inPlan("plus", lab) ? check : "", colX.plus, y);
    });
    y += rowH;
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("PRECIO", 40, y);
  doc.setFont("helvetica", "normal");
  y += 18;
  const p = payload.precios || {};
  const fmt = (m) => money(m?.monto || 0) + " " + (m?.moneda || "MXN");
  doc.text("$", colX.base - 15, y);
  doc.text(fmt(p.base || {}), colX.base, y);
  doc.text("$", colX.medio - 15, y);
  doc.text(fmt(p.medio || {}), colX.medio, y);
  doc.text("$", colX.plus - 15, y);
  doc.text(fmt(p.plus || {}), colX.plus, y);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `ESTA COTIZACIÓN TIENE UNA VIGENCIA DE ${
      payload.validezDias || 30
    } DÍAS A PARTIR DE LA ENTREGA`,
    40,
    770 - 40
  );

  const fname = `Cotizacion_PyME_${slug(
    payload?.empresa?.nombre || "empresa"
  )}.pdf`;
  // Guardar en biblioteca
  try {
    const dataUrl = doc.output("datauristring");
    addPdfToLibrary({
      kind: "pyme_pdf",
      title: `Cotización Lia • ${payload?.empresa?.nombre || "-"}`,
      filename: fname,
      dataUrl,
      meta: payload,
    });
  } catch (e) {
    console.warn("No se pudo generar dataURL para biblioteca:", e);
  }

  doc.save(fname);
}

/* ================== Botón PDF ================== */
pdfBtn?.addEventListener("click", async () => {
  try {
    if (window._lastPyME) {
      await descargarPDFPyME(window._lastPyME);
    } else if (miniQuote) {
      await descargarPDFPresupuesto();
    } else {
      alert("Aún no hay datos confirmados para descargar PDF.");
    }
  } catch (e) {
    console.error(e);
    alert("No se pudo generar el PDF.");
  }
});

/* ================== Navegación ================== */
backBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const target = `../Dashboard/index.html?name=${encodeURIComponent(
    USER_NAME
  )}&company=${encodeURIComponent(USER_COMPANY)}`;
  window.location.href = target;
});
logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("userName");
  localStorage.removeItem("userCompany");
  resetConversationState();
  sessionStorage.clear();
  window.location.href = BASE;
  try {
    const KEY = quoteStorageKey(USER_NAME, USER_COMPANY);
    localStorage.removeItem(KEY);
  } catch {}
});

/* ================== Reiniciar conversación ================== */
document.getElementById("new-quote")?.addEventListener("click", () => {
  resetConversationState();
  const url = new URL(location.href);
  url.searchParams.set("new", "1");
  location.replace(url.pathname + url.search);
});

/* ================== Polling ================== */
async function pollThread(tid) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: null,
        threadId: tid,
        userName: USER_NAME,
        userCompany: USER_COMPANY,
        poll: true,
        history: getHistory(),
      }),
    });

    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("application/json"))
      throw new Error(await res.text());
    const data = await res.json();

    if (data.status === "running") {
      setTimeout(() => pollThread(tid), 1200);
      return;
    }

    THREAD_ID = data.threadId;
    localStorage.setItem(threadKey(), THREAD_ID);

    const shown = sanitizeAssistantReply(data.reply);
    if (shown) {
      addMessage(AGENT_NAME, shown);
      pushHistory("assistant", shown);
      LAST_QUESTION = shown;
    }

    await tryExtractMiniQuote(data.reply);
    await tryExtractPymeQuote(data.reply);
    await tryExtractCotizacionPyMEPDF(data.reply);

    if (!shown) {
      addMessage(
        "Agente Seguros PyME",
        "✅ Tu cotización está lista. El PDF se ha generado y puedes descargarlo desde el botón si lo prefieres."
      );
      pushHistory("assistant", "Cotización lista. PDF generado (JSON oculto).");
    }
  } catch (e) {
    console.error(e);
    addMessage("Lia", `⚠️ ${e.message}`);
  }
}
