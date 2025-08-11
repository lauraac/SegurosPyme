// Esperar a que cargue el DOM
document.addEventListener("DOMContentLoaded", () => {
  // Seleccionar el formulario
  const form = document.querySelector("form");

  form.addEventListener("submit", (e) => {
    e.preventDefault(); // Evita recargar la página

    // Tomar valores de los inputs
    const nombre = document
      .querySelector('input[placeholder="Juan Pérez"]')
      .value.trim();
    const empresa = document
      .querySelector('input[placeholder="Tu empresa de seguros"]')
      .value.trim();
    const email = document.querySelector('input[type="email"]').value.trim();
    const password = document
      .querySelector('input[type="password"]')
      .value.trim();

    if (!nombre || !email || !password) {
      alert("Por favor completa todos los campos obligatorios");
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
});
