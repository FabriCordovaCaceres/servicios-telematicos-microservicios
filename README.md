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
