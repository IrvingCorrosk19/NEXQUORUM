# ASAMBLEAS / NEXQUORUM — SSH helper against the Contabo VPS (same host as Homestead/RestBar).
# Secrets: set env vars or create scripts/.env.vps (gitignored). Never commit passwords.
#
#   ASAMBLEAS_VPS_HOST       default root@164.68.99.83
#   ASAMBLEAS_VPS_PASSWORD   required
#   ASAMBLEAS_VPS_HOSTKEY    default ssh-ed25519 SHA256:fXnxiWr5sqazM3xRId7HtcseAZ0XHcJ2BBIuPsLt2J0
#
# Usage:
#   . .\scripts\vps-ssh.ps1
#   Invoke-AsambleasVps "docker ps --filter name=asambleas"
#   Publish-AsambleasVps   # git archive + remote-deploy-update.sh

$ErrorActionPreference = "Stop"

function Import-AsambleasVpsSecrets {
    $secretFile = Join-Path $PSScriptRoot ".env.vps"
    if (Test-Path $secretFile) {
        Get-Content $secretFile | ForEach-Object {
            if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
            if ($_ -match '^\s*([^=]+)=(.*)$') {
                $name = $Matches[1].Trim()
                $val = $Matches[2].Trim().Trim('"').Trim("'")
                Set-Item -Path "Env:$name" -Value $val
            }
        }
    }
}

function Get-AsambleasVpsConfig {
    Import-AsambleasVpsSecrets
    $plink = if ($env:ASAMBLEAS_PLINK) { $env:ASAMBLEAS_PLINK } else { "C:\Program Files\PuTTY\plink.exe" }
    $pscp = if ($env:ASAMBLEAS_PSCP) { $env:ASAMBLEAS_PSCP } else { "C:\Program Files\PuTTY\pscp.exe" }
    $hostName = if ($env:ASAMBLEAS_VPS_HOST) { $env:ASAMBLEAS_VPS_HOST } else { "root@164.68.99.83" }
    $password = $env:ASAMBLEAS_VPS_PASSWORD
    $hostkey = if ($env:ASAMBLEAS_VPS_HOSTKEY) {
        $env:ASAMBLEAS_VPS_HOSTKEY
    } else {
        "ssh-ed25519 SHA256:fXnxiWr5sqazM3xRId7HtcseAZ0XHcJ2BBIuPsLt2J0"
    }
    if (-not $password) {
        throw "ASAMBLEAS_VPS_PASSWORD required (env or scripts/.env.vps)."
    }
    if (-not (Test-Path $plink)) { throw "plink not found: $plink" }
    if (-not (Test-Path $pscp)) { throw "pscp not found: $pscp" }
    [pscustomobject]@{
        Plink    = $plink
        Pscp     = $pscp
        HostName = $hostName
        Password = $password
        HostKey  = $hostkey
        AppRoot  = "/opt/apps/asambleas"
        PublicUrl = "https://asambleas.164.68.99.83.nip.io"
    }
}

function Invoke-AsambleasVps {
    param(
        [Parameter(Mandatory = $true, Position = 0)]
        [string]$Command
    )
    $c = Get-AsambleasVpsConfig
    & $c.Plink -ssh -pw $c.Password -batch -hostkey $c.HostKey $c.HostName $Command
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed (exit $LASTEXITCODE)" }
}

function Copy-AsambleasVps {
    param(
        [Parameter(Mandatory = $true)][string]$LocalPath,
        [Parameter(Mandatory = $true)][string]$RemotePath
    )
    $c = Get-AsambleasVpsConfig
    & $c.Pscp -pw $c.Password -batch -hostkey $c.HostKey $LocalPath "$($c.HostName):$RemotePath"
    if ($LASTEXITCODE -ne 0) { throw "pscp upload failed (exit $LASTEXITCODE)" }
}

function Publish-AsambleasVps {
    $c = Get-AsambleasVpsConfig
    $repoRoot = Split-Path $PSScriptRoot -Parent
    $archive = Join-Path $env:TEMP "asambleas-src.tgz"
    Push-Location $repoRoot
    try {
        if (Test-Path (Join-Path $repoRoot ".git")) {
            git archive --format=tar.gz -o $archive HEAD
        } else {
            throw "git archive requires a git repo at $repoRoot"
        }
    } finally {
        Pop-Location
    }
    Write-Host "Uploading archive..." -ForegroundColor Cyan
    Copy-AsambleasVps -LocalPath $archive -RemotePath "/tmp/asambleas-src.tgz"
    Write-Host "Running remote deploy..." -ForegroundColor Cyan
    Invoke-AsambleasVps "bash $($c.AppRoot)/deploy/vps/remote-deploy-update.sh"
    Write-Host "Deploy finished. $($c.PublicUrl)" -ForegroundColor Green
}
