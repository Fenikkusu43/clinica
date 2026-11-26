function mostrar(nombre) {
  document.querySelectorAll(".vista").forEach(function (seccion) {
    seccion.classList.add("is-hidden");
  });
  document.getElementById("vista-" + nombre).classList.remove("is-hidden");
  ocultarAviso();
}
function avisar(texto, tipo) {
  const aviso = document.getElementById("aviso");
  aviso.textContent = texto;
  aviso.className = "notification " + tipo;
}
function ocultarAviso() {
  document.getElementById("aviso").className = "notification is-hidden";
}
function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}
function datosDe(formulario) {
  return Object.fromEntries(new FormData(formulario));
}
function enviando(formulario, pedido) {
  const boton = formulario.querySelector("button[type=submit]");
  boton.classList.add("is-loading");
  boton.disabled = true;
  return pedido.finally(function () {
    boton.classList.remove("is-loading");
    boton.disabled = false;
  });
}
function cargar(ruta, callback) {
  if (!usuario) return;
  api(ruta)
    .then(function (datos) {
      if (usuario) callback(datos);
    })
    .catch(function (e) { avisar(e.message, "is-danger"); });
}
function confirmar(texto) {
  const modal = document.getElementById("modal-confirmar");
  document.getElementById("texto-confirmar").textContent = texto;
  modal.classList.add("is-active");
  return new Promise(function (resolver) {
    function elegir(respuesta) {
      modal.classList.remove("is-active");
      resolver(respuesta);
    }
    document.getElementById("boton-si").onclick = function () { elegir(true); };
    document.getElementById("boton-no").onclick = function () { elegir(false); };
    modal.querySelector(".modal-background").onclick = function () { elegir(false); };
  });
}
function llenarFormulario(formulario, registro, titulo) {
  for (const campo of formulario.elements) {
    if (campo.name && campo.name in registro) campo.value = registro[campo.name] ?? "";
  }
  formulario.querySelector(".title").textContent = titulo;
  formulario.querySelector(".solo-al-crear").classList.add("is-hidden");
}
function modoCrear(formulario, titulo) {
  formulario.elements.id.value = "";
  formulario.querySelector(".title").textContent = titulo;
  formulario.querySelector(".solo-al-crear").classList.remove("is-hidden");
}
function guardar(formulario, recurso, alTerminar) {
  const datos = datosDe(formulario);
  const id = datos.id;
  delete datos.id;
  const pedido = id ? api(recurso + "/" + id, "PUT", datos) : api(recurso, "POST", datos);
  enviando(formulario, pedido)
    .then(function () {
      avisar(id ? "Cambios guardados." : "Creado correctamente.", "is-success");
      alTerminar();
    })
    .catch(function (e) { avisar(e.message, "is-danger"); });
}
function borrar(recurso, id, nombre, alTerminar) {
  const texto = "¿Seguro que quieres borrar a " + nombre + "? Si tiene citas, queda desactivado: " +
    "se conserva su historial, ya no puede entrar y sus citas futuras se cancelan.";
  confirmar(texto).then(function (si) {
    if (!si) return;
    api(recurso + "/" + id, "DELETE")
      .then(function (respuesta) {
        avisar(respuesta.mensaje, "is-success");
        alTerminar();
      })
      .catch(function (e) { avisar(e.message, "is-danger"); });
  });
}
function botonesFila(id) {
  return `<td class="has-text-right">
    <button class="button is-small" data-editar="${id}">Editar</button>
    <button class="button is-small is-danger is-light" data-borrar="${id}">Borrar</button>
  </td>`;
}
