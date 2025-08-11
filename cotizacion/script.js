// ================== UI ==================
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messagesEl = document.getElementById("messages");
const pdfBtn = document.getElementById("pdf-btn");
const backBtn = document.getElementById("back-btn");
const logoutBtn = document.getElementById("logout-btn");

// ================== Utils ==================
// Dónde vive el frontend (GitHub Pages usa /<repo>/)
const BASE = location.hostname.endsWith("github.io")
  ? `/${location.pathname.split("/")[1]}/`
  : "/";

// Dónde está la API
const API_URL = location.hostname.endsWith("github.io")
  ? "https://seguros-pyme-api-bn8n.vercel.app/api/chat" // Vercel (producción)
  : "/api/chat"; // Localhost con tu server Express

function getParam(n) {
  return new URLSearchParams(location.search).get(n);
}
function money(n) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
// Corrige desfase (YYYY-MM-DD se convierte a fecha local)
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
function slug(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w-]/g, "");
}

// ================== Sesión usuario ==================
const USER_NAME =
  getParam("name") || localStorage.getItem("userName") || "Cliente";
const USER_COMPANY =
  getParam("company") || localStorage.getItem("userCompany") || "";

localStorage.setItem("userName", USER_NAME);
localStorage.setItem("userCompany", USER_COMPANY);

// ================== Estado ==================
let THREAD_ID = localStorage.getItem("threadId") || null;
let miniQuote = null; // aquí se guarda el JSON { event:"presupuesto_ok", ... }
if (pdfBtn) pdfBtn.disabled = true;

// ================== Chat helpers ==================
function addMessage(sender, text) {
  const div = document.createElement("div");
  div.className = "text-start text-white mb-2";
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Busca un bloque ```json ... ``` en el texto y, si es
 * { event: "presupuesto_ok", ... }, habilita el PDF.
 */
function tryExtractMiniQuote(text) {
  const m = String(text || "").match(/```json([\s\S]*?)```/);
  if (!m) return;
  try {
    const obj = JSON.parse(String(m[1]).trim());
    if (obj && obj.event === "presupuesto_ok") {
      miniQuote = obj;
      if (pdfBtn) pdfBtn.disabled = false;
      addMessage(
        "Sistema",
        "✅ Presupuesto confirmado. Ya puedes descargar el PDF."
      );
      console.log("MiniQuote:", miniQuote);

      // 🔥 Guardar para el Dashboard
      try {
        localStorage.setItem("lastQuote", JSON.stringify(miniQuote));
      } catch (e) {
        console.warn("No se pudo guardar lastQuote:", e);
      }
    }
  } catch (e) {
    console.warn("Bloque JSON inválido:", e);
  }
}

// Oculta el bloque ```json ...``` al usuario, pero deja que el código lo detecte
function sanitizeAssistantReply(text) {
  if (!text) return "";
  // quita cualquier bloque ```...``` (con o sin 'json')
  return String(text)
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    .trim();
}

// ================== Envío de mensaje ==================
async function sendMessage() {
  const userMessage = input.value.trim();
  if (!userMessage) return;

  addMessage("Tú", userMessage);
  input.value = "";
  input.focus();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        threadId: THREAD_ID,
        userName: USER_NAME,
        userCompany: USER_COMPANY,
      }),
    });

    const ctype = res.headers.get("content-type") || "";
    const raw = await res.text();

    if (!res.ok) throw new Error(raw || `HTTP ${res.status}`);
    if (!ctype.includes("application/json")) {
      throw new Error(
        "La API no devolvió JSON (revisa CORS o la URL de la API)."
      );
    }

    const data = JSON.parse(raw);

    // Si la API aún procesa, guarda thread y reintenta
    if (data.status === "running") {
      THREAD_ID = data.threadId;
      localStorage.setItem("threadId", THREAD_ID);
      setTimeout(() => sendMessage(), 1500);
      return;
    }

    // Ya terminó
    THREAD_ID = data.threadId;
    localStorage.setItem("threadId", THREAD_ID);

    // Pinta el mensaje SIN el JSON
    const shown = sanitizeAssistantReply(data.reply);
    addMessage("Agente Seguros PyME", shown);

    // Analiza el texto ORIGINAL para habilitar el PDF
    tryExtractMiniQuote(data.reply);
  } catch (err) {
    console.error(err);
    addMessage("Sistema", `⚠️ ${err.message}`);
  }
}

// Click en enviar
sendBtn?.addEventListener("click", sendMessage);

// Enter para enviar (sin salto)
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
    alert("Falta jsPDF. Asegúrate de tener el CDN en el HTML.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // Logo (ajusta la ruta si lo moviste)
  const logoUrl = `${BASE}img/pdf.png?v=2`;

  let logoDataUrl = null;
  try {
    logoDataUrl = await urlToDataURL(logoUrl);
  } catch (e) {
    console.warn("Logo no disponible:", e.message);
  }

  // Header con banda y logo
  doc.setFillColor(100, 75, 243);
  doc.rect(0, 0, 595, 90, "F");

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 40, 20, 50, 50);
    } catch (e) {
      console.warn("addImage falló, continúo sin logo:", e.message);
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

  doc.save(
    `Presupuesto_${slug(miniQuote.cliente || USER_NAME || "cliente")}.pdf`
  );

  // Helpers
  function putKV(k, v) {
    doc.setFont("helvetica", "normal");
    doc.text(`${k}:`, 40, y);
    doc.setFont("helvetica", "bold");
    const wrap = doc.splitTextToSize(String(v), 420);
    doc.text(wrap, 140, y);
    y += wrap.length * 14 + 6;
  }
}

// Convierte URL → DataURL para jsPDF (con no-store y validación de tipo)
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

pdfBtn?.addEventListener("click", descargarPDFPresupuesto);

// ================== Navegación ==================
backBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (
    document.referrer &&
    new URL(document.referrer).origin === location.origin
  ) {
    history.back();
  } else {
    const fallback = backBtn.getAttribute("href") || BASE;
    window.location.href = fallback;
  }
});

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("userName");
  localStorage.removeItem("userCompany");
  localStorage.removeItem("threadId");
  sessionStorage.clear();
  window.location.href = BASE;
});

// ================== Reiniciar conversación (opcional) ==================
document.getElementById("new-quote")?.addEventListener("click", () => {
  localStorage.removeItem("threadId");
  location.reload();
});
