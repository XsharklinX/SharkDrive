# SharkDrive Release Process

This document keeps local builds, GitHub Releases, updater artifacts, and installer QA consistent.

## Release Script

Run releases from any folder with:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\scripts\release.ps1
```

To release a specific version:

```powershell
.\scripts\release.ps1 -Version 4.1.0
```

The script always builds from `app/`, so it avoids the common mistake of running `npm` from the repository root.

## What The Script Does

1. Reads or receives the target version.
2. Validates semantic version format.
3. Fails early if updater signing is enabled but `TAURI_SIGNING_PRIVATE_KEY` is missing.
4. Synchronizes:

- `VERSION`
- `app/package.json`
- `app/package-lock.json`
- `app/pnpm-lock.yaml` when present
- `app/src-tauri/Cargo.toml`
- `app/src-tauri/Cargo.lock`
- `app/src-tauri/tauri.conf.json`
- `README.md`
- `Docs/ARCHITECTURE.md`

5. Runs `npx tsc --noEmit`.
6. Runs `npm run build`.
7. Cleans old installer bundles unless `-NoClean` is passed.
8. Runs `npm run tauri build`.
9. Prints final artifact paths.
10. Creates `Docs/RELEASE_NOTES_vX.Y.Z.md` if missing.

## Updater Signing

Because `tauri.conf.json` has `createUpdaterArtifacts=true` and an updater public key, release builds require:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $HOME\.tauri\sharkdrive.key -Raw
```

If this variable is missing, Tauri may compile successfully and then fail after generating installers. The release script checks this before the expensive Rust build.

## Expected Artifacts

After a successful release build, check:

```text
app/src-tauri/target/release/app.exe
app/src-tauri/target/release/bundle/msi/*.msi
app/src-tauri/target/release/bundle/nsis/*.exe
app/src-tauri/target/release/bundle/**/latest.json
app/src-tauri/target/release/bundle/**/*.sig
```

Exact updater artifact names can vary by Tauri/bundler target, so the script prints whatever exists.

## Installer Polish Checklist

- Product name is `SharkDrive`.
- Publisher is `SharkDrive`.
- Installer icon uses `app/src-tauri/icons/icon.ico`.
- App/taskbar icon uses the configured Tauri icon set.
- Installed Start Menu entry is named SharkDrive.
- Uninstall entry is named SharkDrive.
- No visible `cmd.exe` or PowerShell windows appear during normal app use.
- Setup, launch, update, and uninstall complete without security-looking popups beyond normal Windows prompts.

## Manual QA Checklist

- Login/session restore.
- Sync with no files and with existing folders.
- Create folder and sync again.
- Delete folder and verify remote behavior.
- Upload file.
- Upload duplicate and verify dedupe.
- Download file.
- Multi-select download and ZIP download.
- Preview image, video, PDF, audio and text.
- Share link create, password, expiry, QR and revoke.
- Encryption unlock, encrypted preview/download, auto-lock.
- Session PIN lock/unlock.
- Auto-backup queue and conflict dialog.
- Auto-update check.

## GitHub Release Notes

Use the generated file:

```text
Docs/RELEASE_NOTES_vX.Y.Z.md
```

Fill in Highlights, Fixes, Security Notes, and Upgrade Notes before publishing.

## Notes

- Use `npm` for release builds. The repository currently contains both `package-lock.json` and `pnpm-lock.yaml`; the release script chooses npm for consistency.
- Do not commit `TAURI_SIGNING_PRIVATE_KEY`.
- Keep `Docs/SECURITY.md` updated when encryption, sharing, or session behavior changes.
