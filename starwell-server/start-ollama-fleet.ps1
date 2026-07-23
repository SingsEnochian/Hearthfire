# start-ollama-fleet.ps1
# Starts one Ollama instance per model on its own port.
# Run this BEFORE starting starwell-server so parallel chorus has true separate queues.
#
# Each instance shares the model cache at %USERPROFILE%\.ollama\models
# but runs inference independently — no queue contention between voices.
#
# Usage: .\start-ollama-fleet.ps1
# To stop all: Get-Process -Name "ollama" | Stop-Process

$fleet = @(
    @{ port = 11434; label = "Qwythos (primary)"  },
    @{ port = 11435; label = "Yggdrasil"           },
    @{ port = 11436; label = "GLM-4 / strategy"   },
    @{ port = 11437; label = "DeepSeek R1 / reason"},
)

foreach ($instance in $fleet) {
    $port  = $instance.port
    $label = $instance.label

    # Check if something is already listening on this port
    $listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Host "  [skip] Port $port already in use — $label" -ForegroundColor Yellow
        continue
    }

    Write-Host "  [start] ollama serve on :$port — $label" -ForegroundColor Cyan

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "ollama"
    $psi.Arguments = "serve"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    # Each instance reads OLLAMA_HOST to know its port
    $psi.EnvironmentVariables["OLLAMA_HOST"] = "127.0.0.1:$port"
    # Shared model cache — all instances see the same pulled models
    $psi.EnvironmentVariables["OLLAMA_MODELS"] = "$env:USERPROFILE\.ollama\models"

    [void][System.Diagnostics.Process]::Start($psi)

    # Short pause so the socket is bound before the next one starts
    Start-Sleep -Milliseconds 800
}

Write-Host ""
Write-Host "Fleet started. Waiting 3s for all instances to bind..." -ForegroundColor Green
Start-Sleep -Seconds 3

# Quick health check
foreach ($instance in $fleet) {
    $port = $instance.port
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/tags" -TimeoutSec 3 -ErrorAction Stop
        $count = $resp.models.Count
        Write-Host "  [:$port] OK — $count model(s) available" -ForegroundColor Green
    } catch {
        Write-Host "  [:$port] not yet ready (may still be loading)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Now start starwell-server:" -ForegroundColor Cyan
Write-Host "  node server.mjs" -ForegroundColor White
