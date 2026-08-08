#Requires -Version 5.1
<#
.SYNOPSIS
  Runs Asambleas.Web for local EO-001 development with env-based connection string.

.DESCRIPTION
  Does not write secrets into appsettings.json.
  Defaults to Docker Compose Postgres on port 5433 (see docker-compose.yml).
  Override with -ConnectionString or ConnectionStrings__DefaultConnection.
#>
param(
  [string]$ConnectionString = $env:ConnectionStrings__DefaultConnection,
  [string]$Urls = "https://localhost:7188;http://localhost:5188"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
  if ($env:PGPASSWORD) {
    $ConnectionString = "Host=127.0.0.1;Port=5432;Database=asambleas;Username=postgres;Password=$($env:PGPASSWORD)"
    Write-Host "Using local PostgreSQL on port 5432 (PGPASSWORD)." -ForegroundColor Cyan
  } else {
    # Docker Compose demo credentials (Development only — not production secrets).
    $ConnectionString = "Host=127.0.0.1;Port=5433;Database=asambleas;Username=asambleas;Password=asambleas_dev_only"
    Write-Host "Using Docker Compose default connection (port 5433)." -ForegroundColor Cyan
  }
}

$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ConnectionStrings__DefaultConnection = $ConnectionString

# Optional LiveKit (leave empty to keep A/V blocked)
if (-not $env:LIVEKIT_URL) { $env:LIVEKIT_URL = "" }
if (-not $env:LIVEKIT_API_KEY) { $env:LIVEKIT_API_KEY = "" }
if (-not $env:LIVEKIT_API_SECRET) { $env:LIVEKIT_API_SECRET = "" }

Write-Host "Starting Asambleas.Web..." -ForegroundColor Green
Write-Host "Health: http://localhost:5188/health" -ForegroundColor DarkGray

Set-Location (Join-Path $root "src\Asambleas.Web")
dotnet run --urls $Urls
