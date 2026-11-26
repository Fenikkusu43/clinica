// =====================================================================
//  Ayudas para la pantalla y para los formularios de médicos y pacientes
// =====================================================================

// Muestra una sola sección (vista) y oculta las demás
function mostrar(nombre) {
  document.querySelectorAll(".vista").forEach(function (seccion) {
    seccion.classList.add("is-hidden");
  });
  document.getElementById("vista-" + nombre).classList.remove("is-hidden");
  ocultarAviso();
}

// Mensaje arriba de la página. tipo: "is-success" o "is-danger"
function avisar(texto, tipo) {
  const aviso = document.getElementById("aviso");
  aviso.textContent = texto;
  aviso.className = "notification " + tipo;
}

function ocultarAviso() {
  document.getElementById("aviso").className = "notification is-hidden";
}

// Evita que un texto con < > se tome como HTML (por ejemplo, un nombre escrito con mala intención)
function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

// Convierte un formulario en un objeto: { nombre: "...", email: "..." }
function datosDe(formulario) {
  return Object.fromEntries(new FormData(formulario));
}

// Mientras se espera la respuesta, el botón de enviar queda "cargando" y no se puede volver a pulsar
// (así un doble clic no manda el formulario dos veces)
function enviando(formulario, pedido) {
  const boton = formulario.querySelector("button[type=submit]");
  boton.classList.add("is-loading");
  boton.disabled = true;
  return pedido.finally(function () {
    boton.classList.remove("is-loading");
    boton.disabled = false;
  });
}

// callback: pide una ruta a la API y, cuando llegan los datos, llama a la función que le pasamos
function cargar(ruta, callback) {
  if (!usuario) return; // sin sesión no hay nada que cargar
  api(ruta)
    .then(function (datos) {
      if (usuario) callback(datos); // si se cerró la sesión mientras llegaban, no se pintan
    })
    .catch(function (e) { avisar(e.message, "is-danger"); });
}

// promise: muestra una ventana con Sí / No y devuelve una promesa
// que se resuelve con true (Sí) o false (No) cuando la persona elige
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
    // un clic afuera de la ventana cuenta como "No"
    modal.querySelector(".modal-background").onclick = function () { elegir(false); };
  });
}

// ---------------------------------------------------------------------
//  Formularios de crear y editar (sirven para médicos y pacientes)
// ---------------------------------------------------------------------

// Pone los datos de un registro en el formulario para editarlo
function llenarFormulario(formulario, registro, titulo) {
  for (const campo of formulario.elements) {
    if (campo.name && campo.name in registro) campo.value = registro[campo.name] ?? "";
  }
  formulario.querySelector(".title").textContent = titulo;
  formulario.querySelector(".solo-al-crear").classList.add("is-hidden"); // la contraseña no se edita aquí
}

// Deja el formulario listo para crear uno nuevo (se llama cuando el formulario se limpia)
function modoCrear(formulario, titulo) {
  formulario.elements.id.value = "";
  formulario.querySelector(".title").textContent = titulo;
  formulario.querySelector(".solo-al-crear").classList.remove("is-hidden");
}

// Guarda: si el formulario tiene id, edita (PUT); si no, crea (POST)
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

// Pregunta y borra. Si tiene citas, la API no lo borra: lo desactiva y lo dice en el mensaje.
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

// Botones de Editar y Borrar de una fila
function botonesFila(id) {
  return `<td class="has-text-right">
    <button class="button is-small" data-editar="${id}">Editar</button>
    <button class="button is-small is-danger is-light" data-borrar="${id}">Borrar</button>
  </td>`;
}
