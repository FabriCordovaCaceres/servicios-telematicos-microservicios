import { EventEmitter } from "node:events";
import type { Task } from "../models/task";

// Eventos que genera el servicio de tareas cada vez que cambia algo.
// El notificador (src/notificaciones/notificador.ts) se suscribe a estos
// eventos y los envía al microservicio de notificaciones.
export type TaskEvent =
  | { tipo: "tarea:creada"; tarea: Task }
  | { tipo: "tarea:actualizada"; tarea: Task }
  | {
      tipo: "tarea:eliminada";
      id: string;
      version: number;
      updatedAt: number;
      updatedBy: string;
    };

const emisor = new EventEmitter();

export function emitTaskEvent(evento: TaskEvent): void {
  emisor.emit("evento", evento);
}

export function onTaskEvent(listener: (evento: TaskEvent) => void): void {
  emisor.on("evento", listener);
}
