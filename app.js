// =====================================================================
//  JavaScript de la Clínica: pide los datos a la API y los muestra.
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

// ---------------------------------------------------------------------
//  Ayudas para la pantalla
// ---------------------------------------------------------------------

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
  });
}

// ---------------------------------------------------------------------
//  Menú según el rol (filter + map)
// ---------------------------------------------------------------------
const OPCIONES_MENU = [
  { texto: "Inicio", vista: "panel", roles: ["administrador", "medico", "paciente"] },
  { texto: "Médicos", vista: "medicos", roles: ["administrador"] },
  { texto: "Pacientes", vista: "pacientes", roles: ["administrador"] },
  { texto: "Agendar", vista: "agendar", roles: ["administrador", "paciente"] },
  { texto: "Citas", vista: "citas", roles: ["administrador", "medico", "paciente"] },
  { texto: "Reporte", vista: "reporte", roles: ["administrador"] },
];

function armarMenu() {
  const menu = document.getElementById("menu");
  if (!usuario) {
    menu.innerHTML = "";
    return;
  }
  // filter: solo las opciones de este rol. map: cada opción se vuelve un enlace.
  const enlaces = OPCIONES_MENU
    .filter(function (opcion) { return opcion.roles.includes(usuario.rol); })
    .map(function (opcion) {
      return `<a class="navbar-item" href="#" data-vista="${opcion.vista}">${opcion.texto}</a>`;
    });
  menu.innerHTML = enlaces.join("");
}

// Clic en una opción del menú
document.getElementById("menu").addEventListener("click", function (evento) {
  const vista = evento.target.dataset.vista;
  if (!vista) return;
  evento.preventDefault();
  abrir(vista);
});

// Abre una vista y carga lo que necesita
function abrir(vista) {
  mostrar(vista);
  if (vista === "panel") pintarPanel();
  if (vista === "medicos") cargar("medicos", pintarMedicos);
  if (vista === "pacientes") cargar("pacientes", guardarPacientes);
  if (vista === "agendar") prepararAgendar();
  if (vista === "citas") cargar("citas", guardarCitas);
  if (vista === "reporte") cargar("reportes/citas-por-medico", pintarReporte);
}

// ---------------------------------------------------------------------
//  Sesión
// ---------------------------------------------------------------------
function entrar(datos) {
  localStorage.setItem("token", datos.token);
  usuario = datos.usuario;
  despuesDeEntrar();
}

function despuesDeEntrar() {
  const nombre = document.getElementById("nombre-usuario");
  nombre.textContent = usuario.nombre;
  nombre.classList.remove("is-hidden");
  document.getElementById("boton-salir").classList.remove("is-hidden");
  armarMenu();
  abrir("panel");
}

function salir() {
  api("logout", "POST").catch(function () {}); // aunque falle, se sale igual
  cerrarSesion();
}

// Borra la sesión de este navegador y vuelve a la portada (al salir o si la sesión venció)
function cerrarSesion() {
  localStorage.removeItem("token");
  usuario = null;
  document.getElementById("nombre-usuario").classList.add("is-hidden");
  document.getElementById("boton-salir").classList.add("is-hidden");
  armarMenu();
  mostrar("portada");
}

document.getElementById("boton-salir").addEventListener("click", salir);

// Formulario de ingresar
document.getElementById("form-login").addEventListener("submit", function (evento) {
  evento.preventDefault();
  api("login", "POST", datosDe(evento.target))
    .then(entrar)
    .catch(function (e) { avisar(e.message, "is-danger"); });
});

// Formulario de registro
document.getElementById("form-registro").addEventListener("submit", function (evento) {
  evento.preventDefault();
  api("registro", "POST", datosDe(evento.target))
    .then(entrar)
    .catch(function (e) { avisar(e.message, "is-danger"); });
});

// ---------------------------------------------------------------------
//  Panel
// ---------------------------------------------------------------------
const NOMBRES_ROL = { administrador: "Administrador", medico: "Médico", paciente: "Paciente" };

function pintarPanel() {
  document.getElementById("saludo").textContent = "Hola, " + usuario.nombre;

  // for...in con un array: recorre las posiciones (0, 1, 2) de la lista de datos
  const datos = [
    ["Nombre", usuario.nombre],
    ["Correo", usuario.email],
    ["Rol", NOMBRES_ROL[usuario.rol]],
  ];
  let html = "";
  for (const i in datos) {
    html += `<li><strong>${datos[i][0]}:</strong> ${escapar(datos[i][1])}</li>`;
  }
  document.getElementById("mis-datos").innerHTML = html;

  cargar("citas", pintarResumen);
}

// reduce: cuenta cuántas citas hay en cada estado -> { programada: 3, atendida: 2, cancelada: 1 }
function pintarResumen(citas) {
  const conteo = citas.reduce(function (cuenta, cita) {
    cuenta[cita.estado] = (cuenta[cita.estado] || 0) + 1;
    return cuenta;
  }, { programada: 0, atendida: 0, cancelada: 0 });

  document.getElementById("resumen-citas").innerHTML = `
    <div><p class="numero">${citas.length}</p><p>en total</p></div>
    <div><p class="numero has-text-success">${conteo.programada}</p><p>programadas</p></div>
    <div><p class="numero has-text-info">${conteo.atendida}</p><p>atendidas</p></div>
    <div><p class="numero has-text-grey">${conteo.cancelada}</p><p>canceladas</p></div>`;
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
  pedido
    .then(function () {
      avisar(id ? "Cambios guardados." : "Creado correctamente.", "is-success");
      alTerminar();
    })
    .catch(function (e) { avisar(e.message, "is-danger"); });
}

// Pregunta y borra
function borrar(recurso, id, nombre, alTerminar) {
  confirmar("¿Seguro que quieres borrar a " + nombre + "?").then(function (si) {
    if (!si) return;
    api(recurso + "/" + id, "DELETE")
      .then(function () {
        avisar(nombre + " fue borrado.", "is-success");
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

// ---------------------------------------------------------------------
//  Médicos
// ---------------------------------------------------------------------
let medicos = []; // la última lista que llegó de la API
const formMedico = document.getElementById("form-medico");

// map: cada médico se vuelve una fila de la tabla
function pintarMedicos(lista) {
  medicos = lista;
  const filas = lista.map(function (m) {
    return `<tr>
      <td>${escapar(m.nombre)}</td>
      <td>${escapar(m.especialidad)}</td>
      <td>${escapar(m.email)}</td>
      ${botonesFila(m.id)}
    </tr>`;
  });
  document.getElementById("tabla-medicos").innerHTML = filas.join("") || `<tr><td colspan="4">No hay médicos.</td></tr>`;
}

function recargarMedicos() {
  formMedico.reset();
  cargar("medicos", pintarMedicos);
}

formMedico.addEventListener("submit", function (evento) {
  evento.preventDefault();
  guardar(formMedico, "medicos", recargarMedicos);
});
formMedico.addEventListener("reset", function () {
  modoCrear(formMedico, "Nuevo médico");
});

document.getElementById("tabla-medicos").addEventListener("click", function (evento) {
  const { editar, borrar: idBorrar } = evento.target.dataset;
  const medico = medicos.find(function (m) { return m.id === Number(editar || idBorrar); });
  if (!medico) return;
  if (editar) llenarFormulario(formMedico, medico, "Editar médico");
  if (idBorrar) borrar("medicos", medico.id, medico.nombre, recargarMedicos);
});

// ---------------------------------------------------------------------
//  Pacientes
// ---------------------------------------------------------------------
let pacientes = [];
const formPaciente = document.getElementById("form-paciente");
const buscador = document.getElementById("buscar-paciente");

function guardarPacientes(lista) {
  pacientes = lista;
  buscador.value = "";
  pintarPacientes(lista);
}

function pintarPacientes(lista) {
  const filas = lista.map(function (p) {
    return `<tr>
      <td>${escapar(p.nombre)}</td>
      <td>${escapar(p.documento)}</td>
      <td>${escapar(p.email)}</td>
      <td>${escapar(p.telefono || "—")}</td>
      ${botonesFila(p.id)}
    </tr>`;
  });
  document.getElementById("tabla-pacientes").innerHTML = filas.join("") || `<tr><td colspan="5">No se encontraron pacientes.</td></tr>`;
}

// filter: el buscador deja solo los pacientes cuyo nombre o documento contienen lo escrito
buscador.addEventListener("input", function () {
  const texto = buscador.value.trim().toLowerCase();
  const encontrados = pacientes.filter(function (p) {
    return p.nombre.toLowerCase().includes(texto) || p.documento.includes(texto);
  });
  pintarPacientes(encontrados);
});

function recargarPacientes() {
  formPaciente.reset();
  cargar("pacientes", guardarPacientes);
}

formPaciente.addEventListener("submit", function (evento) {
  evento.preventDefault();
  guardar(formPaciente, "pacientes", recargarPacientes);
});
formPaciente.addEventListener("reset", function () {
  modoCrear(formPaciente, "Nuevo paciente");
});

document.getElementById("tabla-pacientes").addEventListener("click", function (evento) {
  const { editar, borrar: idBorrar } = evento.target.dataset;
  const paciente = pacientes.find(function (p) { return p.id === Number(editar || idBorrar); });
  if (!paciente) return;
  if (editar) llenarFormulario(formPaciente, paciente, "Editar paciente");
  if (idBorrar) borrar("pacientes", paciente.id, paciente.nombre, recargarPacientes);
});

// ---------------------------------------------------------------------
//  Agendar
//  Horario igual para todos los médicos (el mismo de la API):
//  lunes a viernes, de 8:00 a 12:00 y de 14:00 a 17:00, citas de 30 minutos.
// ---------------------------------------------------------------------
const TRAMOS = [["08:00", "12:00"], ["14:00", "17:00"]];
const DURACION = 30;

const formAgendar = document.getElementById("form-agendar");
const campoMedico = document.getElementById("agendar-medico");
const campoPaciente = document.getElementById("agendar-paciente");
const campoEspecialidad = document.getElementById("agendar-especialidad");
let medicosParaAgendar = []; // todos los médicos; se filtran por especialidad
const campoFecha = document.getElementById("agendar-fecha");
const campoHora = document.getElementById("agendar-hora");

// "08:30" -> 510 minutos, y al revés
function aMinutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}
function aTexto(minutos) {
  return String(Math.floor(minutos / 60)).padStart(2, "0") + ":" + String(minutos % 60).padStart(2, "0");
}

// Fecha y hora de ahora en Colombia: { fecha: "2026-11-18", hora: "14:05" }
function ahoraEnColombia() {
  const opciones = { timeZone: "America/Bogota" };
  return {
    fecha: new Date().toLocaleDateString("en-CA", opciones),
    hora: new Date().toLocaleTimeString("en-GB", { ...opciones, hour: "2-digit", minute: "2-digit" }),
  };
}

// do...while: arma todas las horas del día, de 30 en 30 minutos
function horasDelDia() {
  const horas = [];
  for (const [desde, hasta] of TRAMOS) {
    let minutos = aMinutos(desde);
    do {
      horas.push(aTexto(minutos));
      minutos += DURACION;
    } while (minutos + DURACION <= aMinutos(hasta));
  }
  return horas;
}

// for...of: llena una lista desplegable con un array de opciones
function llenarSelect(select, lista, textoDe) {
  let html = `<option value="">Elige…</option>`;
  for (const item of lista) {
    html += `<option value="${item.id}">${escapar(textoDe(item))}</option>`;
  }
  select.innerHTML = html;
}

function prepararAgendar() {
  formAgendar.reset();
  campoHora.value = "";
  campoFecha.min = ahoraEnColombia().fecha; // no se puede elegir un día pasado
  document.getElementById("botones-horas").innerHTML = "";
  document.getElementById("sugerencia-hora").textContent = "Elige médico y fecha para ver las horas libres.";

  campoMedico.innerHTML = `<option value="">Primero elige la especialidad</option>`;
  cargar("medicos", function (lista) {
    medicosParaAgendar = lista;
    // map + filter: saca la especialidad de cada médico y deja cada una una sola vez
    const especialidades = lista
      .map(function (m) { return m.especialidad; })
      .filter(function (e, posicion, todas) { return todas.indexOf(e) === posicion; });
    let html = `<option value="">Elige…</option>`;
    for (const e of especialidades) {
      html += `<option>${escapar(e)}</option>`;
    }
    campoEspecialidad.innerHTML = html;
  });

  // Solo el administrador elige el paciente
  const esAdmin = usuario.rol === "administrador";
  document.querySelector("#form-agendar .solo-admin").classList.toggle("is-hidden", !esAdmin);
  campoPaciente.required = esAdmin;
  if (esAdmin) {
    cargar("pacientes", function (lista) {
      llenarSelect(campoPaciente, lista, function (p) { return p.nombre + " (" + p.documento + ")"; });
    });
  }
}

// Cuando cambian el médico o la fecha, se piden las horas ocupadas a la API
function buscarHoras() {
  campoHora.value = "";
  const contenedor = document.getElementById("botones-horas");
  const sugerencia = document.getElementById("sugerencia-hora");
  contenedor.innerHTML = "";
  sugerencia.textContent = "Elige médico y fecha para ver las horas libres.";
  if (!campoMedico.value || !campoFecha.value) return;

  const dia = new Date(campoFecha.value + "T12:00:00Z").getUTCDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) {
    sugerencia.textContent = "Ese día no se atiende. Elige un día de lunes a viernes.";
    return;
  }

  cargar("medicos/" + campoMedico.value + "/horas?fecha=" + campoFecha.value, function (datos) {
    const ahora = ahoraEnColombia();
    // filter: quita las horas ocupadas y, si es hoy, las que ya pasaron
    const libres = horasDelDia().filter(function (hora) {
      const yaPaso = campoFecha.value === ahora.fecha && hora <= ahora.hora;
      return !datos.ocupadas.includes(hora) && !yaPaso;
    });
    pintarHoras(libres);
  });
}

// forEach: un botón por cada hora libre
function pintarHoras(libres) {
  const contenedor = document.getElementById("botones-horas");
  const sugerencia = document.getElementById("sugerencia-hora");
  contenedor.innerHTML = "";
  if (libres.length === 0) {
    sugerencia.textContent = "No quedan horas libres ese día.";
    return;
  }

  libres.forEach(function (hora) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "button is-small boton-hora";
    boton.textContent = hora;
    boton.dataset.hora = hora;
    contenedor.appendChild(boton);
  });

  // while: busca la primera hora libre de la tarde (desde las 14:00) para sugerirla
  let i = 0;
  while (i < libres.length && libres[i] < "14:00") {
    i++;
  }
  sugerencia.textContent =
    "Primera hora libre: " + libres[0] + (i < libres.length ? " · en la tarde: " + libres[i] : " · en la tarde ya no hay.");
}

// Clic en una hora: se marca y se guarda en el campo oculto
document.getElementById("botones-horas").addEventListener("click", function (evento) {
  const hora = evento.target.dataset.hora;
  if (!hora) return;
  document.querySelectorAll(".boton-hora").forEach(function (b) { b.classList.remove("is-elegida"); });
  evento.target.classList.add("is-elegida");
  campoHora.value = hora;
});

// filter: al elegir la especialidad, solo salen los médicos de esa especialidad
campoEspecialidad.addEventListener("change", function () {
  const deLaEspecialidad = medicosParaAgendar.filter(function (m) {
    return m.especialidad === campoEspecialidad.value;
  });
  llenarSelect(campoMedico, deLaEspecialidad, function (m) { return m.nombre; });
  buscarHoras();
});

campoMedico.addEventListener("change", buscarHoras);
campoFecha.addEventListener("change", buscarHoras);

formAgendar.addEventListener("submit", function (evento) {
  evento.preventDefault();
  if (!campoHora.value) {
    avisar("Elige una hora.", "is-danger");
    return;
  }
  api("citas", "POST", datosDe(formAgendar))
    .then(function (cita) {
      avisar(`Cita agendada: ${cita.fecha} a las ${cita.hora} con ${cita.medico}.`, "is-success");
      buscarHoras(); // la hora agendada ya no sale como libre
      document.getElementById("agendar-motivo").value = "";
    })
    .catch(function (e) {
      avisar(e.message, "is-danger");
      buscarHoras(); // por si otra persona tomó la hora
    });
});

// ---------------------------------------------------------------------
//  Lista de citas
// ---------------------------------------------------------------------
let citas = [];
const filtroEstado = document.getElementById("filtro-estado");

function guardarCitas(lista) {
  citas = lista;
  pintarCitas();
}

// Color de la etiqueta de cada estado (clases de Bulma)
const COLOR_ESTADO = { programada: "is-success is-light", atendida: "is-info is-light", cancelada: "is-light" };

// filter + map: deja las citas elegidas en el filtro y arma las filas
function pintarCitas() {
  const filtro = filtroEstado.value;
  const hoy = ahoraEnColombia().fecha;
  const elegidas = citas.filter(function (c) {
    if (filtro === "todas") return true;
    if (filtro === "hoy") return c.fecha === hoy;
    return c.estado === filtro;
  });

  const filas = elegidas.map(function (c) {
    let botones = "";
    if (c.estado === "programada") {
      // El médico, además de cancelar, puede atender
      if (usuario.rol === "medico") {
        botones += `<button class="button is-small boton-principal" data-atender="${c.id}">Atender</button> `;
      }
      botones += `<button class="button is-small is-danger is-light" data-cancelar="${c.id}">Cancelar</button>`;
    }
    const nota = c.nota ? `<br><span class="is-size-7">Nota: ${escapar(c.nota)}</span>` : "";
    return `<tr>
      <td>${c.fecha}</td>
      <td>${c.hora}</td>
      <td>${escapar(c.paciente)}</td>
      <td>${escapar(c.medico)}<br><span class="is-size-7">${escapar(c.especialidad)}</span></td>
      <td>${escapar(c.motivo)}${nota}</td>
      <td><span class="tag ${COLOR_ESTADO[c.estado]}">${c.estado}</span></td>
      <td class="has-text-right">${botones}</td>
    </tr>`;
  });
  document.getElementById("tabla-citas").innerHTML = filas.join("") || `<tr><td colspan="7">No hay citas.</td></tr>`;
}

filtroEstado.addEventListener("change", pintarCitas);

// Atender o cancelar una cita
document.getElementById("tabla-citas").addEventListener("click", function (evento) {
  if (evento.target.dataset.atender) {
    abrirAtender(Number(evento.target.dataset.atender));
    return;
  }
  // Cancelar: pregunta antes con la ventana de confirmar
  const id = evento.target.dataset.cancelar;
  if (!id) return;
  confirmar("¿Seguro que quieres cancelar esta cita?").then(function (si) {
    if (!si) return;
    api("citas/" + id + "/cancelar", "PATCH")
      .then(function () {
        avisar("Cita cancelada.", "is-success");
        cargar("citas", guardarCitas);
      })
      .catch(function (e) { avisar(e.message, "is-danger"); });
  });
});

// ---------------------------------------------------------------------
//  Atender una cita (solo el médico): escribe una nota y queda "atendida"
// ---------------------------------------------------------------------
const modalAtender = document.getElementById("modal-atender");
const formAtender = document.getElementById("form-atender");
let citaAtendiendo = null;

function abrirAtender(id) {
  const cita = citas.find(function (c) { return c.id === id; });
  citaAtendiendo = id;
  formAtender.reset();
  document.getElementById("texto-atender").textContent = `${cita.paciente} · ${cita.fecha} a las ${cita.hora}`;
  modalAtender.classList.add("is-active");
}

document.getElementById("atender-cerrar").addEventListener("click", function () {
  modalAtender.classList.remove("is-active");
});

formAtender.addEventListener("submit", function (evento) {
  evento.preventDefault();
  modalAtender.classList.remove("is-active");
  api("citas/" + citaAtendiendo + "/atender", "PATCH", datosDe(formAtender))
    .then(function () {
      avisar("Cita marcada como atendida.", "is-success");
      cargar("citas", guardarCitas);
    })
    .catch(function (e) { avisar(e.message, "is-danger"); });
});

// ---------------------------------------------------------------------
//  Reporte (solo el administrador)
// ---------------------------------------------------------------------

// map: cada médico del reporte se vuelve una fila
function pintarReporte(lista) {
  const filas = lista.map(function (f) {
    return `<tr>
      <td>${escapar(f.nombre)}</td>
      <td>${escapar(f.especialidad)}</td>
      <td>${f.programadas}</td>
      <td>${f.atendidas}</td>
      <td>${f.canceladas}</td>
      <td><strong>${f.total}</strong></td>
    </tr>`;
  });
  document.getElementById("tabla-reporte").innerHTML = filas.join("") || `<tr><td colspan="6">No hay médicos.</td></tr>`;
}

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
