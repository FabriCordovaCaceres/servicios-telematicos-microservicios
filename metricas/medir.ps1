param(
    [Parameter(Mandatory = $true)][ValidateSet('cs','p2p','micro')][string]$Arquitectura,
    [Parameter(Mandatory = $true)][ValidateSet(2,3,5)][int]$Usuarios,
    [ValidateRange(1,100)][int]$Repeticiones = 1,
    [ValidateRange(200,10000)][int]$IntervaloMs = 500
)

$ErrorActionPreference = 'Stop'
$raizMicro = Split-Path -Parent $PSScriptRoot
$raizTelematicos = Split-Path -Parent $raizMicro

$config = switch ($Arquitectura) {
    'cs'    { @{ Carpeta = (Join-Path $raizTelematicos 'servicios-telematicos-cliente-servidor'); Puertos = @(3000); Argumentos = @('cs'); Nombre = 'cs' } }
    'p2p'   { @{ Carpeta = (Join-Path $raizTelematicos 'servicios-telematicos-p2p'); Puertos = @(4001,4002); Argumentos = @('p2p'); Nombre = 'p2p' } }
    'micro' { @{ Carpeta = $raizMicro; Puertos = @(5001,5002,6001); Argumentos = @(); Nombre = 'microservicios' } }
}

$simulador = Join-Path $config.Carpeta 'simulacion\concurrencia.mjs'
$resultadosSimulador = Join-Path $config.Carpeta 'simulacion\resultados'
$salida = Join-Path $raizMicro 'metricas\resultados'

if (-not (Test-Path -LiteralPath $simulador -PathType Leaf)) { throw "No se encontro el simulador: $simulador" }
if (-not (Test-Path -LiteralPath $resultadosSimulador -PathType Container)) { throw "No existe la carpeta de resultados: $resultadosSimulador" }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -eq $node) { throw 'Node.js no esta disponible en PATH' }
$nodeExe = $node.Source
New-Item -ItemType Directory -Force -Path $salida | Out-Null

function Get-PuertoPids {
    $conexiones = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $config.Puertos -contains [int]$_.LocalPort })
    return @($conexiones | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -ExpandProperty OwningProcess -Unique)
}

function Get-CPUActual {
    $datos = @{}
    foreach ($idProceso in (Get-PuertoPids)) {
        $p = Get-Process -Id $idProceso -ErrorAction SilentlyContinue
        if ($null -ne $p) {
            $cpuSegundos = 0.0
            if ($null -ne $p.CPU) { $cpuSegundos = [double]$p.CPU }
            $datos[[string]$idProceso] = @{ cpuSegundos = $cpuSegundos; ramBytes = [long]$p.WorkingSet64; nombre = $p.ProcessName }
        }
    }
    return $datos
}

function Get-RedActual {
    [long]$rx = 0
    [long]$tx = 0
    $nombres = @()
    $adaptadores = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -and $_.HardwareInterface })
    foreach ($adaptador in $adaptadores) {
        $estadisticas = Get-NetAdapterStatistics -Name $adaptador.Name -ErrorAction SilentlyContinue
        if ($null -ne $estadisticas) {
            $rx += [long]$estadisticas.ReceivedBytes
            $tx += [long]$estadisticas.SentBytes
            $nombres += $adaptador.Name
        }
    }
    return @{ recibidos = $rx; enviados = $tx; adaptadores = @($nombres) }
}

function Get-LatenciaTcpMs([int]$puerto) {
    $cliente = New-Object System.Net.Sockets.TcpClient
    $reloj = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $cliente.Connect('127.0.0.1', $puerto)
        $reloj.Stop()
        return [math]::Round($reloj.Elapsed.TotalMilliseconds, 3)
    } catch {
        return $null
    } finally {
        $cliente.Dispose()
    }
}

function Promedio($lista) {
    $valores = @($lista | Where-Object { $null -ne $_ })
    if ($valores.Count -eq 0) { return $null }
    return [math]::Round([double](($valores | Measure-Object -Average).Average), 3)
}

$fallos = 0
for ($repeticion = 1; $repeticion -le $Repeticiones; $repeticion++) {
    $pidsInicio = @(Get-PuertoPids)
    $puertosActivos = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $config.Puertos -contains [int]$_.LocalPort } | Select-Object -ExpandProperty LocalPort -Unique)
    $faltantes = @($config.Puertos | Where-Object { $puertosActivos -notcontains $_ })
    if ($faltantes.Count -gt 0) { throw "Faltan servicios en los puertos: $($faltantes -join ', '). Inicia los servicios correspondientes." }

    $anteriores = @((Get-ChildItem -Path $resultadosSimulador -Filter '*.json' -File -ErrorAction SilentlyContinue).FullName)
    $argumentos = @($simulador) + @($config.Argumentos) + @([string]$Usuarios)
    $argumentosEscapados = @($argumentos | ForEach-Object { '"' + ([string]$_ -replace '"','\"') + '"' }) -join ' '

    $inicioProceso = New-Object System.Diagnostics.ProcessStartInfo
    $inicioProceso.FileName = $nodeExe
    $inicioProceso.Arguments = $argumentosEscapados
    $inicioProceso.WorkingDirectory = $config.Carpeta
    $inicioProceso.UseShellExecute = $false
    $inicioProceso.CreateNoWindow = $false
    $proceso = New-Object System.Diagnostics.Process
    $proceso.StartInfo = $inicioProceso

    Write-Host "Iniciando $Arquitectura con $Usuarios usuarios; repeticion $repeticion/$Repeticiones" -ForegroundColor Cyan
    $muestras = New-Object 'System.Collections.Generic.List[object]'
    $cpuAnterior = Get-CPUActual
    $redAnterior = Get-RedActual
    $tiempoAnterior = Get-Date
    $inicio = Get-Date
    $codigoSalida = $null
    try {
        if (-not $proceso.Start()) { throw 'No se pudo iniciar el simulador Node.js.' }
        do {
            Start-Sleep -Milliseconds $IntervaloMs
            $ahora = Get-Date
            $cpuActual = Get-CPUActual
            $redActual = Get-RedActual
            $segundos = [math]::Max(($ahora - $tiempoAnterior).TotalSeconds, 0.001)
            $deltaCpu = 0.0
            [long]$ram = 0
            foreach ($idProceso in $cpuActual.Keys) {
                $ram += [long]$cpuActual[$idProceso].ramBytes
                if ($cpuAnterior.ContainsKey($idProceso)) {
                    $deltaCpu += [math]::Max(0.0, ([double]$cpuActual[$idProceso].cpuSegundos - [double]$cpuAnterior[$idProceso].cpuSegundos))
                }
            }
            $cpuPorcentaje = [math]::Round(100.0 * $deltaCpu / ($segundos * [Environment]::ProcessorCount), 2)
            $latencias = @{}
            foreach ($puerto in $config.Puertos) { $latencias[[string]$puerto] = Get-LatenciaTcpMs $puerto }
            $muestras.Add([PSCustomObject]@{
                instante = $ahora.ToString('o')
                cpuPorcentajeProcesos = $cpuPorcentaje
                ramBytesProcesos = $ram
                redRecibidosBytesDeltaEquipo = [math]::Max(0, ([long]$redActual.recibidos - [long]$redAnterior.recibidos))
                redEnviadosBytesDeltaEquipo = [math]::Max(0, ([long]$redActual.enviados - [long]$redAnterior.enviados))
                latenciaTcpMsPorPuerto = $latencias
                procesos = @($cpuActual.Keys)
            })
            $cpuAnterior = $cpuActual
            $redAnterior = $redActual
            $tiempoAnterior = $ahora
            $proceso.Refresh()
        } while (-not $proceso.HasExited)
        $proceso.WaitForExit()
        $codigoSalida = [int]$proceso.ExitCode
    } finally {
        $proceso.Dispose()
    }
    $final = Get-Date

    $nuevos = @(Get-ChildItem -Path $resultadosSimulador -Filter '*.json' -File | Where-Object { $anteriores -notcontains $_.FullName -and $_.LastWriteTime -ge $inicio.AddSeconds(-2) } | Sort-Object LastWriteTime -Descending)
    $jsonSimulador = $null
    $archivoSimulador = $null
    foreach ($archivoCandidato in $nuevos) {
        try {
            $candidato = Get-Content -LiteralPath $archivoCandidato.FullName -Raw | ConvertFrom-Json
            if ([int]$candidato.usuarios -eq $Usuarios -and $candidato.arquitectura -eq $config.Nombre) {
                $jsonSimulador = $candidato
                $archivoSimulador = $archivoCandidato.FullName
                break
            }
        } catch { }
    }

    $listaMuestras = @($muestras.ToArray())
    $latenciasTodas = @()
    foreach ($muestra in $listaMuestras) {
        foreach ($puerto in $config.Puertos) { $latenciasTodas += $muestra.latenciaTcpMsPorPuerto[[string]$puerto] }
    }
    $cpuValores = @($listaMuestras | ForEach-Object { $_.cpuPorcentajeProcesos })
    $ramValores = @($listaMuestras | ForEach-Object { $_.ramBytesProcesos })
    $respuestaMs = @()
    if ($null -ne $jsonSimulador -and $null -ne $jsonSimulador.resultados) {
        $respuestaMs = @($jsonSimulador.resultados | Where-Object { $null -ne $_.duracionMs } | ForEach-Object { [double]$_.duracionMs })
    }

    $esperadas = if ($Arquitectura -eq 'micro') { $Usuarios * 5 } else { $Usuarios * 4 }
    $correctas = if ($null -ne $jsonSimulador) { [int]$jsonSimulador.correctas } else { $null }
    $errores = if ($null -ne $jsonSimulador) { [int]$jsonSimulador.errores } else { $null }
    $operacionesRegistradas = if ($null -ne $jsonSimulador) { [int]$jsonSimulador.operacionesRegistradas } else { $null }
    $valido = ($codigoSalida -eq 0 -and $null -ne $jsonSimulador -and $correctas -eq $esperadas -and $operacionesRegistradas -eq $esperadas -and $errores -eq 0 -and $respuestaMs.Count -eq $esperadas)

    $resumen = [ordered]@{
        requisito = 'RQ12'
        tarea = 'T3.5'
        arquitectura = $Arquitectura
        usuarios = $Usuarios
        repeticion = $repeticion
        inicio = $inicio.ToString('o')
        fin = $final.ToString('o')
        duracionTotalMs = [math]::Round(($final - $inicio).TotalMilliseconds, 2)
        codigoSalidaSimulador = $codigoSalida
        archivoSimulador = $archivoSimulador
        operacionesEsperadas = $esperadas
        operacionesRegistradas = $operacionesRegistradas
        correctas = $correctas
        errores = $errores
        valido = $valido
        tiempoRespuestaMedioMs = Promedio $respuestaMs
        latenciaConexionTcpMediaMs = Promedio $latenciasTodas
        cpuMediaPorcentajeProcesos = Promedio $cpuValores
        ramMediaMBProcesos = $(if ($ramValores.Count -gt 0) { [math]::Round(([double](($ramValores | Measure-Object -Average).Average) / 1MB), 2) } else { $null })
        redRecibidaBytesEquipo = [long](($listaMuestras | Measure-Object -Property redRecibidosBytesDeltaEquipo -Sum).Sum)
        redEnviadaBytesEquipo = [long](($listaMuestras | Measure-Object -Property redEnviadosBytesDeltaEquipo -Sum).Sum)
        puertosObservados = @($config.Puertos)
        pidsIniciales = @($pidsInicio)
        notas = @(
            'Tiempo de respuesta HTTP: promedio de resultados[].duracionMs del simulador.',
            'Latencia: tiempo de conexion TCP a localhost, no es el tiempo HTTP.',
            'CPU y RAM: procesos que escuchan en los puertos configurados; CPU normalizada por nucleos logicos.',
            'Red: bytes de adaptadores fisicos del equipo, no incluye necesariamente trafico localhost ni aisla el servicio.',
            'CPU igual a cero puede significar consumo muy bajo o muestreo insuficiente; no equivale a ausencia de actividad.'
        )
        muestras = $listaMuestras
    }
    $nombre = 'metricas-{0}-{1}usuarios-{2}-{3}.json' -f $Arquitectura,$Usuarios,(Get-Date -Format 'yyyyMMdd-HHmmssfff'),$repeticion
    $archivo = Join-Path $salida $nombre
    $resumen | ConvertTo-Json -Depth 12 | Set-Content -Path $archivo -Encoding UTF8
    Write-Host "RESULTADO: $archivo" -ForegroundColor Green
    Write-Host "Simulador salida: $codigoSalida | correctas: $correctas/$esperadas | errores: $errores | HTTP medio: $($resumen.tiempoRespuestaMedioMs) ms | CPU media: $($resumen.cpuMediaPorcentajeProcesos)% | RAM media: $($resumen.ramMediaMBProcesos) MB"
    if (-not $valido) {
        $fallos++
        Write-Warning 'Ejecucion no valida: revisa codigo de salida, archivo del simulador, operaciones y tiempos HTTP.'
    } else {
        Write-Host 'VALIDACION: CORRECTA' -ForegroundColor Green
    }
}
if ($fallos -gt 0) { throw "$fallos ejecucion(es) requieren revision. No publiques estas mediciones como definitivas." }
