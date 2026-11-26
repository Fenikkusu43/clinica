// =====================================================================
//  Sesión: menú según el rol, entrar, registrarse, salir y panel de inicio
// =====================================================================

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
  // La contraseña no se queda escrita en la portada
  document.getElementById("form-login").reset();
  document.getElementById("form-registro").reset();
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

  // forEach: se vacían los formularios y las tablas, para que la siguiente persona no vea nada de esta sesión
  document.querySelectorAll("form").forEach(function (formulario) { formulario.reset(); });
  const lugaresConDatos = ["tabla-medicos", "tabla-pacientes", "tabla-citas", "tabla-reporte", "mis-datos",
    "resumen-citas", "agendar-paciente", "agendar-especialidad", "agendar-medico", "botones-horas"];
  lugaresConDatos.forEach(function (id) { document.getElementById(id).innerHTML = ""; });
  medicos = [];
  pacientes = [];
  citas = [];
  medicosParaAgendar = [];
  filtroEstado.value = "todas";
  buscador.value = "";

  document.getElementById("nombre-usuario").classList.add("is-hidden");
  document.getElementById("boton-salir").classList.add("is-hidden");
  armarMenu();
  mostrar("portada");
}

document.getElementById("boton-salir").addEventListener("click", salir);

// Formulario de ingresar
document.getElementById("form-login").addEventListener("submit", function (evento) {
  evento.preventDefault();
  enviando(evento.target, api("login", "POST", datosDe(evento.target)))
    .then(entrar)
    .catch(function (e) { avisar(e.message, "is-danger"); });
});

// Formulario de registro
document.getElementById("form-registro").addEventListener("submit", function (evento) {
  evento.preventDefault();
  enviando(evento.target, api("registro", "POST", datosDe(evento.target)))
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

// reduce: cuenta cuántas citas hay en cada estado -> { programada: 3, "sin atender": 1, atendida: 2, cancelada: 1 }
function pintarResumen(citas) {
  const conteo = citas.reduce(function (cuenta, cita) {
    cuenta[cita.estado] = (cuenta[cita.estado] || 0) + 1;
    return cuenta;
  }, { programada: 0, "sin atender": 0, atendida: 0, cancelada: 0 });

  document.getElementById("resumen-citas").innerHTML = `
    <div><p class="numero">${citas.length}</p><p>en total</p></div>
    <div><p class="numero has-text-success">${conteo.programada}</p><p>programadas</p></div>
    <div><p class="numero has-text-warning">${conteo["sin atender"]}</p><p>sin atender</p></div>
    <div><p class="numero has-text-info">${conteo.atendida}</p><p>atendidas</p></div>
    <div><p class="numero has-text-grey">${conteo.cancelada}</p><p>canceladas</p></div>`;
}
