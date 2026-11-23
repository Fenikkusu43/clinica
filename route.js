import pg from "pg";
import crypto from "node:crypto";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function responder(datos, codigo = 200) {
  return Response.json(datos, { status: codigo });
}

function error(mensaje, codigo) {
  return Response.json({ error: mensaje }, { status: codigo });
}

function cifrarClave(clave) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(clave, sal, 64).toString("hex");
  return sal + ":" + hash;
}

function claveCorrecta(clave, guardada) {
  const [sal, hash] = guardada.split(":");
  const nuevo = crypto.scryptSync(clave, sal, 64);
  return crypto.timingSafeEqual(nuevo, Buffer.from(hash, "hex"));
}

let listo = null;

function prepararBase() {
  if (!listo) listo = crearTablas().then(sembrar);
  return listo;
}

async function crearTablas() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS medicos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      especialidad VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS pacientes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      documento VARCHAR(20) NOT NULL UNIQUE,
      email VARCHAR(150) NOT NULL UNIQUE,
      telefono VARCHAR(30)
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      clave TEXT NOT NULL,
      rol VARCHAR(20) NOT NULL CHECK (rol IN ('administrador', 'medico', 'paciente')),
      medico_id INT REFERENCES medicos(id) ON DELETE CASCADE,
      paciente_id INT REFERENCES pacientes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sesiones (
      token VARCHAR(64) PRIMARY KEY,
      usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS citas (
      id SERIAL PRIMARY KEY,
      paciente_id INT NOT NULL REFERENCES pacientes(id),
      medico_id INT NOT NULL REFERENCES medicos(id),
      inicio TIMESTAMPTZ NOT NULL,
      motivo VARCHAR(300) NOT NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'cancelada'))
    );
    -- Sin cruces: un médico no puede tener dos citas programadas a la misma hora
    CREATE UNIQUE INDEX IF NOT EXISTS citas_sin_cruce ON citas (medico_id, inicio) WHERE estado = 'programada';
  `);
}

async function sembrar() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email || !process.env.ADMIN_PASSWORD) {
    console.log("Faltan ADMIN_EMAIL o ADMIN_PASSWORD: no se crea el administrador");
    return;
  }

  
  const hay = await db.query("SELECT COUNT(*) AS total FROM usuarios");
  if (Number(hay.rows[0].total) > 0) return;

  await db.query("INSERT INTO usuarios (nombre, email, clave, rol) VALUES ($1, $2, $3, 'administrador')", [
    "Administrador",
    email,
    cifrarClave(process.env.ADMIN_PASSWORD),
  ]);

  const demo = process.env.DEMO_PASSWORD;
  if (!demo) return;

  
  const medicos = [
    ["Dra. Valentina Ríos", "Medicina general", "valentina.rios@ejemplo.test"],
    ["Dr. Andrés Castaño", "Medicina general", "andres.castano@ejemplo.test"],
    ["Dra. Camila Ospina", "Pediatría", "camila.ospina@ejemplo.test"],
    ["Dr. Felipe Mejía", "Cardiología", "felipe.mejia@ejemplo.test"],
  ];
  const idsMedicos = [];
  for (const [nombre, especialidad, correo] of medicos) {
    const m = await db.query("INSERT INTO medicos (nombre, especialidad, email) VALUES ($1, $2, $3) RETURNING id", [nombre, especialidad, correo]);
    idsMedicos.push(m.rows[0].id);
    await db.query("INSERT INTO usuarios (nombre, email, clave, rol, medico_id) VALUES ($1, $2, $3, 'medico', $4)", [nombre, correo, cifrarClave(demo), m.rows[0].id]);
  }

  
  const pacientes = [
    ["Laura Martínez", "1000000001", "laura.martinez@ejemplo.test", "3001112233"],
    ["Carlos Gómez", "1000000002", "carlos.gomez@ejemplo.test", "3002223344"],
    ["Sofía Ramírez", "1000000003", "sofia.ramirez@ejemplo.test", null],
    ["Mateo Torres", "1000000004", "mateo.torres@ejemplo.test", "3004445566"],
    ["Isabella Vargas", "1000000005", "isabella.vargas@ejemplo.test", null],
  ];
  const idsPacientes = [];
  for (const [nombre, documento, correo, telefono] of pacientes) {
    const p = await db.query("INSERT INTO pacientes (nombre, documento, email, telefono) VALUES ($1, $2, $3, $4) RETURNING id", [nombre, documento, correo, telefono]);
    idsPacientes.push(p.rows[0].id);
    await db.query("INSERT INTO usuarios (nombre, email, clave, rol, paciente_id) VALUES ($1, $2, $3, 'paciente', $4)", [nombre, correo, cifrarClave(demo), p.rows[0].id]);
  }

  
  const motivos = ["Control general", "Dolor de cabeza", "Revisión de exámenes", "Chequeo anual", "Tos y fiebre"];
  const dias = proximosDiasHabiles(3);
  let n = 0;
  for (const dia of dias) {
    for (const hora of ["09:00", "15:00"]) {
      const inicio = `${dia}T${hora}:00-05:00`;
      const medico = idsMedicos[n % idsMedicos.length];
      const paciente = idsPacientes[n % idsPacientes.length];
      await db.query("INSERT INTO citas (paciente_id, medico_id, inicio, motivo) VALUES ($1, $2, $3, $4)", [paciente, medico, inicio, motivos[n % motivos.length]]);
      n++;
    }
  }
  console.log("Datos de ejemplo creados");
}


function hoyEnColombia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}


function proximosDiasHabiles(cuantos) {
  const dias = [];
  const fecha = new Date(hoyEnColombia() + "T12:00:00Z");
  while (dias.length < cuantos) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
    const dia = fecha.getUTCDay(); 
    if (dia !== 0 && dia !== 6) dias.push(fecha.toISOString().slice(0, 10));
  }
  return dias;
}

async function leerCuerpo(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function transaccion(trabajo) {
  const cliente = await db.connect();
  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}


function faltan(datos, campos) {
  for (const campo of campos) {
    if (!datos[campo] || String(datos[campo]).trim() === "") return "Falta el campo " + campo + ".";
  }
  return null;
}

async function usuarioActual(request) {
  const cabecera = request.headers.get("authorization") || "";
  const token = cabecera.replace("Bearer ", "");
  if (!token) return null;
  const r = await db.query(
    `SELECT u.id, u.nombre, u.email, u.rol, u.medico_id, u.paciente_id
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = $1 AND s.creado > now() - interval '8 hours'`,
    [token]
  );
  return r.rows[0] || null;
}

async function crearSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.query("INSERT INTO sesiones (token, usuario_id) VALUES ($1, $2)", [token, usuarioId]);
  return token;
}


function datosUsuario(u) {
  return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
}

async function login(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["email", "clave"]);
  if (falta) return error(falta, 400);

  const r = await db.query("SELECT * FROM usuarios WHERE email = $1", [datos.email.trim().toLowerCase()]);
  const u = r.rows[0];
  if (!u || !claveCorrecta(datos.clave, u.clave)) return error("Correo o contraseña incorrectos.", 401);

  const token = await crearSesion(u.id);
  return responder({ token, usuario: datosUsuario(u) });
}

async function registro(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "documento", "email", "clave"]);
  if (falta) return error(falta, 400);
  if (String(datos.clave).length < 6) return error("La contraseña debe tener al menos 6 caracteres.", 400);

  try {
    const nuevo = await guardarPacienteConCuenta(datos);
    const token = await crearSesion(nuevo.usuario.id);
    return responder({ token, usuario: datosUsuario(nuevo.usuario) }, 201);
  } catch (e) {
    return errorDeBase(e, "Ya existe una cuenta con ese correo o documento.");
  }
}

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

function errorDeBase(e, repetido) {
  if (e.code === "23505") return error(repetido, 409);
  if (e.code === "23503") return error("No se puede borrar porque tiene citas.", 409);
  if (e.code === "22001") return error("Algún dato es demasiado largo.", 400);
  throw e;
}
async function listarMedicos() {
  const r = await db.query("SELECT id, nombre, especialidad, email FROM medicos ORDER BY nombre");
  return responder(r.rows);
}

async function crearMedico(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "especialidad", "email", "clave"]);
  if (falta) return error(falta, 400);
  if (String(datos.clave).length < 6) return error("La contraseña debe tener al menos 6 caracteres.", 400);

  const email = datos.email.trim().toLowerCase();
  try {
    const medico = await transaccion(async function (cliente) {
      const m = await cliente.query("INSERT INTO medicos (nombre, especialidad, email) VALUES ($1, $2, $3) RETURNING *", [
        datos.nombre.trim(),
        datos.especialidad.trim(),
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

  const email = datos.email.trim().toLowerCase();
  try {
    const medico = await transaccion(async function (cliente) {
      const r = await cliente.query("UPDATE medicos SET nombre = $1, especialidad = $2, email = $3 WHERE id = $4 RETURNING *", [
        datos.nombre.trim(),
        datos.especialidad.trim(),
        email,
        id,
      ]);
      
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
  try {
    const r = await db.query("DELETE FROM medicos WHERE id = $1", [id]); 
    if (r.rowCount === 0) return error("El médico no existe.", 404);
    return responder({ mensaje: "Médico borrado." });
  } catch (e) {
    return errorDeBase(e, "");
  }
}

async function listarPacientes() {
  const r = await db.query("SELECT id, nombre, documento, email, telefono FROM pacientes ORDER BY nombre");
  return responder(r.rows);
}

async function crearPaciente(request) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["nombre", "documento", "email", "clave"]);
  if (falta) return error(falta, 400);
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

  const email = datos.email.trim().toLowerCase();
  try {
    const paciente = await transaccion(async function (cliente) {
      const r = await cliente.query("UPDATE pacientes SET nombre = $1, documento = $2, email = $3, telefono = $4 WHERE id = $5 RETURNING *", [
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
  try {
    const r = await db.query("DELETE FROM pacientes WHERE id = $1", [id]);
    if (r.rowCount === 0) return error("El paciente no existe.", 404);
    return responder({ mensaje: "Paciente borrado." });
  } catch (e) {
    return errorDeBase(e, "");
  }
}

const TRAMOS = [["08:00", "12:00"], ["14:00", "17:00"]];
const DURACION = 30;

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


function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(fecha + "T12:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === fecha;
}


const CONSULTA_CITAS = `
  SELECT c.id, c.motivo, c.estado, c.medico_id, c.paciente_id,
         to_char(c.inicio AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS fecha,
         to_char(c.inicio AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora,
         m.nombre AS medico, m.especialidad, p.nombre AS paciente
    FROM citas c
    JOIN medicos m ON m.id = c.medico_id
    JOIN pacientes p ON p.id = c.paciente_id`;


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

async function horasOcupadas(request, medicoId) {
  const fecha = new URL(request.url).searchParams.get("fecha") || "";
  if (!fechaValida(fecha)) return error("La fecha debe ser AAAA-MM-DD y existir.", 400);

  const r = await db.query(
    `SELECT to_char(inicio AT TIME ZONE 'America/Bogota', 'HH24:MI') AS hora
       FROM citas
      WHERE medico_id = $1 AND estado = 'programada'
        AND to_char(inicio AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') = $2
      ORDER BY hora`,
    [medicoId, fecha]
  );
  return responder({ fecha, ocupadas: r.rows.map((fila) => fila.hora) });
}

async function agendar(request, usuario) {
  const datos = await leerCuerpo(request);
  const falta = faltan(datos, ["medico_id", "fecha", "hora", "motivo"]);
  if (falta) return error(falta, 400);

  if (String(datos.motivo).length > 300) return error("El motivo puede tener máximo 300 caracteres.", 400);

  const pacienteId = usuario.rol === "paciente" ? usuario.paciente_id : Number(datos.paciente_id);
  if (!pacienteId) return error("Falta el campo paciente_id.", 400);

  
  if (!fechaValida(datos.fecha)) return error("La fecha debe ser AAAA-MM-DD y existir.", 400);
  const dia = new Date(datos.fecha + "T12:00:00Z").getUTCDay(); 
  if (dia === 0 || dia === 6) return error("Solo se atiende de lunes a viernes.", 400);
  if (!horasDelHorario().includes(datos.hora)) return error("Esa hora está fuera del horario.", 400);

  
  const inicio = `${datos.fecha}T${datos.hora}:00-05:00`;
  if (new Date(inicio) <= new Date()) return error("No se puede agendar en el pasado.", 400);

  
  const medico = await db.query("SELECT id FROM medicos WHERE id = $1", [Number(datos.medico_id)]);
  if (medico.rows.length === 0) return error("El médico no existe.", 404);
  const paciente = await db.query("SELECT id FROM pacientes WHERE id = $1", [pacienteId]);
  if (paciente.rows.length === 0) return error("El paciente no existe.", 404);

  try {
    const r = await db.query("INSERT INTO citas (paciente_id, medico_id, inicio, motivo) VALUES ($1, $2, $3, $4) RETURNING id", [
      pacienteId,
      Number(datos.medico_id),
      inicio,
      String(datos.motivo).trim(),
    ]);
    const cita = await db.query(CONSULTA_CITAS + " WHERE c.id = $1", [r.rows[0].id]);
    return responder(cita.rows[0], 201);
  } catch (e) {
    
    if (e.code === "23505") return error("El médico ya tiene una cita a esa hora.", 409);
    throw e;
  }
}


async function cancelar(usuario, id) {
  const r = await db.query("SELECT * FROM citas WHERE id = $1", [id]);
  const cita = r.rows[0];
  
  const esSuya =
    usuario.rol === "administrador" ||
    (usuario.rol === "medico" && cita?.medico_id === usuario.medico_id) ||
    (usuario.rol === "paciente" && cita?.paciente_id === usuario.paciente_id);
  if (!cita || !esSuya) return error("La cita no existe.", 404);

  if (cita.estado !== "programada") return error("La cita ya estaba cancelada.", 409);

  await db.query("UPDATE citas SET estado = 'cancelada' WHERE id = $1", [id]);
  return responder({ mensaje: "Cita cancelada." });
}

async function atender(request, { params }) {
  const { ruta } = await params; 
  const metodo = request.method;
  const camino = ruta.join("/");

  try {
    await prepararBase();

    
    if (metodo === "GET" && camino === "salud") {
      const r = await db.query("SELECT now() AS hora");
      return responder({ estado: "ok", hora: r.rows[0].hora });
    }

    
    if (metodo === "POST" && camino === "login") return login(request);
    if (metodo === "POST" && camino === "registro") return registro(request);

    
    const usuario = await usuarioActual(request);
    if (!usuario) return error("Debes iniciar sesión.", 401);

    if (metodo === "POST" && camino === "logout") return logout(request);
    if (metodo === "GET" && camino === "yo") return responder(datosUsuario(usuario));

    const recurso = ruta[0]; 
    const id = Number(ruta[1]); 
    const esAdmin = usuario.rol === "administrador";

    
    if (recurso === "medicos" && ruta.length === 1) {
      if (metodo === "GET") return listarMedicos();
      if (metodo === "POST") return esAdmin ? crearMedico(request) : error("No tienes permiso.", 403);
    }
    if (recurso === "medicos" && ruta.length === 3 && id > 0 && ruta[2] === "horas" && metodo === "GET") {
      return horasOcupadas(request, id);
    }
    if (recurso === "medicos" && ruta.length === 2 && id > 0) {
      if (!esAdmin) return error("No tienes permiso.", 403);
      if (metodo === "PUT") return editarMedico(request, id);
      if (metodo === "DELETE") return borrarMedico(id);
    }

    
    if (recurso === "pacientes") {
      if (!esAdmin) return error("No tienes permiso.", 403);
      if (ruta.length === 1 && metodo === "GET") return listarPacientes();
      if (ruta.length === 1 && metodo === "POST") return crearPaciente(request);
      if (ruta.length === 2 && id > 0 && metodo === "PUT") return editarPaciente(request, id);
      if (ruta.length === 2 && id > 0 && metodo === "DELETE") return borrarPaciente(id);
    }

    
    if (recurso === "citas" && ruta.length === 1) {
      if (metodo === "GET") return listarCitas(usuario);
      if (metodo === "POST") return usuario.rol === "medico" ? error("El médico no agenda citas.", 403) : agendar(request, usuario);
    }
    if (recurso === "citas" && ruta.length === 3 && id > 0 && ruta[2] === "cancelar" && metodo === "PATCH") {
      return cancelar(usuario, id);
    }

    return error("Esa ruta no existe.", 404);
  } catch (e) {
    console.error(e);
    return error("Error en el servidor.", 500);
  }
}

export const GET = atender;
export const POST = atender;
export const PUT = atender;
export const PATCH = atender;
export const DELETE = atender;