param(
    [Parameter(Mandatory = $true)][ValidateSet('cs','p2p','micro')][string]$Arquitectura,
    [Parameter(Mandatory = $true)][ValidateSet(2,3,5)][int]$Usuarios,
    [ValidateRange(1,100)][int]$Repeticiones = 1,
    [ValidateRange(200,10000)][int]$IntervaloMs = 500,
    [string]$VM1 = '192.168.56.11',
    [string]$VM2 = '192.168.56.12',
    [string]$UsuarioSSH = 'grupo10'
)

# RQ12 - Modulo de metricas para el entorno virtualizado (VM1 y VM2).
# Se ejecuta en el equipo anfitrion (Windows). El simulador de concurrencia
# envia las solicitudes por la red Host-Only hacia las maquinas virtuales y,
# mientras tanto, se registran:
#   - Tiempo de respuesta HTTP: duracionMs de cada operacion del simulador.
#   - Latencia de conexion TCP: del anfitrion a la IP y puerto de cada servicio.
#   - CPU, RAM y red de cada contenedor: "docker stats" en cada VM, por SSH.
# Requisito: acceso SSH sin contrasena (clave publica) a VM1 y VM2.

$ErrorActionPreference = 'Stop'
$raizMicro = Split-Path -Parent $PSScriptRoot
$raizTelematicos = Split-Path -Parent $raizMicro

$config = switch ($Arquitectura) {
    'cs' { @{
        Carpeta = (Join-Path $raizTelematicos 'servicios-telematicos-cliente-servidor')
        Argumentos = @('cs'); Nombre = 'cs'
        Variable = 'SERVIDORES'; Valor = "http://${VM1}:3000"
        Destinos = @(@{ Host = $VM1; Puerto = 3000 })
        Contenedores = @(@{ VM = $VM1; Nombres = @('tele-cs') })
    } }
    'p2p' { @{
        Carpeta = (Join-Path $raizTelematicos 'servicios-telematicos-p2p')
        Argumentos = @('p2p'); Nombre = 'p2p'
        Variable = 'SERVIDORES'; Valor = "http://${VM1}:4001,http://${VM2}:4002"
        Destinos = @(@{ Host = $VM1; Puerto = 4001 }, @{ Host = $VM2; Puerto = 4002 })
        Contenedores = @(@{ VM = $VM1; Nombres = @('tele-p2p-1') }, @{ VM = $VM2; Nombres = @('tele-p2p-2') })
    } }
    'micro' { @{
        Carpeta = $raizMicro
        Argumentos = @(); Nombre = 'microservicios'
        Variable = 'GATEWAY_URL'; Valor = "http://${VM2}:6001"
        Destinos = @(@{ Host = $VM2; Puerto = 6001 }, @{ Host = $VM2; Puerto = 5001 }, @{ Host = $VM2; Puerto = 5002 })
        Contenedores = @(@{ VM = $VM2; Nombres = @('tele-api-gateway','tele-micro-tareas','tele-micro-notificaciones') })
    } }
}

$simulador = Join-Path $config.Carpeta 'simulacion\concurrencia.mjs'
$resultadosSimulador = Join-Path $config.Carpeta 'simulacion\resultados'
$salida = Join-Path $raizMicro 'metricas\resultados'
$temporal = Join-Path $salida 'tmp'

if (-not (Test-Path -LiteralPath $simulador -PathType Leaf)) { throw "No se encontro el simulador: $simulador" }
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -eq $node) { throw 'Node.js no esta disponible en PATH' }
$ssh = Get-Command ssh.exe -ErrorAction SilentlyContinue
if ($null -eq $ssh) { throw 'No se encontro ssh.exe (cliente OpenSSH de Windows)' }
New-Item -ItemType Directory -Force -Path $salida, $temporal, $resultadosSimulador | Out-Null

# ---------------------------------------------------------------- utilidades

function Invoke-SSH([string]$vm, [string]$comando) {
    $salidaSsh = & $ssh.Source -o BatchMode=yes -o ConnectTimeout=5 "$UsuarioSSH@$vm" $comando 2>&1
    return @{ Codigo = $LASTEXITCODE; Texto = ($salidaSsh | Out-String) }
}

function Get-LatenciaTcpMs([string]$destino, [int]$puerto) {
    $cliente = New-Object System.Net.Sockets.TcpClient
    $reloj = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $intento = $cliente.BeginConnect($destino, $puerto, $null, $null)
        if (-not $intento.AsyncWaitHandle.WaitOne(2000)) { return $null }
        $cliente.EndConnect($intento)
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

# Convierte "45.3MiB", "1.2kB", "3GB"... a bytes
function ConvertTo-Bytes([string]$texto) {
    $t = $texto.Trim()
    if ($t -notmatch '^([0-9.]+)\s*([A-Za-z]*)$') { return $null }
    $numero = [double]::Parse($Matches[1], [System.Globalization.CultureInfo]::InvariantCulture)
    $factor = switch -CaseSensitive ($Matches[2]) {
        'B'   { 1 }
        'kB'  { 1e3 }
        'KB'  { 1e3 }
        'MB'  { 1e6 }
        'GB'  { 1e9 }
        'TB'  { 1e12 }
        'KiB' { 1024 }
        'MiB' { 1048576 }
        'GiB' { 1073741824 }
        'TiB' { 1099511627776 }
        default { 1 }
    }
    return [double]($numero * $factor)
}

# Lee el archivo de "docker stats" y devuelve las muestras por contenedor
function Read-DockerStats([string]$archivo, [string]$vm) {
    $muestras = @()
    if (-not (Test-Path -LiteralPath $archivo)) { return $muestras }
    $texto = Get-Content -LiteralPath $archivo -Raw -ErrorAction SilentlyContinue
    if ($null -eq $texto) { return $muestras }
    $esc = [string][char]27
    $texto = $texto -replace ($esc + '\[[0-9;?]*[A-Za-z]'), "`n"
    foreach ($linea in ($texto -split "`r?`n")) {
        $partes = $linea.Trim() -split ';'
        if ($partes.Count -ne 4 -or $partes[0] -eq '' -or $partes[1] -notmatch '%') { continue }
        $cpu = [double]::Parse(($partes[1] -replace '%', ''), [System.Globalization.CultureInfo]::InvariantCulture)
        $ram = ConvertTo-Bytes (($partes[2] -split '/')[0])
        $red = $partes[3] -split '/'
        $muestras += [PSCustomObject]@{
            vm = $vm
            contenedor = $partes[0].Trim()
            cpuPorcentaje = $cpu
            ramBytes = $ram
            redRecibidosBytes = ConvertTo-Bytes $red[0]
            redEnviadosBytes = ConvertTo-Bytes $red[1]
        }
    }
    return $muestras
}

# ---------------------------------------------------------- comprobaciones

foreach ($grupo in $config.Contenedores) {
    $nombres = $grupo.Nombres -join ' '
    $prueba = Invoke-SSH $grupo.VM "docker inspect -f '{{.Name}} {{.State.Running}}' $nombres"
    if ($prueba.Codigo -ne 0) {
        throw "No se pudo consultar los contenedores en $($grupo.VM) por SSH. Revisa la clave SSH y que existan: $nombres`n$($prueba.Texto)"
    }
    if ($prueba.Texto -match 'false') { throw "Hay contenedores detenidos en $($grupo.VM):`n$($prueba.Texto)" }
}
foreach ($d in $config.Destinos) {
    if ($null -eq (Get-LatenciaTcpMs $d.Host $d.Puerto)) { throw "No responde $($d.Host):$($d.Puerto)" }
}

# -------------------------------------------------------------- mediciones

$fallos = 0
for ($repeticion = 1; $repeticion -le $Repeticiones; $repeticion++) {
    Write-Host "Iniciando $Arquitectura con $Usuarios usuarios contra las VMs; repeticion $repeticion/$Repeticiones" -ForegroundColor Cyan

    # 1) Iniciar "docker stats" en cada VM (en segundo plano)
    $monitores = @()
    foreach ($grupo in $config.Contenedores) {
        $archivoStats = Join-Path $temporal ("stats-{0}-{1}.txt" -f $grupo.VM, [guid]::NewGuid().ToString('N').Substring(0,8))
        $archivoErr = "$archivoStats.err"
        $nombres = $grupo.Nombres -join ' '
        $remoto = "timeout 300 docker stats --format '{{.Name}};{{.CPUPerc}};{{.MemUsage}};{{.NetIO}}' $nombres"
        $argumentosSsh = "-o BatchMode=yes -o ConnectTimeout=5 -T $UsuarioSSH@$($grupo.VM) `"$remoto`""
        $p = Start-Process -FilePath $ssh.Source -ArgumentList $argumentosSsh -NoNewWindow -PassThru `
            -RedirectStandardOutput $archivoStats -RedirectStandardError $archivoErr
        $monitores += @{ Proceso = $p; Archivo = $archivoStats; Error = $archivoErr; VM = $grupo.VM }
    }

    # Esperar a que llegue la primera lectura de cada VM (maximo 10 s)
    $limite = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 300
        $listos = @($monitores | Where-Object { (Read-DockerStats $_.Archivo $_.VM).Count -gt 0 }).Count
    } while ($listos -lt $monitores.Count -and (Get-Date) -lt $limite)
    if ($listos -lt $monitores.Count) { Write-Warning 'docker stats tardo en responder; las metricas de CPU/RAM pueden quedar incompletas.' }

    # 2) Ejecutar el simulador apuntando a las VMs
    $anteriores = @((Get-ChildItem -Path $resultadosSimulador -Filter '*.json' -File -ErrorAction SilentlyContinue).FullName)
    $argumentos = @($simulador) + @($config.Argumentos) + @([string]$Usuarios)
    $inicioProceso = New-Object System.Diagnostics.ProcessStartInfo
    $inicioProceso.FileName = $node.Source
    $inicioProceso.Arguments = (@($argumentos | ForEach-Object { '"' + ([string]$_ -replace '"','\"') + '"' }) -join ' ')
    $inicioProceso.WorkingDirectory = $config.Carpeta
    $inicioProceso.UseShellExecute = $false
    $inicioProceso.EnvironmentVariables[$config.Variable] = $config.Valor
    $proceso = New-Object System.Diagnostics.Process
    $proceso.StartInfo = $inicioProceso

    $latencias = New-Object 'System.Collections.Generic.List[object]'
    $inicio = Get-Date
    $codigoSalida = $null
    try {
        if (-not $proceso.Start()) { throw 'No se pudo iniciar el simulador Node.js.' }
        do {
            foreach ($d in $config.Destinos) {
                $latencias.Add([PSCustomObject]@{ destino = "$($d.Host):$($d.Puerto)"; ms = (Get-LatenciaTcpMs $d.Host $d.Puerto) })
            }
            Start-Sleep -Milliseconds $IntervaloMs
            $proceso.Refresh()
        } while (-not $proceso.HasExited)
        $proceso.WaitForExit()
        $codigoSalida = [int]$proceso.ExitCode
    } finally {
        $proceso.Dispose()
    }
    $final = Get-Date

    # 3) Una lectura mas de docker stats despues de terminar y detener monitores
    Start-Sleep -Milliseconds 1500
    foreach ($m in $monitores) { Stop-Process -Id $m.Proceso.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300

    $muestrasStats = @()
    foreach ($m in $monitores) { $muestrasStats += Read-DockerStats $m.Archivo $m.VM }

    # 4) Resultado del simulador
    $jsonSimulador = $null
    $archivoSimulador = $null
    $nuevos = @(Get-ChildItem -Path $resultadosSimulador -Filter '*.json' -File | Where-Object { $anteriores -notcontains $_.FullName } | Sort-Object LastWriteTime -Descending)
    foreach ($candidatoArchivo in $nuevos) {
        try {
            $candidato = Get-Content -LiteralPath $candidatoArchivo.FullName -Raw | ConvertFrom-Json
            if ([int]$candidato.usuarios -eq $Usuarios -and $candidato.arquitectura -eq $config.Nombre) {
                $jsonSimulador = $candidato; $archivoSimulador = $candidatoArchivo.FullName; break
            }
        } catch { }
    }
    $respuestaMs = @()
    if ($null -ne $jsonSimulador) {
        $respuestaMs = @($jsonSimulador.resultados | Where-Object { $null -ne $_.duracionMs } | ForEach-Object { [double]$_.duracionMs })
    }

    # 5) Resumen por contenedor
    $porContenedor = @()
    foreach ($grupoMuestras in ($muestrasStats | Group-Object contenedor)) {
        $lista = @($grupoMuestras.Group)
        $primera = $lista[0]; $ultima = $lista[$lista.Count - 1]
        $porContenedor += [PSCustomObject]@{
            contenedor = $grupoMuestras.Name
            vm = $primera.vm
            muestras = $lista.Count
            cpuMediaPorcentaje = Promedio ($lista | ForEach-Object { $_.cpuPorcentaje })
            cpuMaximaPorcentaje = [math]::Round([double](($lista | Measure-Object -Property cpuPorcentaje -Maximum).Maximum), 2)
            ramMediaMB = [math]::Round([double](($lista | Measure-Object -Property ramBytes -Average).Average) / 1MB, 2)
            redRecibidaBytes = [long][math]::Max(0, $ultima.redRecibidosBytes - $primera.redRecibidosBytes)
            redEnviadaBytes = [long][math]::Max(0, $ultima.redEnviadosBytes - $primera.redEnviadosBytes)
        }
    }

    $esperadas = if ($Arquitectura -eq 'micro') { $Usuarios * 5 } else { $Usuarios * 4 }
    $correctas = if ($null -ne $jsonSimulador) { [int]$jsonSimulador.correctas } else { $null }
    $errores = if ($null -ne $jsonSimulador) { [int]$jsonSimulador.errores } else { $null }
    $registradas = if ($null -ne $jsonSimulador) { [int]$jsonSimulador.operacionesRegistradas } else { $null }
    $valido = ($codigoSalida -eq 0 -and $null -ne $jsonSimulador -and $correctas -eq $esperadas -and $registradas -eq $esperadas -and $errores -eq 0 -and $porContenedor.Count -gt 0)

    $cpuTotal = $null; $ramTotal = $null
    if ($porContenedor.Count -gt 0) {
        $cpuTotal = [math]::Round([double](($porContenedor | Measure-Object -Property cpuMediaPorcentaje -Sum).Sum), 3)
        $ramTotal = [math]::Round([double](($porContenedor | Measure-Object -Property ramMediaMB -Sum).Sum), 2)
    }

    $resumen = [ordered]@{
        requisito = 'RQ12'
        tarea = 'T3.5/T3.6'
        entorno = 'virtualizado (VM1 y VM2, red Host-Only)'
        arquitectura = $Arquitectura
        usuarios = $Usuarios
        repeticion = $repeticion
        destinos = $config.Valor
        inicio = $inicio.ToString('o')
        fin = $final.ToString('o')
        duracionTotalMs = [math]::Round(($final - $inicio).TotalMilliseconds, 2)
        codigoSalidaSimulador = $codigoSalida
        archivoSimulador = $archivoSimulador
        operacionesEsperadas = $esperadas
        operacionesRegistradas = $registradas
        correctas = $correctas
        errores = $errores
        valido = $valido
        tiempoRespuestaMedioMs = Promedio $respuestaMs
        tiempoRespuestaMaximoMs = $(if ($respuestaMs.Count -gt 0) { ($respuestaMs | Measure-Object -Maximum).Maximum } else { $null })
        latenciaConexionTcpMediaMs = Promedio ($latencias | ForEach-Object { $_.ms })
        cpuMediaTotalContenedoresPorcentaje = $cpuTotal
        ramMediaTotalContenedoresMB = $ramTotal
        contenedores = $porContenedor
        latenciasTcp = @($latencias.ToArray())
        notas = @(
            'Tiempo de respuesta HTTP: promedio de resultados[].duracionMs del simulador, medido desde el anfitrion hasta las VMs.',
            'Latencia: tiempo de conexion TCP desde el anfitrion a la IP y puerto de cada servicio (red Host-Only).',
            'CPU y RAM: docker stats de cada contenedor; CPU en % de un nucleo (100% = 1 vCPU).',
            'Red: diferencia del contador NetIO del contenedor entre la primera y la ultima lectura.',
            'docker stats se actualiza aprox. cada segundo; en escenarios muy cortos hay pocas muestras.'
        )
    }

    $nombre = 'metricas-vm-{0}-{1}usuarios-{2}-{3}.json' -f $Arquitectura, $Usuarios, (Get-Date -Format 'yyyyMMdd-HHmmssfff'), $repeticion
    $archivo = Join-Path $salida $nombre
    $resumen | ConvertTo-Json -Depth 8 | Set-Content -Path $archivo -Encoding UTF8
    foreach ($m in $monitores) { Remove-Item -LiteralPath $m.Archivo, $m.Error -ErrorAction SilentlyContinue }

    Write-Host "RESULTADO: $archivo" -ForegroundColor Green
    Write-Host ("Simulador: salida {0} | correctas {1}/{2} | errores {3} | HTTP medio {4} ms | TCP medio {5} ms | CPU contenedores {6}% | RAM contenedores {7} MB" -f `
        $codigoSalida, $correctas, $esperadas, $errores, $resumen.tiempoRespuestaMedioMs, $resumen.latenciaConexionTcpMediaMs, $cpuTotal, $ramTotal)
    foreach ($c in $porContenedor) {
        Write-Host ("  {0} ({1}): CPU media {2}% | CPU max {3}% | RAM {4} MB | red recibida {5} B | red enviada {6} B | muestras {7}" -f `
            $c.contenedor, $c.vm, $c.cpuMediaPorcentaje, $c.cpuMaximaPorcentaje, $c.ramMediaMB, $c.redRecibidaBytes, $c.redEnviadaBytes, $c.muestras)
    }
    if ($valido) { Write-Host 'VALIDACION: CORRECTA' -ForegroundColor Green }
    else { $fallos++; Write-Warning 'Ejecucion no valida: revisa el simulador, los contenedores y la conexion SSH.' }
}
Remove-Item -LiteralPath $temporal -Recurse -Force -ErrorAction SilentlyContinue
if ($fallos -gt 0) { throw "$fallos ejecucion(es) requieren revision." }
