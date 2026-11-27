/**
 * Apex Parasite - Post-Combat Pure Core Session Logic (Phase 2)
 * Fully headless, zero DOM, zero audio dependencies.
 * Deterministic cut stream per seed: mulberry32(fnv1a(seed + ":cuts")).
 * Implements condition model (0-100), clamp rework, flatline multipliers, and loose/severed tray.
 */

import { CONFIG } from './config.js';
import { validateSurgeryResult } from './validator.js';
import { resolveSpecimen, generateBody, fnv1a, mulberry32 } from './body.js';

export function createSession(specimenDef, templatesOrLoot, lootDefsOrInput, maybeInput, configOverride = {}) {
  // Argument normalization for flexible callers
  let templates = {};
  let lootDefs = {};
  let input = null;
  let configOverrides = configOverride;

  if (maybeInput !== undefined) {
    templates = templatesOrLoot || {};
    lootDefs = lootDefsOrInput || {};
    input = maybeInput;
  } else if (lootDefsOrInput && typeof lootDefsOrInput === 'object' && ('specimenId' in lootDefsOrInput || 'player' in lootDefsOrInput)) {
    // createSession(specimenDef, templates, input) or createSession(specimenDef, lootDefs, input)
    if (specimenDef.template && templatesOrLoot && templatesOrLoot[specimenDef.template]) {
      templates = templatesOrLoot;
      lootDefs = {};
    } else {
      lootDefs = templatesOrLoot || {};
    }
    input = lootDefsOrInput;
  } else {
    input = lootDefsOrInput || {};
  }

  const config = { ...CONFIG, ...configOverrides };

  // Resolve specimen against template if not already resolved
  const resolvedSpecimen = (specimenDef.slots && Array.isArray(specimenDef.slots))
    ? specimenDef
    : resolveSpecimen(specimenDef, templates);

  // Action cuts PRNG stream (Section 4.2)
  const cutRng = mulberry32(fnv1a(String(input.seed) + ':cuts'));

  const isDeadFromStart = input.state === 'dead';
  let pulse = isDeadFromStart ? 0 : (input.pulsePct ?? config.TYPICAL_START_PULSE);
  let flatlined = isDeadFromStart || pulse <= 0;
  const bloodPct = input.bloodPct ?? 100;

  let calories = input.player.calories;
  let caloriesSpent = 0;
  let caloriesGained = 0;
  let biomassExpGained = 0;

  let sutures = input.player.supplies?.sutures ?? 0;
  let suturesUsed = 0;

  const appliedClamps = new Set();
  const extractedItems = new Map(); // slotId -> harvestedEntry
  const destroyedItems = new Map(); // slotId -> { slotId, reason: 'destroyed', condition }
  const rupturedItems = new Map();  // slotId -> { slotId, reason: 'ruptured' }
  const lostItems = new Map();      // slotId -> { slotId, reason: 'forfeited' }

  // Generate deterministic body instance (Section 3.2 & 7)
  const bodyInstance = generateBody(resolvedSpecimen, input);

  // Loose and severed tray items
  const trayItems = [
    ...bodyInstance.severedParts,
    ...bodyInstance.looseItems
  ];

  let ended = false;
  let endedBy = null;
  const skillXp = { Surgery: 0 };
  const rollLog = [];

  function calcBleedReductionPct() {
    let total = 0;
    for (const clampId of appliedClamps) {
      const c = resolvedSpecimen.clampPoints?.find(p => p.id === clampId);
      if (c?.bleedReductionPct) {
        total += c.bleedReductionPct;
      }
    }
    return Math.min(config.BLEED_REDUCTION_CAP, total);
  }

  function calcPassiveBleed() {
    let bleed = config.BASE_BLEED;
    if (bloodPct < config.LOW_BLOOD_THRESHOLD) {
      bleed *= config.LOW_BLOOD_BLEED_MULT;
    }
    const reduction = calcBleedReductionPct();
    bleed *= (1 - reduction / 100);
    return bleed;
  }

  function getSlotCalorieCost(slot) {
    if (!slot) return 0;
    if (slot.kind === 'loose') return config.LOOSE_CALORIE_COST;
    if (slot.calorieCost !== undefined) return slot.calorieCost;
    const base = config.RARITY_CALORIE_COST[slot.rarity] || 3;
    if (slot.kind === 'part') {
      return base + config.PART_CALORIE_ADD;
    }
    return base;
  }

  function getSlotPulseCost(slot) {
    if (pulse === null || isDeadFromStart || flatlined || pulse <= 0) return 0;
    if (slot.killsPulse) return 100;

    // Clamps protect specific regions (Section 6)
    let reductionPct = 0;
    for (const clampId of appliedClamps) {
      const c = resolvedSpecimen.clampPoints?.find(p => p.id === clampId);
      if (c?.protects?.includes(slot.region)) {
        reductionPct += c.drainReductionPct;
      }
    }
    reductionPct = Math.min(100, reductionPct);
    return Math.max(0, Math.round(slot.pulseCost * (1 - reductionPct / 100)));
  }

  function triggerFlatline(events) {
    if (flatlined) return;
    flatlined = true;
    events.push({ type: 'flatline' });

    // Section 4.4: Mark items whose projected max condition is < 10 as "ruptured"
    bodyInstance.items.forEach(item => {
      if (!item.present || item.taken) return;
      if (extractedItems.has(item.slotId) || destroyedItems.has(item.slotId) || rupturedItems.has(item.slotId)) return;

      const isFragile = item.slot.tags && item.slot.tags.includes('fragile');
      const fragileMult = isFragile ? (config.FRAGILE_BASE + config.FRAGILE_SLOPE * 0) : 1.0;
      const flatlineMult = isFragile ? config.FLATLINE_MULT_FRAGILE : config.FLATLINE_MULT_OTHER;

      // Projected max condition with perfect cutFactor 1.0
      const projectedMax = Math.round(item.bodyCondition * 1.0 * fragileMult * flatlineMult);

      if (projectedMax < config.DESTROY_THRESHOLD) {
        rupturedItems.set(item.slotId, { slotId: item.slotId, reason: 'ruptured' });
        events.push({ type: 'organ_ruptured', id: item.slotId });
      }
    });
  }

  function canAct(action) {
    if (ended) {
      return { ok: false, reason: 'Surgery has ended' };
    }
    if (!action || !action.type) {
      return { ok: false, reason: 'Invalid action' };
    }

    switch (action.type) {
      case 'extract': {
        const item = bodyInstance.items.find(i => i.slotId === action.id);
        if (!item) return { ok: false, reason: 'Unknown slot' };
        if (!item.present) return { ok: false, reason: item.reason || 'Not present' };
        if (item.taken || extractedItems.has(item.slotId)) return { ok: false, reason: 'Already harvested' };
        if (destroyedItems.has(item.slotId)) return { ok: false, reason: 'Item was destroyed' };
        if (rupturedItems.has(item.slotId)) return { ok: false, reason: 'Ruptured on flatline' };
        if (lostItems.has(item.slotId)) return { ok: false, reason: 'Item lost' };

        // Requirements check
        if (item.slot.requires && item.slot.requires.length > 0) {
          for (const reqId of item.slot.requires) {
            const reqResolved = extractedItems.has(reqId) || destroyedItems.has(reqId);
            if (!reqResolved) {
              const reqSlot = resolvedSpecimen.slots.find(s => s.id === reqId);
              return { ok: false, reason: `Requires: ${reqSlot?.name || reqId}` };
            }
          }
        }

        const cost = getSlotCalorieCost(item.slot);
        if (calories < cost) {
          return { ok: false, reason: `Need ${cost} cal` };
        }
        return { ok: true };
      }

      case 'clamp': {
        if (isDeadFromStart || flatlined || pulse <= 0) {
          return { ok: false, reason: 'Specimen is dead' };
        }
        const clampPoint = resolvedSpecimen.clampPoints?.find(c => c.id === action.id);
        if (!clampPoint) return { ok: false, reason: 'Unknown clamp point' };
        if (appliedClamps.has(clampPoint.id)) return { ok: false, reason: 'Already clamped' };
        if (sutures < config.CLAMP_SUTURE_COST) return { ok: false, reason: 'No sutures left' };
        if (calories < config.CLAMP_CALORIE_COST) return { ok: false, reason: 'Need 1 cal' };
        return { ok: true };
      }

      case 'take': {
        const trayItem = trayItems.find(t => t.id === action.id);
        if (!trayItem) return { ok: false, reason: 'Unknown tray item' };
        if (trayItem.taken) return { ok: false, reason: 'Already taken' };
        return { ok: true };
      }

      case 'feast':
      case 'leave':
        return { ok: true };

      default:
        return { ok: false, reason: `Unsupported action type: ${action.type}` };
    }
  }

  function act(action) {
    const check = canAct(action);
    if (!check.ok) {
      throw new Error(`Illegal action ${action.type}: ${check.reason}`);
    }

    const events = [];

    switch (action.type) {
      case 'take': {
        const item = trayItems.find(t => t.id === action.id);
        item.taken = true;

        const harvestedEntry = {
          lootId: item.lootId,
          slotId: item.slotId || item.id,
          slotType: item.slotType,
          side: item.side ?? null,
          kind: item.kind,
          rarity: item.rarity,
          condition: item.condition, // 100 for loose, calculated for severed
          quantity: item.quantity,
          source: item.kind === 'part' ? 'severed' : 'loose'
        };

        extractedItems.set(item.id, harvestedEntry);
        events.push({ type: 'tray_taken', id: item.id, item: harvestedEntry });
        break;
      }

      case 'clamp': {
        const clampPoint = resolvedSpecimen.clampPoints.find(c => c.id === action.id);
        appliedClamps.add(clampPoint.id);

        const oldCal = calories;
        calories -= config.CLAMP_CALORIE_COST;
        caloriesSpent += config.CLAMP_CALORIE_COST;
        sutures -= config.CLAMP_SUTURE_COST;
        suturesUsed += config.CLAMP_SUTURE_COST;

        events.push({ type: 'clamped', id: clampPoint.id });
        events.push({ type: 'calories_changed', from: oldCal, to: calories });

        // Passive bleed applies after clamp (Section 4.2 / Phase 1)
        if (pulse > 0 && !flatlined) {
          const bleed = calcPassiveBleed();
          const oldPulse = pulse;
          pulse = Math.max(0, pulse - bleed);
          events.push({ type: 'pulse_changed', from: oldPulse, to: pulse });
          if (pulse <= 0) {
            triggerFlatline(events);
          }
        }
        break;
      }

      case 'extract': {
        const item = bodyInstance.items.find(i => i.slotId === action.id);
        const calCost = getSlotCalorieCost(item.slot);
        const oldCal = calories;
        calories -= calCost;
        caloriesSpent += calCost;
        events.push({ type: 'calories_changed', from: oldCal, to: calories });

        // Base attempt skill XP (Section 8.4)
        skillXp.Surgery += config.SKILL_XP.PER_ATTEMPT;

        // Draw exactly two numbers from action stream in order (Section 4.2)
        const u1 = cutRng();
        const u2 = cutRng();

        const surgerySkill = input.player.surgerySkill ?? 1;
        const precisionBonus = input.player.precisionBonus ?? 0;

        const skillScore = config.SKILL_FLOOR
          + config.SKILL_RANGE * (surgerySkill - 1) / (config.SKILL_MAX - 1)
          + precisionBonus;

        const difficulty = item.slot.difficulty ?? (config.RARITY_DIFFICULTY[item.slot.rarity] || 10);
        const margin = skillScore - difficulty;

        const spread = Math.max(5, config.SPREAD_BASE - config.SPREAD_SKILL_MULT * (surgerySkill - 1) / (config.SKILL_MAX - 1));
        const cutFactor = Math.max(0.10, Math.min(1.00, config.CUT_FACTOR_BASE + margin / 100 + (u1 + u2 - 1) * spread / 100));

        const isFragile = item.slot.tags && item.slot.tags.includes('fragile');
        let fragileMult = 1.0;
        if (isFragile && !isDeadFromStart) {
          fragileMult = pulse >= config.FRAGILE_PULSE_THRESHOLD
            ? 1.0
            : config.FRAGILE_BASE + config.FRAGILE_SLOPE * pulse;
        }

        let flatlineMult = 1.0;
        if (flatlined && !isDeadFromStart) {
          flatlineMult = isFragile ? config.FLATLINE_MULT_FRAGILE : config.FLATLINE_MULT_OTHER;
        }

        const condition = Math.round(item.bodyCondition * cutFactor * fragileMult * flatlineMult);

        rollLog.push({
          slotId: item.slotId,
          skillScore,
          difficulty,
          margin,
          u1,
          u2,
          cutFactor,
          fragile: fragileMult,
          flatlineMult,
          condition,
          destroyed: condition < config.DESTROY_THRESHOLD
        });

        const rollRecord = rollLog[rollLog.length - 1];

        if (condition < config.DESTROY_THRESHOLD) {
          // Destroyed item (Section 4.2)
          destroyedItems.set(item.slotId, {
            slotId: item.slotId,
            reason: 'destroyed',
            condition
          });

          // Toxic / Volatile Organ Rupture (Chemical spill damages adjacent organs)
          const isVolatile = item.slot.tags?.includes('toxic') || item.slot.tags?.includes('volatile') || item.slotId.includes('bile') || item.slotId.includes('venom');
          if (isVolatile) {
            const spillDmg = 20;
            bodyInstance.items.forEach(adj => {
              if (adj.slot.region === item.slot.region && adj.slotId !== item.slotId && adj.present) {
                adj.bodyCondition = Math.max(10, adj.bodyCondition - spillDmg);
              }
            });
            events.push({
              type: 'toxic_spill',
              id: item.slotId,
              region: item.slot.region,
              spillDmg
            });
          }

          events.push({
            type: 'organ_failed',
            id: item.slotId,
            condition,
            roll: rollRecord
          });
        } else {
          // Successfully harvested
          const harvestedEntry = {
            lootId: item.slot.loot || `${resolvedSpecimen.id}:${item.slotId}`,
            slotId: item.slotId,
            slotType: item.slot.slotType,
            side: item.slot.side || null,
            kind: item.slot.kind,
            rarity: item.slot.rarity,
            condition, // Integer 1-100
            quantity: item.quantity,
            source: 'body'
          };

          extractedItems.set(item.slotId, harvestedEntry);

          // Head Decapitation Mutual Exclusivity:
          // Removing the entire Head takes all remaining cranial parts (brain, eyes, fangs) with it
          if (item.slot.slotType === 'head' || item.slotId === 'head') {
            bodyInstance.items.forEach(child => {
              if (child.slot.region === 'head' && child.slotId !== item.slotId && child.present) {
                if (!extractedItems.has(child.slotId) && !destroyedItems.has(child.slotId) && !rupturedItems.has(child.slotId) && !lostItems.has(child.slotId)) {
                  lostItems.set(child.slotId, { slotId: child.slotId, reason: 'forfeited' });
                  events.push({ type: 'organ_forfeited', id: child.slotId, reason: 'decapitated' });
                }
              }
            });
          }

          // Craniotomy Mutual Exclusivity:
          // Extracting the brain cracks open the skull, forfeiting the intact mountable Head
          if (item.slot.slotType === 'brain' || item.slotId === 'brain') {
            const headItem = bodyInstance.items.find(h => (h.slot.slotType === 'head' || h.slotId === 'head') && h.present);
            if (headItem && !extractedItems.has(headItem.slotId) && !destroyedItems.has(headItem.slotId) && !rupturedItems.has(headItem.slotId) && !lostItems.has(headItem.slotId)) {
              lostItems.set(headItem.slotId, { slotId: headItem.slotId, reason: 'forfeited' });
              events.push({ type: 'organ_forfeited', id: headItem.slotId, reason: 'craniotomy' });
            }
          }

          // Skill XP bonuses (Section 8.4)
          if (condition >= 70) {
            skillXp.Surgery += config.SKILL_XP.CONDITION_70_BONUS;
          }
          if (['rare', 'epic', 'legendary'].includes(item.slot.rarity) && condition >= 50) {
            skillXp.Surgery += config.SKILL_XP.RARE_PLUS_50_BONUS;
          }

          events.push({
            type: 'organ_extracted',
            id: item.slotId,
            entry: harvestedEntry,
            roll: rollRecord
          });
        }

        // Pulse Mechanics (Section 4.2 / Section 6)
        if (!isDeadFromStart && pulse > 0) {
          const pCost = getSlotPulseCost(item.slot);
          if (pCost > 0) {
            const oldPulse = pulse;
            pulse = Math.max(0, pulse - pCost);
            events.push({ type: 'pulse_changed', from: oldPulse, to: pulse });
          }

          // killsPulse triggers after organ resolves
          if (item.slot.killsPulse && pulse > 0) {
            const oldPulse = pulse;
            pulse = 0;
            events.push({ type: 'pulse_changed', from: oldPulse, to: 0 });
          }

          // Passive bleed
          if (pulse > 0) {
            const bleed = calcPassiveBleed();
            const oldPulse = pulse;
            pulse = Math.max(0, pulse - bleed);
            events.push({ type: 'pulse_changed', from: oldPulse, to: pulse });
          }

          if (pulse <= 0) {
            triggerFlatline(events);
          }
        }
        break;
      }

      case 'feast':
      case 'leave': {
        ended = true;
        endedBy = action.type;

        if (action.type === 'feast') {
          caloriesGained = getRemainingFeastCalories();
          biomassExpGained = resolvedSpecimen.feast?.biomassExp || 4;
        }

        // Forfeit remaining present untaken slots (Section 8.4: absent slots not listed)
        bodyInstance.items.forEach(item => {
          if (!item.present) return;
          const resolved = extractedItems.has(item.slotId)
            || destroyedItems.has(item.slotId)
            || rupturedItems.has(item.slotId)
            || lostItems.has(item.slotId);

          if (!resolved) {
            lostItems.set(item.slotId, {
              slotId: item.slotId,
              reason: 'forfeited'
            });
          }
        });

        events.push({ type: 'ended', endedBy: action.type, caloriesGained, biomassExpGained });
        break;
      }
    }

    return events;
  }

  function getRemainingFeastCalories() {
    let unharvestedPartCalories = 0;
    bodyInstance.items.forEach(item => {
      if (item.present && !item.taken && !extractedItems.has(item.slotId)) {
        unharvestedPartCalories += (item.nutritionalCalories || 0);
      }
    });

    const baseCarcass = resolvedSpecimen.feast?.baseCalories !== undefined
      ? resolvedSpecimen.feast.baseCalories
      : (config.BASE_CARCASS_CALORIES || 12);

    const mult = (isDeadFromStart || flatlined)
      ? config.DEAD_OR_FLATLINE_FEAST_CALORIE_MULT
      : config.LIVING_FEAST_CALORIE_MULT;

    return Math.max(5, Math.round((baseCarcass + unharvestedPartCalories) * mult));
  }

  function isEnded() {
    return ended;
  }

  function countFragileRemaining() {
    let count = 0;
    bodyInstance.items.forEach(item => {
      if (item.present && !item.taken) {
        if (!extractedItems.has(item.slotId) && !destroyedItems.has(item.slotId) && !rupturedItems.has(item.slotId)) {
          if (item.slot.tags && item.slot.tags.includes('fragile')) {
            count++;
          }
        }
      }
    });
    return count;
  }

  function getState() {
    return {
      pulse,
      flatlined,
      calories,
      caloriesSpent,
      caloriesGained,
      sutures,
      suturesUsed,
      appliedClamps: Array.from(appliedClamps),
      extractedItems: Array.from(extractedItems.values()),
      destroyedItems: Array.from(destroyedItems.values()),
      rupturedItems: Array.from(rupturedItems.values()),
      lostItems: Array.from(lostItems.values()),
      bodyInstance,
      trayItems: trayItems.map(t => ({ ...t })),
      fragileRemaining: countFragileRemaining(),
      remainingFeastCalories: getRemainingFeastCalories(),
      ended,
      endedBy,
      skillXp: { ...skillXp },
      rollLog: [...rollLog]
    };
  }

  function result() {
    if (!ended) {
      throw new Error('Cannot get SurgeryResult before surgery has ended');
    }

    const harvestedList = Array.from(extractedItems.values());

    const lostList = [
      ...Array.from(destroyedItems.values()),
      ...Array.from(rupturedItems.values()),
      ...Array.from(lostItems.values())
    ];

    const res = {
      schemaVersion: 2,
      specimenId: resolvedSpecimen.id,
      specimenKind: resolvedSpecimen.kind,
      seed: input.seed,
      harvested: harvestedList,
      lost: lostList,
      caloriesSpent,
      caloriesGained,
      biomassExpGained,
      suppliesUsed: {
        sutures: suturesUsed
      },
      skillXp: {
        Surgery: skillXp.Surgery
      },
      endedBy,
      flatlined: Boolean(flatlined)
    };

    // Strict validation against Section 8.4 schema
    const validation = validateSurgeryResult(res);
    if (!validation.ok) {
      throw new Error(`Constructed SurgeryResult failed validation: ${validation.errors.join(', ')}`);
    }

    return res;
  }

  return {
    getState,
    canAct,
    act,
    isEnded,
    result,
    getSlotPulseCost,
    getSlotCalorieCost,
    getRemainingFeastCalories,
    countFragileRemaining,
    resolvedSpecimen,
    bodyInstance
  };
}
