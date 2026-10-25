# T3.6 — Integración y validación del módulo de métricas (RQ12)

## 1. Objetivo

Integrar el módulo de medición desarrollado en la tarea **T3.5** con los tres prototipos de Servicios Telemáticos (**Cliente-Servidor, P2P y Microservicios**) y verificar el registro independiente de métricas mediante simulaciones de concurrencia con **2, 3 y 5 usuarios virtuales**.

La integración de T3.6 se realiza mediante scripts de PowerShell que ejecutan el módulo central. **No se modifica el código de los endpoints ni se incorpora middleware de instrumentación dentro de los servicios.**

## 2. Organización del proyecto

Se utilizan tres repositorios hermanos dentro de la carpeta `Telematicos`:

```text
Telematicos/
├── servicios-telematicos-cliente-servidor/
│   ├── metricas/
│   │   └── registrar.ps1
│   └── simulacion/
│       └── concurrencia.mjs
├── servicios-telematicos-p2p/
│   ├── metricas/
│   │   └── registrar.ps1
│   └── simulacion/
│       └── concurrencia.mjs
└── servicios-telematicos-microservicios/
    ├── metricas/
    │   ├── medir.ps1
    │   ├── registrar.ps1
    │   ├── README.md
    │   └── resultados/          # Archivos JSON generados localmente
    └── simulacion/
        └── concurrencia.mjs
```

**Dependencia de rutas:** los scripts `registrar.ps1` de Cliente-Servidor y P2P localizan `medir.ps1` en el repositorio hermano de Microservicios. Para usarlos sin modificaciones, se debe conservar esta estructura de carpetas.

## 3. Requisitos

- Windows con PowerShell y Node.js instalados.
- Dependencias de los tres proyectos instaladas.
- Servicios de las tres arquitecturas iniciados antes de ejecutar las pruebas.
- Los siguientes puertos TCP deben estar disponibles:

| Puerto | Componente |
|---|---|
| `3000` | Cliente-Servidor |
| `4001` | P2P — nodo 1 |
| `4002` | P2P — nodo 2 |
| `5001` | Microservicios — tareas |
| `5002` | Microservicios — notificaciones |
| `6001` | Microservicios — API Gateway |

Verificar desde PowerShell:

```powershell
3000,4001,4002,5001,5002,6001 | ForEach-Object { $p=$_; [PSCustomObject]@{ Puerto=$p; Activo=(Test-NetConnection -ComputerName 127.0.0.1 -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue) } } | Format-Table -AutoSize
```

Todos deben mostrar `True` para una validación integral de los tres prototipos.

## 4. Ejecución de las pruebas

### 4.1. Cliente-Servidor

Desde `servicios-telematicos-cliente-servidor`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\registrar.ps1 -Usuarios 2 -Repeticiones 1
```

Para probar 2, 3 y 5 usuarios:

```powershell
2,3,5 | ForEach-Object { powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\registrar.ps1 -Usuarios $_ -Repeticiones 1 }
```

### 4.2. P2P

Desde `servicios-telematicos-p2p`:

```powershell
2,3,5 | ForEach-Object { powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\registrar.ps1 -Usuarios $_ -Repeticiones 1 }
```

### 4.3. Microservicios

Desde `servicios-telematicos-microservicios`:

```powershell
2,3,5 | ForEach-Object { powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\registrar.ps1 -Usuarios $_ -Repeticiones 1 }
```

### 4.4. Ejecución directa del módulo central

Desde `servicios-telematicos-microservicios`, también es posible medir cada arquitectura de forma independiente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir.ps1 -Arquitectura cs -Usuarios 5 -Repeticiones 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir.ps1 -Arquitectura p2p -Usuarios 5 -Repeticiones 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\metricas\medir.ps1 -Arquitectura micro -Usuarios 5 -Repeticiones 1
```

Los valores de `-Usuarios` utilizados en la validación fueron **2, 3 y 5**. `-Repeticiones` indica cuántas veces se ejecuta el escenario.

## 5. Métricas registradas

| Métrica | Descripción |
|---|---|
| Tiempo de respuesta HTTP medio (ms) | Promedio de duración de las operaciones HTTP registradas por el simulador |
| Latencia de conexión TCP media (ms) | Tiempo medio observado al establecer conexiones TCP de prueba |
| CPU media (%) | Uso estimado de CPU de los procesos asociados a los puertos monitoreados |
| RAM media (MB) | Memoria de los procesos asociados a la arquitectura |
| Tráfico de red | Actividad observada en interfaces de red del equipo durante la medición |
| Operaciones correctas y errores | Resultados de la simulación de concurrencia |
| Código de salida y validación | Resultado de ejecución del simulador y comprobación de operaciones esperadas |

**Limitaciones:** el tráfico de red medido a nivel de interfaz corresponde al equipo y no está aislado por aplicación. Las mediciones de CPU/RAM son muestras de procesos; no equivalen necesariamente al consumo total de contenedores, del sistema operativo o de dependencias externas. Los tiempos HTTP y TCP son métricas diferentes.

## 6. Resultados de la validación T3.6

Se ejecutó **una repetición por escenario** el **25 de octubre de 2026**, con los seis puertos activos.

| Arquitectura | Usuarios | Operaciones correctas / esperadas | Errores | Código de salida | Válido | HTTP medio (ms) | TCP medio (ms) | CPU media (%) |
|---|---:|---:|---:|---:|---|---:|---:|---:|
| Cliente-Servidor | 2 | 8/8 | 0 | 0 | Sí | 70.960 | 19.726 | 5.37 |
| Cliente-Servidor | 3 | 12/12 | 0 | 0 | Sí | 85.809 | 19.400 | 10.91 |
| Cliente-Servidor | 5 | 20/20 | 0 | 0 | Sí | 226.247 | 31.043 | 12.83 |
| P2P | 2 | 8/8 | 0 | 0 | Sí | 38.912 | 10.919 | 11.08 |
| P2P | 3 | 12/12 | 0 | 0 | Sí | 93.962 | 9.277 | 6.87 |
| P2P | 5 | 20/20 | 0 | 0 | Sí | 205.187 | 22.007 | 16.82 |
| Microservicios | 2 | 10/10 | 0 | 0 | Sí | 99.404 | 11.830 | 12.24 |
| Microservicios | 3 | 15/15 | 0 | 0 | Sí | 107.903 | 9.583 | 37.51 |
| Microservicios | 5 | 25/25 | 0 | 0 | Sí | 144.649 | 6.491 | 47.78 |

**Conclusión de validación:** los nueve escenarios completaron todas las operaciones esperadas, sin errores y con registros de métricas generados. Estos valores son mediciones puntuales de un entorno local y **no demuestran por sí solos la superioridad general de una arquitectura**. Para una comparación estadística más robusta, se requieren múltiples repeticiones y condiciones controladas.

## 7. Archivos de resultados

Los archivos se generan en:

```text
servicios-telematicos-microservicios/metricas/resultados/
```

Ejemplos de nombres:

```text
metricas-cs-2usuarios-<fecha-hora>-1.json
metricas-p2p-3usuarios-<fecha-hora>-1.json
metricas-micro-5usuarios-<fecha-hora>-1.json
```

Cada JSON conserva el registro correspondiente a una arquitectura, cantidad de usuarios y repetición. Los archivos de simulación se generan, por separado, en `simulacion/resultados/` del repositorio correspondiente.

Para consultar los últimos registros:

```powershell
Get-ChildItem .\metricas\resultados\metricas-*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 9 Name,LastWriteTime
```

Para revisar un resultado concreto:

```powershell
Get-ChildItem .\metricas\resultados\metricas-cs-5usuarios-*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Format-List }
```

## 8. Criterios de aceptación

Para cada escenario se comprueba:

- El simulador finaliza con **código de salida 0**.
- Se ejecutan **4 operaciones por usuario** en Cliente-Servidor y P2P (crear, leer, actualizar y eliminar).
- Se ejecutan **5 operaciones por usuario** en Microservicios (las cuatro anteriores y verificación de eliminación).
- El número de operaciones correctas coincide con el esperado.
- No se registran errores.
- Se genera un archivo JSON de métricas y la validación informa `CORRECTA`.

## 9. Publicación en GitHub

La documentación y el script de integración de Microservicios pertenecen a la rama `sprint3-integracion-metricas`:

```powershell
git branch --show-current
git add metricas/registrar.ps1 metricas/README.md
git diff --cached --name-only
git commit -m "T3.6 RQ12: documentar integracion y validacion de metricas"
git push -u origin sprint3-integracion-metricas
```

No incluir automáticamente resultados generados, respaldos ni archivos temporales mediante `git add .`.

---

**Proyecto:** Servicios Telemáticos  
**Sprint:** 3  
**Tarea:** T3.6  
**Requisito:** RQ12 — Registro y validación de métricas
