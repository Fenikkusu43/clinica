// =====================================================================
//  Citas: agendar, lista de citas y atender
// =====================================================================

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
    // (sin importar mayúsculas: "pediatría" y "Pediatría" son la misma)
    const especialidades = lista
      .map(function (m) { return m.especialidad; })
      .filter(function (e, posicion, todas) {
        const enMinusculas = todas.map(function (x) { return x.toLowerCase(); });
        return enMinusculas.indexOf(e.toLowerCase()) === posicion;
      });
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

  // El administrador manda el paciente elegido (el paciente no hace falta: la API ya sabe quién es)
  let ruta = "medicos/" + campoMedico.value + "/horas?fecha=" + campoFecha.value;
  if (usuario.rol === "administrador" && campoPaciente.value) ruta += "&paciente_id=" + campoPaciente.value;

  cargar(ruta, function (datos) {
    const ahora = ahoraEnColombia();
    // filter: quita las horas en que el médico o el paciente ya tienen cita y, si es hoy, las que ya pasaron
    const libres = horasDelDia().filter(function (hora) {
      const yaPaso = campoFecha.value === ahora.fecha && hora <= ahora.hora;
      return !datos.ocupadas.includes(hora) && !datos.ocupadas_paciente.includes(hora) && !yaPaso;
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
    return m.especialidad.toLowerCase() === campoEspecialidad.value.toLowerCase();
  });
  llenarSelect(campoMedico, deLaEspecialidad, function (m) { return m.nombre; });
  buscarHoras();
});

campoMedico.addEventListener("change", buscarHoras);
campoPaciente.addEventListener("change", buscarHoras);
campoFecha.addEventListener("change", buscarHoras);

formAgendar.addEventListener("submit", function (evento) {
  evento.preventDefault();
  if (!campoHora.value) {
    avisar("Elige una hora.", "is-danger");
    return;
  }
  enviando(formAgendar, api("citas", "POST", datosDe(formAgendar)))
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
const COLOR_ESTADO = {
  programada: "is-success is-light",
  "sin atender": "is-warning is-light",
  atendida: "is-info is-light",
  cancelada: "is-light",
};

// filter + map: deja las citas elegidas en el filtro y arma las filas
function pintarCitas() {
  const filtro = filtroEstado.value;
  const hoy = ahoraEnColombia().fecha;
  const elegidas = citas.filter(function (c) {
    if (filtro === "todas") return true;
    if (filtro === "hoy") return c.fecha === hoy;
    return c.estado === filtro;
  });

  const ahora = ahoraEnColombia();
  const filas = elegidas.map(function (c) {
    // ¿Ya llegó la hora de la cita? (se comparan textos como "2026-12-01 09:00")
    const yaEmpezo = c.fecha + " " + c.hora <= ahora.fecha + " " + ahora.hora;
    let botones = "";
    // El médico atiende desde la hora de la cita (también las que quedaron sin atender)
    if (usuario.rol === "medico" && (c.estado === "sin atender" || (c.estado === "programada" && yaEmpezo))) {
      botones += `<button class="button is-small boton-principal" data-atender="${c.id}">Atender</button> `;
    }
    // Se puede cancelar solo antes de que empiece
    if (c.estado === "programada" && !yaEmpezo) {
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

function cerrarAtender() {
  modalAtender.classList.remove("is-active");
}
document.getElementById("atender-cerrar").addEventListener("click", cerrarAtender);
modalAtender.querySelector(".modal-background").addEventListener("click", cerrarAtender);

// La tecla Escape cierra la ventana que esté abierta (en la de confirmar cuenta como "No")
document.addEventListener("keydown", function (evento) {
  if (evento.key !== "Escape") return;
  if (document.getElementById("modal-confirmar").classList.contains("is-active")) {
    document.getElementById("boton-no").click();
  }
  cerrarAtender();
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
