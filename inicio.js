// =====================================================================
//  Modo claro y oscuro, y arranque de la página (se carga de último)
// =====================================================================

// ---------------------------------------------------------------------
//  Modo claro y oscuro
//  Bulma cambia sus colores con data-theme="dark" o "light" en <html>.
//  Sin data-theme, sigue el modo del celular o del computador.
// ---------------------------------------------------------------------
const botonTema = document.getElementById("boton-tema");

function temaActual() {
  const elegido = document.documentElement.dataset.theme;
  if (elegido) return elegido;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// El botón ofrece pasar al otro modo
function pintarBotonTema() {
  botonTema.textContent = temaActual() === "dark" ? "☀️ Modo claro" : "🌙 Modo oscuro";
}

botonTema.addEventListener("click", function () {
  const nuevo = temaActual() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nuevo;
  try {
    localStorage.setItem("tema", nuevo); // se recuerda para la próxima vez
  } catch (e) {}
  pintarBotonTema();
});

// Si cambia el modo del celular o del computador y la persona no eligió uno, se actualiza el botón
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintarBotonTema);
pintarBotonTema();

// ---------------------------------------------------------------------
//  Al abrir la página: si ya había sesión guardada, entrar directo
// ---------------------------------------------------------------------
function iniciar() {
  if (!localStorage.getItem("token")) {
    mostrar("portada");
    return;
  }
  api("yo")
    .then(function (datos) {
      usuario = datos;
      despuesDeEntrar();
    })
    .catch(function () {
      localStorage.removeItem("token"); // la sesión venció
      mostrar("portada");
    });
}

iniciar();
