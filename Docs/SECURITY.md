# SharkDrive Security Model

This document explains what SharkDrive protects, what it does not protect, and how to use its security features without surprises.

## Short Version

SharkDrive can encrypt file contents locally before upload. Telegram stores the encrypted bytes, and SharkDrive decrypts them only when your encryption password is loaded.

Your encryption password is not uploaded to Telegram and is not recoverable by SharkDrive.

## What SharkDrive Protects

- File contents when a file is uploaded with encryption enabled.
- New files uploaded into folders marked as auto-encrypt.
- The in-memory encryption key through auto-lock after inactivity.
- The local Telegram session file when Session PIN is enabled.
- LAN share links with random tokens, optional password, expiration, and download limits.

## What SharkDrive Does Not Protect

- File names, folder names, sizes, and dates unless future metadata encryption is added.
- Your Telegram account if someone can log in to it directly.
- A device that is already compromised by malware or remote access.
- Screenshots or copied content while a file is open on screen.
- Lost encryption passwords. SharkDrive cannot recover them.

## Encryption Modes

### Per-file Encryption

Use encrypted upload when a specific file needs protection. The file is encrypted before upload and marked as encrypted in the explorer.

### Folder Auto-encryption

When a folder has auto-encrypt enabled, new uploads into that folder are encrypted by default. Existing files are not automatically converted until you explicitly run the encryption audit flow.

### Global Encryption Key Loaded

When the encryption password is loaded in Settings, SharkDrive can preview and download encrypted files. This does not mean every file is encrypted. It only means the key is currently available in memory.

## Auto-lock

Auto-lock clears the encryption key from memory after the configured inactivity period. Telegram remains connected, but encrypted files require the password again.

Recommended values:

- 5 minutes for shared or risky devices.
- 15 minutes for normal personal use.
- Disabled only for testing or isolated machines.

## Session PIN

Session PIN protects the local Telegram session file with a 6-digit PIN. It is useful if someone copies files from your computer.

Session PIN is not the same as the encryption password:

- Session PIN protects local login/session data.
- Encryption password protects encrypted file contents.

## Encryption Audit

The encryption audit in Settings uses the local index to show encrypted and plain files per folder.

Use it to answer:

- Which folders contain plain files?
- Which folders are fully encrypted?
- Which plain files should be converted?

Conversion is intentionally explicit. SharkDrive should not silently rewrite your remote files.

## Key Rotation

Key rotation is a high-risk operation because it downloads, decrypts, re-encrypts, uploads replacements, and then removes originals one file at a time.

Use it only when:

- You know the old password.
- You have tested the new password.
- You have time to let the process finish.
- You understand that interruptions may require another sync/audit pass.

## Sharing

Share links are LAN links served by SharkDrive while the app/server is available. They are not public cloud URLs.

Use expiration, passwords, and download limits for anything sensitive. Revoke links when they are no longer needed.

## Practical Recommendations

- Use folder auto-encryption for private folders.
- Use per-file encrypted upload for individual sensitive files.
- Keep the encryption password in a password manager.
- Enable auto-lock.
- Enable Session PIN on shared machines.
- Periodically review the encryption audit.
- Do not rely on SharkDrive to recover a forgotten password.
