# T4.6 - Seguridad y tolerancia a fallos: Microservicios

Requisito: RQ14

## Objetivo
Comprobar validacion de entradas, puertos, TLS verificado y recuperacion tras interrupciones controladas.

## Alcance y limitaciones
- Entorno virtualizado (direcciones por variables de entorno). No son una auditoria de seguridad externa.
- Los procesos se detuvieron y reiniciaron manualmente; no se ha demostrado alta disponibilidad automatica.
- Una conexion TLS local no verificada no demuestra ausencia de HTTPS en un despliegue con proxy inverso.
- Los resultados HALLAZGO y OBSERVADO documentan limitaciones y no se ocultan.

## Seguridad
Evidencia: evidencias/vm-seguridad-micro-365fec62.json

| Prueba | Estado | Resultado observado |
|---|---|---|
| Gateway: servicio disponible | OK | 200 |
| Gateway: cabeceras HTTP | OBSERVADO | {"x-powered-by":"Express","x-content-type-options":null,"strict-transport-security":null} |
| Gateway: ID inexistente | OK | 404 |
| Gateway: POST sin titulo | OK | 400 |
| Gateway: POST titulo numerico | OK | 400 |
| Gateway: POST titulo vacio | OK | 400 |
| Gateway: JSON malformado | OK | 400 |
| Gateway: crear tarea temporal | OK | 201 |
| Gateway: PUT titulo solo espacios | OK | 400 |
| Gateway: PUT estado invalido | OK | 400 |
| Gateway: eliminar tarea temporal | OK | 204 |
| Gateway: titulo solo espacios | OK | 400 |
| Gateway: metodo PATCH prohibido | OK | 405 |
| Servicio de tareas directo: servicio disponible | OK | 200 |
| Servicio de tareas directo: cabeceras HTTP | OBSERVADO | {"x-powered-by":"Express","x-content-type-options":null,"strict-transport-security":null} |
| Servicio de tareas directo: ID inexistente | OK | 404 |
| Servicio de tareas directo: POST sin titulo | OK | 400 |
| Servicio de tareas directo: POST titulo numerico | OK | 400 |
| Servicio de tareas directo: POST titulo vacio | OK | 400 |
| Servicio de tareas directo: JSON malformado | OK | 400 |
| Servicio de tareas directo: crear tarea temporal | OK | 201 |
| Servicio de tareas directo: PUT titulo solo espacios | OK | 400 |
| Servicio de tareas directo: PUT estado invalido | OK | 400 |
| Servicio de tareas directo: eliminar tarea temporal | OK | 204 |
| Servicio de tareas directo: titulo solo espacios | OK | 400 |
| Puerto 5001 en 192.168.56.12 | OK | ABIERTO |
| TLS verificado 5001 | OBSERVADO | ERR_SSL_WRONG_VERSION_NUMBER |
| Puerto 5002 en 192.168.56.12 | OK | ABIERTO |
| TLS verificado 5002 | OBSERVADO | ERR_SSL_WRONG_VERSION_NUMBER |
| Puerto 6001 en 192.168.56.12 | OK | ABIERTO |
| TLS verificado 6001 | OBSERVADO | ERR_SSL_WRONG_VERSION_NUMBER |

## Tolerancia a fallos
Evidencia: evidencias/vm-fallos-micro-23e31984.json

| Prueba | Estado | Resultado observado |
|---|---|---|
| Gateway 6001 antes del fallo | OK | 200 |
| Tareas 5001 antes del fallo | OK | 200 |
| Notificaciones 5002 antes del fallo | OK | 200 |
| Gateway tareas antes del fallo | OK | 200 |
| Gateway notificaciones antes del fallo | OK | 200 |
| Tareas 5001 detenido | OK | sin conexion |
| Gateway sigue vivo sin tareas | OK | 200 |
| Gateway responde a fallo de tareas | OK | 504 |
| Notificaciones siguen disponibles | OK | 200 |
| Tareas 5001 reiniciado | OK | 200 |
| Gateway recupera tareas | OK | 200 |
| Notificaciones 5002 detenido | OK | sin conexion |
| Gateway responde a fallo de notificaciones | OK | 504 |
| Tareas siguen disponibles | OK | 200 |
| Notificaciones 5002 reiniciado | OK | 200 |
| Gateway recupera notificaciones | OK | 200 |

## Conclusion
Los resultados muestran el comportamiento observado en el entorno virtualizado (direcciones por variables de entorno). Las debilidades detectadas deben documentarse como mejoras pendientes y no como controles implementados.
