# T4.4 - Pruebas de rendimiento y escalabilidad (RQ14)

## Objetivo
Evaluar el comportamiento de Cliente-Servidor, P2P y Microservicios con 2, 5, 10 y 20 usuarios virtuales.

## Metodologia
Se ejecutaron simuladores de operaciones CRUD con cuatro mediciones iniciales por arquitectura y nivel de carga. Se realizo una medicion adicional de Microservicios con 20 usuarios para investigar un fallo. El medidor registro tiempos HTTP y metricas de recursos.

## Resultados
| Arquitectura | Usuarios | Ejecuciones | Validas | Fallidas | HTTP medio (ms) |
|---|---:|---:|---:|---:|---:|
| cs | 2 | 4 | 4 | 0 | 91,4 |
| cs | 5 | 4 | 4 | 0 | 169,89 |
| cs | 10 | 4 | 4 | 0 | 325,99 |
| cs | 20 | 4 | 4 | 0 | 399,7 |
| micro | 2 | 4 | 4 | 0 | 67,71 |
| micro | 5 | 4 | 4 | 0 | 139,49 |
| micro | 10 | 4 | 4 | 0 | 311,71 |
| micro | 20 | 5 | 4 | 1 | 910,97 |
| p2p | 2 | 4 | 4 | 0 | 118,72 |
| p2p | 5 | 4 | 4 | 0 | 216,43 |
| p2p | 10 | 4 | 4 | 0 | 309,09 |
| p2p | 20 | 4 | 4 | 0 | 554,24 |

## Incidencia detectada
De 49 ejecuciones, 48 fueron validas y una fallo. En Microservicios con 20 usuarios, una ejecucion registro 72 operaciones correctas y 28 incorrectas: 14 DELETE con error fetch failed y 14 verificaciones que devolvieron HTTP 200. Una repeticion adicional completo 100 de 100 operaciones sin errores. La causa exacta del fallo no fue determinada.

## Conclusiones
Los tiempos de respuesta aumentaron al incrementar los usuarios. Con 20 usuarios, Cliente-Servidor obtuvo el menor tiempo HTTP medio de las tres arquitecturas. Microservicios presento una incidencia intermitente bajo carga. Las metricas individuales de CPU y RAM estan conservadas en los archivos JSON.

## Limitaciones
Las pruebas se realizaron en un entorno local. Microservicios registra una verificacion adicional por usuario, por lo que las comparaciones entre arquitecturas son orientativas. Las pruebas P2P utilizaron usuarios virtuales distribuidos entre dos nodos; no demuestran escalabilidad a 20 nodos reales.

## Evidencias
Consultar resumen-t4.4.csv y los archivos JSON de pruebas/T4.4/resultados.

