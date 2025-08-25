// Dashboard/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  /* ============== helpers ============== */
  const qs = new URLSearchParams(location.search);
  const getParam = (k) => (qs.get(k) || "").trim();
  const $ = (sel) => document.querySelector(sel);

  const slug = (s) =>
    String(s || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "")
      .toLowerCase();

  const money = (n) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const prettyDate = (d) => {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      const dt = new Date(y, m - 1, day);
      return dt.toLocaleDateString();
    }
    const dt = new Date(d);
    return isNaN(dt) ? String(d) : dt.toLocaleDateString();
  };

  const quoteStorageKey = (user, company) =>
    `sp:lastQuote:${slug(user || "anon")}:${slug(company || "")}`;
  const pdfLibKey = (u, c) => `sp:pdfLib:${slug(u)}:${slug(c)}`;

  /* ============== sesión/identidad ============== */
  // Si vienen en el querystring, los persistimos
  const qsName = getParam("name");
  const qsCompany = getParam("company");
  if (qsName) localStorage.setItem("userName", qsName);
  if (qsCompany) localStorage.setItem("userCompany", qsCompany);

  // Leemos de localStorage
  const name = localStorage.getItem("userName") || "Usuario";
  const company = localStorage.getItem("userCompany") || "";
  const email = localStorage.getItem("userEmail") || "";

  /* ============== pinta encabezados/topbar ============== */
  const welcomeNameEl = $("#welcomeName");
  if (welcomeNameEl) welcomeNameEl.textContent = name.toUpperCase();

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

  /* ============== biblioteca de PDFs y últimas cotizaciones ============== */
  function getPdfLib() {
    try {
      const arr = JSON.parse(
        localStorage.getItem(pdfLibKey(name, company)) || "[]"
      );
      // Más reciente primero
      return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch {
      return [];
    }
  }

  const pdfs = getPdfLib();

  // KPI: cotizaciones del mes (cuenta PDFs guardados este mes)
  const kpiEl = $("#kpi-quotes-this-month");
  if (kpiEl) {
    const now = new Date();
    const count = pdfs.filter((p) => {
      const d = new Date(p.createdAt);
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      );
    }).length;
    kpiEl.textContent = String(count);
  }

  // Cotizaciones recientes (mostramos hasta 6 PDFs)
  const listEl = $("#quotes-list");
  const emptyEl = $("#quotes-empty");

  function rowFromPdf(p) {
    const when = new Date(p.createdAt);
    const kind =
      p.kind === "pyme"
        ? "PyME"
        : p.kind === "presupuesto"
        ? "Presupuesto"
        : (p.kind || "").toUpperCase();

    return `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-700">${p.title || p.filename || "Cotización"}</div>
          <div class="small text-secondary">
            ${when.toLocaleDateString()} · ${kind}
          </div>
        </div>
        <div class="d-flex gap-2">
          <a class="btn btn-sm btn-outline-primary" target="_blank" href="${
            p.dataUrl
          }">Ver</a>
          <a class="btn btn-sm btn-primary" href="${p.dataUrl}" download="${
      p.filename || "cotizacion.pdf"
    }">Descargar</a>
        </div>
      </div>
    `;
  }

  if (listEl) {
    if (pdfs.length) {
      emptyEl?.classList.add("d-none");
      listEl.innerHTML = pdfs.slice(0, 6).map(rowFromPdf).join("");
    } else {
      listEl.innerHTML = "";
      emptyEl?.classList.remove("d-none");
    }
  }

  // Última cotización (bloque “Última cotización generada”)
  const lastQuoteCard = $("#last-quote");
  const lastQuoteBody = $("#last-quote-body");

  function paintLastQuoteFromStorage() {
    try {
      const raw = localStorage.getItem(quoteStorageKey(name, company));
      if (!raw) return false;
      const last = JSON.parse(raw);
      if (!last || !last.data) return false;

      const kind = (last.kind || "").toUpperCase();
      const createdAt = new Date(last.createdAt || Date.now()).toLocaleString();

      // Intentamos mostrar algo útil según el tipo
      let summary = "";
      if (last.kind === "pyme" && last.data?.input) {
        const inp = last.data.input;
        summary = `
          <div><strong>Negocio:</strong> ${inp.negocioNombre || "-"}</div>
          <div><strong>Actividad:</strong> ${
            inp.actividadPrincipal || "-"
          }</div>
          <div class="mt-2 small text-secondary">${createdAt} · ${kind}</div>`;
      } else if (last.kind === "presupuesto") {
        const cli = last.data?.cliente || name;
        const monto = last.data?.precio?.monto ?? 0;
        summary = `
          <div><strong>Cliente:</strong> ${cli}</div>
          <div><strong>Total:</strong> $${money(monto)}</div>
          <div class="mt-2 small text-secondary">${createdAt} · ${kind}</div>`;
      } else {
        summary = `<div class="small text-secondary">${createdAt} · ${kind}</div>`;
      }

      lastQuoteBody.innerHTML = summary;
      lastQuoteCard?.classList.remove("d-none");
      return true;
    } catch {
      return false;
    }
  }

  // Si no hay “lastQuote” del flujo viejo, mostramos el PDF más reciente
  function paintLastQuoteFromPdfs() {
    if (!pdfs.length || !lastQuoteBody) return false;
    const p = pdfs[0];
    const when = new Date(p.createdAt).toLocaleString();
    lastQuoteBody.innerHTML = `
      <div><strong>Título:</strong> ${
        p.title || p.filename || "Cotización"
      }</div>
      <div><strong>Tipo:</strong> ${(p.kind || "").toUpperCase()}</div>
      <div class="mt-2 small text-secondary">${when}</div>
      <div class="mt-2 d-flex gap-2">
        <a class="btn btn-sm btn-outline-primary" target="_blank" href="${
          p.dataUrl
        }">Ver</a>
        <a class="btn btn-sm btn-primary" href="${p.dataUrl}" download="${
      p.filename || "cotizacion.pdf"
    }">Descargar</a>
      </div>
    `;
    lastQuoteCard?.classList.remove("d-none");
    return true;
  }

  if (!paintLastQuoteFromStorage()) {
    paintLastQuoteFromPdfs();
  }

  /* ============== modal/galería ============== */
  $("#kpi-open-gallery")?.addEventListener("click", () => {
    const list = $("#pdf-gallery-list");
    if (list) {
      list.innerHTML = pdfs.length
        ? pdfs
            .map((p, idx) => {
              const when = new Date(p.createdAt).toLocaleString();
              const badge = idx === 0 ? "🆕 " : "";
              const kind =
                p.kind === "pyme"
                  ? "PyME"
                  : p.kind === "presupuesto"
                  ? "Presupuesto"
                  : (p.kind || "").toUpperCase();
              return `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                  <div>
                    <div class="fw-700">${badge}${
                p.title || p.filename || "Cotización"
              }</div>
                    <div class="small text-secondary">${when} · ${kind}</div>
                  </div>
                  <div class="d-flex gap-2">
                    <a class="btn btn-sm btn-outline-primary" target="_blank" href="${
                      p.dataUrl
                    }">Ver</a>
                    <a class="btn btn-sm btn-primary" href="${
                      p.dataUrl
                    }" download="${
                p.filename || "cotizacion.pdf"
              }">Descargar</a>
                  </div>
                </div>
              `;
            })
            .join("")
        : `<div class="text-secondary">Aún no tienes PDFs guardados.</div>`;
    }
    new bootstrap.Modal(document.getElementById("pdfGalleryModal")).show();
  });
});
