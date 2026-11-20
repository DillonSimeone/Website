# Project: Haptic Weight Lab

Parametric configurator for interchangeable eccentric rotors on a Minebea / NMB **M1N10FB11G** flat brush motor.

## Motor Reference
| Spec | Value |
|:---|:---|
| Part | M1N10FB11G |
| Frame | 12 × 10 × 20 mm |
| Shaft | Ø1.0 × 8.5 mm |
| Rated | 5 V · 13,740 rpm · 0.3 mN·m |
| No-load | 16,040 rpm |

## Architecture
**Glued hub + hex drive + full-height skirt**

1. **Hub / adapter**
   - **Motor face (−Z):** blind shaft bore with **A1 0.6 mm nozzle hole kerf** baked in. CAD bore = shaft ⌀ + glue clearance + hole kerf (defaults ⌀1.00 + 0.08 + 0.45 = **⌀1.53**), so as-printed lands near ⌀1.08 — glue fit without reaming. Hard depth stop ≤ 4.25 mm. Stand with this face up, glue, press shaft in.
   - **Weight face (+Z):** hex slot (across-flats parametric).
2. **Weights** — eccentric top plate + male hex peg + **skirt lips that wrap the full hub height**. Slide on by hand; very hard to fling axially off while spinning.
3. **Fit coupon** — skirt + hex only, for clearance tuning.
4. **Spin guard** — separate printable cage (not packed in the kit envelope).

Minimum feature size ≈ **1.6 mm** (PETG, 0.6 mm nozzle). Small holes are designed oversized — FDM undersize is treated as “kerf.”

## Kit Envelope
One mutation packs **hub + fit coupon + rotors** into **41 × 19 × 10 mm**. Overflow is reported — parts are never silently scaled.

## Print / Use
1. Print PETG on Bambu A1 with 0.6 mm nozzle (no ream if kerf dial is right; tweak Hole Kerf if snug/loose).
2. Glue shaft ≤ 4.25 mm deep.
3. Slide a weight onto the hex until the skirt seats fully.
4. Start at 1–2 V inside a rigid enclosure / spin guard.

## File Structure
```
16-HapticEccentricWeight/
├── index.html
├── style.css
├── AGENTS.md
└── src/
    ├── main.js
    ├── state.js
    ├── manifoldInit.js
    ├── viewport.js
    ├── geometry.js
    ├── geometry/
    │   ├── helpers.js
    │   ├── hub.js
    │   ├── rotors.js
    │   └── guard.js
    ├── mutation.js
    ├── packing.js
    ├── ui.js
    └── export.js
```
