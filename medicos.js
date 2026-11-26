let medicos = [];
const formMedico = document.getElementById("form-medico");
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
