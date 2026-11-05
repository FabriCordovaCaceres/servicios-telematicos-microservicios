# T4.5 - Pruebas de comunicacion: Microservicios

Requisito: RQ14

## Objetivo
Evaluar interrupcion de notificaciones, duplicacion y reconexion WebSocket.

## Resultados
- Conexion inicial: OK. Cliente WebSocket conectado.
- Interrupcion: OBSERVADO. Las operaciones CRUD continuaron durante la desconexion del cliente.
- Reconexion: SIN REENVIO en la ejecucion definitiva. No se observaron eventos antiguos reenviados.
- Recuperacion de datos: la tarea permanecio disponible mediante GET.
- Eventos nuevos: OK. Se recibieron notificaciones posteriores a la reconexion.
- Duplicacion: NO MITIGADO. Dos eventos identicos generaron dos notificaciones.

## Evidencia
- resultados/micro-44f4b3ff.json

## Conclusion
La comunicacion se restablece, pero no se garantiza recuperar eventos perdidos ni evitar notificaciones duplicadas.
