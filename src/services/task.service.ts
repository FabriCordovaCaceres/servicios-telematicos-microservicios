import { randomUUID } from "node:crypto";
import type { Task, TaskStatus } from "../models/task";
import { emitTaskEvent } from "../events/task.events";

const ORIGEN = "servicio-tareas";

const tasks: Task[] = [];

export function getTasks(): Task[] {
  return tasks;
}

export function getTaskById(id: string): Task | undefined {
  return tasks.find((task) => task.id === id);
}

export function createTask(
  titulo: string,
  descripcion: string,
  updatedBy: string,
): Task {
  const now = Date.now();

  const task: Task = {
    id: randomUUID(),
    titulo,
    descripcion,
    estado: "pendiente",
    createdAt: now,
    updatedAt: now,
    version: 1,
    updatedBy,
  };

  tasks.push(task);

  // Sprint 2: se avisa al servicio de notificaciones
  emitTaskEvent({ tipo: "tarea:creada", tarea: task });

  return task;
}

export function updateTask(
  id: string,
  data: {
    titulo?: string;
    descripcion?: string;
    estado?: TaskStatus;
    updatedBy: string;
  },
): Task | undefined {
  const task = getTaskById(id);

  if (!task) {
    return undefined;
  }

  if (data.titulo !== undefined) {
    task.titulo = data.titulo;
  }

  if (data.descripcion !== undefined) {
    task.descripcion = data.descripcion;
  }

  if (data.estado !== undefined) {
    task.estado = data.estado;
  }

  task.updatedAt = Date.now();
  task.updatedBy = data.updatedBy;
  task.version += 1;

  // Sprint 2: se avisa al servicio de notificaciones
  emitTaskEvent({ tipo: "tarea:actualizada", tarea: task });

  return task;
}

export function deleteTask(id: string): boolean {
  const index = tasks.findIndex((task) => task.id === id);
  const task = tasks[index];

  if (!task) {
    return false;
  }

  tasks.splice(index, 1);

  // Sprint 2: se avisa al servicio de notificaciones
  emitTaskEvent({
    tipo: "tarea:eliminada",
    id,
    version: task.version + 1,
    updatedAt: Date.now(),
    updatedBy: ORIGEN,
  });

  return true;
}
