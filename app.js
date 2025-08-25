// --- Observer para revelar elementos ---
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("show");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// --- Configuración de la API ---
const API_BASE = location.hostname.endsWith("liasolutions.company")
  ? "https://seguros-pyme-api.vercel.app" // backend en producción
  : "http://localhost:3000"; // backend en local

const CHAT_URL = `${API_BASE}/api/chat`;

// --- Ejemplo: enviar mensaje al chatbot ---
async function sendToChat(
  message,
  history = [],
  userName = "Cliente",
  userCompany = ""
) {
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, userName, userCompany }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Error en fetch:", err);
    return { reply: "⚠️ Failed to fetch" };
  }
}
