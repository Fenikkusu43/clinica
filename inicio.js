const botonTema = document.getElementById("boton-tema");
function temaActual() {
  const elegido = document.documentElement.dataset.theme;
  if (elegido) return elegido;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function pintarBotonTema() {
  botonTema.textContent = temaActual() === "dark" ? " Modo claro" : " Modo oscuro";
}
botonTema.addEventListener("click", function () {
  const nuevo = temaActual() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nuevo;
  try {
    localStorage.setItem("tema", nuevo);
  } catch (e) {}
  pintarBotonTema();
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintarBotonTema);
pintarBotonTema();
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
      localStorage.removeItem("token");
      mostrar("portada");
    });
}
iniciar();
