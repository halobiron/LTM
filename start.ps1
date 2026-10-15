param([switch]$Stop)
$ErrorActionPreference = 'Stop'

function Compose([string]$Folder, [string[]]$Arguments) {
    Push-Location (Join-Path $PSScriptRoot $Folder)
    try {
        & docker compose @Arguments
        if ($LASTEXITCODE -ne 0) { throw "Docker failed in $Folder." }
    } finally { Pop-Location }
}

function Wait-Service([string]$Url) {
    Write-Host "Waiting for $Url (first model download can take a long time)..."
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt 3600) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Seconds 3
    }
    throw "Service not ready: $Url. Check docker compose logs in its folder."
}

try {
    if ($Stop) {
        Compose 'Syltalky_BE' @('down')
        Compose 'Syltalky_API' @('down')
        Write-Host 'Docker services stopped; data preserved. Stop frontend with Ctrl+C.'
        exit 0
    }
    foreach ($command in @('docker', 'npm.cmd')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Missing $command. Install Docker Desktop and Node.js, then retry."
        }
    }
    $envFile = Join-Path $PSScriptRoot 'Syltalky_BE/.env'
    if (-not (Test-Path -LiteralPath $envFile)) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Syltalky_BE/.env.example') -Destination $envFile
        throw 'Created Syltalky_BE/.env. Configure it as described in README, then rerun.'
    }
    Compose 'Syltalky_API' @('up', '-d', '--build')
    Compose 'Syltalky_BE' @('up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'minio', 'livekit')
    Compose 'Syltalky_BE' @('build', 'backend')
    Wait-Service 'http://localhost:8000/health'
    Wait-Service 'http://localhost:9000/minio/health/live'
    Compose 'Syltalky_BE' @('run', '--rm', '--no-deps', 'backend', 'alembic', 'upgrade', 'head')
    Compose 'Syltalky_BE' @('up', '-d', '--no-deps', '--force-recreate', 'backend')
    Wait-Service 'http://localhost:8001/health'

    Push-Location (Join-Path $PSScriptRoot 'Syltalky_FE')
    try {
        if (-not (Test-Path 'node_modules/.bin/vite.cmd')) {
            if (Test-Path 'package-lock.json') { & npm.cmd ci } else { & npm.cmd install }
            if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        }
        Write-Host 'Open http://localhost:5173. Ctrl+C stops frontend; start.cmd -Stop stops Docker.'
        & npm.cmd run dev -- --port 5173 --strictPort
        if ($LASTEXITCODE -ne 0) { throw 'Frontend stopped with an error.' }
    } finally { Pop-Location }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
