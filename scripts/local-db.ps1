<#
.SYNOPSIS
  Runs a throwaway PostgreSQL cluster for local development, isolated from any
  Postgres service already installed on the machine.

.DESCRIPTION
  Reuses the PostgreSQL binaries found on this machine (or PG_BIN) to initialise a
  cluster inside .localdb/, listening on 127.0.0.1 only, with trust auth. It is a
  development convenience: never point production at it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 start
  powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 stop
  powershell -ExecutionPolicy Bypass -File scripts/local-db.ps1 status
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "status", "reset")]
  [string]$Command = "start",

  [int]$Port = 55433,
  [string]$Database = "gestao_erp"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root ".localdb\data"
$logFile = Join-Path $root ".localdb\postgres.log"

function Resolve-PgBin {
  if ($env:PG_BIN -and (Test-Path (Join-Path $env:PG_BIN "pg_ctl.exe"))) { return $env:PG_BIN }

  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending

  foreach ($candidate in $candidates) {
    $bin = Join-Path $candidate.FullName "bin"
    if (Test-Path (Join-Path $bin "pg_ctl.exe")) { return $bin }
  }

  throw "PostgreSQL binaries not found. Install PostgreSQL or set PG_BIN to its bin directory."
}

$bin = Resolve-PgBin
$pgCtl = Join-Path $bin "pg_ctl.exe"
$initDb = Join-Path $bin "initdb.exe"
$psql = Join-Path $bin "psql.exe"

function Test-Running {
  if (-not (Test-Path (Join-Path $dataDir "postmaster.pid"))) { return $false }

  # pg_ctl writes to stderr, which PowerShell turns into a terminating error here.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $pgCtl -D $dataDir status *> $null
    return $LASTEXITCODE -eq 0
  }
  finally {
    $ErrorActionPreference = $previous
  }
}

switch ($Command) {
  "status" {
    if (Test-Running) { "running on port $Port" } else { "stopped" }
    break
  }

  "stop" {
    if (Test-Running) {
      & $pgCtl -D $dataDir -m fast stop | Out-Null
      "stopped"
    }
    else { "already stopped" }
    break
  }

  "reset" {
    if (Test-Running) { & $pgCtl -D $dataDir -m immediate stop | Out-Null }
    Remove-Item (Join-Path $root ".localdb") -Recurse -Force -ErrorAction SilentlyContinue
    "cluster removed"
    break
  }

  "start" {
    if (Test-Running) { "already running on port $Port"; break }

    if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
      New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
      & $initDb -D $dataDir -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "initdb failed" }

      Add-Content -Path (Join-Path $dataDir "postgresql.conf") -Encoding utf8 -Value @"

# local development cluster
listen_addresses = '127.0.0.1'
port = $Port
max_connections = 50
"@
    }

    & $pgCtl -D $dataDir -l $logFile -o "-p $Port" -w start | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed. See $logFile" }

    $exists = & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$Database'"
    if (-not $exists) {
      & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -c "CREATE DATABASE $Database" | Out-Null
    }

    "running on port $Port, database $Database"
    break
  }
}
