// =====================================================================
//  Pacientes (solo el administrador)
// =====================================================================

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
