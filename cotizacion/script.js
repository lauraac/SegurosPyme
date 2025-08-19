// ================== Config rápido ==================
const AUTO_DOWNLOAD_PDF = true; // Auto-descargar PDF al confirmar
const AUTO_DOWNLOAD_JSON = false; // (opcional) Auto-descargar JSON al confirmar

// ================== UI ==================
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messagesEl = document.getElementById("messages");
const pdfBtn = document.getElementById("pdf-btn");
const backBtn = document.getElementById("back-btn");
const logoutBtn = document.getElementById("logout-btn");

// ================== Utils ==================
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

// ================== Dónde está la API (FIJO a tu Vercel) ==================
const API_URL = "https://seguros-pyme-api.vercel.app/api/chat";

// Helpers
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

// ======= TARIFAS Y COBERTURAS (EJEMPLO: reemplaza con tus números del doc) =======
const COBERTURAS = {
  CONT: {
    clave: "CONT",
    descripcion: "Contenido",
    obligatoria: true,
    tarifa: 0.002,
  },
  EDIF: {
    clave: "EDIF",
    descripcion: "Edificio",
    obligatoria: false,
    tarifa: 0.0015,
  },
  VCJA: {
    clave: "VCJA",
    descripcion: "Valores en caja",
    obligatoria: false,
    tarifa: 0.003,
  },
  VTRA: {
    clave: "VTRA",
    descripcion: "Valores en tránsito",
    obligatoria: false,
    tarifa: 0.0035,
  },
  ELEC: {
    clave: "ELEC",
    descripcion: "Equipos electrónicos",
    obligatoria: false,
    tarifa: 0.0028,
  },
  CRIS: {
    clave: "CRIS",
    descripcion: "Cristales",
    obligatoria: false,
    tarifa: 0.0012,
  },
};

// Qué coberturas entran en cada plan (ajusta según tu documento “punto 4”)
const PLANES = {
  Base: (c, actividad) => c.obligatoria === true,
  Medio: (c, actividad) => c.obligatoria === true,
  Plus: (c, actividad) => c.obligatoria === true || aplicaExtra(c, actividad),
};

// Lógica extra por giro (ejemplo: para restaurantes incluir Cristales y Electrónicos)
function aplicaExtra(cobertura, actividad) {
  const act = String(actividad || "").toLowerCase();
  if (act.includes("restaurante"))
    return ["CRIS", "ELEC"].includes(cobertura.clave);
  return false;
}

// Fórmula del punto 5 (ajústala si tu doc tiene otra)
function computePremium(sumasPorCobertura) {
  const primaNeta = sumasPorCobertura.reduce(
    (acc, i) => acc + i.suma * i.tarifa,
    0
  );
  const gastosExpedicion = 150; // ejemplo
  const derechos = 0; // ajusta si aplica
  const iva = (primaNeta + gastosExpedicion + derechos) * 0.16;
  const primaTotal = primaNeta + gastosExpedicion + derechos + iva;
  return { primaNeta, gastosExpedicion, derechos, iva, primaTotal };
}

function buildPlansFromInput(input) {
  const mapa = {
    CONT: Number(input.sumaContenido || 0),
    EDIF: Number(input.sumaEdificio || 0),
    VCJA: Number(input.sumaValoresCaja || 0),
    VTRA: Number(input.sumaValoresTransito || 0),
    ELEC: Number(input.sumaElectronicos || 0),
    CRIS: Number(input.sumaCristales || 0),
  };
  const cobList = Object.values(COBERTURAS);

  function makePlan(nombre) {
    const filtra = PLANES[nombre];
    const seleccion = cobList
      .filter((c) => filtra(c, input.actividadPrincipal))
      .filter((c) => (mapa[c.clave] || 0) > 0);

    const detalle = seleccion.map((c) => ({
      clave: c.clave,
      descripcion: c.descripcion,
      suma: mapa[c.clave],
      tarifa: c.tarifa,
      prima: mapa[c.clave] * c.tarifa,
    }));

    const totales = computePremium(
      detalle.map((d) => ({ suma: d.suma, tarifa: d.tarifa }))
    );
    return { nombrePlan: nombre, coberturas: detalle, ...totales };
  }

  return [makePlan("Base"), makePlan("Medio"), makePlan("Plus")];
}

// ================== Sesión usuario (DINÁMICA) ==================
const qName = getParam("name");
const qCompany = getParam("company");
const USER_NAME = qName ?? localStorage.getItem("userName");
const USER_COMPANY = qCompany ?? localStorage.getItem("userCompany");

if (!USER_NAME || !USER_COMPANY) {
  window.location.href = "../index.html";
  throw new Error("Sin sesión");
}
if (qName) localStorage.setItem("userName", USER_NAME);
if (qCompany) localStorage.setItem("userCompany", USER_COMPANY);

// 🔒 Aísla el thread por usuario/empresa
function threadKey() {
  return `sp:thread:${slug(USER_NAME)}:${slug(USER_COMPANY)}`;
}

// ================== Estado ==================
let THREAD_ID = localStorage.getItem(threadKey()) || null;
let miniQuote = null; // { event:"presupuesto_ok", ... }
if (pdfBtn) pdfBtn.disabled = true;

// ================== Historial (memoria ligera) ==================
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

// ===== HOTFIX: Estado PyME mínimo para contexto y anti-loop =====
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

  // Nombre (solo cuando es explícito)
  const m1 = t.match(
    /(?:mi\s+negocio\s+se\s+llama|se\s+llama|nombre\s*[:=])\s+(.+)/i
  );
  if (m1 && !PYME_STATE.negocioNombre) {
    PYME_STATE.negocioNombre = m1[1].trim().replace(/[."”]+$/, "");
    savePymeState();
  }

  // Actividad principal
  const m2 = t.match(
    /(?:actividad\s*principal\s*[:=]|actividad\s*[:=])\s+(.+)/i
  );
  if (m2 && !PYME_STATE.actividadPrincipal) {
    PYME_STATE.actividadPrincipal = m2[1].trim().replace(/[."”]+$/, "");
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
  const parts = [];
  if (PYME_STATE.negocioNombre)
    parts.push(`Nombre del negocio: ${PYME_STATE.negocioNombre}`);
  if (PYME_STATE.actividadPrincipal)
    parts.push(`Actividad principal: ${PYME_STATE.actividadPrincipal}`);
  return parts.length ? `[[Contexto conocido]]\n${parts.join("\n")}\n\n` : "";
}

// ================== Guardado para Panel/Dashboard ==================
function saveQuoteForDashboard(payload, kind) {
  // kind: "presupuesto" | "pyme"
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
    localStorage.setItem("lastQuote", JSON.stringify(wrapped)); // compat
  } catch (e) {
    console.warn("No se pudo persistir la cotización:", e);
  }
}

// ================== Chat helpers ==================
function addMessage(sender, text) {
  if (!text) return;
  const div = document.createElement("div");
  div.className = "text-start text-white mb-2";
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Descarga JSON (opcional)
function downloadJSON(filename, dataObj) {
  try {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("No se pudo descargar JSON:", e);
  }
}

// ============= Detección de JSON inline o con backticks =============
function extractJsonCandidate(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1];

  // Detecta presupuesto_ok O pyme_fields_ok
  const inline = text.match(
    /\{[\s\S]*?"event"\s*:\s*"(?:presupuesto_ok|pyme_fields_ok)"[\s\S]*?\}/i
  );
  if (inline) return inline[0];

  return null;
}

/**
 * Mini-JSON del flujo antiguo (presupuesto_ok)
 * Habilita PDF simple, guarda historial y autodispara descargas si aplica.
 */
async function tryExtractMiniQuote(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return;

  let obj;
  try {
    obj = JSON.parse(candidate.trim());
  } catch {
    try {
      const fixed = candidate.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"');
      obj = JSON.parse(fixed);
    } catch {
      return;
    }
  }

  if (!obj || obj.event !== "presupuesto_ok") return;

  miniQuote = obj;

  // Guardar historial (máx 10 por usuario/empresa)
  const KEY = quotesKey(USER_NAME, USER_COMPANY);
  const enriched = { ...miniQuote, createdAt: new Date().toISOString() };

  let arr = [];
  try {
    arr = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {}
  arr = [enriched, ...arr].slice(0, 10);
  localStorage.setItem(KEY, JSON.stringify(arr));

  // Habilita PDF + guarda formato unificado para Panel
  if (pdfBtn) pdfBtn.disabled = false;
  addMessage(
    "Sistema",
    "✅ Presupuesto confirmado. Ya puedes descargar el PDF."
  );
  saveQuoteForDashboard(miniQuote, "presupuesto");

  // (Opcional) auto-JSON
  if (AUTO_DOWNLOAD_JSON) {
    const filename = `Presupuesto_${slug(
      miniQuote.cliente || USER_NAME || "cliente"
    )}.json`;
    downloadJSON(filename, miniQuote);
  }

  // (Opcional) auto-PDF
  if (AUTO_DOWNLOAD_PDF) {
    try {
      await descargarPDFPresupuesto();
    } catch (e) {
      console.warn(e);
    }
  }
}

/**
 * JSON del flujo PyME (pyme_fields_ok)
 * Arma 3 planes, guarda y (opcional) auto-descarga PDF.
 */
async function tryExtractPymeQuote(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return;

  let obj;
  try {
    obj = JSON.parse(candidate.trim());
  } catch {
    try {
      const fixed = candidate.replace(/(\w+)\s*:/g, '"$1":').replace(/'/g, '"');
      obj = JSON.parse(fixed);
    } catch {
      return;
    }
  }

  if (!obj || obj.event !== "pyme_fields_ok") return;

  // Si no elegible: informamos y NO generamos PDF
  if (!obj.elegibilidad?.esElegible) {
    addMessage(
      "Agente Seguros PyME",
      `El giro requiere evaluación especial: ${
        obj.elegibilidad?.motivoNoElegible || "—"
      }`
    );
    return;
  }

  // Construimos los 3 planes en el FRONT
  const planes = buildPlansFromInput(obj.input);
  const quoteResult = {
    input: obj.input,
    planes,
    validezDias: Number(obj.validezDias || 30),
    fecha: new Date().toISOString().slice(0, 10),
    folio: crypto.randomUUID?.() || String(Date.now()),
  };

  // Habilita botón PDF y guarda
  if (pdfBtn) pdfBtn.disabled = false;
  addMessage(
    "Sistema",
    "✅ Cotización PyME armada. Ya puedes descargar el PDF."
  );

  window._lastPyME = quoteResult;
  saveQuoteForDashboard(quoteResult, "pyme");

  // Auto-descarga PDF si está prendido
  if (AUTO_DOWNLOAD_PDF) {
    try {
      await descargarPDFPyME(quoteResult);
    } catch (e) {
      console.warn(e);
    }
  }
}

// Oculta bloques ```...``` e inline JSON del mensaje mostrado y limpia comas
function sanitizeAssistantReply(text) {
  if (!text) return "";
  let out = String(text);

  // Quita bloques con backticks (```json ... ```)
  out = out.replace(/```(?:json)?[\s\S]*?```/gi, "");
  // Quita JSON inline con event: presupuesto_ok o pyme_fields_ok
  out = out.replace(
    /\{[\s\S]*?"event"\s*:\s*"(?:presupuesto_ok|pyme_fields_ok)"[\s\S]*?\}/gi,
    ""
  );

  // Limpieza
  out = out
    .replace(/\s*,\s*(?=[\}\]])/g, "")
    .replace(/(^|\n)\s*,\s*/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return out;
}

// ====== Anti-loop suave: si repite un campo ya dado, lo re-afirma y empuja ======
let antiLoopGuardCount = 0;
async function recoverIfStuck(assistantShownText) {
  if (!assistantShownText) return;
  if (antiLoopGuardCount >= 3) return;

  const t = assistantShownText.toLowerCase();
  const asksName =
    /¿cu[aá]l\s+es\s+el\s+nombre\s+del\s+negocio|ind[íi]came\s+el\s+nombre\s+del\s+negocio|nombre\s+del\s+negocio\?/i.test(
      assistantShownText
    );
  const asksAct = /actividad\s+principal/i.test(assistantShownText);

  if (asksName && PYME_STATE.negocioNombre) {
    antiLoopGuardCount++;
    const msg = `El nombre del negocio es: ${PYME_STATE.negocioNombre}. Por favor, continúa con la Actividad Principal.`;
    addMessage("Tú", msg);
    input.value = "";
    await sendMessageInternal(msg, /*withCtx*/ true);
  } else if (asksAct && PYME_STATE.actividadPrincipal) {
    antiLoopGuardCount++;
    const msg = `La actividad principal es: ${PYME_STATE.actividadPrincipal}. Continúa con los valores: Contenido, Edificio (si aplica), Valores en caja, Valores en tránsito, Electrónicos y Cristales.`;
    addMessage("Tú", msg);
    input.value = "";
    await sendMessageInternal(msg, /*withCtx*/ true);
  }
}

// ================== Envío de mensaje ==================
async function sendMessage() {
  const userMessage = input.value.trim();
  if (!userMessage) return;

  // Actualiza estado + historial
  updateStateFromUser(userMessage);
  pushHistory("user", userMessage);

  addMessage("Tú", userMessage);
  input.value = "";
  input.focus();

  await sendMessageInternal(userMessage, /*withCtx*/ true);
}

// Enviar al backend con opción de contexto
async function sendMessageInternal(userMessage, withContext = false) {
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
        history: getHistory(), // <<< memoria ligera
      }),
    });

    const ctype = res.headers.get("content-type") || "";
    const raw = await res.text();

    if (!res.ok) throw new Error(raw || `HTTP ${res.status}`);
    if (!ctype.includes("application/json"))
      throw new Error("La API no devolvió JSON (revisa CORS o la URL).");

    const data = JSON.parse(raw);

    if (data.status === "running") {
      THREAD_ID = data.threadId;
      localStorage.setItem(threadKey(), THREAD_ID);
      setTimeout(() => pollThread(THREAD_ID), 1200);
      return;
    }

    THREAD_ID = data.threadId;
    localStorage.setItem(threadKey(), THREAD_ID);

    // Pinta el mensaje SIN el JSON
    const shown = sanitizeAssistantReply(data.reply);
    if (shown) {
      addMessage("Agente Seguros PyME", shown);
      pushHistory("assistant", shown);
      await recoverIfStuck(shown);
    } else {
      // si no mostró nada (solo JSON), igual guarda algo en history
      pushHistory("assistant", data.reply || "");
    }

    // Analiza el texto ORIGINAL para habilitar PDF/guardar JSON
    await tryExtractMiniQuote(data.reply);
    await tryExtractPymeQuote(data.reply);
  } catch (err) {
    console.error(err);
    addMessage("Sistema", `⚠️ ${err.message}`);
  }
}

// Botón ENVIAR (click)
sendBtn?.addEventListener("click", () => {
  sendMessage();
});

// Enter para enviar
input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
  }
});

// ================== PDF ==================
async function descargarPDFPresupuesto() {
  if (!miniQuote) {
    alert("Aún no confirmas el presupuesto en el chat.");
    return;
  }
  if (!window.jspdf?.jsPDF) {
    alert("Falta jsPDF. Agrega el CDN en el HTML.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Logo
  const logoUrl = `${BASE}img/pdf.png?v=2`;
  let logoDataUrl = null;
  try {
    logoDataUrl = await urlToDataURL(logoUrl);
  } catch (e) {
    console.warn("Logo no disponible:", e.message);
  }

  // Header
  doc.setFillColor(100, 75, 243);
  doc.rect(0, 0, 595, 90, "F");
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 40, 20, 50, 50);
    } catch (e) {
      console.warn("addImage falló:", e.message);
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SegurosPyme • Presupuesto", 110, 55);

  // Contenido
  doc.setTextColor(34, 40, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  let y = 130;
  putKV("Cliente", miniQuote.cliente || USER_NAME || "—");
  putKV("Fecha objetivo", prettyDate(miniQuote.fecha) || "—");
  if (miniQuote.detalle) putKV("Detalle", miniQuote.detalle);

  // Caja de precio
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

  // Footer
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

// URL → DataURL para jsPDF
async function urlToDataURL(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error(`No es imagen: ${type}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(rd.result);
    rd.onerror = reject;
    rd.readAsDataURL(blob);
  });
}

async function descargarPDFPyME(quoteResult) {
  if (!window.jspdf?.jsPDF) {
    alert("Falta jsPDF. Agrega el CDN en el HTML.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Encabezado
  doc.setFillColor(100, 75, 243);
  doc.rect(0, 0, 595, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SegurosPyme • Cotización PyME", 40, 55);

  // Datos
  doc.setTextColor(34, 40, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  const { input, planes, fecha, validezDias } = quoteResult;
  let y = 120;

  putKV("Fecha", prettyDate(fecha));
  putKV("Validez", `${validezDias} días`);
  putKV("Negocio", input.negocioNombre || "—");
  putKV("Actividad", input.actividadPrincipal || "—");

  y += 8;
  // Resumen Sumas
  doc.setDrawColor(100, 75, 243);
  doc.setFillColor(246, 245, 255);
  doc.roundedRect(40, y, 515, 120, 8, 8, "FD");
  let py = y + 20;
  putRow("Contenido", input.sumaContenido);
  putRow("Edificio", input.sumaEdificio);
  putRow("Valores en caja", input.sumaValoresCaja);
  putRow("Valores en tránsito", input.sumaValoresTransito);
  putRow("Electrónicos", input.sumaElectronicos);
  putRow("Cristales", input.sumaCristales);

  // Cada plan en páginas separadas
  planes.forEach((p) => {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(34, 40, 49);
    doc.text(`Plan ${p.nombrePlan}`, 40, 60);

    // Tabla coberturas
    let y2 = 90;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Coberturas:", 40, y2);
    y2 += 12;

    // Header
    doc.setFont("helvetica", "bold");
    doc.text("Cobertura", 40, y2);
    doc.text("Suma (MXN)", 260, y2);
    doc.text("Prima (MXN)", 420, y2);
    y2 += 10;
    doc.setFont("helvetica", "normal");

    p.coberturas.forEach((cob) => {
      doc.text(cob.descripcion, 40, y2);
      doc.text(money(cob.suma), 260, y2, { align: "left" });
      doc.text(money(cob.prima), 420, y2, { align: "left" });
      y2 += 16;
      if (y2 > 720) {
        doc.addPage();
        y2 = 60;
      }
    });

    y2 += 10;
    doc.setFont("helvetica", "bold");
    doc.text("Resumen:", 40, y2);
    y2 += 14;
    doc.setFont("helvetica", "normal");
    putLine("Prima Neta", p.primaNeta);
    putLine("Gastos de Expedición", p.gastosExpedicion);
    putLine("Derechos", p.derechos);
    putLine("IVA", p.iva);
    putLine("Prima Total", p.primaTotal);

    function putLine(label, value) {
      doc.text(label, 40, y2);
      doc.text(money(value), 420, y2, { align: "left" });
      y2 += 16;
    }
  });

  // Guardar
  const fname = `Cotizacion_PyME_${slug(input.negocioNombre || "negocio")}.pdf`;
  doc.save(fname);

  // Helpers internos
  function putKV(k, v) {
    doc.setFont("helvetica", "normal");
    doc.text(`${k}:`, 40, y);
    doc.setFont("helvetica", "bold");
    const text = String(v ?? "—");
    doc.text(text, 120, y);
    y += 16;
  }
  function putRow(k, v) {
    doc.setFont("helvetica", "normal");
    doc.text(`${k}:`, 60, py);
    doc.setFont("helvetica", "bold");
    doc.text(money(v || 0), 240, py);
    py += 16;
  }
}

// Botón PDF inteligente (PyME > Presupuesto)
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

// ================== Navegación ==================
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
  localStorage.removeItem(threadKey());
  localStorage.removeItem("threadId"); // legacy
  clearHistory();
  sessionStorage.clear();
  window.location.href = BASE;
  try {
    const KEY = quoteStorageKey(USER_NAME, USER_COMPANY);
    localStorage.removeItem(KEY);
  } catch {}
});

// ================== Reiniciar conversación ==================
document.getElementById("new-quote")?.addEventListener("click", () => {
  localStorage.removeItem(threadKey());
  localStorage.removeItem("threadId"); // legacy
  clearHistory();
  location.reload();
});

// ================== Polling ==================
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
        history: getHistory(), // <<< envía memoria también en polling
      }),
    });

    const ctype = res.headers.get("content-type") || "";
    if (!res.ok || !ctype.includes("application/json")) {
      throw new Error(await res.text());
    }
    const data = await res.json();

    if (data.status === "running") {
      setTimeout(() => pollThread(tid), 1200);
      return;
    }

    THREAD_ID = data.threadId;
    localStorage.setItem(threadKey(), THREAD_ID);

    const shown = sanitizeAssistantReply(data.reply);
    if (shown) {
      addMessage("Agente Seguros PyME", shown);
      pushHistory("assistant", shown);
      await recoverIfStuck(shown);
    }
    await tryExtractMiniQuote(data.reply);
    await tryExtractPymeQuote(data.reply);
  } catch (e) {
    console.error(e);
    addMessage("Sistema", `⚠️ ${e.message}`);
  }
}
