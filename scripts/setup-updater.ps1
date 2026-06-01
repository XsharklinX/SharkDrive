param(
    [string]$KeyPath = (Join-Path $HOME '.tauri\sharkdrive.key'),
    [switch]$Force,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$appRoot = Join-Path $root 'app'
$configPath = Join-Path $appRoot 'src-tauri\tauri.conf.json'
$publicKeyPath = "$KeyPath.pub"

if ((Test-Path -LiteralPath $KeyPath) -and -not $Force) {
    Write-Host "Using the existing private key at $KeyPath"
} else {
    $keyDirectory = Split-Path -Parent $KeyPath
    New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null

    Push-Location $appRoot
    try {
        $arguments = @('run', 'tauri', 'signer', 'generate', '--', '--ci', '-w', $KeyPath)
        if ($Force) {
            $arguments += '--force'
        }
        & npm @arguments
        if ($LASTEXITCODE -ne 0) {
            throw 'Tauri updater key generation failed.'
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $KeyPath) -or -not (Test-Path -LiteralPath $publicKeyPath)) {
    throw "Expected updater key files were not found at $KeyPath and $publicKeyPath"
}

$publicKey = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim()
$privateKey = (Get-Content -LiteralPath $KeyPath -Raw).Trim()
$configContent = Get-Content -LiteralPath $configPath -Raw
$matcher = [regex]::new('("pubkey"\s*:\s*")[^"]*(")')
$updatedConfig = $matcher.Replace($configContent, { param($match) $match.Groups[1].Value + $publicKey + $match.Groups[2].Value }, 1)
[System.IO.File]::WriteAllText($configPath, $updatedConfig, [System.Text.UTF8Encoding]::new($false))

Set-Clipboard -Value $privateKey

$secretUrl = 'https://github.com/XsharklinX/SharkDrive/settings/secrets/actions/new'
if (-not $NoBrowser) {
    Start-Process $secretUrl
}

Write-Host ''
Write-Host 'Updater preparation complete.' -ForegroundColor Green
Write-Host ''
Write-Host "1. The private key was stored outside the repository:"
Write-Host "   $KeyPath"
Write-Host '2. Back up that file somewhere safe. Losing it prevents future updates.'
Write-Host '3. The private key is currently in your clipboard.'
Write-Host '4. In the GitHub page that opened, create this repository secret:'
Write-Host ''
Write-Host '   Name:  TAURI_SIGNING_PRIVATE_KEY' -ForegroundColor Cyan
Write-Host '   Value: paste the clipboard content' -ForegroundColor Cyan
Write-Host ''
Write-Host '5. Commit the updated app/src-tauri/tauri.conf.json file.'
Write-Host ''
Write-Host 'Do not paste the private key into source files, chat messages, or issues.'
