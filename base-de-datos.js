import pg from "pg";
import crypto from "node:crypto";
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export function cifrarClave(clave) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(clave, sal, 64).toString("hex");
  return sal + ":" + hash;
}
export function claveCorrecta(clave, guardada) {
  const [sal, hash] = guardada.split(":");
  const nuevo = crypto.scryptSync(clave, sal, 64);
  return crypto.timingSafeEqual(nuevo, Buffer.from(hash, "hex"));
}
let listo = null;
export function prepararBase() {
  if (!listo) {
    listo = crearTablas()
      .then(sembrar)
      .catch(function (e) {
        listo = null;
        throw e;
      });
  }
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
      estado VARCHAR(20) NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'atendida', 'cancelada')),
      nota VARCHAR(500)
    );
    -- Para bases creadas antes: agrega la nota y el estado "atendida" (si ya existen, no pasa nada)
    ALTER TABLE citas ADD COLUMN IF NOT EXISTS nota VARCHAR(500);
    ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_estado_check;
    ALTER TABLE citas ADD CONSTRAINT citas_estado_check CHECK (estado IN ('programada', 'atendida', 'cancelada'));
    -- Sin cruces: un médico no puede tener dos citas a la misma hora (salvo que una esté cancelada).
    -- Una cita atendida sigue ocupando su hora.
    DROP INDEX IF EXISTS citas_sin_cruce;
    CREATE UNIQUE INDEX citas_sin_cruce ON citas (medico_id, inicio) WHERE estado <> 'cancelada';
    -- Y un paciente tampoco puede tener dos citas a la misma hora (aunque sean con médicos distintos)
    CREATE UNIQUE INDEX IF NOT EXISTS citas_paciente_sin_cruce ON citas (paciente_id, inicio) WHERE estado <> 'cancelada';
    -- Un médico o paciente con citas no se borra: se desactiva (activo = false) y se conserva su historial
    ALTER TABLE medicos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
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
export async function transaccion(trabajo) {
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
