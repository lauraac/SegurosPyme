document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const nombreInput = document.getElementById("nombre");
  const empresaInput = document.getElementById("empresa");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  // === Ayuda de contraseña (no rompe layout) ===
  const pwdHelp = document.createElement("div");
  pwdHelp.className = "form-text mt-1";
  pwdHelp.style.color = "rgba(255,255,255,.75)";
  // Colocar el mensaje DESPUÉS del .input-group
  const pwdGroup = passwordInput.closest(".input-group");
  pwdGroup.insertAdjacentElement("afterend", pwdHelp);

  // === Validaciones ===
  const validarEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function getPasswordStatus(v) {
    const checks = {
      longitud: v.length >= 8 && v.length <= 20,
      mayúscula: /[A-Z]/.test(v),
      minúscula: /[a-z]/.test(v),
      número: /[0-9]/.test(v),
      símbolo: /[^\w\s]/.test(v),
      "sin espacios": !/\s/.test(v),
    };
    const faltantes = Object.entries(checks)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    return { ok: faltantes.length === 0, faltantes };
  }

  function pintarPasswordFeedback() {
    const v = passwordInput.value.trim();
    const { ok, faltantes } = getPasswordStatus(v);

    passwordInput.classList.toggle("is-valid", ok && v !== "");
    passwordInput.classList.toggle("is-invalid", !ok && v !== "");

    if (!v) {
      pwdHelp.textContent =
        "Mín. 8–20 caracteres, incluye mayúscula, minúscula, número y símbolo. Sin espacios.";
      return;
    }

    pwdHelp.textContent = ok
      ? "Contraseña segura ✓"
      : "Te falta: " + faltantes.join(", ") + ".";
    pwdHelp.style.color = ok ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.75)";
  }

  passwordInput.addEventListener("input", pintarPasswordFeedback);
  pintarPasswordFeedback();

  // === Envío ===
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const nombre = nombreInput.value.trim();
    const empresa = empresaInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    // Reglas básicas
    if (!nombre || !email || !password) {
      Swal.fire({
        icon: "warning",
        title: "Campos incompletos",
        text: "Por favor completa nombre, correo y contraseña.",
        confirmButtonColor: "#644bf3",
      });
      return;
    }

    if (!validarEmail(email)) {
      Swal.fire({
        icon: "error",
        title: "Email inválido",
        text: "Ingresa un correo electrónico válido.",
        confirmButtonColor: "#644bf3",
      });
      emailInput.focus();
      return;
    }

    const { ok, faltantes } = getPasswordStatus(password);
    if (!ok) {
      pintarPasswordFeedback();
      Swal.fire({
        icon: "error",
        title: "Contraseña inválida",
        html: `Te falta: <b>${faltantes.join(", ")}</b>`,
        confirmButtonColor: "#644bf3",
      });
      passwordInput.focus();
      return;
    }

    // === Guardar sesión en localStorage ===
    try {
      localStorage.setItem("userName", nombre);
      localStorage.setItem("userCompany", empresa);
      localStorage.setItem("userEmail", email.toLowerCase());
      localStorage.setItem("userPassword", password);
    } catch (err) {
      console.error("Error guardando en localStorage:", err);
      Swal.fire({
        icon: "error",
        title: "No se pudo guardar la sesión",
        text: "Revisa permisos del navegador.",
        confirmButtonColor: "#644bf3",
      });
      return;
    }

    // Redirigir al Dashboard con QS para primer render
    const qs = `?name=${encodeURIComponent(
      nombre
    )}&company=${encodeURIComponent(empresa)}`;
    window.location.href = `../Dashboard/index.html${qs}`;
  });
});
