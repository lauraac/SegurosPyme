// Dashboard/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  // ---------- Utils ----------
  const getParam = (n) => new URLSearchParams(location.search).get(n);
  const slug = (s) =>
    String(s || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "")
      .toLowerCase();
  const quotesKey = (user, company) =>
    `sp:quotes:${slug(user || "anon")}:${slug(company || "")}`;

  const fmtDate = (d) => {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day).toLocaleDateString();
    }
    const dt = new Date(d);
    return isNaN(dt) ? String(d) : dt.toLocaleDateString();
  };

  const fmtMoney = (n, cur) =>
    `${Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${(cur || "").toUpperCase()}`.trim();

  // ---------- Sesión (name/company) ----------
  const nameQS = getParam("name");
  const compQS = getParam("company");
  const name = nameQS || localStorage.getItem("userName") || "LAURA";
  const company = compQS || localStorage.getItem("userCompany") || "Servifacil";

  // Pinta encabezado
  document.getElementById("welcomeName")!.textContent = name.toUpperCase();
  document.getElementById("topUser")!.textContent = name.toUpperCase();
  document.getElementById("topCompany")!.textContent = company;

  // Persiste sesión (para la navegación entre pantallas)
  localStorage.setItem("userName", name);
  localStorage.setItem("userCompany", company);

  // Link “Nueva Cotización” con QS
  const newQuoteLink = document.querySelector(
    'a[href*="cotizacion/index.html"]'
  );
  if (newQuoteLink) {
    newQuoteLink.setAttribute(
      "href",
      `../cotizacion/index.html?name=${encodeURIComponent(
        name
      )}&company=${encodeURIComponent(company)}`
    );
  }

  // ---------- Pintado de cotizaciones ----------
  const list = document.getElementById("quotes-list");
  const empty = document.getElementById("quotes-empty");
  const lastBox = document.getElementById("last-quote");
  const lastBody = document.getElementById("last-quote-body");
  if (!list || !empty || !lastBox || !lastBody) return;

  const KEY = quotesKey(name, company);

  // Cargar historial por usuario; migrar claves viejas si existieran
  let quotes = [];
  try {
    quotes = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {}

  // Migración opcional desde "lastQuote" (legacy)
  if (!quotes.length) {
    const legacy = localStorage.getItem("lastQuote");
    if (legacy) {
      try {
        quotes = [JSON.parse(legacy)];
        localStorage.setItem(KEY, JSON.stringify(quotes));
        localStorage.removeItem("lastQuote");
      } catch {}
    }
  }

  if (!quotes.length) {
    empty.classList.remove("d-none");
    lastBox.classList.add("d-none");
    list.innerHTML = "";
    return;
  }

  empty.classList.add("d-none");
  lastBox.classList.remove("d-none");

  // Tarjeta "Última cotización" (la más reciente)
  const last = quotes[0];
  lastBody.innerHTML = `
    <div class="row g-2">
      <div class="col-12 col-md-6"><strong>Cliente:</strong> ${last?.cliente ?? "—"}</div>
      <div class="col-6 col-md-3"><strong>Fecha:</strong> ${fmtDate(last?.fecha) || "—"}</div>
      <div class="col-6 col-md-3"><strong>Total:</strong> ${fmtMoney(last?.precio?.monto, last?.precio?.moneda)}</div>
      <div class="col-12"><strong>Producto:</strong> ${last?.producto ?? "—"}</div>
      ${last?.detalle ? `<div class="col-12"><strong>Detalle:</strong> ${last.detalle}</div>` : ""}
    </div>
  `;

  // Lista: muestra hasta 3 recientes
  const top3 = quotes.slice(0, 3);
  list.innerHTML = top3
    .map(
      (q) => `
    <div class="list-group-item px-0">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div>
          <div class="fw-700">${q?.cliente ?? "—"}</div>
          <div class="text-secondary small">${q?.producto ?? "—"}</div>
          <div class="text-secondary small">${fmtDate(q?.fecha) || "—"}</div>
        </div>
        <div class="text-end">
          <div class="fw-700">${fmtMoney(q?.precio?.monto, q?.precio?.moneda)}</div>
          <span class="badge bg-success-subtle text-success-emphasis rounded-pill px-3">Generada</span>
        </div>
      </div>
    </div>`
    )
    .join("");
});
