# T4.3 - Pruebas funcionales de microservicios

## Objetivo
Verificar las operaciones CRUD, la integracion del API Gateway, las notificaciones WebSocket, las validaciones HTTP y la tolerancia a fallos.

## Resultados de pruebas
| Prueba | Resultado observado | Estado |
|---|---|---|
| Crear tarea | Creacion correcta, version 1 | APROBADO |
| Consultar tarea | ID y titulo coinciden | APROBADO |
| Actualizar tarea | Estado en_progreso, version 2 | APROBADO |
| Eliminar tarea | HTTP 204 | APROBADO |
| Consultar tarea eliminada | HTTP 404 | APROBADO |
| Eliminar tarea inexistente | HTTP 404 | APROBADO |
| Titulo vacio | HTTP 400 | APROBADO |
| Titulo numerico | HTTP 400 | APROBADO |
| Estado invalido | HTTP 400 | APROBADO |
| Evento invalido | HTTP 400 | APROBADO |
| Evento valido mediante Gateway | HTTP 202 | APROBADO |
| WebSocket - crear tarea | Evento tarea:creada recibido | APROBADO |
| WebSocket - actualizar tarea | Evento tarea:actualizada recibido | APROBADO |
| WebSocket - eliminar tarea | Evento tarea:eliminada recibido | APROBADO |
| Tareas sin servicio de notificaciones | Tarea creada y consultada correctamente | APROBADO |
| Gateway con notificaciones detenido | HTTP 502 | APROBADO |
| Recuperacion de notificaciones | Estado ok mediante servicio y Gateway | APROBADO |
| Compilacion de tareas, Gateway y notificaciones | Sin errores | APROBADO |
| ESLint de tareas, Gateway y notificaciones | Sin errores | APROBADO |

## Evidencias
Archivo estado-servicios.txt: respuestas de salud de los tres servicios.
Pruebas HTTP ejecutadas mediante PowerShell.
Notificaciones WebSocket verificadas visualmente en la pagina de demostracion.
Prueba de tolerancia a fallos realizada deteniendo y recuperando notificaciones.

## Conclusion
Las pruebas funcionales manuales ejecutadas fueron satisfactorias. Se verifico la comunicacion entre servicios, la validacion de solicitudes, la difusion de eventos en tiempo real y la continuidad del servicio de tareas ante una interrupcion de notificaciones.

Nota: El proyecto no dispone actualmente de una bateria automatizada de pruebas configurada en los scripts npm.
