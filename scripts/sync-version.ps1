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
    $updated = [regex]::Replace($content, '"version"\s*:\s*"[^"]+"', "`"version`": `"$Version`"", 1)
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

Update-JsonVersion 'app\package.json'
Update-JsonVersion 'app\src-tauri\tauri.conf.json'
Update-RegexVersion 'app\src-tauri\Cargo.toml' '(?m)^version = "[^"]+"' "version = `"$Version`""
Update-RegexVersion 'README.md' 'version-[0-9]+\.[0-9]+\.[0-9]+-brightgreen' "version-$Version-brightgreen"
Update-RegexVersion 'Docs\ARCHITECTURE.md' '> \*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+' "> **Version:** $Version"

Write-Host "Synchronized version to $Version"
