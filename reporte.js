// =====================================================================
//  Reporte (solo el administrador)
// =====================================================================

// map: cada médico del reporte se vuelve una fila
function pintarReporte(lista) {
  const filas = lista.map(function (f) {
    return `<tr>
      <td>${escapar(f.nombre)}</td>
      <td>${escapar(f.especialidad)}</td>
      <td>${f.programadas}</td>
      <td>${f.sin_atender}</td>
      <td>${f.atendidas}</td>
      <td>${f.canceladas}</td>
      <td><strong>${f.total}</strong></td>
    </tr>`;
  });
  document.getElementById("tabla-reporte").innerHTML = filas.join("") || `<tr><td colspan="7">No hay médicos.</td></tr>`;
}
