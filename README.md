# Prototipo de Microservicios

Prototipo basado en Microservicios para el sistema colaborativo de gestión de tareas del proyecto de Servicios Telemáticos.

En el Sprint 1 se implementó el microservicio independiente de tareas.

Los demás servicios y la comunicación entre ellos se incorporarán progresivamente durante los siguientes sprints.

## Requisitos

Para ejecutar el proyecto localmente se necesita:

- Git
- Node.js 26.x
- npm 12.x

Para utilizar contenedores:

- Docker
- Docker Compose

En Windows se recomienda utilizar Git, Node.js y Docker Desktop.

## Entorno probado

El proyecto fue probado con:

- Node.js 26.10.0
- npm 12.1.0
- TypeScript 5.9.x
- Express 5.2.1
- ESLint 10.12.x
- tsx 4.23.x
- Docker 29.9.0
- Docker Compose 5.6.0

El Dockerfile utiliza:

```text
node:26-alpine
```

## Instalación

Clonar el repositorio:

```bash
git clone https://github.com/FabriCordovaCaceres/servicios-telematicos-microservicios.git
```

Entrar al proyecto:

```bash
cd servicios-telematicos-microservicios
```

Instalar dependencias:

```bash
npm ci
```

## Verificación

```bash
npm run lint
npm run build
```

## Desarrollo

```bash
npm run dev
```

El microservicio se ejecutará en:

```text
http://localhost:5001
```

## Ejecución compilada

```bash
npm run build
npm start
```

## Microservicio de tareas

Puerto:

```text
5001
```

Endpoints generales:

```text
GET /        Información del servicio
GET /health  Estado del microservicio
```

Endpoints de tareas:

```text
GET    /tasks
GET    /tasks/:id
POST   /tasks
PUT    /tasks/:id
DELETE /tasks/:id
```

## Comprobar el servicio

```bash
curl http://localhost:5001/
```

Comprobar el estado:

```bash
curl http://localhost:5001/health
```

Resultado esperado:

```json
{
  "servicio": "tareas",
  "estado": "ok"
}
```

Listar tareas:

```bash
curl http://localhost:5001/tasks
```

## Crear una tarea

```bash
curl -X POST http://localhost:5001/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "titulo":"Tarea microservicios",
    "descripcion":"Prueba del servicio de tareas",
    "updatedBy":"usuario-1"
  }'
```

## Docker

Construir:

```bash
docker build -t tele-microservicios .
```

Ejecutar:

```bash
docker run --rm \
  -p 5001:5001 \
  --name tele-micro-tareas \
  tele-microservicios
```

Comprobar:

```bash
curl http://localhost:5001/
curl http://localhost:5001/health
curl http://localhost:5001/tasks
```

## Almacenamiento

Actualmente el microservicio almacena las tareas en memoria.

Los datos se pierden cuando se reinicia el servicio.

Esto se utiliza en esta etapa para mantener condiciones similares entre los prototipos que serán comparados.

## Virtualizacion

 **Guía completa paso a paso:** [VIRTUALIZACION.md](https://github.com/FabriCordovaCaceres/servicios-telematicos-cliente-servidor/blob/main/docs/VIRTUALIZACION.md) (en el repositorio de Cliente-Servidor).

### Topología

| VM | IP | Servicios |
|---|---|---|
| VM1 `vm1-cs-p2p` | 192.168.56.11 | Cliente-Servidor :3000 + P2P nodo-1 :4001 |
| VM2 `vm2-p2p-micro` | 192.168.56.12 | P2P nodo-2 :4002 + **Microservicio de tareas :5001** |

### Desplegar este prototipo en VM2

Dentro de VM2 (`ssh grupo10@192.168.56.12`):

```bash
mkdir -p ~/proyecto && cd ~/proyecto
git clone https://github.com/FabriCordovaCaceres/servicios-telematicos-microservicios.git
cd ~/proyecto/servicios-telematicos-microservicios
docker build -t tele-microservicios .
docker run -d --name tele-micro-tareas --restart unless-stopped -p 5001:5001 tele-microservicios
```

Comprobar desde VM1 (a través de la red):

```bash
curl http://192.168.56.12:5001/health
curl http://192.168.56.12:5001/tasks
```

### Actualizar tras un cambio en GitHub

```bash
cd ~/proyecto/servicios-telematicos-microservicios
git pull
docker build -t tele-microservicios .
docker rm -f tele-micro-tareas
docker run -d --name tele-micro-tareas --restart unless-stopped -p 5001:5001 tele-microservicios
```

---

## Sprint 2 — Servicio de notificaciones por WebSocket (RQ9)

Ahora el sistema tiene dos microservicios independientes:

| Servicio | Carpeta | Puerto | Función |
|---|---|---|---|
| Tareas | raíz del repositorio | 5001 | CRUD de tareas (API REST) |
| Notificaciones | `notificaciones/` | 5002 | Difunde por WebSocket cada cambio a los clientes |

Cada cambio en el servicio de tareas se envía por HTTP (`POST /eventos`) al servicio
de notificaciones, que lo reenvía por WebSocket (`ws://<servidor>:5002/ws`).
**Si el servicio de notificaciones está caído, el CRUD de tareas sigue funcionando.**

### Desplegar en VM2

```bash
cd ~/proyecto/servicios-telematicos-microservicios
git pull
docker network create tele-red            # solo la primera vez
docker build -t tele-micro-notificaciones ./notificaciones
docker build -t tele-microservicios .
docker rm -f tele-micro-tareas tele-micro-notificaciones
docker run -d --name tele-micro-notificaciones --network tele-red --restart unless-stopped -p 5002:5002 tele-micro-notificaciones
docker run -d --name tele-micro-tareas --network tele-red --restart unless-stopped -p 5001:5001 \
  -e NOTIFICACIONES_URL=http://tele-micro-notificaciones:5002 tele-microservicios
```

### Probarlo

- Navegador: `http://192.168.56.12:5002/demo/` (muestra los eventos en vivo).
- Consola: `docker exec -it tele-micro-notificaciones node dist/tools/escuchar.js ws://localhost:5002/ws`
- Crear una tarea: `curl -X POST http://192.168.56.12:5001/tasks -H "Content-Type: application/json" -d '{"titulo":"Tarea micro","updatedBy":"vm1"}'`

### Nuevos archivos

`src/events/task.events.ts`, `src/notificaciones/notificador.ts`, carpeta `notificaciones/`
(servicio completo con su `package.json`, `Dockerfile` y `src/`). Se modificaron
`src/services/task.service.ts`, `src/index.ts` y `tsconfig.json` (ahora con `"include": ["src"]`
para no compilar la carpeta `notificaciones/` dentro del servicio de tareas).

---

## Sprint 3 — API Gateway (RQ8), concurrencia (RQ11) y métricas (RQ12)

| Servicio | Carpeta | Puerto | Función |
|---|---|---|---|
| API Gateway | `gateway/` | 6001 | Punto de entrada único: `/api/tareas` → servicio de tareas, `/api/notificaciones/...` → notificaciones |
| Tareas | raíz del repositorio | 5001 | CRUD de tareas |
| Notificaciones | `notificaciones/` | 5002 | Difusión de eventos por WebSocket |

> Se usa el puerto **6001** (y no 6000) porque los navegadores bloquean el 6000 (`ERR_UNSAFE_PORT`).
> Limitación: el Gateway reenvía solo HTTP; los clientes WebSocket siguen conectándose a `ws://<VM2>:5002/ws`.

### Desplegar el Gateway en VM2

```bash
cd ~/proyecto/servicios-telematicos-microservicios
git pull
docker build -t tele-api-gateway ./gateway
docker rm -f tele-api-gateway
docker run -d --name tele-api-gateway --network tele-red --restart unless-stopped -p 6001:6001 \
  -e GATEWAY_PORT=6001 \
  -e TAREAS_URL=http://tele-micro-tareas:5001 \
  -e NOTIFICACIONES_URL=http://tele-micro-notificaciones:5002 \
  tele-api-gateway
```

Probar: `curl http://192.168.56.12:6001/health` y `curl http://192.168.56.12:6001/api/tareas`.

### Simulación y métricas contra las máquinas virtuales

Desde el equipo anfitrión (Windows, con Node.js y los tres repositorios en la misma carpeta):

```powershell
# Requisito (una sola vez): acceso SSH sin contraseña a VM1 y VM2
ssh-keygen -t ed25519
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh grupo10@192.168.56.11 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh grupo10@192.168.56.12 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"

# Medir (desde servicios-telematicos-microservicios)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir-vm.ps1 -Arquitectura cs -Usuarios 2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir-vm.ps1 -Arquitectura p2p -Usuarios 3
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir-vm.ps1 -Arquitectura micro -Usuarios 5
```

`medir-vm.ps1` ejecuta el simulador de concurrencia apuntando a las IP de las VMs
(`SERVIDORES` para Cliente-Servidor y P2P, `GATEWAY_URL` para Microservicios) y, al mismo tiempo,
registra la latencia TCP desde el anfitrión y el CPU, RAM y red de cada contenedor con `docker stats` (por SSH).
Los resultados se guardan en `metricas/resultados/metricas-vm-*.json`. El script `medir.ps1` original
se conserva para la ejecución local (localhost).

## Sprint 4 — Pruebas funcionales y no funcionales (RQ13, RQ14)

| Tarea | Archivo | Qué prueba |
|---|---|---|
| T4.3 | `pruebas/T4.3/funcionales-t4.3.test.mjs` (y `RESULTADOS.md`, pruebas manuales) | Salud de los servicios, CRUD por el Gateway, validaciones, eventos WebSocket y errores del Gateway (22 comprobaciones) |
| T4.4 | `simulacion/rendimiento-t4.4.mjs`, `metricas/medir-t4.4.ps1`, `metricas/medir-vm.ps1 -Tarea T4.4` | Rendimiento con 2, 5, 10 y 20 usuarios en las tres arquitecturas |
| T4.5 | `pruebas/T4.5/comunicacion-t4.5.mjs` | Interrupción del cliente WebSocket, reconexión y eventos duplicados |
| T4.6 | `pruebas/T4.6/seguridad-t4.6.mjs`, `pruebas/T4.6/fallos-t4.6.mjs` | Validación de entradas, puertos, TLS y tolerancia a fallos de cada servicio |

```powershell
npm test                                              # local (localhost)
$env:GATEWAY_URL="http://192.168.56.12:6001"           # entorno virtualizado (VM2)
$env:TAREAS_URL="http://192.168.56.12:5001"
$env:NOTIFICACIONES_URL="http://192.168.56.12:5002"
npm test
node pruebas/T4.5/comunicacion-t4.5.mjs
node pruebas/T4.6/seguridad-t4.6.mjs
node pruebas/T4.6/fallos-t4.6.mjs                      # pide detener/reiniciar tareas y notificaciones (docker stop/start)

# Rendimiento T4.4 contra las VMs (2, 5, 10 o 20 usuarios)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir-vm.ps1 -Tarea T4.4 -Arquitectura micro -Usuarios 20 -Repeticiones 3
```

`medir-vm.ps1 -Tarea T4.4` guarda los resultados en `pruebas/T4.4/resultados-vm/`. Sin `-Tarea` funciona como en el Sprint 3.
Si una operación falla por la red, el simulador de T4.4 registra también el código interno del error (por ejemplo `ECONNRESET`).

Cambios del Sprint 4 en los servicios:
- **CORS en el Gateway** (`gateway/src/cors.ts`): permite que la interfaz gráfica consuma la API.
- **Validación:** el servicio de tareas rechaza con HTTP 400 un título compuesto solo de espacios en `POST` y `PUT`.
