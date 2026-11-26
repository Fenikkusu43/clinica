// =====================================================================
//  API de la Clínica (Next.js + PostgreSQL)
//  Todas las rutas /api/... llegan a este archivo.
//
//  Cómo correrlo (se necesita Node.js 20 o más y PostgreSQL):
//    1) Instalar las librerías (no crea archivos en el proyecto):
//         npm install --no-save --no-package-lock next react react-dom pg
//    2) Arrancar, poniendo tus propios datos (inventados):
//         DATABASE_URL=postgresql://usuario:clave@localhost:5432/clinica \
//         ADMIN_EMAIL=admin@ejemplo.test ADMIN_PASSWORD=tu-clave \
//         DEMO_PASSWORD=clave-de-los-ejemplos npx next dev
//    3) Abrir http://localhost:3000/index.html
//  La primera vez se crean las tablas y los datos de ejemplo (inventados).
//  La base de datos (conexión, tablas y datos de ejemplo) está en lib/base-de-datos.js
// =====================================================================
import crypto from "node:crypto";
import { db, cifrarClave, claveCorrecta, prepararBase, transaccion } from "../../../lib/base-de-datos.js";

// ---------------------------------------------------------------------
//  Respuestas
// ---------------------------------------------------------------------
function responder(datos, codigo = 200) {
  return Response.json(datos, { status: codigo });
}

function error(mensaje, codigo) {
  return Response.json({ error: mensaje }, { status: codigo });
}

// ---------------------------------------------------------------------
//  Ayudas para las rutas
// ---------------------------------------------------------------------

// Lee el JSON que manda la página (si viene mal, devuelve un objeto vacío).
// Solo se guardan textos: los números se pasan a texto y lo demás (listas, objetos) se ignora.
async function leerCuerpo(request) {
  let datos;
  try {
    datos = await request.json();
  } catch {
    return {};
  }
  const limpio = {};
  for (const campo in datos) {
    if (typeof datos[campo] === "string") limpio[campo] = datos[campo];
    if (typeof datos[campo] === "number") limpio[campo] = String(datos[campo]);
  }
  return limpio;
}

// Convierte un id ("3") en número. Si no es un número entero que quepa en la base, devuelve 0.
function aId(texto) {
  return /^\d{1,9}$/.test(String(texto)) ? Number(texto) : 0;
}

// Revisa que los campos obligatorios vengan llenos. Devuelve el mensaje de error o null.
function faltan(datos, campos) {
  for (const campo of campos) {
    if (!datos[campo] || String(datos[campo]).trim() === "") return "Falta el campo " + campo + ".";
  }
  return null;
}

// Un correo válido: algo@algo.algo, sin espacios
function correoValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Si ya hay un médico con esa especialidad escrita con otras mayúsculas
// ("cardiología" y "Cardiología"), se usa la que ya existe para no repetirla
async function nombreDeEspecialidad(cliente, especialidad, idMedico) {
  const r = await cliente.query("SELECT especialidad FROM medicos WHERE lower(especialidad) = lower($1) AND id <> $2 LIMIT 1", [
    especialidad,
    idMedico,
  ]);
  return r.rows.length ? r.rows[0].especialidad : especialidad;
}

// Una cuenta está activa si su médico o paciente no fue desactivado (el administrador siempre lo está)
const CUENTA_ACTIVA = "coalesce(m.activo, p.activo, true)";
const CON_FICHA = "LEFT JOIN medicos m ON m.id = u.medico_id LEFT JOIN pacientes p ON p.id = u.paciente_id";

// ¿Quién hace el pedido? Busca el token de la cabecera Authorization en la tabla sesiones.
// La sesión dura 8 horas, y deja de servir si la cuenta se desactiva.
async function usuarioActual(request) {
  const cabecera = request.headers.get("authorization") || "";
  const token = cabecera.replace("Bearer ", "");
  if (!token) return null;
  const r = await db.query(
    `SELECT u.id, u.nombre, u.email, u.rol, u.medico_id, u.paciente_id
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id ${CON_FICHA}
      WHERE s.token = $1 AND s.creado > now() - interval '8 hours' AND ${CUENTA_ACTIVA}`,
    [token]
  );
  return r.rows[0] || null;
}

// Crea una sesión nueva y devuelve el token
async function crearSesion(usuarioId) {
  await db.query("DELETE FROM sesiones WHERE creado < now() - interval '8 hours'"); // limpia las vencidas
  const token = crypto.randomBytes(32).toString("hex");
  await db.query("INSERT INTO sesiones (token, usuario_id) VALUES ($1, $2)", [token, usuarioId]);
  return token;
}

// Lo que se devuelve de un usuario (nunca la clave)
function datosUsuario(u) {
  return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
}

// ---------------------------------------------------------------------
//  Cuentas: login, registro, logout y yo
// ---------------------------------------------------------------------
// Límite de intentos: 5 contraseñas malas seguidas (mismo correo desde la misma conexión)
// bloquean ese correo desde esa conexión por 15 minutos. Se guarda en memoria del servidor.
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
const intentosFallidos = new Map(); // "ip|correo" -> { cuantos, ultimo }

function llaveDeIntentos(request, email) {
  // Traefik pone la IP de quien visita en X-Real-Ip
  const ip = request.headers.get("x-real-ip") || "local";
  return ip + "|" + email;
}

// Borra los registros de intentos que ya vencieron
function limpiarIntentos() {
  for (const [llave, registro] of intentosFallidos) {
    if (Date.now() - registro.ultimo > MINUTOS_BLOQUEO * 60 * 1000) intentosFallidos.delete(llave);
  }
}

async function login(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["email", "clave"]);
  if (falta) return error(falta, 400);

  const email = datos.email.trim().toLowerCase();
  const llave = llaveDeIntentos(request, email);
  limpiarIntentos();
  if ((intentosFallidos.get(llave)?.cuantos || 0) >= MAX_INTENTOS) {
    return error(`Demasiados intentos. Espera ${MINUTOS_BLOQUEO} minutos e inténtalo de nuevo.`, 429);
  }

  const r = await db.query(`SELECT u.*, ${CUENTA_ACTIVA} AS activo FROM usuarios u ${CON_FICHA} WHERE u.email = $1`, [email]);
  const u = r.rows[0];
  if (!u || !claveCorrecta(datos.clave, u.clave)) {
    const registro = intentosFallidos.get(llave) || { cuantos: 0 };
    intentosFallidos.set(llave, { cuantos: registro.cuantos + 1, ultimo: Date.now() });
    return error("Correo o contraseña incorrectos.", 401);
  }

  intentosFallidos.delete(llave); // entró bien: se empieza de cero
  if (!u.activo) return error("Esta cuenta está desactivada.", 403);
  const token = await crearSesion(u.id);
  return responder({ token, usuario: datosUsuario(u) });
}

// Un paciente se registra solo: se crean su ficha y su cuenta al mismo tiempo
async function registro(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "documento", "email", "clave"]);
  if (falta) return error(falta, 400);
  if (!correoValido(datos.email)) return error("El correo no es válido.", 400);
  if (String(datos.clave).length < 6) return error("La contraseña debe tener al menos 6 caracteres.", 400);

  try {
    const nuevo = await guardarPacienteConCuenta(datos);
    const token = await crearSesion(nuevo.usuario.id);
    return responder({ token, usuario: datosUsuario(nuevo.usuario) }, 201);
  } catch (e) {
    return errorDeBase(e, "Ya existe una cuenta con ese correo o documento.");
  }
}

// Crea la ficha del paciente y su cuenta al mismo tiempo (la usan el registro y el administrador)
function guardarPacienteConCuenta(datos) {
  const email = datos.email.trim().toLowerCase();
  return transaccion(async function (cliente) {
    const p = await cliente.query("INSERT INTO pacientes (nombre, documento, email, telefono) VALUES ($1, $2, $3, $4) RETURNING *", [
      datos.nombre.trim(),
      String(datos.documento).trim(),
      email,
      datos.telefono || null,
    ]);
    const u = await cliente.query(
      "INSERT INTO usuarios (nombre, email, clave, rol, paciente_id) VALUES ($1, $2, $3, 'paciente', $4) RETURNING *",
      [datos.nombre.trim(), email, cifrarClave(datos.clave), p.rows[0].id]
    );
    return { paciente: p.rows[0], usuario: u.rows[0] };
  });
}

async function logout(request) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  await db.query("DELETE FROM sesiones WHERE token = $1", [token]);
  return responder({ mensaje: "Sesión cerrada." });
}

// ---------------------------------------------------------------------
//  Errores de la base de datos que se le explican al usuario
//  23505 = dato repetido (correo o documento)   23503 = tiene citas   22001 = texto muy largo
// ---------------------------------------------------------------------
function errorDeBase(e, repetido) {
  if (e.code === "23505") return error(repetido, 409);
  if (e.code === "23503") return error("No se puede borrar porque tiene citas.", 409);
  if (e.code === "22001") return error("Algún dato es demasiado largo.", 400);
  throw e;
}

// ---------------------------------------------------------------------
//  Médicos (crear, editar y borrar: solo el administrador)
// ---------------------------------------------------------------------
async function listarMedicos() {
  const r = await db.query("SELECT id, nombre, especialidad, email FROM medicos WHERE activo ORDER BY nombre");
  return responder(r.rows);
}

// Al crear un médico se crea también su cuenta para entrar
async function crearMedico(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "especialidad", "email", "clave"]);
  if (falta) return error(falta, 400);
  if (!correoValido(datos.email)) return error("El correo no es válido.", 400);
  if (String(datos.clave).length < 6) return error("La contraseña debe tener al menos 6 caracteres.", 400);

  const email = datos.email.trim().toLowerCase();
  try {
    const medico = await transaccion(async function (cliente) {
      const especialidad = await nombreDeEspecialidad(cliente, datos.especialidad.trim(), 0);
      const m = await cliente.query("INSERT INTO medicos (nombre, especialidad, email) VALUES ($1, $2, $3) RETURNING *", [
        datos.nombre.trim(),
        especialidad,
        email,
      ]);
      await cliente.query("INSERT INTO usuarios (nombre, email, clave, rol, medico_id) VALUES ($1, $2, $3, 'medico', $4)", [
        datos.nombre.trim(),
        email,
        cifrarClave(datos.clave),
        m.rows[0].id,
      ]);
      return m.rows[0];
    });
    return responder(medico, 201);
  } catch (e) {
    return errorDeBase(e, "Ya existe una cuenta con ese correo.");
  }
}

async function editarMedico(request, id) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "especialidad", "email"]);
  if (falta) return error(falta, 400);
  if (!correoValido(datos.email)) return error("El correo no es válido.", 400);

  const email = datos.email.trim().toLowerCase();
  try {
    const medico = await transaccion(async function (cliente) {
      const especialidad = await nombreDeEspecialidad(cliente, datos.especialidad.trim(), id);
      const r = await cliente.query("UPDATE medicos SET nombre = $1, especialidad = $2, email = $3 WHERE id = $4 AND activo RETURNING id, nombre, especialidad, email", [
        datos.nombre.trim(),
        especialidad,
        email,
        id,
      ]);
      // La cuenta del médico cambia igual (nombre y correo para entrar)
      await cliente.query("UPDATE usuarios SET nombre = $1, email = $2 WHERE medico_id = $3", [datos.nombre.trim(), email, id]);
      return r.rows[0];
    });
    if (!medico) return error("El médico no existe.", 404);
    return responder(medico);
  } catch (e) {
    return errorDeBase(e, "Ya existe una cuenta con ese correo.");
  }
}

async function borrarMedico(id) {
  return borrarODesactivar("medicos", "medico_id", id, "El médico");
}

// Si no tiene citas, se borra (su cuenta se borra sola por el CASCADE).
// Si tiene citas, no se borra: se desactiva para conservar su historial,
// ya no puede entrar ni recibir citas nuevas, y sus citas futuras se cancelan.
// (tabla y columna las pone el código, nunca vienen del usuario)
async function borrarODesactivar(tabla, columna, id, quien) {
  let resultado;
  try {
    resultado = await transaccion(async function (cliente) {
      const r = await cliente.query(
        `SELECT (SELECT COUNT(*) FROM citas WHERE ${columna} = $1)::int AS citas FROM ${tabla} WHERE id = $1 AND activo`,
        [id]
      );
      if (r.rows.length === 0) return null;
      if (r.rows[0].citas === 0) {
        await cliente.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
        return quien + " fue borrado.";
      }
      await cliente.query(`UPDATE ${tabla} SET activo = false WHERE id = $1`, [id]);
      const canceladas = await cliente.query(
        `UPDATE citas SET estado = 'cancelada' WHERE ${columna} = $1 AND estado = 'programada' AND inicio > now()`,
        [id]
      );
      return `${quien} tiene citas: quedó desactivado y se conserva su historial. Citas futuras canceladas: ${canceladas.rowCount}.`;
    });
  } catch (e) {
    return errorDeBase(e, ""); // por si alguien agendó una cita justo en ese momento
  }
  if (!resultado) return error(quien + " no existe.", 404);
  return responder({ mensaje: resultado });
}

// ---------------------------------------------------------------------
//  Pacientes (solo el administrador)
// ---------------------------------------------------------------------
async function listarPacientes() {
  const r = await db.query("SELECT id, nombre, documento, email, telefono FROM pacientes WHERE activo ORDER BY nombre");
  return responder(r.rows);
}

// El administrador crea la ficha y la cuenta del paciente
async function crearPaciente(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "documento", "email", "clave"]);
  if (falta) return error(falta, 400);
  if (!correoValido(datos.email)) return error("El correo no es válido.", 400);
  if (String(datos.clave).length < 6) return error("La contraseña debe tener al menos 6 caracteres.", 400);

  try {
    const nuevo = await guardarPacienteConCuenta(datos);
    return responder(nuevo.paciente, 201);
  } catch (e) {
    return errorDeBase(e, "Ya existe un paciente con ese correo o documento.");
  }
}

async function editarPaciente(request, id) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "documento", "email"]);
  if (falta) return error(falta, 400);
  if (!correoValido(datos.email)) return error("El correo no es válido.", 400);

  const email = datos.email.trim().toLowerCase();
  try {
    const paciente = await transaccion(async function (cliente) {
      const r = await cliente.query("UPDATE pacientes SET nombre = $1, documento = $2, email = $3, telefono = $4 WHERE id = $5 AND activo RETURNING id, nombre, documento, email, telefono", [
        datos.nombre.trim(),
        String(datos.documento).trim(),
        email,
        datos.telefono || null,
        id,
      ]);
      await cliente.query("UPDATE usuarios SET nombre = $1, email = $2 WHERE paciente_id = $3", [datos.nombre.trim(), email, id]);
      return r.rows[0];
    });
    if (!paciente) return error("El paciente no existe.", 404);
    return responder(paciente);
  } catch (e) {
    return errorDeBase(e, "Ya existe un paciente con ese correo o documento.");
  }
}

async function borrarPaciente(id) {
  return borrarODesactivar("pacientes", "paciente_id", id, "El paciente");
}

// ---------------------------------------------------------------------
//  Citas
//  Horario igual para todos los médicos: lunes a viernes,
//  de 8:00 a 12:00 y de 14:00 a 17:00, citas de 30 minutos.
// ---------------------------------------------------------------------
const TRAMOS = [["08:00", "12:00"], ["14:00", "17:00"]];
const DURACION = 30;

// Todas las horas en que puede empezar una cita: ["08:00", "08:30", ..., "16:30"]
function horasDelHorario() {
  const horas = [];
  for (const [desde, hasta] of TRAMOS) {
    let minutos = aMinutos(desde);
    while (minutos + DURACION <= aMinutos(hasta)) {
      horas.push(aTexto(minutos));
      minutos += DURACION;
    }
  }
  return horas;
}

function aMinutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function aTexto(minutos) {
  const h = String(Math.floor(minutos / 60)).padStart(2, "0");
  const m = String(minutos % 60).padStart(2, "0");
  return h + ":" + m;
}

// ¿La fecha existe de verdad? (por ejemplo, 2026-02-31 no existe)
function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(fecha + "T12:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === fecha;
}

// Lo que se devuelve de cada cita: con los nombres y la fecha y hora de Colombia
const CONSULTA_CITAS = `
  SELECT c.id, c.motivo, c.nota, c.medico_id, c.paciente_id,
         -- Una cita programada que ya terminó (30 minutos) y nadie atendió se muestra "sin atender"
         CASE WHEN c.estado = 'programada' AND c.inicio + interval '30 minutes' < now()
              THEN 'sin atender' ELSE c.estado END AS estado,
         to_char(c.inicio AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS fecha,
         to_char(c.inicio AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora,
         m.nombre AS medico, m.especialidad, p.nombre AS paciente
    FROM citas c
    JOIN medicos m ON m.id = c.medico_id
    JOIN pacientes p ON p.id = c.paciente_id`;

// GET /api/citas: el administrador ve todas; el médico y el paciente, solo las suyas
async function listarCitas(usuario) {
  let r;
  if (usuario.rol === "administrador") {
    r = await db.query(CONSULTA_CITAS + " ORDER BY c.inicio");
  } else if (usuario.rol === "medico") {
    r = await db.query(CONSULTA_CITAS + " WHERE c.medico_id = $1 ORDER BY c.inicio", [usuario.medico_id]);
  } else {
    r = await db.query(CONSULTA_CITAS + " WHERE c.paciente_id = $1 ORDER BY c.inicio", [usuario.paciente_id]);
  }
  return responder(r.rows);
}

// Horas con cita ese día, de un médico o de un paciente (columna: "medico_id" o "paciente_id")
async function horasConCita(columna, id, fecha) {
  const r = await db.query(
    `SELECT to_char(inicio AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora
       FROM citas
      WHERE ${columna} = $1 AND estado <> 'cancelada'
        AND to_char(inicio AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') = $2
      ORDER BY hora`,
    [id, fecha]
  );
  return r.rows.map((fila) => fila.hora);
}

// GET /api/medicos/:id/horas?fecha=2026-12-01[&paciente_id=3]
//   ocupadas: las horas en que el médico ya tiene cita
//   ocupadas_paciente: las horas en que el paciente ya tiene cita con cualquier médico
//   (el paciente no manda paciente_id: se usa el suyo)
// La página arma la lista completa de horas y quita estas.
async function horasOcupadas(request, usuario, medicoId) {
  const parametros = new URL(request.url).searchParams;
  const fecha = parametros.get("fecha") || "";
  if (!fechaValida(fecha)) return error("La fecha debe ser AAAA-MM-DD y existir.", 400);

  const pacienteId = usuario.rol === "paciente" ? usuario.paciente_id : aId(parametros.get("paciente_id"));
  const ocupadas = await horasConCita("medico_id", medicoId, fecha);
  const delPaciente = pacienteId ? await horasConCita("paciente_id", pacienteId, fecha) : [];
  return responder({ fecha, ocupadas, ocupadas_paciente: delPaciente });
}

// POST /api/citas: el paciente agenda para sí; el administrador, para cualquiera
async function agendar(request, usuario) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["medico_id", "fecha", "hora", "motivo"]);
  if (falta) return error(falta, 400);

  if (String(datos.motivo).length > 300) return error("El motivo puede tener máximo 300 caracteres.", 400);

  const pacienteId = usuario.rol === "paciente" ? usuario.paciente_id : aId(datos.paciente_id);
  const medicoId = aId(datos.medico_id);
  if (!pacienteId) return error("Falta el campo paciente_id.", 400);

  // ¿Es un día de lunes a viernes y una hora del horario?
  if (!fechaValida(datos.fecha)) return error("La fecha debe ser AAAA-MM-DD y existir.", 400);
  const dia = new Date(datos.fecha + "T12:00:00Z").getUTCDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) return error("Solo se atiende de lunes a viernes.", 400);
  if (!horasDelHorario().includes(datos.hora)) return error("Esa hora está fuera del horario.", 400);

  // ¿No es en el pasado? (hora de Colombia)
  const inicio = `${datos.fecha}T${datos.hora}:00-05:00`;
  if (new Date(inicio) <= new Date()) return error("No se puede agendar en el pasado.", 400);

  // ¿Existen el médico y el paciente?
  const medico = await db.query("SELECT id FROM medicos WHERE id = $1 AND activo", [medicoId]);
  if (medico.rows.length === 0) return error("El médico no existe.", 404);
  const paciente = await db.query("SELECT id FROM pacientes WHERE id = $1 AND activo", [pacienteId]);
  if (paciente.rows.length === 0) return error("El paciente no existe.", 404);

  try {
    const r = await db.query("INSERT INTO citas (paciente_id, medico_id, inicio, motivo) VALUES ($1, $2, $3, $4) RETURNING id", [
      pacienteId,
      medicoId,
      inicio,
      String(datos.motivo).trim(),
    ]);
    const cita = await db.query(CONSULTA_CITAS + " WHERE c.id = $1", [r.rows[0].id]);
    return responder(cita.rows[0], 201);
  } catch (e) {
    // Los índices "sin cruce" no dejan dos citas a la misma hora: ni del médico ni del paciente
    if (e.code === "23505" && e.constraint === "citas_paciente_sin_cruce") {
      const quien = usuario.rol === "paciente" ? "Ya tienes" : "El paciente ya tiene";
      return error(quien + " una cita a esa hora.", 409);
    }
    if (e.code === "23505") return error("El médico ya tiene una cita a esa hora.", 409);
    throw e;
  }
}

// PATCH /api/citas/:id/cancelar
async function cancelar(usuario, id) {
  const r = await db.query("SELECT * FROM citas WHERE id = $1", [id]);
  const cita = r.rows[0];

  // Si la cita no es suya, se responde "no existe" para no dar pistas
  const esSuya =
    usuario.rol === "administrador" ||
    (usuario.rol === "medico" && cita?.medico_id === usuario.medico_id) ||
    (usuario.rol === "paciente" && cita?.paciente_id === usuario.paciente_id);
  if (!cita || !esSuya) return error("La cita no existe.", 404);

  if (cita.estado !== "programada") return error("Solo se pueden cancelar citas programadas.", 409);
  if (cita.inicio <= new Date()) return error("No se puede cancelar una cita que ya empezó o ya pasó.", 409);

  await db.query("UPDATE citas SET estado = 'cancelada' WHERE id = $1", [id]);
  return responder({ mensaje: "Cita cancelada." });
}

// PATCH /api/citas/:id/atender: el médico marca su cita como atendida y escribe una nota
async function marcarAtendida(request, usuario, id) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nota"]);
  if (falta) return error(falta, 400);
  if (String(datos.nota).length > 500) return error("La nota puede tener máximo 500 caracteres.", 400);

  // Solo cuenta si la cita es de este médico, sigue programada y ya empezó
  const r = await db.query("SELECT estado, inicio <= now() AS empezo FROM citas WHERE id = $1 AND medico_id = $2", [
    id,
    usuario.medico_id,
  ]);
  const cita = r.rows[0];
  if (!cita || cita.estado !== "programada") return error("La cita no existe o ya no está programada.", 404);
  if (!cita.empezo) return error("Solo se puede atender una cita desde su hora de inicio.", 409);

  await db.query("UPDATE citas SET estado = 'atendida', nota = $1 WHERE id = $2 AND estado = 'programada'", [
    String(datos.nota).trim(),
    id,
  ]);
  return responder({ mensaje: "Cita atendida." });
}

// ---------------------------------------------------------------------
//  Reporte (solo el administrador): cuántas citas tiene cada médico, por estado
// ---------------------------------------------------------------------
async function reporteCitasPorMedico() {
  const r = await db.query(`
    SELECT m.nombre, m.especialidad,
           COUNT(c.id)::int AS total,
           SUM(CASE WHEN c.estado = 'programada' AND c.inicio + interval '30 minutes' >= now() THEN 1 ELSE 0 END)::int AS programadas,
           SUM(CASE WHEN c.estado = 'programada' AND c.inicio + interval '30 minutes' < now() THEN 1 ELSE 0 END)::int AS sin_atender,
           SUM(CASE WHEN c.estado = 'atendida' THEN 1 ELSE 0 END)::int AS atendidas,
           SUM(CASE WHEN c.estado = 'cancelada' THEN 1 ELSE 0 END)::int AS canceladas
      FROM medicos m
      LEFT JOIN citas c ON c.medico_id = m.id
     GROUP BY m.id, m.nombre, m.especialidad
     ORDER BY total DESC, m.nombre`);
  return responder(r.rows);
}

// ---------------------------------------------------------------------
//  Rutas
// ---------------------------------------------------------------------
// Recibe todos los pedidos. Si algo falla, responde 500 con { error } en vez de romperse.
// (el await es importante: sin él, el catch no alcanza a ver los errores de la ruta)
async function atender(request, { params }) {
  try {
    const { ruta } = await params; // por ejemplo /api/medicos/3 -> ["medicos", "3"]
    return await elegirRuta(request, ruta);
  } catch (e) {
    console.error(e);
    return error("Error en el servidor.", 500);
  }
}

async function elegirRuta(request, ruta) {
  const metodo = request.method;
  const camino = ruta.join("/");

  await prepararBase();

  // GET /api/salud -> dice si la base de datos responde
  if (metodo === "GET" && camino === "salud") {
    const r = await db.query("SELECT now() AS hora");
    return responder({ estado: "ok", hora: r.rows[0].hora });
  }

  // Rutas públicas (sin sesión)
  if (metodo === "POST" && camino === "login") return login(request);
  if (metodo === "POST" && camino === "registro") return registro(request);

  // De aquí para abajo hay que haber iniciado sesión
  const usuario = await usuarioActual(request);
  if (!usuario) return error("Debes iniciar sesión.", 401);

  if (metodo === "POST" && camino === "logout") return logout(request);
  if (metodo === "GET" && camino === "yo") return responder(datosUsuario(usuario));

  const recurso = ruta[0]; // "medicos" o "pacientes"
  const id = aId(ruta[1]); // el número que viene después, si hay (si no es válido, 0)
  const esAdmin = usuario.rol === "administrador";

  // Médicos: todos pueden ver la lista; solo el administrador la cambia
  if (recurso === "medicos" && ruta.length === 1) {
    if (metodo === "GET") return listarMedicos();
    if (metodo === "POST") return esAdmin ? crearMedico(request) : error("No tienes permiso.", 403);
  }
  if (recurso === "medicos" && ruta.length === 3 && id > 0 && ruta[2] === "horas" && metodo === "GET") {
    return horasOcupadas(request, usuario, id);
  }
  if (recurso === "medicos" && ruta.length === 2 && id > 0) {
    if (!esAdmin) return error("No tienes permiso.", 403);
    if (metodo === "PUT") return editarMedico(request, id);
    if (metodo === "DELETE") return borrarMedico(id);
  }

  // Pacientes: solo el administrador
  if (recurso === "pacientes") {
    if (!esAdmin) return error("No tienes permiso.", 403);
    if (ruta.length === 1 && metodo === "GET") return listarPacientes();
    if (ruta.length === 1 && metodo === "POST") return crearPaciente(request);
    if (ruta.length === 2 && id > 0 && metodo === "PUT") return editarPaciente(request, id);
    if (ruta.length === 2 && id > 0 && metodo === "DELETE") return borrarPaciente(id);
  }

  // Citas
  if (recurso === "citas" && ruta.length === 1) {
    if (metodo === "GET") return listarCitas(usuario);
    if (metodo === "POST") return usuario.rol === "medico" ? error("El médico no agenda citas.", 403) : agendar(request, usuario);
  }
  if (recurso === "citas" && ruta.length === 3 && id > 0 && ruta[2] === "cancelar" && metodo === "PATCH") {
    return cancelar(usuario, id);
  }
  if (recurso === "citas" && ruta.length === 3 && id > 0 && ruta[2] === "atender" && metodo === "PATCH") {
    return usuario.rol === "medico" ? marcarAtendida(request, usuario, id) : error("Solo el médico atiende citas.", 403);
  }

  // Reporte: solo el administrador
  if (metodo === "GET" && camino === "reportes/citas-por-medico") {
    return esAdmin ? reporteCitasPorMedico() : error("No tienes permiso.", 403);
  }

  return error("Esa ruta no existe.", 404);
}

export const GET = atender;
export const POST = atender;
export const PUT = atender;
export const PATCH = atender;
export const DELETE = atender;
