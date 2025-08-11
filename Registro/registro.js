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

    if (!nombre) {
      alert("Por favor ingresa tu nombre");
      return;
    }

    // Guardar datos en localStorage
    localStorage.setItem("userName", nombre);
    localStorage.setItem("userCompany", empresa);

    // Redirigir al dashboard
    window.location.href = "../Dashboard/index.html";
  });
});
