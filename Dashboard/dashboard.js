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
  const quoteStorageKey = (u, c) =>
    `sp:lastQuote:${slug(u || "anon")}:${slug(c || "")}`;

  // --- MIGRACIÓN / LIMPIEZA: mover la clave global "lastQuote" a la clave por usuario/empresa
  try {
    const globalLast = localStorage.getItem("lastQuote");
    if (globalLast && !localStorage.getItem(quoteStorageKey(name, company))) {
      const parsed = JSON.parse(globalLast);
      if (
        (parsed?.user || "").toLowerCase() === (name || "").toLowerCase() &&
        (parsed?.company || "").toLowerCase() === (company || "").toLowerCase()
      ) {
        localStorage.setItem(quoteStorageKey(name, company), globalLast);
      }
    }
  } catch (e) {
    console.warn("No se pudo migrar 'lastQuote' global:", e);
  }
  localStorage.removeItem("lastQuote");

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
  // === Respaldo: leer la última cotización simple (no PDF) ===
  function readLastQuote() {
    try {
      const key = quoteStorageKey(name, company);
      const w = JSON.parse(localStorage.getItem(key) || "null");
      return w && w.data ? w : null;
    } catch {
      return null;
    }
  }

  /* ============== KPI: cotizaciones del mes ============== */
  function setQuotesThisMonthKPI() {
    const list = readPdfLibrary();
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    let count = list.filter((x) => {
      const d = new Date(x.createdAt || 0);
      return d.getMonth() === m && d.getFullYear() === y;
    }).length;

    // Respaldo: si no hay PDFs del mes, pero sí hay lastQuote del mes
    if (count === 0) {
      const w = readLastQuote();
      if (w?.createdAt) {
        const d = new Date(w.createdAt);
        if (d.getMonth() === m && d.getFullYear() === y) count = 1;
      }
    }

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
      // Respaldo: intenta mostrar lastQuote aunque no haya PDFs guardados
      const w = readLastQuote();
      if (w) {
        emptyEl?.classList.add("d-none");

        let title = "Cotización";
        let kind = "PYME";
        let created = new Date(w.createdAt || Date.now()).toLocaleDateString();

        if (w.kind === "pyme" && w.data?.input) {
          title = `${w.data.input.negocioNombre || "Negocio"} • ${created}`;
          kind = "PyME";
        } else if (w.kind === "presupuesto") {
          title = `${w.data.cliente || "Cliente"} • ${created}`;
          kind = "Presupuesto";
        }

        container.innerHTML = `
      <div class="list-group-item px-0 d-flex align-items-start justify-content-between">
        <div class="me-3">
          <div class="fw-700">${escapeHtml(title)}</div>
          <small class="text-secondary">${created} · ${kind}</small>
        </div>
      </div>
    `;
        return;
      }

      // Si tampoco hay lastQuote, muestra el vacío
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
      wrapped = JSON.parse(
        localStorage.getItem(quoteStorageKey(name, company)) || "null"
      );
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
    const openBtn = document.querySelector("#kpi-open-gallery");
    const modalEl = document.querySelector("#pdfGalleryModal");
    const galleryList = document.querySelector("#pdf-gallery-list");
    if (!openBtn || !modalEl || !galleryList) return;

    const modal = new bootstrap.Modal(modalEl);

    openBtn.addEventListener("click", () => {
      const arr = readPdfLibrary();

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
            <a class="btn btn-sm btn-primary" download="${escapeHtml(
              fname
            )}" href="${it.dataUrl}">
              Descargar
            </a>
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
