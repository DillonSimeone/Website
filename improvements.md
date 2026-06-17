# Improvements

Concrete, repo-specific suggestions for `F:\Github\Website`, ordered roughly by
payoff-to-effort. Nothing here is urgent; this is a "when you have an afternoon"
list.

---

## 1. Pin PlatformIO platform versions (highest payoff)

**Problem:** ~120 of your `platformio.ini` files use a bare
`platform = espressif32` with no version. That resolves to *whatever is installed
on the machine that day*, which is exactly what caused the `tool-esptoolpy`
download hang. See `public/ESP32Codes/PLATFORMIO_TOOLCHAIN_NOTES.md` for the full
story.

**Fix:** Pin the platform in every project you still build. For the
official Espressif platform that pairs with the esptool 4.5.1 you provisioned:

```ini
platform = espressif32@6.6.0
```

**Suggested approach — don't boil the ocean:**
- Pin the handful you actively flash *now* (Ember, both LightBatons, the
  WirelessHaptic trio, DataGlove). These are your "live" units.
- Leave dormant/archived projects alone until you next touch one — then pin it.
- You currently have a deliberate split: official `espressif32@6.x` for most,
  and the **pioarduino fork** (URL-based `platform = .../pioarduino/...`) for
  `Haxel` and `HumanDetector`. That's fine, but those two are what pull in the
  newer esptool and clobber the shared tool folder. If they keep biting you,
  give them their own `core_dir` so they stop fighting the official-platform
  projects over `~/.platformio/packages`.

## 2. Settle on ONE agent instruction file convention

**Problem:** You have `GEMINI.md` / `gemini.md` scattered across dozens of
folders (mixed case), plus a root `GEMINI.md`, plus `.claude/`. **Cursor does not
read `GEMINI.md` at all**, so most of those files are invisible to the agent
you're using right now. (And Gemini CLI itself is being retired June 18, 2026 in
favor of Antigravity — so the format you've invested in is a moving target.)

**Reality in mid-2026:** there is no clean universal standard. Each tool keeps a
native file (`CLAUDE.md`, `GEMINI.md`, Cursor's `.cursor/rules/*.mdc` and
`AGENTS.md`), and the newer "Agent Skills" (`SKILL.md`) standard is emerging on
top.

**Recommendation:**
- Make **`AGENTS.md`** the single source of truth per project. Cursor, Codex, and
  most current agents read it natively; it's plain markdown with no lock-in.
- Don't hand-maintain N copies. Either delete the per-tool duplicates, or make
  `GEMINI.md` / `CLAUDE.md` one-line pointers: `> See AGENTS.md`.
- The root `GEMINI.md` is actually a *good* website architecture doc — rename it
  `AGENTS.md` (or copy it) so Cursor picks it up.
- Quick sanity check that any tool is reading your file: open a chat and ask
  *"what project instructions are you operating under?"* If it can't quote your
  file, it isn't loading it.

## 3. Standardize the upload/flash scripts

You fixed `upload.bat` (Ember) and `flashFollower.bat` (LightBaton) to locate
`pio.exe` robustly and use CRLF. The same fragile pattern likely exists in other
projects' `.bat` files. Promote the fixed version to a single shared template
(e.g. `public/ESP32Codes/_tooling/upload.template.bat`) and point projects at it,
so the next "pio is not recognized" surprise is a one-line fix everywhere.

## 4. Commit a toolchain restore helper

You already have the `tool-esptoolpy` backup zip in `_tooling/`. Add a tiny
`restore-esptool.ps1` next to it that does the wipe-and-Expand-Archive from the
toolchain notes. Future-you (or an agent) recovers in one command instead of
rediscovering the manual steps.

## 5. Light repo hygiene (cosmetic, low priority)

- Recurring typos baked into folder names: `Mircopython`, `Mircocontroller`,
  `ImageGenerator` siblings, `MAX7219_Bullshit`. Renames are cheap but break any
  hardcoded paths/links — only do it if you're touching the project anyway.
- `dist/` is gitignored and is a generated mirror of `public/` — good. Just
  remember **all real edits go in `public/`**, never `dist/`.
- Confirm no real secrets slipped in: `.gitignore` correctly excludes
  `secrets.py` / `secrets.h`, but it's worth a `git log` spot-check on those
  paths since they predate the ignore rule.

## 6. A "project tier" convention (answers the 62-projects question)

Instead of trying to keep all 62 projects current, label each one's status so you
know what deserves maintenance. A single line at the top of each `platformio.ini`
or README:

```ini
; status: active        ; flashed regularly — keep pinned & tested
; status: reference      ; works, kept for reuse — pin, don't update
; status: archived       ; experiment/dead end — frozen, ignore
```

Then your update policy is simple: **only `active` projects ever get version
bumps, and only when you have hardware to test them on.** Everything else stays
frozen at the version that last worked.

---

## On "keep everything updated vs. jump to current and hold"

For embedded/hobby firmware, **pin-and-hold wins.** A toolchain bump can silently
change timing, flash layout, or library behavior, and you usually find out only
when hardware misbehaves. So:

- **New projects:** start on a current, known-good platform (e.g. the latest
  `espressif32@6.x` you've validated), then **pin it and leave it** for years.
- **Old working projects:** do *not* mass-update. Pin them to whatever they were
  built and tested on. "If it flashes and runs, freeze it."
- **Update only with a reason:** a new chip, a bug fix you need, or a feature you
  actually want — and only when you can re-test on the actual board.

In short: your instinct to "jump forward to current and stay there for a few
years" is the right one — just do it *per active project*, pin the result, and
let the dormant 50-ish projects sleep.

---

*Last updated: 2026-06-16*
