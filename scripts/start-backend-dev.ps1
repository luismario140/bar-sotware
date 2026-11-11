$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendPort = 8080
if ($env:APPBARPOS_PORT) {
    if (-not [int]::TryParse($env:APPBARPOS_PORT, [ref]$backendPort) -or $backendPort -lt 1 -or $backendPort -gt 65535) {
        throw 'APPBARPOS_PORT debe estar entre 1 y 65535 para desarrollo web.'
    }
}
$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $backendPort)
try { $portProbe.Start() } catch {
    throw "El puerto $backendPort no se encuentra disponible. Define APPBARPOS_PORT con otro puerto en las terminales del backend y frontend."
} finally { $portProbe.Stop() }
$localDirectory = Join-Path $projectRoot '.local'
[IO.Directory]::CreateDirectory($localDirectory) | Out-Null
$tokenBytes = New-Object byte[] 32
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $generator.GetBytes($tokenBytes) } finally { $generator.Dispose() }
$channelToken = [BitConverter]::ToString($tokenBytes).Replace('-', '').ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $localDirectory "api-token-$backendPort.txt") -Value $channelToken -Encoding ASCII -NoNewline
$previousToken = $env:APPBARPOS_API_TOKEN
$env:APPBARPOS_API_TOKEN = $channelToken
Push-Location -LiteralPath (Join-Path $projectRoot 'backend')
try {
    & .\mvnw.cmd spring-boot:run
    $runExit = $LASTEXITCODE
} finally {
    Pop-Location
    $env:APPBARPOS_API_TOKEN = $previousToken
}
exit $runExit
