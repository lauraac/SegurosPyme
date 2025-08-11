// Esperar a que cargue el DOM
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form");
  const nombreInput = document.querySelector('input[placeholder="Juan Pérez"]');
  const empresaInput = document.querySelector(
    'input[placeholder="Tu empresa de seguros"]'
  );
  const emailInput = document.querySelector('input[type="email"]');
  const passwordInput = document.querySelector('input[type="password"]');

  // Crea (por JS) un texto de ayuda bajo el campo de contraseña sin tocar el HTML
  const pwdHelp = document.createElement("div");
  pwdHelp.className = "form-text mt-1"; // usa estilos Bootstrap existentes
  pwdHelp.style.color = "rgba(255,255,255,.75)"; // combina con tu tema
  passwordInput.closest(".input-group").parentElement.appendChild(pwdHelp);

  function validarEmail(v) {
    // Sencilla y suficiente para UI
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function getPasswordStatus(v) {
    const checks = {
      longitud: v.length >= 8 && v.length <= 20,
      mayúscula: /[A-Z]/.test(v),
      minúscula: /[a-z]/.test(v),
      número: /[0-9]/.test(v),
      símbolo: /[^\w\s]/.test(v), // símbolo/puntuación
      "sin espacios": !/\s/.test(v),
    };
    const faltantes = Object.entries(checks)
      .filter(([_, ok]) => !ok)
      .map(([k]) => k);
    return { ok: faltantes.length === 0, faltantes };
  }

  function pintarPasswordFeedback() {
    const v = passwordInput.value.trim();
    const { ok, faltantes } = getPasswordStatus(v);

    // Estilos Bootstrap sin cambiar el layout
    passwordInput.classList.toggle("is-valid", ok && v !== "");
    passwordInput.classList.toggle("is-invalid", !ok && v !== "");

    if (!v) {
      pwdHelp.textContent =
        "Mín. 8–20 caracteres, incluye mayúscula, minúscula, número y símbolo. Sin espacios.";
      return;
    }

    if (ok) {
      pwdHelp.textContent = "Contraseña segura ✓";
      pwdHelp.style.color = "rgba(255,255,255,.9)";
    } else {
      pwdHelp.textContent = "Te falta: " + faltantes.join(", ") + ".";
      pwdHelp.style.color = "rgba(255,255,255,.75)";
    }
  }

  // Feedback en vivo
  passwordInput.addEventListener("input", pintarPasswordFeedback);

  form.addEventListener("submit", (e) => {
    e.preventDefault(); // Evita recargar la página

    const nombre = (nombreInput.value || "").trim();
    const empresa = (empresaInput.value || "").trim();
    const email = (emailInput.value || "").trim();
    const password = (passwordInput.value || "").trim();

    if (!nombre || !email || !password) {
      alert("Por favor completa todos los campos obligatorios");
      return;
    }

    if (!validarEmail(email)) {
      alert("Por favor ingresa un correo electrónico válido");
      emailInput.focus();
      return;
    }

    const { ok, faltantes } = getPasswordStatus(password);
    if (!ok) {
      pintarPasswordFeedback();
      Swal.fire({
        icon: "error",
        title: "Contraseña inválida",
        html: `<p style="margin:0">Te falta: <b>${faltantes.join(
          ", "
        )}</b></p>`,
        confirmButtonText: "Entendido",
        confirmButtonColor: "#644bf3",
      });

      passwordInput.focus();
      return;
    }

    // Guardar datos en localStorage
    localStorage.setItem("userName", nombre);
    localStorage.setItem("userCompany", empresa);
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userPassword", password);

    // Redirigir al dashboard
    window.location.href = "../Dashboard/index.html";
  });

  // Pintar ayuda inicial
  pintarPasswordFeedback();
});
