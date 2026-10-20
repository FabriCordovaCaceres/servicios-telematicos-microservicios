import { onTaskEvent } from "../events/task.events";
import type { TaskEvent } from "../events/task.events";

// Dirección del microservicio de notificaciones.
// En Docker Compose: http://micro-notificaciones:5002
const URL_NOTIFICACIONES =
  process.env.NOTIFICACIONES_URL ?? "http://localhost:5002";

const ORIGEN = "servicio-tareas";
const TIEMPO_MAXIMO_MS = 2000;

async function publicar(evento: TaskEvent): Promise<void> {
  try {
    const respuesta = await fetch(`${URL_NOTIFICACIONES}/eventos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...evento,
        origen: ORIGEN,
        enviadoEn: Date.now(),
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });

    if (!respuesta.ok) {
      console.warn(
        `Notificaciones respondió ${respuesta.status} al evento ${evento.tipo}`,
      );
    }
  } catch (error) {
    // Si el servicio de notificaciones está caído, el CRUD de tareas sigue
    // funcionando: los servicios son independientes (tolerancia a fallos).
    const motivo = error instanceof Error ? error.message : String(error);
    console.warn(`No se pudo notificar ${evento.tipo}: ${motivo}`);
  }
}

export function iniciarNotificador(): void {
  onTaskEvent((evento) => {
    void publicar(evento);
  });

  console.log(`Notificador activo. Servicio de notificaciones: ${URL_NOTIFICACIONES}`);
}
