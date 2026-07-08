param(
    [string]$Version = $(Get-Content -Path (Join-Path $PSScriptRoot '..\VERSION') -Raw).Trim(),
    [switch]$SkipBuild,
    [switch]$SkipTauriBuild,
    [switch]$NoClean
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$appRoot = Join-Path $root 'app'
$tauriRoot = Join-Path $appRoot 'src-tauri'
$bundleRoot = Join-Path $tauriRoot 'target\release\bundle'
$releaseNotesPath = Join-Path $root "Docs\RELEASE_NOTES_v$Version.md"

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Semver {
    param([string]$Value)
    if ($Value -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') {
        throw "Invalid version '$Value'. Use semantic versions such as 2.9.1 or 3.0.0-beta.1."
    }
}

function Read-JsonVersion {
    param([string]$Path)
    $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    return [string]$json.version
}

function Read-CargoVersion {
    param([string]$Path)
    $match = [regex]::Match((Get-Content -LiteralPath $Path -Raw), '(?m)^version = "([^"]+)"')
    if (-not $match.Success) {
        throw "Could not read Cargo version from $Path"
    }
    return $match.Groups[1].Value
}

function Assert-VersionSync {
    $versionFile = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
    $versions = [ordered]@{
        'VERSION' = $versionFile
        'app/package.json' = Read-JsonVersion (Join-Path $appRoot 'package.json')
        'app/src-tauri/tauri.conf.json' = Read-JsonVersion (Join-Path $tauriRoot 'tauri.conf.json')
        'app/src-tauri/Cargo.toml' = Read-CargoVersion (Join-Path $tauriRoot 'Cargo.toml')
    }

    $bad = @($versions.GetEnumerator() | Where-Object { $_.Value -ne $Version })
    if ($bad.Count -gt 0) {
        $details = ($bad | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '
        throw "Version mismatch after sync. Expected $Version, got: $details"
    }
}

function Assert-UpdaterSigningReady {
    $config = Get-Content -LiteralPath (Join-Path $tauriRoot 'tauri.conf.json') -Raw | ConvertFrom-Json
    $hasPubKey = $null -ne $config.plugins.updater.pubkey -and [string]$config.plugins.updater.pubkey -ne ''
    $createsUpdaterArtifacts = [bool]$config.bundle.createUpdaterArtifacts
    if ($hasPubKey -and $createsUpdaterArtifacts -and -not $env:TAURI_SIGNING_PRIVATE_KEY) {
        throw @"
Updater signing is enabled, but TAURI_SIGNING_PRIVATE_KEY is not set.

Set it before release build, for example:
  `$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content `$HOME\.tauri\sharkdrive.key -Raw

This preflight prevents waiting for the full Rust build only to fail during updater signing.
"@
    }
}

function Invoke-Checked {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Get-ArtifactRows {
    $patterns = @(
        'target\release\app.exe',
        'target\release\bundle\msi\*.msi',
        'target\release\bundle\nsis\*.exe',
        'target\release\bundle\nsis\*.zip',
        'target\release\bundle\nsis\*.sig',
        'target\release\bundle\msi\*.zip',
        'target\release\bundle\msi\*.sig',
        'target\release\bundle\latest.json'
    )

    foreach ($pattern in $patterns) {
        Get-ChildItem -LiteralPath $tauriRoot -Filter '__never__' -ErrorAction SilentlyContinue | Out-Null
        Get-ChildItem -Path (Join-Path $tauriRoot $pattern) -ErrorAction SilentlyContinue
    }
}

function Write-ReleaseNotesTemplate {
    if (Test-Path -LiteralPath $releaseNotesPath) {
        return
    }

    $content = @"
# SharkDrive v$Version

## Highlights

- 

## Fixes

- 

## Security Notes

- 

## Upgrade Notes

- Download the Windows installer from this release.
- If auto-update is enabled, SharkDrive should detect this version through `latest.json`.

## QA Checklist

- [ ] Login/session restore
- [ ] Sync
- [ ] Create/delete folder
- [ ] Upload/download
- [ ] Preview image/video/PDF/audio
- [ ] Multi-select bulk actions
- [ ] Share link create/revoke
- [ ] Encryption unlock/auto-lock
- [ ] Installer icon/taskbar icon
- [ ] Auto-update detection
"@
    Set-Content -LiteralPath $releaseNotesPath -Value $content -NoNewline
}

Assert-Semver $Version

Write-Step "Release preflight from $root"
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'package.json'))) {
    throw "package.json was not found. This script must be run from the repository or scripts folder, but it always builds from: $appRoot"
}

if ((Test-Path -LiteralPath (Join-Path $appRoot 'pnpm-lock.yaml')) -and (Test-Path -LiteralPath (Join-Path $appRoot 'package-lock.json'))) {
    Write-Host 'Both package-lock.json and pnpm-lock.yaml exist. Release uses npm/package-lock.json for reproducibility.' -ForegroundColor Yellow
}

if (-not $SkipTauriBuild) {
    Assert-UpdaterSigningReady
}

Write-Step "Synchronizing version to $Version"
Set-Content -LiteralPath (Join-Path $root 'VERSION') -Value $Version -NoNewline
Push-Location $root
try {
    & (Join-Path $PSScriptRoot 'sync-version.ps1') -Version $Version
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: sync-version.ps1 -Version $Version"
    }
} finally {
    Pop-Location
}
Assert-VersionSync
Write-ReleaseNotesTemplate

if (-not $SkipBuild) {
    Write-Step 'TypeScript validation: npx tsc --noEmit'
    Invoke-Checked -FilePath 'npx' -Arguments @('tsc', '--noEmit') -WorkingDirectory $appRoot

    Write-Step 'Frontend production build: npm run build'
    Invoke-Checked -FilePath 'npm' -Arguments @('run', 'build') -WorkingDirectory $appRoot
}

if (-not $SkipTauriBuild) {
    if (-not $NoClean -and (Test-Path -LiteralPath $bundleRoot)) {
        Write-Step 'Cleaning previous installer bundles'
        Remove-Item -LiteralPath $bundleRoot -Recurse -Force
    }

    Write-Step 'Tauri release build: npm run tauri build'
    Invoke-Checked -FilePath 'npm' -Arguments @('run', 'tauri', 'build') -WorkingDirectory $appRoot
}

Write-Step 'Release artifacts'
$artifacts = @(Get-ArtifactRows | Sort-Object FullName -Unique)
if ($artifacts.Count -eq 0) {
    Write-Host 'No artifacts found yet. If you used -SkipTauriBuild, run without it to generate installers.' -ForegroundColor Yellow
} else {
    $artifacts | ForEach-Object {
        $sizeMb = [math]::Round($_.Length / 1MB, 2)
        Write-Host ("{0}  ({1} MB)" -f $_.FullName, $sizeMb)
    }
}

Write-Host ''
Write-Host "Release notes template: $releaseNotesPath" -ForegroundColor Green
Write-Host 'Release script completed.' -ForegroundColor Green
