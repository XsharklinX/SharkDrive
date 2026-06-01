# Publishing SharkDrive

SharkDrive uses GitHub Releases and the signed Tauri updater feed. The setup is intentionally split into one action you run once and one command you run for each new version.

## First-time setup

Run this from the repository root:

```powershell
.\scripts\setup-updater.ps1
```

The script:

1. creates the updater signing key under `$HOME\.tauri\sharkdrive.key`
2. keeps the private key outside this repository
3. writes the matching public key into `app/src-tauri/tauri.conf.json`
4. copies the private key to your clipboard
5. opens the GitHub Actions secrets page

In GitHub, create one repository secret:

```text
Name:  TAURI_SIGNING_PRIVATE_KEY
Value: paste the clipboard content
```

Commit the updated `tauri.conf.json`. Back up `$HOME\.tauri\sharkdrive.key` securely. If that private key is lost, existing installations cannot verify future updates.

## Publish a version

Use a valid semantic version:

```powershell
.\scripts\publish-release.ps1 -Version 2.9.1 -Publish
```

The script synchronizes version files, runs `npx tsc --noEmit`, creates the release commit, tags it and pushes it. GitHub Actions builds installers and publishes the update assets:

```text
SharkDrive_<version>_x64-setup.exe
SharkDrive_<version>_x64-setup.nsis.zip
SharkDrive_<version>_x64-setup.nsis.zip.sig
latest.json
```

Use dots in versions. `v2.9.1` is valid; `v2.9,1` is not.
