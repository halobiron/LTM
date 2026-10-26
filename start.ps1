param([switch]$Stop, [switch]$NoApi, [switch]$WithApi, [switch]$Tailscale, [switch]$Local, [switch]$Cloud)
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
        if (Get-Command tailscale -ErrorAction SilentlyContinue) {
            & tailscale funnel --https=443 off 2>$null
            & tailscale funnel --https=8443 off 2>$null
        }
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
    if (-not $Tailscale -and -not $Local -and -not $Cloud) {
        $answer = Read-Host 'Chay o che do nao? [1] Local (localhost)  [2] Tailscale  [3] Cloud (LiveKit Cloud + Funnel)'
        $Tailscale = $answer -match '^(2|t|tailscale)$'
        $Cloud = $answer -match '^(3|c|cloud)$'
    }
    $mode = if ($Cloud) { 'cloud' } elseif ($Tailscale) { 'tailscale' } else { 'local' }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "Syltalky_BE/mode.$mode.env") -Destination (Join-Path $PSScriptRoot 'Syltalky_BE/.env.mode') -Force
    Write-Host "Mode: $mode"
    # AI API needs an NVIDIA GPU. Without it the rest of the app still works (STT, TTS and sign language are unavailable).
    $runApi = $true
    if ($NoApi) {
        $runApi = $false
    } elseif (-not $WithApi) {
        $hasGpu = [bool](Get-Command nvidia-smi -ErrorAction SilentlyContinue)
        $hint = if ($hasGpu) { '[Y/n]' } else { '[y/N]' }
        $answer = Read-Host "Chay Syltalky_API (AI: phu de, giong noi, ngon ngu ky hieu; can GPU NVIDIA)? $hint"
        if ($answer -eq '') { $runApi = $hasGpu } else { $runApi = $answer -match '^(y|yes)$' }
    }

    if ($runApi) {
        $apiArgs = @('up', '-d')
        docker image inspect syltalky_api-ai-api *> $null
        if ($LASTEXITCODE -eq 0) {
            $answer = Read-Host 'Build lai Syltalky_API (co the mat nhieu phut)? [y/N]'
            if ($answer -match '^(y|yes)$') { $apiArgs += '--build' }
        } else {
            Write-Host 'Chua co image Syltalky_API, se build lan dau.'
        }
        Compose 'Syltalky_API' $apiArgs
    } else {
        Write-Host 'Bo qua Syltalky_API: cac tinh nang AI se khong dung duoc.' -ForegroundColor Yellow
    }
    # Cloud mode: calls run on LiveKit Cloud, so no local LiveKit/Redis container
    $infra = if ($Cloud) { @('postgres', 'minio') } else { @('postgres', 'redis', 'minio', 'livekit') }
    Compose 'Syltalky_BE' (@('up', '-d', '--wait', '--wait-timeout', '180') + $infra)
    Compose 'Syltalky_BE' @('build', 'backend')
    if ($runApi) { Wait-Service 'http://localhost:8000/health' }
    Wait-Service 'http://localhost:9000/minio/health/live'
    Compose 'Syltalky_BE' @('run', '--rm', '--no-deps', 'backend', 'alembic', 'upgrade', 'head')
    Compose 'Syltalky_BE' @('up', '-d', '--no-deps', '--force-recreate', 'backend')
    Wait-Service 'http://localhost:8001/health'

    if ($Cloud) {
        # Expose backend and MinIO publicly through Tailscale Funnel (visitors do not need Tailscale)
        if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
            throw 'Missing tailscale. Install Tailscale and log in, then rerun.'
        }
        foreach ($f in @(@('443', '8001'), @('8443', '9000'))) {
            & tailscale funnel --bg "--https=$($f[0])" $f[1]
            if ($LASTEXITCODE -ne 0) { throw "tailscale funnel failed for port $($f[1]). Enable Funnel/HTTPS for your tailnet (see the link it printed) and rerun." }
        }
        & tailscale funnel status
        Write-Host 'Cloud mode: backend is public via Funnel. Frontend is deployed on Cloudflare Pages (see docs/DEPLOY.md). Stop with start.cmd -Stop.' -ForegroundColor Green
        Read-Host 'Nhan Enter de dong cua so (he thong van chay nen)' | Out-Null
        exit 0
    }
    Push-Location (Join-Path $PSScriptRoot 'Syltalky_FE')
    try {
        if (-not (Test-Path 'node_modules/.bin/vite.cmd')) {
            if (Test-Path 'package-lock.json') { & npm.cmd ci } else { & npm.cmd install }
            if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        }
        Write-Host 'Open http://localhost:5173 (or the ts.net URL in -Tailscale mode). Ctrl+C stops frontend; start.cmd -Stop stops Docker.'
        & npm.cmd run dev -- --port 5173 --strictPort --mode $(if ($Tailscale) { 'tailscale' } else { 'development' })
        if ($LASTEXITCODE -ne 0) { throw 'Frontend stopped with an error.' }
    } finally { Pop-Location }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
