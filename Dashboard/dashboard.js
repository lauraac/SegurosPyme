document.addEventListener("DOMContentLoaded", () => {
  /* ============== helpers de sesión ============== */
  const qs = new URLSearchParams(location.search);
  const getParam = (k) => (qs.get(k) || "").trim();

  const qsName = getParam("name");
  const qsCompany = getParam("company");
  if (qsName) localStorage.setItem("userName", qsName);
  if (qsCompany) localStorage.setItem("userCompany", qsCompany);

  const name = localStorage.getItem("userName") || "Usuario";
  const company = localStorage.getItem("userCompany") || "";
  const email = localStorage.getItem("userEmail") || "";

  const $ = (sel) => document.querySelector(sel);

  /* ============== encabezados / links ============== */
  $("#welcomeName") && ($("#welcomeName").textContent = name.toUpperCase());
  $("#topUser") && ($("#topUser").textContent = name.toUpperCase());
  $("#topCompany") && ($("#topCompany").textContent = company || email || "");

  const newQuoteLink = document.querySelector(
    'a[href*="cotizacion/index.html"]'
  );
  if (newQuoteLink) {
    const href = new URL(newQuoteLink.getAttribute("href"), location.href);
    if (name) href.searchParams.set("name", name);
    if (company) href.searchParams.set("company", company);
    newQuoteLink.setAttribute("href", href.pathname + href.search);
  }

  /* ============== util: almacenamiento de PDFs ============== */
  const slug = (s = "") =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "");

  const pdfLibKey = (u, c) => `sp:pdfLib:${slug(u)}:${slug(c)}`;

  function readPdfLibrary() {
    try {
      const key = pdfLibKey(name, company);
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      // Orden más reciente primero
      return arr.sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );
    } catch {
      return [];
    }
  }

  /* ============== KPI: cotizaciones del mes ============== */
  function setQuotesThisMonthKPI() {
    const list = readPdfLibrary();
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const count = list.filter((x) => {
      const d = new Date(x.createdAt || 0);
      return d.getMonth() === m && d.getFullYear() === y;
    }).length;
    const kpiEl = $("#kpi-quotes-this-month");
    if (kpiEl) kpiEl.textContent = String(count);
  }

  /* ============== Cotizaciones recientes (solo 1 y sin botones) ============== */
  function renderRecentOnlyOne() {
    const list = readPdfLibrary();
    const container = $("#quotes-list");
    const emptyEl = $("#quotes-empty");

    if (!container) return;

    if (!list.length) {
      container.innerHTML = "";
      emptyEl?.classList.remove("d-none");
      return;
    }

    emptyEl?.classList.add("d-none");

    const it = list[0]; // SOLO la más reciente
    const created = new Date(it.createdAt || Date.now());
    const niceDate = created.toLocaleDateString();
    const kind =
      (it.kind === "pyme" && "PyME") ||
      (it.kind === "presupuesto" && "Presupuesto") ||
      (it.kind === "pyme_pdf" && "PyME") ||
      "PDF";

    container.innerHTML = `
      <div class="list-group-item px-0 d-flex align-items-start justify-content-between">
        <div class="me-3">
          <div class="fw-700">${escapeHtml(it.title || "Cotización")}</div>
          <small class="text-secondary">${niceDate} · ${kind}</small>
        </div>
        <!-- intencionalmente SIN botones aquí -->
      </div>
    `;
  }

  function escapeHtml(s = "") {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  /* ============== Tarjeta “Última cotización generada” ============== */
  function renderLastQuoteCard() {
    const lastEl = $("#last-quote");
    const bodyEl = $("#last-quote-body");
    if (!lastEl || !bodyEl) return;

    // Se guarda en la cotización la clave sp:lastQuote:*
    let wrapped = null;
    try {
      wrapped = JSON.parse(localStorage.getItem("lastQuote") || "null");
    } catch {}

    if (!wrapped || !wrapped.data) {
      lastEl.classList.add("d-none");
      return;
    }

    const kind = wrapped.kind;
    let html = "";

    if (kind === "pyme" && wrapped.data?.input) {
      const inp = wrapped.data.input;
      html = `
        <div><strong>Negocio:</strong> ${escapeHtml(
          inp.negocioNombre || "—"
        )}</div>
        <div><strong>Actividad:</strong> ${escapeHtml(
          inp.actividadPrincipal || "—"
        )}</div>
        <div class="small text-secondary mt-2">${new Date(
          wrapped.createdAt || Date.now()
        ).toLocaleString()} · PYME</div>
      `;
    } else if (kind === "presupuesto") {
      const q = wrapped.data || {};
      html = `
        <div><strong>Cliente:</strong> ${escapeHtml(q.cliente || "—")}</div>
        <div><strong>Monto:</strong> ${Number(
          q?.precio?.monto || 0
        ).toLocaleString()}</div>
        <div class="small text-secondary mt-2">${new Date(
          wrapped.createdAt || Date.now()
        ).toLocaleString()} · PRESUPUESTO</div>
      `;
    } else {
      html = `
        <div>${escapeHtml(wrapped?.data?.title || "Documento")}</div>
        <div class="small text-secondary mt-2">${new Date(
          wrapped.createdAt || Date.now()
        ).toLocaleString()}</div>
      `;
    }

    bodyEl.innerHTML = html;
    lastEl.classList.remove("d-none");
  }

  /* ============== Galería (con Ver/Descargar) ============== */
  function wireGallery() {
    const openBtn = $("#kpi-open-gallery");
    const modalEl = $("#pdfGalleryModal");
    if (!openBtn || !modalEl) return;

    const galleryList = $("#pdf-gallery-list");
    const modal = new bootstrap.Modal(modalEl);

    openBtn.addEventListener("click", () => {
      const arr = readPdfLibrary();
      if (!galleryList) return;

      if (!arr.length) {
        galleryList.innerHTML = `<div class="list-group-item text-secondary">No hay PDFs aún.</div>`;
      } else {
        galleryList.innerHTML = arr
          .map((it) => {
            const d = new Date(it.createdAt || 0).toLocaleString();
            const kind =
              (it.kind === "pyme" && "PyME") ||
              (it.kind === "presupuesto" && "Presupuesto") ||
              (it.kind === "pyme_pdf" && "PyME") ||
              "PDF";
            const fname = it.filename || "Cotizacion.pdf";
            return `
              <div class="list-group-item d-flex justify-content-between align-items-center">
                <div class="me-3">
                  <div class="fw-700">${escapeHtml(it.title || fname)}</div>
                  <small class="text-secondary">${d} · ${kind}</small>
                </div>
                <div class="btn-group">
                  <a class="btn btn-sm btn-outline-secondary" target="_blank" href="${
                    it.dataUrl
                  }">Ver</a>
                  <a class="btn btn-sm btn-primary" download="${escapeHtml(
                    fname
                  )}" href="${it.dataUrl}">Descargar</a>
                </div>
              </div>
            `;
          })
          .join("");
      }

      modal.show();
    });
  }

  /* ============== inicializa ============== */
  setQuotesThisMonthKPI();
  renderRecentOnlyOne();
  renderLastQuoteCard();
  wireGallery();
});
