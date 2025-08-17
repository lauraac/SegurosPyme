// Dashboard/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  // --- helpers ---
  const qs = new URLSearchParams(location.search);
  const getParam = (k) => (qs.get(k) || "").trim();

  // Si vienen en el querystring, los persistimos
  const qsName = getParam("name");
  const qsCompany = getParam("company");
  if (qsName) localStorage.setItem("userName", qsName);
  if (qsCompany) localStorage.setItem("userCompany", qsCompany);

  // Leemos de localStorage (o valores por defecto)
  const name = localStorage.getItem("userName") || "Usuario";
  const company = localStorage.getItem("userCompany") || "";
  const email = localStorage.getItem("userEmail") || "";

  // --- pinta encabezados ---
  const $ = (sel) => document.querySelector(sel);

  // Saludo principal
  const welcomeNameEl = $("#welcomeName");
  if (welcomeNameEl) welcomeNameEl.textContent = name.toUpperCase();

  // Top derecho (nombre grande + empresa)
  const topUserEl = $("#topUser");
  const topCompanyEl = $("#topCompany");
  if (topUserEl) topUserEl.textContent = name.toUpperCase();
  if (topCompanyEl) topCompanyEl.textContent = company || email || "";

  // Botón "Nueva Cotización" con sesión en QS
  const newQuoteLink = document.querySelector(
    'a[href*="cotizacion/index.html"]'
  );
  if (newQuoteLink) {
    const href = new URL(newQuoteLink.getAttribute("href"), location.href);
    if (name) href.searchParams.set("name", name);
    if (company) href.searchParams.set("company", company);
    newQuoteLink.setAttribute("href", href.pathname + href.search);
  }

  // (Opcional) si en el futuro usas email visible en el top, tendrías un
  // <span id="topEmail"></span> y lo pintas aquí:
  // const topEmailEl = $("#topEmail");
  // if (topEmailEl) topEmailEl.textContent = email;
});
