# Gemini Assistant Workspace Guide  ERust Study 🦀

These instructions apply whenever inspecting, compiling, modifying, or creating native Rust projects inside `F:\Github\Website\public\Glue\RUST\`.

---

## Primary Authority

> [!IMPORTANT]
> **Always refer to [`AGENTS.md`](file:///F:/Github/Website/public/Glue/RUST/AGENTS.md) as the primary architectural and operational standard for this workspace.**
> It defines the mandatory rules for toolchain selection, Win32 double-buffering invariants, GDI leak prevention, and detached background process lifecycle.

---

## Quick Reference Summary

1. **Toolchain Target:**
   * Always compile using the configured GNU target: `stable-x86_64-pc-windows-gnu`.
   * Ensure `C:\Users\DoctorNightmares\.cargo\bin` is in the session `$env:PATH`.
2. **Subsystem Standard:**
   * GUI / HUD applications must use `#![windows_subsystem = "windows"]` in `src/main.rs` to guarantee zero console window popups.
3. **Double-Buffering & Paint Invariant:**
   * In any Win32 `WM_PAINT` handler, strictly use `BeginPaint` and `EndPaint`. Never leave the update region unvalidated.
4. **Detached Process Spawning:**
   * When launching background utilities intended to persist beyond the current agent session, invoke via WMI (`Invoke-CimMethod -ClassName Win32_Process -MethodName Create ...`) to avoid termination by the caller's Job Object.
5. **Cross-Project Synergy:**
   * Utilities created here serve as lean, native compliments or replacements for the Python daemons documented in [`../SKILL.md`](file:///F:/Github/Website/public/Glue/SKILL.md).
