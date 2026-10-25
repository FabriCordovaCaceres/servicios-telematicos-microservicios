
/* global AbortSignal, console, fetch, performance, process, setTimeout */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// T3.4 - Simulacion de concurrencia en Microservicios
// Ejemplo: node simulacion/concurrencia.mjs 2

const usuarios = Number(process.argv[2]);

if (![2, 3, 5].includes(usuarios)) {
  console.error("Uso: node simulacion/concurrencia.mjs 2|3|5");
  process.exit(1);
}

const GATEWAY =
  process.env.GATEWAY_URL || "http://localhost:6001";

const RUTA = "/api/tareas";
const ejecucion = randomUUID().slice(0, 8);

const resultados = [];
const tareas = [];

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Enviar una solicitud HTTP mediante el Gateway
async function solicitar(metodo, ruta, datos) {
  const inicio = performance.now();

  try {
    const respuesta = await fetch(GATEWAY + ruta, {
      method: metodo,
      headers: datos
        ? { "Content-Type": "application/json" }
        : {},
      body: datos ? JSON.stringify(datos) : undefined,
      signal: AbortSignal.timeout(10000)
    });

    const texto = await respuesta.text();
    let contenido = null;

    if (texto) {
      try {
        contenido = JSON.parse(texto);
      } catch {
        contenido = texto;
      }
    }

    return {
      ok: respuesta.ok,
      codigo: respuesta.status,
      datos: contenido,
      duracionMs: Math.round(
        (performance.now() - inicio) * 100
      ) / 100
    };
  } catch (error) {
    return {
      ok: false,
      codigo: 0,
      datos: null,
      duracionMs: Math.round(
        (performance.now() - inicio) * 100
      ) / 100,
      error: error.message
    };
  }
}

function registrar(usuario, operacion, respuesta, valida) {
    const correcto = valida;

  resultados.push({
    usuario,
    operacion,
    codigo: respuesta.codigo,
    duracionMs: respuesta.duracionMs,
    correcto,
    error: respuesta.error ?? null
  });

  console.log(
    `[${correcto ? "OK" : "ERROR"}] ` +
    `Usuario ${usuario} - ${operacion} ` +
    `HTTP ${respuesta.codigo} - ` +
    `${respuesta.duracionMs} ms`
  );

  return correcto;
}

// CREATE: crear una tarea por usuario
async function crear(usuario) {
  const respuesta = await solicitar("POST", RUTA, {
    titulo: `T3.4-${ejecucion}-Usuario-${usuario}`,
    descripcion: "Simulacion de concurrencia RQ11",
    updatedBy: `usuario-${usuario}`
  });

  const valida =
    respuesta.codigo === 201 &&
    typeof respuesta.datos?.id === "string" &&
    respuesta.datos?.estado === "pendiente";

  registrar(usuario, "CREATE", respuesta, valida);

  if (valida) {
    tareas.push({
      usuario,
      id: respuesta.datos.id
    });
  }
}

// READ: consultar una tarea creada
async function leer(tarea) {
  const respuesta = await solicitar(
    "GET",
    `${RUTA}/${tarea.id}`
  );

  registrar(
    tarea.usuario,
    "READ",
    respuesta,
    respuesta.codigo === 200 &&
      respuesta.datos?.id === tarea.id
  );
}

// UPDATE: actualizar el estado
async function actualizar(tarea) {
  const respuesta = await solicitar(
    "PUT",
    `${RUTA}/${tarea.id}`,
    {
      titulo: `T3.4-${ejecucion}-Actualizada-${tarea.usuario}`,
      descripcion: "Actualizada durante concurrencia",
      estado: "en_progreso",
      updatedBy: `usuario-${tarea.usuario}`
    }
  );

  registrar(
    tarea.usuario,
    "UPDATE",
    respuesta,
    respuesta.codigo === 200 &&
      respuesta.datos?.estado === "en_progreso" &&
      respuesta.datos?.id === tarea.id
  );
}

// DELETE: eliminar una tarea
async function eliminar(tarea) {
  const respuesta = await solicitar(
    "DELETE",
    `${RUTA}/${tarea.id}`
  );

  registrar(
    tarea.usuario,
    "DELETE",
    respuesta,
    respuesta.codigo === 204
  );
}

// Cada fase ejecuta varias solicitudes a la vez
async function fase(nombre, elementos, accion) {
  console.log(`\n--- ${nombre} ---`);

  const inicio = performance.now();

  await Promise.all(elementos.map(accion));

  const tiempo = Math.round(performance.now() - inicio);

  console.log(`Fase terminada en ${tiempo} ms`);
}

// Comprobar que las tareas eliminadas ya no existan
async function verificarEliminacion() {
  console.log("\n--- VERIFICACION DE ELIMINACION ---");

  await Promise.all(
    tareas.map(async tarea => {
      const respuesta = await solicitar(
        "GET",
        `${RUTA}/${tarea.id}`
      );

      registrar(
        tarea.usuario,
        "VERIFICAR_DELETE",
        respuesta,
        respuesta.codigo === 404
      );
    })
  );
}

async function main() {
  console.log("\n================================");
  console.log(" SIMULACION DE CONCURRENCIA T3.4");
  console.log("================================");
  console.log("Arquitectura: microservicios");
  console.log(`Gateway: ${GATEWAY}`);
  console.log(`Usuarios virtuales: ${usuarios}`);
  console.log(`Ejecucion: ${ejecucion}`);

  const inicio = performance.now();

  // Verificar la disponibilidad del Gateway
  const salud = await solicitar("GET", "/health");

  if (!salud.ok) {
    throw new Error("API Gateway no disponible");
  }

  // Verificar servicio de tareas
  const tareasDisponibles = await solicitar("GET", RUTA);

  if (!tareasDisponibles.ok) {
    throw new Error("Servicio de tareas no disponible");
  }

  // Verificar servicio de notificaciones
  const notificaciones = await solicitar(
    "GET",
    "/api/notificaciones/health"
  );

  if (!notificaciones.ok) {
    throw new Error("Servicio de notificaciones no disponible");
  }

  const agentes = Array.from(
    { length: usuarios },
    (_, i) => i + 1
  );

  await fase("CREAR", agentes, crear);

  // No borrar accidentalmente otras tareas.
  if (tareas.length !== usuarios) {
    console.error("No se pudieron crear todas las tareas");
  }

  await esperar(100);

  await fase("LEER", tareas, leer);
  await fase("ACTUALIZAR", tareas, actualizar);
  await fase("ELIMINAR", tareas, eliminar);

  await verificarEliminacion();

  const correctas = resultados.filter(
    r => r.correcto
  ).length;

  const errores = resultados.length - correctas;

  const resumen = {
    requisito: "RQ11",
    tarea: "T3.4",
    arquitectura: "microservicios",
    gateway: GATEWAY,
    usuarios,
    ejecucion,
    fecha: new Date().toISOString(),
    tareasCreadas: tareas.length,
    operacionesRegistradas: resultados.length,
    operacionesCRUD: resultados.filter(
      r => r.operacion !== "VERIFICAR_DELETE"
    ).length,
    correctas,
    errores,
    tiempoTotalMs: Math.round(performance.now() - inicio),
    resultados
  };

  const carpeta = path.join(
    process.cwd(),
    "simulacion",
    "resultados"
  );

  fs.mkdirSync(carpeta, { recursive: true });

  const archivo = path.join(
    carpeta,
    `micro-${usuarios}usuarios-${ejecucion}.json`
  );
  

  fs.writeFileSync(
    archivo,
    JSON.stringify(resumen, null, 2),
    "utf8"
  );

  console.log("\n========== RESULTADO FINAL ==========");
  console.log(`Usuarios: ${usuarios}`);
  console.log(`Tareas creadas: ${tareas.length}`);
  console.log(`Operaciones registradas: ${resultados.length}`);
  console.log(`Correctas: ${correctas}`);
  console.log(`Errores: ${errores}`);
  console.log(`Tiempo total: ${resumen.tiempoTotalMs} ms`);
  console.log(`Archivo: ${archivo}`);

  if (errores > 0 || tareas.length !== usuarios) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error("[ERROR]", error.message);
  process.exitCode = 1;
});
