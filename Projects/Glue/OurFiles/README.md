# ☭ OUR FILES, COMRADE — Seize the Means of Permission ⚒️

> *"Private property is a bourgeois myth. Your file? No, Comrade. **OUR** file."*

A lightweight, zero-dependency Windows Explorer context menu utility that liberates files and folders from the bureaucratic nightmare of Windows NTFS permissions.

---

## The Scenario

You are sitting at your desk. You purchased the hardware. You built the machine. You logged into Windows with your own credentials.

You right-click an extracted folder, an orphaned build cache, a rogue `node_modules`, or stray Mac archive metadata (`__MACOSX`) and press **Delete**.

Windows hits you with this bureaucratic masterpiece:

```
┌─────────────────────────────────────────────────────────────┐
│  Folder Access Denied                                       │
│                                                             │
│  You require permission from NIGHTMARISHTOWE\Doctor         │
│  Nightmares to make changes to this folder.                 │
│                                                             │
│             [ Try Again ]          [ Cancel ]               │
└─────────────────────────────────────────────────────────────┘
```

**You are `Doctor Nightmares`.**

You are being instructed by your own operating system to walk across the room, shake hands with yourself, ask yourself for permission in writing, reject your own petition, and sit back down in defeat.

---

## The Historical Explanation

Under capitalist Windows NTFS architecture:
1. **Ownership $\neq$ Permission**: Even if you own the file, you only hold `WRITE_DAC` (the legal authority to change permissions), not the permission to delete it.
2. **UAC Token Partitioning**: Even as an Administrator, Windows runs `explorer.exe` with a neutered, non-elevated user token. The high-level state authority (`SeTakeOwnershipPrivilege`) remains locked in the vault.
3. **The Gosplan Permitting Office**: If an extracted archive carries over restrictive Unix file permissions, Windows Explorer throws its hands in the air, looks up the registered owner, and tells you to petition yourself.

---

## The Solution: Supreme Soviet Directive 404

**OurFiles** injects a 1-click liberation action directly into your Windows right-click menu:

### `⚒️ Seize the Means of Production (Take Ownership)`

Right-click any stubborn folder, file, or background canvas, and the worker's engine executes three rapid-fire operations:

```cmd
:: 1. Expropriate ownership from bourgeois user tokens to the collective
takeown /f "<target>" /r /d y

:: 2. Liquidate bureaucratic ACLs and grant Full Control to all workers
icacls "<target>" /reset /t /c /q
icacls "<target>" /grant "*S-1-1-0:(OI)(CI)F" /t /c /q

:: 3. Purge counter-revolutionary Read-Only & Hidden attributes
attrib -r -s -h "<target>\*" /s /d
```

---

## Installation

1. Open a terminal or double-click:
   ```cmd
   Install.bat
   ```
2. Approve the UAC prompt from the Central Committee.
3. Done. The context menu entry is immediately active.

---

## How to Use

1. Right-click any file, folder, or empty space in Windows Explorer.
2. Click **`⚒️ Seize the Means of Production (Take Ownership)`**.
3. A retro console window will momentarily appear, display the Five-Year Plan progress report, and liberate the asset.
4. Delete, rename, or edit the file immediately without further consultation from yourself.

---

## Uninstallation

To demobilize the context menu and return to standard bureaucratic oversight:
```cmd
Uninstall.bat
```

---

## Safety Guidelines

> [!WARNING]
> **Do not seize `C:\Windows` or system core directories.**
> Seizing ownership of system-critical operating system binaries will confuse the Windows Update apparatus and may result in an unscheduled one-way ticket to the Blue Screen of Death. Use this tool strictly on project assets, archives, drives, and developer directories.
