// Dashboard/dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  /* ------------ helpers de sesión ------------ */
  const qs = new URLSearchParams(location.search);
  const getParam = (k) => (qs.get(k) || "").trim();

  // Si vienen en el querystring, los persistimos
  const qsName = getParam("name");
  const qsCompany = getParam("company");
  if (qsName) localStorage.setItem("userName", qsName);
  if (qsCompany) localStorage.setItem("userCompany", qsCompany);

  // Identidad
  const name = localStorage.getItem("userName") || "Usuario";
  const company = localStorage.getItem("userCompany") || "";
  const email = localStorage.getItem("userEmail") || "";

  /* ------------ utilidades ------------ */
  const $ = (sel) => document.querySelector(sel);
  const slug = (s) =>
    String(s || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w-]/g, "")
      .toLowerCase();
  const quotesKey = (u, c) => `sp:quotes:${slug(u || "anon")}:${slug(c || "")}`; // historial (legacy)
  const lastQuoteKey = (u, c) =>
    `sp:lastQuote:${slug(u || "anon")}:${slug(c || "")}`; // última
  const money = (n) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const prettyDate = (d) => {
    if (!d) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day).toLocaleDateString();
    }
    const dt = new Date(d);
    return isNaN(dt) ? String(d) : dt.toLocaleDateString();
  };
  const safeParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  /* ------------ encabezados UI ------------ */
  const welcomeNameEl = $("#welcomeName");
  if (welcomeNameEl) welcomeNameEl.textContent = name.toUpperCase();

  const topUserEl = $("#topUser");
  const topCompanyEl = $("#topCompany");
  if (topUserEl) topUserEl.textContent = name.toUpperCase();
  if (topCompanyEl) topCompanyEl.textContent = company || email || "";

  // Link "Nueva Cotización" conserva sesión
  const newQuoteLink = document.querySelector(
    'a[href*="cotizacion/index.html"]'
  );
  if (newQuoteLink) {
    const href = new URL(newQuoteLink.getAttribute("href"), location.href);
    if (name) href.searchParams.set("name", name);
    if (company) href.searchParams.set("company", company);
    newQuoteLink.setAttribute("href", href.pathname + href.search);
  }

  /* ------------ carga de cotizaciones guardadas por la app ------------ */
  function loadLastWrapped() {
    // Preferimos la clave namespaced; luego la de compatibilidad "lastQuote"
    let w = safeParse(localStorage.getItem(lastQuoteKey(name, company)));
    if (!w) w = safeParse(localStorage.getItem("lastQuote"));

    // Compatibilidad: a veces se guardó sin "kind"
    if (w && !w.kind && w.event === "presupuesto_ok") {
      w = {
        kind: "presupuesto",
        data: w,
        user: name,
        company,
        createdAt: w.createdAt || w.fecha || new Date().toISOString(),
      };
    }
    // Compat: si es una PyME cruda (con input y planes)
    if (w && !w.kind && w.input && w.planes) {
      w = {
        kind: "pyme",
        data: w,
        user: name,
        company,
        createdAt: w.createdAt || w.fecha || new Date().toISOString(),
      };
    }
    return w;
  }

  function loadRecentWrapped() {
    // Historial legacy de presupuestos simples
    const arr = safeParse(localStorage.getItem(quotesKey(name, company))) || [];
    const items = [];
    arr.forEach((q) => {
      if (q && q.event === "presupuesto_ok") {
        items.push({
          kind: "presupuesto",
          data: q,
          user: name,
          company,
          createdAt: q.createdAt || q.fecha || new Date().toISOString(),
        });
      }
    });

    // Metemos la última (PyME o Presupuesto), primero en la lista
    const last = loadLastWrapped();
    if (last) {
      const dup = items.find(
        (x) =>
          x.kind === last.kind &&
          JSON.stringify(x.data) === JSON.stringify(last.data)
      );
      if (!dup) items.unshift(last);
    }
    return items.slice(0, 5);
  }

  /* ------------ helpers de render ------------ */
  function labelFor(w) {
    if (!w) return "Cotización";
    if (w.kind === "pyme")
      return w.data?.input?.negocioNombre || "Cotización PyME";
    if (w.kind === "presupuesto")
      return `Presupuesto • ${w.data?.cliente || "Cliente"}`;
    return "Cotización";
  }
  function subtitleFor(w) {
    if (!w) return "";
    if (w.kind === "pyme") return w.data?.input?.actividadPrincipal || "";
    if (w.kind === "presupuesto") return w.data?.detalle || "";
    return "";
  }
  function amountFor(w) {
    if (!w) return "";
    if (w.kind === "presupuesto") {
      const m = w.data?.precio?.monto;
      const cur = (w.data?.precio?.moneda || "MXN").toUpperCase();
      return `${money(m)} ${cur}`;
    }
    if (w.kind === "pyme") {
      const plus =
        (w.data?.planes || []).find((p) => p.nombrePlan === "Plus") ||
        (w.data?.planes || [])[0];
      const total = plus?.primaTotal ?? 0;
      return `Prima Total: ${money(total)} MXN`;
    }
    return "";
  }
  function dateFor(w) {
    return w?.createdAt || w?.data?.fecha || new Date().toISOString();
  }

  /* ------------ pinta lista de recientes ------------ */
  function renderRecent() {
    const listEl = $("#quotes-list");
    const emptyEl = $("#quotes-empty");
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = "";
    const items = loadRecentWrapped();

    if (!items.length) {
      emptyEl.classList.remove("d-none");
      return;
    }
    emptyEl.classList.add("d-none");

    items.forEach((w) => {
      const a = document.createElement("a");
      a.className =
        "list-group-item list-group-item-action d-flex align-items-center justify-content-between";
      a.href = `../cotizacion/index.html?name=${encodeURIComponent(
        name
      )}&company=${encodeURIComponent(company)}`;

      const left = document.createElement("div");
      left.innerHTML = `
        <div class="fw-700">${labelFor(w)}</div>
        <small class="text-secondary">${subtitleFor(w)}</small>
      `;

      const right = document.createElement("div");
      right.className = "text-end";
      right.innerHTML = `
        <div class="fw-700">${amountFor(w)}</div>
        <small class="text-secondary">${prettyDate(dateFor(w))}</small>
      `;

      a.appendChild(left);
      a.appendChild(right);
      listEl.appendChild(a);
    });
  }

  /* ------------ pinta bloque "Última cotización" ------------ */
  function renderLast() {
    const box = $("#last-quote");
    const body = $("#last-quote-body");
    if (!box || !body) return;

    const last = loadLastWrapped();
    if (!last) {
      box.classList.add("d-none");
      return;
    }
    box.classList.remove("d-none");

    if (last.kind === "presupuesto") {
      const q = last.data;
      body.innerHTML = `
        <div class="d-flex justify-content-between">
          <div>
            <div class="fw-700">Cliente: ${q.cliente || "—"}</div>
            <div class="small text-secondary">${q.detalle || ""}</div>
          </div>
          <div class="text-end">
            <div class="fw-800">${money(q?.precio?.monto)} ${(
        q?.precio?.moneda || "MXN"
      ).toUpperCase()}</div>
            <small class="text-secondary">${prettyDate(q.fecha)}</small>
          </div>
        </div>
      `;
      return;
    }

    if (last.kind === "pyme") {
      const d = last.data || {};
      const inp = d.input || {};
      const plus =
        (d.planes || []).find((p) => p.nombrePlan === "Plus") ||
        (d.planes || [])[0];

      body.innerHTML = `
        <div class="d-flex justify-content-between">
          <div>
            <div class="fw-700">${inp.negocioNombre || "Cotización PyME"}</div>
            <div class="small text-secondary">${
              inp.actividadPrincipal || ""
            }</div>
            <div class="small mt-1">
              <span class="me-2">Contenido: <strong>${money(
                inp.sumaContenido
              )}</strong></span>
              <span class="me-2">Caja: <strong>${money(
                inp.sumaValoresCaja
              )}</strong></span>
              <span class="me-2">Tránsito: <strong>${money(
                inp.sumaValoresTransito
              )}</strong></span>
              <span class="me-2">Electrónicos: <strong>${money(
                inp.sumaElectronicos
              )}</strong></span>
              <span>Cristales: <strong>${money(
                inp.sumaCristales
              )}</strong></span>
            </div>
          </div>
          <div class="text-end">
            <div class="fw-800">Prima Total (Plan ${
              plus?.nombrePlan || ""
            })</div>
            <div class="fs-5">${money(plus?.primaTotal || 0)} MXN</div>
            <small class="text-secondary">${prettyDate(
              d.fecha
            )} • Validez ${Number(d.validezDias || 30)} días</small>
          </div>
        </div>
      `;
    }
  }

  // Render inicial
  renderRecent();
  renderLast();
});
