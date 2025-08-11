document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  function validarEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

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

    const savedEmail = localStorage.getItem("userEmail");
    const savedPassword = localStorage.getItem("userPassword");

    if (email === savedEmail && password === savedPassword) {
      // Popup de éxito breve y luego redirección
      Swal.fire({
        icon: "success",
        title: "¡Bienvenida!",
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
