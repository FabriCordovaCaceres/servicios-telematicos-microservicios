/* global AbortSignal, WebSocket, console, fetch, process, setTimeout */

// T4.3 / RQ13 - Pruebas funcionales automatizadas del prototipo de Microservicios.
// Complementa las pruebas manuales documentadas en RESULTADOS.md.
// Requiere Node.js 22+ (fetch y WebSocket globales). No necesita dependencias.
//
// Uso local (por defecto):
//   node --test pruebas/T4.3/funcionales-t4.3.test.mjs
// Uso contra las VMs (PowerShell):
//   $env:GATEWAY_URL="http://192.168.56.12:6001"
//   $env:TAREAS_URL="http://192.168.56.12:5001"
//   $env:NOTIFICACIONES_URL="http://192.168.56.12:5002"
//   node --test pruebas/T4.3/funcionales-t4.3.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

const sinBarra = (url) => url.replace(/\/+$/, "");
const GATEWAY = sinBarra(process.env.GATEWAY_URL ?? "http://localhost:6001");
const TAREAS = sinBarra(process.env.TAREAS_URL ?? "http://localhost:5001");
const NOTIFICACIONES = sinBarra(process.env.NOTIFICACIONES_URL ?? "http://localhost:5002");
const WS_URL = `${NOTIFICACIONES.replace(/^http/, "ws")}/ws`;
const API = `${GATEWAY}/api/tareas`;
const ID_INEXISTENTE = "00000000-0000-0000-0000-000000000000";

let comprobaciones = 0;
function ok(id, mensaje) {
  comprobaciones += 1;
  console.log(`OK ${id}: ${mensaje}`);
}

async function solicitar(url, metodo = "GET", datos) {
  const opciones = { method: metodo, signal: AbortSignal.timeout(7000) };
  if (datos !== undefined) {
    opciones.headers = { "Content-Type": "application/json" };
    opciones.body = JSON.stringify(datos);
  }
  const respuesta = await fetch(url, opciones);
  const texto = await respuesta.text();
  let cuerpo = null;
  if (texto) {
    try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  }
  return { status: respuesta.status, cuerpo };
}

function conectarWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const mensajes = [];
    const limite = setTimeout(() => reject(new Error(`Sin conexion WebSocket: ${WS_URL}`)), 6000);
    ws.addEventListener("message", (evento) => {
      try { mensajes.push(JSON.parse(String(evento.data))); } catch { /* mensaje no JSON */ }
    });
    ws.addEventListener("open", () => { clearTimeout(limite); resolve({ ws, mensajes }); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(limite); reject(new Error(`Error WebSocket: ${WS_URL}`)); }, { once: true });
  });
}

async function esperarMensaje(mensajes, condicion, maxMs = 5000) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    const encontrado = mensajes.find(condicion);
    if (encontrado) return encontrado;
    await new Promise((r) => setTimeout(r, 75));
  }
  return null;
}

test("T4.3 - Pruebas funcionales Microservicios (Gateway, tareas y notificaciones)", async () => {
  console.log(`Gateway: ${GATEWAY} | Tareas: ${TAREAS} | Notificaciones: ${NOTIFICACIONES}`);
  let conexion = null;
  let id = null;

  try {
    // Salud de los servicios
    assert.equal((await solicitar(`${GATEWAY}/health`)).status, 200);
    ok("PF-MS-01", "Gateway activo");
    assert.equal((await solicitar(`${TAREAS}/health`)).status, 200);
    ok("PF-MS-02", "Servicio de tareas activo");
    assert.equal((await solicitar(`${NOTIFICACIONES}/health`)).status, 200);
    ok("PF-MS-03", "Servicio de notificaciones activo");
    assert.equal((await solicitar(`${GATEWAY}/api/notificaciones/health`)).status, 200);
    ok("PF-MS-04", "Gateway se comunica con notificaciones");

    // Cliente WebSocket que observa los eventos
    conexion = await conectarWebSocket();
    assert.ok(await esperarMensaje(conexion.mensajes, (m) => m.tipo === "conexion"));
    ok("PF-MS-05", "Cliente WebSocket conectado a notificaciones");

    // Validaciones de entrada a traves del Gateway
    assert.equal((await solicitar(API, "POST", { titulo: "" })).status, 400);
    ok("PF-MS-06", "Titulo vacio rechazado (400)");
    assert.equal((await solicitar(API, "POST", { titulo: 123 })).status, 400);
    ok("PF-MS-07", "Titulo numerico rechazado (400)");
    assert.equal((await solicitar(API, "POST", { titulo: "   " })).status, 400);
    ok("PF-MS-08", "Titulo solo espacios rechazado (400)");

    // Crear
    const titulo = `Prueba T4.3 ${Date.now()}`;
    const creada = await solicitar(API, "POST", {
      titulo,
      descripcion: "Prueba funcional automatizada",
      updatedBy: "t4.3-funcionales",
    });
    assert.equal(creada.status, 201);
    assert.equal(creada.cuerpo.estado, "pendiente");
    assert.equal(creada.cuerpo.version, 1);
    id = creada.cuerpo.id;
    ok("PF-MS-09", "Tarea creada mediante el Gateway (201, version 1)");

    assert.ok(await esperarMensaje(conexion.mensajes, (m) => m.tipo === "tarea:creada" && m.tarea?.id === id));
    ok("PF-MS-10", "Evento tarea:creada recibido por WebSocket");

    // Consultar
    const consulta = await solicitar(`${API}/${id}`);
    assert.equal(consulta.status, 200);
    assert.equal(consulta.cuerpo.titulo, titulo);
    ok("PF-MS-11", "Tarea consultada mediante el Gateway");

    const directa = await solicitar(`${TAREAS}/tasks/${id}`);
    assert.equal(directa.status, 200);
    assert.deepEqual(directa.cuerpo, consulta.cuerpo);
    ok("PF-MS-12", "Los datos coinciden con el servicio de tareas");

    // Actualizar
    assert.equal((await solicitar(`${API}/${id}`, "PUT", { estado: "estado_no_valido" })).status, 400);
    ok("PF-MS-13", "Estado invalido rechazado (400)");
    assert.equal((await solicitar(`${API}/${id}`, "PUT", { titulo: "   " })).status, 400);
    ok("PF-MS-14", "Edicion con titulo solo espacios rechazada (400)");

    const actualizada = await solicitar(`${API}/${id}`, "PUT", {
      estado: "en_progreso",
      updatedBy: "t4.3-funcionales",
    });
    assert.equal(actualizada.status, 200);
    assert.equal(actualizada.cuerpo.estado, "en_progreso");
    assert.equal(actualizada.cuerpo.version, 2);
    ok("PF-MS-15", "Tarea actualizada (200, en_progreso, version 2)");

    assert.ok(await esperarMensaje(conexion.mensajes, (m) => m.tipo === "tarea:actualizada" && m.tarea?.id === id));
    ok("PF-MS-16", "Evento tarea:actualizada recibido por WebSocket");

    // Eliminar
    assert.equal((await solicitar(`${API}/${id}`, "DELETE")).status, 204);
    const eliminadaId = id;
    id = null;
    ok("PF-MS-17", "Tarea eliminada (204)");

    assert.ok(await esperarMensaje(conexion.mensajes, (m) => m.tipo === "tarea:eliminada" && m.id === eliminadaId));
    ok("PF-MS-18", "Evento tarea:eliminada recibido por WebSocket");

    assert.equal((await solicitar(`${API}/${eliminadaId}`)).status, 404);
    ok("PF-MS-19", "La tarea eliminada ya no existe (404)");

    // Casos de error del Gateway
    assert.equal((await solicitar(`${API}/${ID_INEXISTENTE}`, "DELETE")).status, 404);
    ok("PF-MS-20", "Eliminar tarea inexistente (404)");
    assert.equal((await solicitar(API, "PATCH")).status, 405);
    ok("PF-MS-21", "Metodo no permitido en el Gateway (405)");
    assert.equal((await solicitar(`${GATEWAY}/api/notificaciones/eventos`, "POST", {})).status, 400);
    ok("PF-MS-22", "Evento invalido rechazado por notificaciones (400)");

    console.log(`RESULTADO: ${comprobaciones} COMPROBACIONES MICROSERVICIOS APROBADAS`);
  } finally {
    if (id) await solicitar(`${API}/${id}`, "DELETE").catch(() => {});
    if (conexion) conexion.ws.close();
  }
});
