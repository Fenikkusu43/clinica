let usuario = null;
function api(ruta, metodo = "GET", cuerpo = null) {
  const opciones = { method: metodo, headers: {} };
  const token = localStorage.getItem("token");
  if (token) opciones.headers["Authorization"] = "Bearer " + token;
  if (cuerpo) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }
  return fetch("/api/" + ruta, opciones).then(function (respuesta) {
    return respuesta.json().then(function (datos) {
      if (respuesta.status === 401 && token) {
        if (localStorage.getItem("token") === token) cerrarSesion();
        throw new Error("Tu sesión venció, vuelve a ingresar.");
      }
      if (!respuesta.ok) throw new Error(datos.error || "Algo salió mal.");
      return datos;
    });
  });
}
