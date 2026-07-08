param(
    [string]$Version = $(Get-Content -Path (Join-Path $PSScriptRoot '..\VERSION') -Raw).Trim()
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')

function Update-JsonVersion {
    param(
        [string]$Path
    )

    $fullPath = Join-Path $root $Path
    $content = Get-Content -Path $fullPath -Raw
    $matcher = [regex]::new('"version"\s*:\s*"[^"]+"')
    $updated = $matcher.Replace($content, "`"version`": `"$Version`"", 1)
    Set-Content -Path $fullPath -Value ($updated.TrimEnd() + [Environment]::NewLine) -NoNewline
}

function Update-RegexVersion {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement
    )

    $fullPath = Join-Path $root $Path
    $content = Get-Content -Path $fullPath -Raw
    $updated = [regex]::Replace($content, $Pattern, $Replacement)
    Set-Content -Path $fullPath -Value ($updated.TrimEnd() + [Environment]::NewLine) -NoNewline
}

function Update-PackageLockVersion {
    $lockPath = Join-Path $root 'app\package-lock.json'
    $env:SHARKDRIVE_VERSION = $Version
    $env:SHARKDRIVE_PACKAGE_LOCK = $lockPath
    node -e "const fs=require('fs'); const path=process.env.SHARKDRIVE_PACKAGE_LOCK; const version=process.env.SHARKDRIVE_VERSION; const lock=JSON.parse(fs.readFileSync(path,'utf8')); lock.version=version; if(lock.packages && lock.packages['']) lock.packages[''].version=version; fs.writeFileSync(path, JSON.stringify(lock, null, 2) + '\n');"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to update package-lock.json"
    }
    Remove-Item Env:SHARKDRIVE_VERSION
    Remove-Item Env:SHARKDRIVE_PACKAGE_LOCK
}

function Update-PnpmLockVersion {
    $lockPath = Join-Path $root 'app\pnpm-lock.yaml'
    if (-not (Test-Path -LiteralPath $lockPath)) {
        return
    }

    $content = Get-Content -LiteralPath $lockPath -Raw
    $updated = [regex]::Replace(
        $content,
        '(?ms)(importers:\s*\r?\n\s*\.:\s*\r?\n(?:.*?\r?\n)*?\s+version:\s*)[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?',
        "`${1}$Version",
        1
    )
    Set-Content -LiteralPath $lockPath -Value ($updated.TrimEnd() + [Environment]::NewLine) -NoNewline
}

Update-JsonVersion 'app\package.json'
Update-PackageLockVersion
Update-PnpmLockVersion
Update-JsonVersion 'app\src-tauri\tauri.conf.json'
Update-RegexVersion 'app\src-tauri\Cargo.toml' '(?m)^version = "[^"]+"' "version = `"$Version`""
Update-RegexVersion 'app\src-tauri\Cargo.lock' '(?ms)(\[\[package\]\]\r?\nname = "app"\r?\nversion = ")[^"]+(")' "`${1}$Version`${2}"
Update-RegexVersion 'README.md' 'version-(?:[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?|-Version)-brightgreen' "version-$Version-brightgreen"
Update-RegexVersion 'Docs\ARCHITECTURE.md' '> \*\*Version:\*\* (?:[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?|-Version)' "> **Version:** $Version"

Write-Host "Synchronized version to $Version"
