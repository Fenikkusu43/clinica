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
    <button class="button is-small" data-clave="${id}">Contraseña</button>
    <button class="button is-small is-danger is-light" data-borrar="${id}">Borrar</button>
  </td>`;
}
document.addEventListener("click", function (evento) {
  const boton = evento.target.closest("[data-ver]");
  if (!boton) return;
  const campo = document.getElementById(boton.dataset.ver);
  const oculta = campo.type === "password";
  campo.type = oculta ? "text" : "password";
  boton.setAttribute("aria-label", oculta ? "Ocultar contraseña" : "Mostrar contraseña");
});
document.addEventListener("reset", function (evento) {
  evento.target.querySelectorAll("[data-ver]").forEach(function (boton) {
    document.getElementById(boton.dataset.ver).type = "password";
  });
}, true);
document.addEventListener("keydown", function (evento) {
  if (evento.key !== "Escape") return;
  if (document.getElementById("modal-confirmar").classList.contains("is-active")) {
    document.getElementById("boton-no").click();
    return;
  }
  document.querySelectorAll(".modal.is-active").forEach(function (modal) { modal.classList.remove("is-active"); });
});
const modalClave = document.getElementById("modal-clave");
const formClaveTemporal = document.getElementById("form-clave-temporal");
let rutaClave = null;
function abrirClave(recurso, id, nombre) {
  rutaClave = recurso + "/" + id + "/clave";
  formClaveTemporal.reset();
  document.getElementById("texto-clave").textContent = "Para " + nombre;
  modalClave.classList.add("is-active");
  document.getElementById("clave-temporal").focus();
}
function cerrarClave() {
  modalClave.classList.remove("is-active");
}
document.getElementById("clave-cerrar").addEventListener("click", cerrarClave);
modalClave.querySelector(".modal-background").addEventListener("click", cerrarClave);
formClaveTemporal.addEventListener("submit", function (evento) {
  evento.preventDefault();
  enviando(formClaveTemporal, api(rutaClave, "PATCH", datosDe(formClaveTemporal)))
    .then(function (respuesta) {
      cerrarClave();
      avisar(respuesta.mensaje, "is-success");
    })
    .catch(function (e) {
      cerrarClave();
      avisar(e.message, "is-danger");
    });
});
