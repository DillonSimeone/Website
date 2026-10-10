# MODULE SPEC: postCombat, PHASE 2 (variable bodies, condition %, richer anatomy)

Suggested repo path: `gameDev/SPEC_postCombat_phase2.md`.
Read `AGENTS.md`, then `gameDev/SPEC_postCombat.md` (Phase 1), then this file.
**Where Phase 2 conflicts with Phase 1, Phase 2 wins.** Section 1 lists exactly what is superseded.
Phase 1 file allow-list, import rules, and project rules (no build step, no `alert/prompt/confirm`,
no canvas silhouette creatures, z-index band, audio never the only channel) all still apply.

**Additional files you may create/edit:** `content/templates/*.json`, `src/postcombat/body.js` (new),
`src/postcombat/balance.js` (new). You may READ `src/skills.js` (read-only) to confirm the skill
level range; do not edit it.

---

## 0. Why Phase 2 exists (playtest findings from the live Phase 1 harness)

| # | Observation | Root cause | Fix (section) |
|---|---|---|---|
| 1 | Every body of a species has the identical organs | Organs are static per species def | Per-body generation with presence rolls (3) |
| 2 | Human gear costs pulse to take | Gear modeled as an organ | Gear becomes free "loose items" (7) |
| 3 | Human clamp only protects the heart | One clamp point, covering one item | Clamp rework + validator (6) |
| 4 | Skill 1 harvests everything | Budgets too loose. Dire wolf: item pulse costs sum to 67 vs start pulse 75; calorie costs sum to ~11 vs 100 cal | Budget rebalance + balance test (5) |
| 5 | Outcome is binary damaged/intact | Discrete quality tiers | Condition 0-100 (4) |
| 6 | Wolf has one eye, no limbs, no tail | Hand-authored minimal organ lists | Body-plan templates and slot taxonomy (3) |
| 7 | Tags truncated ("Prime Flank ..."), bottom tag clipped by log panel, tags piled on one side | Naive layout | Layout rules (9) |
| 8 | Log shows "Illegal action clamp: specimen is dead" | Clamp controls still reachable on dead specimens | Hide/disable, never error (6, 9) |

## 1. What is superseded from Phase 1

- 4.4 / 4.5 / 4.7 (success %, quality tiers, ceilings) are replaced by sections 4 and 5 here.
- 4.6 flatline "lost vs capped" is replaced by condition multipliers (4.4).
- 6.1 / 6.2 / 6.3 schemas are replaced by section 8. Bump `schemaVersion` to `2`; v1 files must fail
  validation with a readable "v1 schema, needs migration" message (do not silently load them).
- Phase 1 checks 3, 4, 6, 8, 11, 12, 14 are superseded by section 11. Checks 1, 5, 13, 15-20 still apply.
- Everything else (verbs, turn model, clamp costs, ground loot being free, Feast/Leave confirm,
  entrance animation, audio interface, harness structure, headless script tokens) is unchanged.

## 2. Design summary

1. A species is a **template + overrides**. Templates define a full body plan (head, limbs, tail, paired
   eyes, organs). Species patch it.
2. Every body is **generated per seed**: which slots are present, how many units, and each slot's
   starting **condition** (0-100). No two wolves are the same.
3. Extraction no longer succeeds or fails. It **multiplies condition by a cut factor** driven by skill
   vs difficulty. Below 10% the item is destroyed.
4. Budgets are tightened so a typical body offers roughly **twice** what you can take. The decision
   (order, clamps, what to abandon) must be real, and a built-in balance test enforces it.
5. Combat damage matters: how you hurt the creature changes which parts are worth taking.

## 3. Body generation

### 3.1 Slot taxonomy

Every harvestable thing is a **slot** with a `kind`:

| kind | Examples | Pulse cost | Calorie cost | Notes |
|---|---|---|---|---|
| `part` | head, foreleg_l, hindleg_r, tail, torso (humanoids) | low (2-6) | high (organ cost + 3) | Structural, graftable onto the rig. Sided (`side: left/right`) where relevant. |
| `organ` | heart, lungs, liver, eyes, brain, flank meat | medium to high (8-25) | by rarity | Pulse-sensitive; may be `fragile`. Can stack (`yield`). |
| `trait` | venom gland, thorn mantle, echo organ | medium (6-15) | by rarity | Rare. Low `presencePct` (10-40). Where mutations live. |
| loose items | gear, satchel, severed limbs | none | none | Not slots. See section 7. |

Target density: an average generated body shows **about 8 items, never more than 12**. Template slots
number ~14-18 candidates; presence rolls cull them.

### 3.2 `generateBody(specimenDef(resolved), input) -> BodyInstance`

Pure function in `src/postcombat/body.js`. **Per-slot RNG:** each slot uses its own stream seeded
`mulberry32(fnv1a(String(input.seed) + ":" + slot.id))`. This makes a body stable when defs are edited
or slots reordered (adding a slot never changes other slots' results).

Per slot, always draw four numbers in this order: `u_presence, u_cond1, u_cond2, u_qty`.

```
present   = slot.presencePct >= 100 || u_presence*100 < slot.presencePct
quantity  = slot.yield ? slot.yield.min + floor(u_qty * (slot.yield.max - slot.yield.min + 1)) : 1
bodyCondition (0-100) =
    clamp(10, 100,
        BODY_COND_MEAN                                  // 80
      + (u_cond1 + u_cond2 - 1) * BODY_COND_SPREAD      // triangular, spread 15
      - regionDamage[slot.region] * REGION_DAMAGE_FACTOR // 0.8; regionDamage is 0-100
      - (input.state == 'dead' ? DEAD_PENALTY : 0))     // 8
```

`BodyInstance`:
```json
{ "items": [
  { "slotId": "heart", "present": true, "quantity": 1, "bodyCondition": 71, "taken": false },
  { "slotId": "foreleg_l", "present": false, "reason": "mangled" }
] }
```
- Absent `part`/`organ` slots show a dim **ghost marker** labeled with the reason ("Mangled") so the
  player understands why a wolf has no foreleg on this one. Absent `trait` slots render nothing.
- Present items are the only extractable ones.
- Severed parts from combat (`input.damage.severedParts`) are NOT generated here; they go to the
  loose tray (section 7) with their own condition (`bodyCondition - SEVER_PENALTY`, penalty 15).

## 4. Condition model (replaces quality tiers)

### 4.1 Representation
Every harvested item has `condition` (integer 0-100). 0 = destroyed, 100 = flawless.
Display bands (UI only): `<10 RUINED`, `10-39 POOR`, `40-69 FAIR`, `70-89 GOOD`, `90-100 FLAWLESS`.
Pre-extraction tags show the **band**; the exact number appears after extraction.
[OPEN] Inspection skill could reveal exact numbers pre-extraction (deferred, section 12).

### 4.2 Cut formula (one extract action)
Draw exactly two numbers `u1, u2` from the **action stream** (seeded `mulberry32(fnv1a(seed + ":cuts"))`,
consumed in action order; every extract draws two regardless of outcome).

```
skillScore  = SKILL_FLOOR + SKILL_RANGE * (skill - 1) / (SKILL_MAX - 1) + player.precisionBonus
              // starting: SKILL_FLOOR 20, SKILL_RANGE 70, SKILL_MAX 10  [confirm range from skills.js]
difficulty  = slot.difficulty ?? RARITY_DIFFICULTY[slot.rarity]
              // common 10, uncommon 25, rare 40, epic 55, legendary 70
margin      = skillScore - difficulty
spread      = max(5, 30 - 25 * (skill - 1) / (SKILL_MAX - 1))
cutFactor   = clamp(0.10, 1.00, 0.60 + margin/100 + (u1 + u2 - 1) * spread / 100)
fragile     = slot is fragile ? (pulse >= 50 ? 1 : 0.4 + 0.012 * pulse) : 1     // living only
condition   = round(item.bodyCondition * cutFactor * fragile * flatlineMult(item))
if condition < DESTROY_THRESHOLD (10): item is destroyed -> lost, reason "destroyed"
```
Stacks (`quantity > 1`) are cut in ONE roll: all units share the resulting condition; if destroyed, all
units are lost.

### 4.3 Targets (average condition for a body-condition-80 item; the balance test must show these)

| Skill | common | uncommon | rare | epic | legendary |
|---|---|---|---|---|---|
| 1 | >= 55 | 40-50 | 28-38 | 16-26 | 5-15 (destroyed >= 40%) |
| mid (5-6) | >= 75 | 65-78 | 55-65 | 42-52 | 25-38 |
| max | >= 78 | >= 78 | >= 75 | >= 70 | 58-75 (destroyed < 3% below legendary) |

The constants above are starting values that approximately hit these. Tune `config.js` (not logic) until
`?test=balance` reports the table within tolerance.

### 4.4 Flatline (replaces Phase 1 4.6)
On flatline (living specimen reaches pulse 0): state becomes `dead`, clamps unavailable. For every
remaining untaken item, set `flatlineMult`: fragile x0.25, others x0.70 (applied at extraction time via
the formula, and shown by graying the tag). Items whose projected max condition is < 10 are marked
"ruptured" and unextractable. Loose items are unaffected. Dead-from-start specimens have no
flatline multiplier (their `DEAD_PENALTY` is already in `bodyCondition`).

### 4.5 What condition means downstream (module does not implement; it only returns it)
The caller scales the harvested item's power (rig stats, alchemy yield, sale price) by `condition/100`.
Document this in the AGENTS.md patch so the owners of `chimera.js` and the market apply it.

## 5. Budget rebalance

### 5.1 Starting pulse comes from the fight, not a default
Typical living start pulse is **15-60, mean ~35**. Harness default: 35. (Integration guidance:
knocked-out/sedated 40-60, bled into shock 15-35.) 75 is a testing value, not a normal one.

### 5.2 Pulse cost guidance (content rule, validated)
For a fully-present living specimen, `sum(pulseCost over all non-loose slots)` should be between
**1.6x and 2.4x** the typical start pulse (i.e. ~55-85). Validator warns outside this band.
Starting costs: `part` 2-6, `organ` 8-25, `trait` 6-15.

### 5.3 Calorie costs
Starting: organ/trait by rarity `common 3, uncommon 5, rare 8, epic 12, legendary 18`; `part` = rarity cost + 3.
Clamp 1 (unchanged). Loose items 0. A full harvest of ~8 items lands around 45-60 calories.
**Role of calories:** pulse is the budget that always binds; calories bind when the run is going badly
(hungry players must choose between harvesting and survival). Feast returns 25-45. The harness
calorie slider must make this visible. If playtests want calories binding more often, raise costs in
`config.js`, nothing else.

### 5.4 Balance test: `postCombat.html?test=balance`
Uses `core.js` + `body.js` + `balance.js`, no DOM. For each specimen, for skill in {1, mid, max},
for clamp loadouts {0 sutures, 2 sutures}, run 200 seeds (seeds 1..200) with state living, pulse 35,
calories 100. Per body compute `value = sum(condition/100 * RARITY_VALUE[rarity] * quantity)` with
`RARITY_VALUE = {common 1, uncommon 2.5, rare 6, epic 14, legendary 30}`. Report, as fractions of
the body's total *potential* value (all present items at bodyCondition):
- **random order** average
- **best order** (brute-force all permutations when <= 8 present items; otherwise best of 5000
  random permutations plus a greedy value/pulse heuristic)
- **worst order** (same method)

Also print the section 4.3 table and presence frequencies per slot. Output as plain text and a
JSON blob (copyable).

## 6. Clamp rework

- A clamp point declares `protects`: a list of **regions**. Its `drainReductionPct` applies to the pulse
  cost of every untaken item whose `region` is in `protects`. `bleedReductionPct` still reduces passive bleed.
- Every living specimen must have **at least 2 clamp points** with disjoint `protects`, together
  covering **>= 75%** of total pulse cost. Validator warns otherwise. (Phase 1's single heart-only
  clamp on the poacher is exactly what this prevents.)
- Clamp markers are **not rendered at all** on dead specimens, and `canAct` returns `ok:false` with a
  reason that is never shown as an error: no "Illegal action" log lines can be produced from UI input.
- `killsPulse` organs cannot be protected by a clamp (their cost is the whole pulse).
- **Forecast:** a `killsPulse` organ's tag shows `ENDS PULSE: fragile items left will rot (N)` computed from live
  state. If N > 0, clicking it requires the in-place two-step confirm (same pattern as Feast/Leave).

## 7. Loose items tray (gear, ground loot, severed parts)

Replaces "gear as organ". A `loose` entry in the def:
```json
{ "id": "poacher_satchel", "name": "Poacher's Satchel", "loot": "poacher_satchel",
  "rarity": "uncommon", "presencePct": 80, "yield": { "min": 1, "max": 1 } }
```
- Shown in a **tray** below the body next to severed parts, not on the anatomy.
- Taking is **free**: 0 pulse, 0 calories, no roll, no condition (reported as `condition: 100`).
- Presence is rolled in `generateBody` like any slot (same per-slot stream).
- Severed parts use their `severable` def entry and appear here with condition per 3.2.
- Humans' worn/carried items (weapons, wraps, coin) are `loose`; their organs and limbs are slots.

## 8. Schemas (v2)

### 8.1 `BodyTemplate` (`content/templates/<id>.json`)
```json
{
  "schemaVersion": 2,
  "id": "quadruped",
  "art": { "placeholder": "quadruped" },
  "slots": [
    { "id": "head", "name": "Head", "kind": "part", "slotType": "head", "region": "head",
      "anchor": [180, 300], "hitShape": { "type": "ellipse", "rx": 55, "ry": 45 },
      "rarity": "uncommon", "presencePct": 100, "pulseCost": 4 },
    { "id": "foreleg_l", "name": "Left Foreleg", "kind": "part", "slotType": "leg", "side": "left",
      "region": "forelegs", "anchor": [260, 220], "hitShape": { "type": "ellipse", "rx": 30, "ry": 50 },
      "rarity": "common", "presencePct": 90, "pulseCost": 3, "reasonAbsent": "mangled" },
    { "id": "eyes", "name": "Eyes", "kind": "organ", "slotType": "eye", "region": "head",
      "anchor": [165, 275], "hitShape": { "type": "ellipse", "rx": 20, "ry": 14 },
      "rarity": "common", "presencePct": 95, "yield": { "min": 1, "max": 2 },
      "pulseCost": 6, "tags": ["fragile"] },
    { "id": "heart", "name": "Heart", "kind": "organ", "slotType": "organ", "region": "thorax",
      "anchor": [330, 300], "hitShape": { "type": "ellipse", "rx": 35, "ry": 30 },
      "rarity": "rare", "presencePct": 100, "pulseCost": 25, "killsPulse": true }
  ],
  "clampPoints": [
    { "id": "carotid", "name": "Carotid", "anchor": [200, 250], "protects": ["head"],
      "drainReductionPct": 50, "bleedReductionPct": 10 },
    { "id": "aorta", "name": "Aorta", "anchor": [340, 260], "protects": ["thorax", "abdomen"],
      "drainReductionPct": 40, "bleedReductionPct": 25 },
    { "id": "femoral", "name": "Femoral", "anchor": [480, 340], "protects": ["forelegs", "hindlegs", "tail"],
      "drainReductionPct": 50, "bleedReductionPct": 10 }
  ]
}
```
Slot required fields: `id, name, kind, slotType, region, anchor, hitShape, rarity, presencePct, pulseCost`.
Optional: `side, yield, difficulty, tags (fragile), requires, killsPulse, calorieCost, reasonAbsent`.
Templates required: `quadruped`, `humanoid`. (Insectoid/avian are future work.) Ship 12-18 slots each.

### 8.2 `SpecimenDef` v2
```json
{
  "schemaVersion": 2,
  "id": "dire_wolf",
  "displayName": "Dire Wolf Alpha",
  "kind": "beast",
  "template": "quadruped",
  "art": { "body": null, "size": [1024, 640], "keying": "none" },
  "patch": {
    "heart":   { "rarity": "epic", "pulseCost": 25 },
    "eyes":    { "name": "Nightstalker Eyes", "rarity": "rare", "yield": { "min": 1, "max": 2 } }
  },
  "remove": [],
  "add": [
    { "id": "alpha_gland", "name": "Alpha Pheromone Gland", "kind": "trait", "slotType": "organ",
      "region": "thorax", "anchor": [380, 260], "hitShape": { "type": "ellipse", "rx": 18, "ry": 14 },
      "rarity": "epic", "presencePct": 25, "pulseCost": 10 }
  ],
  "loose": [],
  "severable": [
    { "id": "foreleg_l", "slotId": "foreleg_l" }
  ],
  "baseVitals": { "pulse": 100 },
  "feast": { "calories": 35, "biomassExp": 4 }
}
```
- `resolveSpecimen(def, templates)` = template slots, minus `remove`, shallow-merged with `patch`
  (keyed by slot id), plus `add`. Clamp points come from the template unless the def supplies its own.
- `severable[].slotId` ties a combat-severed part to its slot. A severed slot is removed from the
  generated body (it is on the ground instead) and a stump patch is drawn at its anchor.
- If a slot has no `loot`, the module synthesizes loot id `"<specimenId>:<slotId>"` and name
  `"<displayName> <slot.name>"`. The caller maps by `slotType`, `side`, and rarity.

### 8.3 `SurgeryInput` v2
```json
{
  "schemaVersion": 2,
  "specimenId": "dire_wolf",
  "state": "living",
  "pulsePct": 35,
  "bloodPct": 14,
  "damage": {
    "severedParts": ["foreleg_l"],
    "regionDamage": { "head": 10, "thorax": 45, "forelegs": 30 }
  },
  "player": {
    "calories": 100, "maxCalories": 120,
    "surgerySkill": 1, "precisionBonus": 0,
    "supplies": { "sutures": 2 }
  },
  "seed": 12345,
  "options": { "skipEntrance": false, "forceAllPresent": false }
}
```
Legacy `woundedRegions: [r]` is still accepted and treated as `regionDamage[r] = 30`.
`forceAllPresent` is for the harness only (testing); ignored when `NODE_ENV`-style `options.production`
is set by the caller.

### 8.4 `SurgeryResult` v2
```json
{
  "schemaVersion": 2,
  "specimenId": "dire_wolf",
  "specimenKind": "beast",
  "seed": 12345,
  "harvested": [
    { "lootId": "dire_wolf:heart", "slotId": "heart", "slotType": "organ", "side": null,
      "kind": "organ", "rarity": "epic", "condition": 64, "quantity": 1, "source": "body" },
    { "lootId": "dire_wolf:foreleg_l", "slotId": "foreleg_l", "slotType": "leg", "side": "left",
      "kind": "part", "rarity": "common", "condition": 58, "quantity": 1, "source": "severed" },
    { "lootId": "dire_wolf:eyes", "slotId": "eyes", "slotType": "eye", "side": null,
      "kind": "organ", "rarity": "rare", "condition": 41, "quantity": 2, "source": "body" }
  ],
  "lost": [
    { "slotId": "alpha_gland", "reason": "destroyed", "condition": 6 },
    { "slotId": "liver", "reason": "forfeited" }
  ],
  "caloriesSpent": 31,
  "caloriesGained": 35,
  "biomassExpGained": 4,
  "suppliesUsed": { "sutures": 1 },
  "skillXp": { "Surgery": 6 },
  "endedBy": "feast",
  "flatlined": false
}
```
`source`: `body | severed | loose`. `lost.reason`: `destroyed | ruptured | forfeited`
(`ruptured` = became unextractable after flatline). Absent slots are NOT listed anywhere in the result.
`condition` is an integer 1-100 for harvested items.
`skillXp`: +1 per attempt, +1 more if `condition >= 70`, +2 more if rare+ and `condition >= 50`.

## 9. UI changes

- **Callout layout.** Assign each tag to left or right by anchor x relative to body center, sort by anchor y,
  enforce a minimum vertical gap (>= 8px), and clamp tags inside the stage's safe area (never under
  the harness log panel or HUD). **Names wrap; they are never ellipsized.** Tag width fixed ~220px.
  Leader lines run to the anchor and avoid crossing other tags where possible.
- **Overflow.** If more than 8 tags on one side, collapse by `kind` into chips ("ORGANS 5"); hover or focus expands.
- **Tag contents:** name, rarity, **condition band bar**, pulse cost (after clamp reduction), calorie cost,
  badges: `FRAGILE`, `ENDS PULSE (N rot)`, `REQUIRES: X`, `x2` for stacks.
- **Ghost markers** for absent non-trait slots (dim, "Mangled", not clickable).
- **Dead specimens:** no clamp markers, no pulse meter.
- **Tray:** loose items and severed parts in a strip under the body; free to take.
- **Harness additions:**
  - **Body inspector** panel listing every generated item (present, quantity, bodyCondition, region damage applied).
  - "Reroll body" (new seed, same input) and "Force all present" toggle.
  - `?test=balance` link and results panel.
  - The roll log shows `skillScore, difficulty, margin, u1, u2, cutFactor, fragile, flatlineMult, condition`.
  - The harness log panel is collapsible and defaults to collapsed height <= 20% of viewport.

## 10. Content to ship

| File | Notes |
|---|---|
| `templates/quadruped.json` | Head, 4 legs (sided), tail, paired eyes (stack), brain, heart, lungs, liver, flank meat, hide. 3 clamp points. |
| `templates/humanoid.json` | Head, 2 arms, 2 legs, torso, eyes, brain, heart, lungs, liver. 3 clamp points. |
| `generic_beast` | quadruped, no patches (fallback) |
| `dire_wolf` | quadruped + alpha gland trait + patches as in 8.2 |
| `verdant_thorn_beast` | quadruped with forelegs patched into scythe arms (rarity rare), thorn-mantle trait, venom gland trait |
| `human_poacher` | humanoid + loose: satchel, cleaver, linen wraps, coin purse |

Migrate or delete all Phase 1 specimen files. They must not remain loadable as v1.
Maintain `content/specimens/index.json` and `content/templates/index.json` manifests.

## 11. Acceptance checks (Phase 2; all demonstrable in the harness)

1. All v2 content validates; a v1 file produces a readable "needs migration" error, not a crash.
2. Same input + seed generates an identical body twice; a different seed generates a different body (verified over 20 seeds on dire_wolf: not all identical).
3. Presence frequencies over 200 seeds are within +/-8 percentage points of each slot's `presencePct`.
4. Per-slot streams: deleting or reordering an unrelated slot does not change another slot's presence/quantity/condition on the same seed (automated test).
5. Absent part/organ slots render ghost markers and cannot be extracted; absent traits render nothing.
6. Dire wolf bodies include limbs, tail, and eyes (stack) when present; poacher bodies include arms and legs.
7. Condition is an integer 0-100 everywhere; tags show bands; the result shows exact numbers; no quality-tier strings remain in the code.
8. The section 4.3 table is met within tolerance by `?test=balance`.
9. `condition < 10` after the cut formula produces `lost` with `destroyed`.
10. Stacks share one roll; `quantity` is returned; destroyed stacks lose all units.
11. Fragile items degrade with pulse (formula 4.2) and with flatline (x0.25); non-fragile degrade x0.70 on flatline; items that cannot reach 10 are marked `ruptured`.
12. `regionDamage` lowers `bodyCondition` per 3.2; legacy `woundedRegions` still works.
13. **Budget:** at pulse 35, skill 1, 2 sutures, brute-force-best order harvests <= 65% of total potential value on average across 200 bodies for dire_wolf and verdant_thorn_beast, and the worst order harvests <= 35%.
14. **Order matters:** best-order average exceeds random-order average by >= 20 percentage points of potential value (skill 1, 2 sutures).
15. At skill max with 2 sutures, best-order average >= 75% of potential value (progression feels like progress).
16. Calorie costs follow 5.3; with calories set to 20 the harness visibly disables unaffordable items with the needed amount; calories never go negative.
17. Every living specimen has >= 2 clamp points with disjoint `protects` covering >= 75% of pulse cost (validator enforces/warns); clamp markers do not exist on dead specimens; no "Illegal action" log line can be produced from UI input.
18. `killsPulse` tag shows the rot forecast; clicking it with fragile items remaining requires the in-place two-step confirm.
19. Gear/loose items: free, no roll, never on the anatomy; poacher gear costs 0 pulse.
20. Layout at 1280x720 and 1920x1080 with the worst-case 12 tags: no tag truncated, clipped, or hidden under the log or HUD; overflow collapses into chips.
21. Full-result determinism: same input + seed + script gives a byte-identical `SurgeryResult`.
22. Result validates against 8.4 and contains nothing else. Phase 1 checks 1, 5, 13, 15-20 still pass.

## 12. Deferred ideas (do NOT build now; recorded so they aren't lost)

- **Inspection skill:** reveals exact conditions and trait presence pre-extraction; low skill shows fuzzy bands and hides low-presence traits until cut.
- **Combat-aware bodies:** `regionDamage` is already in the contract. Combat could later track *how* a creature died (blunt vs piercing) to bias which organs are pre-ruined.
- **Species mutations / alpha variants:** rolled at the encounter level (not here), passed in as `input.variantTags`.
- **Head vs brain exclusivity**, torso as a harvestable for beasts. [OPEN]
- **Insectoid and avian templates**, boss anatomy with unique slots.
- **Condition-based rig effects** (owned by `chimera.js`).

## 13. AGENTS.md patch (apply when done)

Add to **FILE MAP**:
```
* `content/templates/*.json`: Body-plan templates (slots, clamp points). Species files patch templates.
* `src/postcombat/body.js`: Deterministic per-body generation (per-slot hashed RNG). `balance.js`: balance test harness.
```
Add to **INSTRUCTIONS FOR FUTURE AGENTS**:
```
8. Harvested items carry `condition` (1-100). Anything consuming them (rig stats, alchemy, market) MUST scale by condition/100.
9. Never hardcode a species' harvestables. Add or edit a template/species JSON, then run `postCombat.html?test=balance`.
10. Bodies are generated per seed. Never reuse a seed across encounters; derive it from run seed + encounter id.
```

## 14. Build order

1. `config.js` constants, v2 validators (including budget and clamp warnings), delete/migrate v1 content.
2. `body.js` + templates + 4 specimens; body inspector in the harness. Checks 1-6, 12.
3. Condition model in `core.js`, flatline multipliers, stacks. Checks 7, 9-11, 21.
4. Loose tray and gear. Check 19.
5. Clamp rework and kill-pulse forecast. Checks 17-18.
6. `balance.js` and `?test=balance`; tune `config.js` until checks 8, 13-16 pass. Do not change logic to hit numbers; change config.
7. Layout rework and ghost markers. Check 20.
8. Final: checks 22, AGENTS.md patch.
