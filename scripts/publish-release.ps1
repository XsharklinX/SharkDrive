param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$appRoot = Join-Path $root 'app'
$tag = "v$Version"
$releaseFiles = @(
    'VERSION',
    'README.md',
    'Docs/ARCHITECTURE.md',
    'app/package.json',
    'app/package-lock.json',
    'app/src-tauri/Cargo.toml',
    'app/src-tauri/Cargo.lock',
    'app/src-tauri/tauri.conf.json'
)

if ($Version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$') {
    throw "Version '$Version' is invalid. Use semantic versions such as 2.9.1 or 3.0.0-beta.1."
}

Push-Location $root
try {
    $stagedFiles = @(git diff --cached --name-only)
    $unexpectedStagedFiles = @($stagedFiles | Where-Object { $_ -notin $releaseFiles })
    if ($unexpectedStagedFiles.Count -gt 0) {
        throw "Unrelated staged files detected. Commit or unstage them before publishing: $($unexpectedStagedFiles -join ', ')"
    }

    $existingTag = git tag --list $tag
    if ($existingTag) {
        throw "Tag $tag already exists."
    }

    Set-Content -LiteralPath (Join-Path $root 'VERSION') -Value $Version -NoNewline
    & (Join-Path $PSScriptRoot 'sync-version.ps1') -Version $Version
    if ($LASTEXITCODE -ne 0) {
        throw 'Version synchronization failed.'
    }

    Push-Location $appRoot
    try {
        & npx tsc --noEmit
        if ($LASTEXITCODE -ne 0) {
            throw 'TypeScript validation failed. The release was not published.'
        }
    } finally {
        Pop-Location
    }

    git add -- $releaseFiles

    if (-not $Publish) {
        Write-Host ''
        Write-Host "Release $tag is prepared and TypeScript validation passed." -ForegroundColor Green
        Write-Host 'Review the staged files, then publish with:'
        Write-Host "  .\scripts\publish-release.ps1 -Version $Version -Publish" -ForegroundColor Cyan
        Write-Host ''
        Write-Host 'No commit, tag, or push was created.'
        exit 0
    }

    git commit -m "release: $tag"
    if ($LASTEXITCODE -ne 0) {
        throw 'Release commit failed.'
    }

    git tag $tag
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create tag $tag."
    }

    git push origin main
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not push the release commit.'
    }

    git push origin $tag
    if ($LASTEXITCODE -ne 0) {
        throw "Could not push tag $tag."
    }

    Write-Host ''
    Write-Host "Published $tag. GitHub Actions is now building the installers and latest.json." -ForegroundColor Green
} finally {
    Pop-Location
}
