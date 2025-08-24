// Login/login.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  // ================= Helpers =================
  const validarEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  // Heurística simple por nombre: termina en "a" => F, termina en "o" => M
  function inferGenderByName(name = "") {
    const n = (name || "").trim().toLowerCase();
    if (!n) return null;
    if (n.endsWith("a")) return "F";
    if (n.endsWith("o")) return "M";
    return null; // no concluyente
  }

  function getWelcomeTitle() {
    const stored = (localStorage.getItem("userGender") || "").toUpperCase(); // "F" | "M"
    if (stored === "M") return "¡Bienvenido!";
    if (stored === "F") return "¡Bienvenida!";

    // Si no hay género guardado, intenta inferir por el nombre
    const guessed = inferGenderByName(localStorage.getItem("userName") || "");
    if (guessed === "M") return "¡Bienvenido!";
    if (guessed === "F") return "¡Bienvenida!";

    // Neutro si no se puede inferir
    return "¡Bienvenid@!";
  }

  // ================= Submit =================
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const email = (emailInput.value || "").trim().toLowerCase();
    const password = (passwordInput.value || "").trim();

    if (!email || !password) {
      Swal.fire({
        icon: "warning",
        title: "Faltan datos",
        html: "<p style='margin:0'>Por favor, completa todos los campos.</p>",
        confirmButtonText: "Entendido",
        confirmButtonColor: "#644bf3",
      });
      return;
    }

    if (!validarEmail(email)) {
      Swal.fire({
        icon: "error",
        title: "Correo inválido",
        html: "<p style='margin:0'>Ingresa un correo electrónico válido.</p>",
        confirmButtonText: "Corregir",
        confirmButtonColor: "#644bf3",
      });
      emailInput.focus();
      return;
    }

    const savedEmail = (localStorage.getItem("userEmail") || "").toLowerCase();
    const savedPassword = localStorage.getItem("userPassword") || "";

    // Si no hay cuenta guardada, sugiere registrarse
    if (!savedEmail || !savedPassword) {
      Swal.fire({
        icon: "info",
        title: "Aún no tienes cuenta",
        html: "<p style='margin:0'>Regístrate primero para crear tu usuario.</p>",
        confirmButtonText: "Ir a Registro",
        confirmButtonColor: "#644bf3",
      }).then(() => {
        window.location.href = "../Registro/index.html";
      });
      return;
    }

    // Compara credenciales
    if (email === savedEmail && password === savedPassword) {
      // (Opcional) Refresca nombre/empresa en sesión
      const name = localStorage.getItem("userName") || "";
      const company = localStorage.getItem("userCompany") || "";
      if (name) localStorage.setItem("userName", name);
      if (company) localStorage.setItem("userCompany", company);

      Swal.fire({
        icon: "success",
        title: getWelcomeTitle(), // Bienvenido / Bienvenida / Bienvenid@
        html: "<p style='margin:0'>Accediendo a tu panel…</p>",
        showConfirmButton: false,
        timer: 1200,
      }).then(() => {
        window.location.href = "../Dashboard/index.html";
      });
    } else {
      Swal.fire({
        icon: "error",
        title: "Credenciales incorrectas",
        html: "<p style='margin:0'>Verifica tu correo y contraseña.</p>",
        confirmButtonText: "Intentar de nuevo",
        confirmButtonColor: "#644bf3",
      });
    }
  });
});
