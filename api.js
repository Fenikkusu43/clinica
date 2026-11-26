// =====================================================================
//  fetch a la API: todos los pedidos de la página pasan por aquí
// =====================================================================

let usuario = null; // el usuario que inició sesión (o null)

// ---------------------------------------------------------------------
//  fetch + promise: todos los pedidos a la API pasan por aquí.
//  Devuelve una promesa con los datos (o un error con el mensaje).
// ---------------------------------------------------------------------
function api(ruta, metodo = "GET", cuerpo = null) {
  const opciones = { method: metodo, headers: {} };

  // Si hay sesión, se manda el token para que la API sepa quién es
  const token = localStorage.getItem("token");
  if (token) opciones.headers["Authorization"] = "Bearer " + token;

  if (cuerpo) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }

  return fetch("/api/" + ruta, opciones).then(function (respuesta) {
    return respuesta.json().then(function (datos) {
      // 401 habiendo mandado un token: la sesión venció (dura 8 horas) -> volver a la portada
      if (respuesta.status === 401 && token) {
        if (localStorage.getItem("token") === token) cerrarSesion();
        throw new Error("Tu sesión venció, vuelve a ingresar.");
      }
      if (!respuesta.ok) throw new Error(datos.error || "Algo salió mal.");
      return datos;
    });
  });
}
