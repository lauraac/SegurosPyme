// ================== UI ==================
const input = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const messagesEl = document.getElementById("messages");
const pdfBtn = document.getElementById("pdf-btn");
const backBtn = document.getElementById("back-btn");
const logoutBtn = document.getElementById("logout-btn");

// ================== Utils ==================
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
  const dt = new Date(d);
  return isNaN(dt) ? String(d || "") : dt.toLocaleDateString();
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
    const obj = JSON.parse(m[1]);
    if (obj && obj.event === "presupuesto_ok") {
      miniQuote = obj;
      if (pdfBtn) pdfBtn.disabled = false;
      addMessage(
        "Sistema",
        "✅ Presupuesto confirmado. Ya puedes descargar el PDF."
      );
      console.log("MiniQuote:", miniQuote);
    }
  } catch (e) {
    console.warn("Bloque JSON inválido:", e);
  }
}

// ================== Envío de mensaje ==================
async function sendMessage() {
  const userMessage = input.value.trim();
  if (!userMessage) return;

  addMessage("Tú", userMessage);
  input.value = "";
  input.focus();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        threadId: THREAD_ID,
        userName: USER_NAME, // 👈 lo leerá el assistant para saludarte/no pedir nombre
        userCompany: USER_COMPANY,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error desconocido");

    THREAD_ID = data.threadId;
    localStorage.setItem("threadId", THREAD_ID);

    addMessage("Agente Seguros PyME", data.reply);
    tryExtractMiniQuote(data.reply); // 👈 activa PDF cuando vea el JSON
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
function descargarPDFPresupuesto() {
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

  // Header (banda morada)
  doc.setFillColor(100, 75, 243); // #644bf3
  doc.rect(0, 0, 595, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SegurosPyme • Presupuesto", 40, 55);

  // Contenido
  doc.setTextColor(34, 40, 49);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  let y = 130;

  putKV("Cliente", miniQuote.cliente || USER_NAME || "—");
  putKV("Fecha objetivo", prettyDate(miniQuote.fecha) || "—");
  if (miniQuote.detalle) putKV("Detalle", miniQuote.detalle);

  // Caja de precio destacada
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

  // helpers internos
  function putKV(k, v) {
    doc.setFont("helvetica", "normal");
    doc.text(`${k}:`, 40, y);
    doc.setFont("helvetica", "bold");
    const wrap = doc.splitTextToSize(String(v), 420);
    doc.text(wrap, 140, y);
    y += wrap.length * 14 + 6;
  }
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
    const fallback = backBtn.getAttribute("href") || "/";
    window.location.href = fallback;
  }
});

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("userName");
  localStorage.removeItem("userCompany");
  localStorage.removeItem("threadId");
  sessionStorage.clear();
  window.location.href = "/";
});

// ================== Reiniciar conversación (opcional) ==================
// Si pones un botón con id="new-quote", habilita esto:
document.getElementById("new-quote")?.addEventListener("click", () => {
  localStorage.removeItem("threadId");
  location.reload();
});
