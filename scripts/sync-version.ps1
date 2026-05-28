param(
    [string]$Version = $(Get-Content -Path (Join-Path $PSScriptRoot '..\VERSION') -Raw).Trim()
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')

function Update-JsonVersion {
    param(
        [string]$Path
    )

    $fullPath = Join-Path $root $Path
    $json = Get-Content -Path $fullPath -Raw | ConvertFrom-Json
    $json.version = $Version
    $json | ConvertTo-Json -Depth 100 | Set-Content -Path $fullPath
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
    Set-Content -Path $fullPath -Value $updated
}

Update-JsonVersion 'app\package.json'
Update-JsonVersion 'app\src-tauri\tauri.conf.json'
Update-RegexVersion 'app\src-tauri\Cargo.toml' 'version = "[^"]+"' "version = `"$Version`""
Update-RegexVersion 'README.md' 'version-[0-9]+\.[0-9]+\.[0-9]+-brightgreen' "version-$Version-brightgreen"
Update-RegexVersion 'Docs\ARCHITECTURE.md' '> \*\*Version:\*\* [0-9]+\.[0-9]+\.[0-9]+' "> **Version:** $Version"

Write-Host "Synchronized version to $Version"
