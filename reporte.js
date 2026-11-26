function pintarReporte(lista) {
  const filas = lista.map(function (f) {
    return `<tr>
      <td>${escapar(f.nombre)}${f.activo ? "" : ` <span class="tag is-light">desactivado</span>`}</td>
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
