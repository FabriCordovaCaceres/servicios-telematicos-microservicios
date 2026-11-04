/* global process, URL, setTimeout, clearTimeout, console, fetch, AbortSignal, WebSocket */
/* T4.5 / RQ14 - Microservicios: interrupcion, duplicacion y reconexion de notificaciones.
   Requiere Node.js 22+ (WebSocket global). No detiene ni modifica servicios. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:6001';
const NOTIFICACIONES = process.env.NOTIFICACIONES_URL ?? 'http://localhost:5002';
const WS_URL = new URL('/ws', NOTIFICACIONES.replace(/^http/, 'ws')).toString();
const ID = randomUUID().slice(0, 8);
const resultados = [];
const creadas = [];
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function anotar(prueba, resultado, detalle) {
  resultados.push({ prueba, resultado, detalle });
  console.log(`[${resultado}] ${prueba}: ${detalle}`);
}
function exigir(condicion, mensaje) { if (!condicion) throw new Error(mensaje); }
async function pedir(base, metodo, ruta, cuerpo) {
  const respuesta = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(7000),
  });
  const texto = await respuesta.text();
  let datos = null;
  if (texto) { try { datos = JSON.parse(texto); } catch { datos = texto; } }
  return { codigo: respuesta.status, datos };
}
async function hasta(condicion, maxMs = 5000) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    if (await condicion()) return true;
    await esperar(75);
  }
  return false;
}
function conectar() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const mensajes = [];
    const temporizador = setTimeout(() => reject(new Error(`Sin conexion WebSocket: ${WS_URL}`)), 6000);
    ws.addEventListener('message', (evento) => {
      try { mensajes.push(JSON.parse(String(evento.data))); } catch { /* mensaje no JSON */ }
    });
    ws.addEventListener('open', () => { clearTimeout(temporizador); resolve({ ws, mensajes }); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(temporizador); reject(new Error(`Error WebSocket: ${WS_URL}`)); }, { once: true });
  });
}
async function cerrar(conexion) {
  if (!conexion) return;
  if (conexion.ws.readyState === WebSocket.OPEN) conexion.ws.close();
  await hasta(() => conexion.ws.readyState === WebSocket.CLOSED, 1800);
}
function guardar() {
  const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'resultados');
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `micro-${ID}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ requisito: 'RQ14', tarea: 'T4.5', arquitectura: 'microservicios', fecha: new Date().toISOString(), ejecucion: ID, resultados }, null, 2));
  console.log(`\nEvidencia: ${archivo}`);
}
async function main() {
  exigir(typeof WebSocket === 'function', 'Se requiere Node.js 22+ para WebSocket global.');
  console.log(`\nT4.5 Microservicios | ${GATEWAY} | ejecucion ${ID}`);
  let conexion;
  try {
    exigir((await pedir(GATEWAY, 'GET', '/health')).codigo === 200, 'Gateway 6001 no disponible.');
    exigir((await pedir(NOTIFICACIONES, 'GET', '/health')).codigo === 200, 'Notificaciones 5002 no disponible.');
    conexion = await conectar();
    exigir(await hasta(() => conexion.mensajes.some((m) => m.tipo === 'conexion')), 'No llego mensaje de bienvenida.');
    anotar('Conexion inicial', 'OK', 'WebSocket del notificador conectado.');

    await cerrar(conexion);
    conexion = undefined;
    const perdida = await pedir(GATEWAY, 'POST', '/api/tareas', { titulo: `T4.5-MICRO-PERDIDA-${ID}`, descripcion: 'Cliente WS desconectado' });
    exigir(perdida.codigo === 201 && perdida.datos?.id, 'No se pudo crear tarea mientras WS estaba desconectado.');
    creadas.push(perdida.datos.id);
    await esperar(2500);
    anotar('Interrupcion de notificaciones', 'OBSERVADO', 'El CRUD crea la tarea aunque el cliente WS este desconectado.');

    conexion = await conectar();
    exigir(await hasta(() => conexion.mensajes.some((m) => m.tipo === 'conexion')), 'No se reconecto el cliente WebSocket.');
    await esperar(900);
    const reenviados = conexion.mensajes.filter((m) => m.tipo === 'tarea:creada' && m.tarea?.id === perdida.datos.id).length;
    const guardada = await pedir(GATEWAY, 'GET', `/api/tareas/${perdida.datos.id}`);
    exigir(guardada.codigo === 200 && guardada.datos?.id === perdida.datos.id, 'La tarea no esta disponible en el Gateway tras reconectar.');
    anotar('Reconexion y recuperacion', reenviados === 0 ? 'SIN_REENVIO' : 'CON_REENVIO', `Cliente WS reconectado; eventos antiguos reenviados: ${reenviados}; tarea consultable por GET.`);

    const activa = await pedir(GATEWAY, 'POST', '/api/tareas', { titulo: `T4.5-MICRO-ACTIVA-${ID}`, descripcion: 'Cliente WS conectado' });
    exigir(activa.codigo === 201 && activa.datos?.id, 'No se pudo crear tarea con WS conectado.');
    creadas.push(activa.datos.id);
    exigir(await hasta(() => conexion.mensajes.some((m) => m.tipo === 'tarea:creada' && m.tarea?.id === activa.datos.id)), 'No llego notificacion nueva tras reconectar.');
    anotar('Eventos nuevos tras reconexion', 'OK', 'Se reciben nuevas notificaciones, pero no se garantiza recuperar las perdidas.');

    const evento = { tipo: 'tarea:actualizada', origen: 'prueba-t4.5', enviadoEn: Date.now(), tarea: { id: `T4.5-DUP-${ID}`, titulo: `T4.5-DUP-${ID}` } };
    const e1 = await pedir(GATEWAY, 'POST', '/api/notificaciones/eventos', evento);
    const e2 = await pedir(GATEWAY, 'POST', '/api/notificaciones/eventos', evento);
    exigir(e1.codigo === 202 && e2.codigo === 202, `No se aceptaron ambos eventos duplicados: ${e1.codigo}, ${e2.codigo}`);
    exigir(await hasta(() => conexion.mensajes.filter((m) => m.tipo === 'tarea:actualizada' && m.tarea?.id === evento.tarea.id).length >= 2), 'No llegaron ambos eventos duplicados.');
    anotar('Mensajes duplicados', 'NO_MITIGADO', 'Dos POST /eventos identicos generan dos notificaciones WS; no hay deduplicacion.');
  } finally {
    await cerrar(conexion);
    for (const id of creadas) {
      try { const r = await pedir(GATEWAY, 'DELETE', `/api/tareas/${id}`); console.log(`Limpieza ${id}: HTTP ${r.codigo}`); }
      catch (error) { console.warn(`No se pudo limpiar ${id}: ${error.message}`); }
    }
    guardar();
  }
}
main().catch((error) => { anotar('Ejecucion', 'ERROR', error.message); guardar(); process.exitCode = 1; });
