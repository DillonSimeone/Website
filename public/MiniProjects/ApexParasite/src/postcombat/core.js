/**
 * Apex Parasite - Post-Combat Pure Core Session Logic
 * Fully headless, zero DOM, zero audio dependencies.
 * Deterministic PRNG stream per seed.
 */

import { CONFIG } from './config.js';
import { validateSurgeryResult } from './validator.js';

/**
 * 32-bit deterministic Mulberry32 PRNG
 */
function createPrng(seed) {
  let s = (seed >>> 0) || 12345;
  return function next() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t >>> 0) / 4294967296);
  };
}

const QUALITY_ORDER = { damaged: 0, intact: 1, pristine: 2 };
function minQuality(q1, q2) {
  return QUALITY_ORDER[q1] <= QUALITY_ORDER[q2] ? q1 : q2;
}

export function createSession(specimenDef, lootDefs, input, configOverride = {}) {
  const config = { ...CONFIG, ...configOverride };
  const rng = createPrng(input.seed);

  const isDeadFromStart = input.state === 'dead';
  let pulse = isDeadFromStart ? 0 : input.pulsePct;
  let flatlined = isDeadFromStart || pulse <= 0;
  const bloodPct = input.bloodPct ?? 100;

  let calories = input.player.calories;
  let caloriesSpent = 0;
  let caloriesGained = 0;
  let biomassExpGained = 0;

  let sutures = input.player.supplies?.sutures ?? 0;
  let suturesUsed = 0;

  const appliedClamps = new Set();
  const extractedOrgans = new Map(); // organId -> { lootId, quality, rarity, source: 'organ' }
  const destroyedOrgans = new Map(); // organId -> { lootId, reason: 'destroyed' }
  const lostOrgans = new Map();      // organId -> { lootId, reason: 'necrosis' | 'forfeited' }

  // Ground loot from severable parts
  const severedIds = new Set(input.damage?.severedParts || []);
  const groundLoot = (specimenDef.severable || [])
    .filter(part => severedIds.has(part.id))
    .map(part => ({
      ...part,
      taken: false
    }));

  const groundHarvested = [];

  let ended = false;
  let endedBy = null;
  const skillXp = { Surgery: 0 };
  const rollLog = [];

  function calcBleedReductionPct() {
    let total = 0;
    for (const clampId of appliedClamps) {
      const c = specimenDef.clampPoints?.find(p => p.id === clampId);
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

  function triggerFlatline(events) {
    if (flatlined) return;
    flatlined = true;
    events.push({ type: 'flatline' });

    // Section 4.6: Every remaining organ tagged fragile is lost (reason: "necrosis")
    for (const organ of specimenDef.organs) {
      const alreadyHarvested = extractedOrgans.has(organ.id);
      const alreadyDestroyed = destroyedOrgans.has(organ.id);
      const alreadyLost = lostOrgans.has(organ.id);
      if (!alreadyHarvested && !alreadyDestroyed && !alreadyLost) {
        if (organ.tags && organ.tags.includes('fragile')) {
          lostOrgans.set(organ.id, { lootId: organ.loot, reason: 'necrosis' });
          events.push({ type: 'organ_lost', id: organ.id, reason: 'necrosis' });
        }
      }
    }
  }

  function getQualityCeiling(organ) {
    let ceiling = 'pristine';
    if (isDeadFromStart) {
      ceiling = minQuality(ceiling, 'intact');
    }
    if (flatlined) {
      ceiling = minQuality(ceiling, 'damaged');
    }
    if (input.damage?.woundedRegions?.includes(organ.region)) {
      ceiling = minQuality(ceiling, 'intact');
    }
    return ceiling;
  }

  function getOrganPulseCost(organ) {
    if (pulse === null || isDeadFromStart) return 0;
    let reductionPct = 0;
    if (organ.slowedByClamp && Array.isArray(organ.slowedByClamp)) {
      for (const clampId of organ.slowedByClamp) {
        if (appliedClamps.has(clampId)) {
          const c = specimenDef.clampPoints?.find(p => p.id === clampId);
          if (c?.drainReductionPct) {
            reductionPct += c.drainReductionPct;
          }
        }
      }
    }
    reductionPct = Math.min(100, reductionPct);
    return Math.max(0, Math.round(organ.pulseCost * (1 - reductionPct / 100)));
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
        const organ = specimenDef.organs.find(o => o.id === action.id);
        if (!organ) return { ok: false, reason: 'Unknown organ' };
        if (extractedOrgans.has(organ.id)) return { ok: false, reason: 'Organ already extracted' };
        if (destroyedOrgans.has(organ.id)) return { ok: false, reason: 'Organ was destroyed' };
        if (lostOrgans.has(organ.id)) return { ok: false, reason: 'Organ was lost to necrosis' };

        // Requirements check
        if (organ.requires && organ.requires.length > 0) {
          for (const reqId of organ.requires) {
            const reqResolved = extractedOrgans.has(reqId) || destroyedOrgans.has(reqId);
            if (!reqResolved) {
              const reqOrgan = specimenDef.organs.find(o => o.id === reqId);
              return { ok: false, reason: `Requires: ${reqOrgan?.name || reqId}` };
            }
          }
        }

        const cost = config.RARITY_CALORIE_COST[organ.rarity] || 1;
        if (calories < cost) {
          return { ok: false, reason: `Need ${cost} cal` };
        }
        return { ok: true };
      }

      case 'clamp': {
        if (isDeadFromStart || flatlined || pulse <= 0) {
          return { ok: false, reason: 'Specimen is dead or flatlined' };
        }
        const clampPoint = specimenDef.clampPoints?.find(c => c.id === action.id);
        if (!clampPoint) return { ok: false, reason: 'Unknown clamp point' };
        if (appliedClamps.has(clampPoint.id)) return { ok: false, reason: 'Already clamped' };
        if (sutures < config.CLAMP_SUTURE_COST) return { ok: false, reason: 'No sutures left' };
        if (calories < config.CLAMP_CALORIE_COST) return { ok: false, reason: 'Need 1 cal' };
        return { ok: true };
      }

      case 'take': {
        const groundItem = groundLoot.find(g => g.id === action.id);
        if (!groundItem) return { ok: false, reason: 'Unknown ground loot' };
        if (groundItem.taken) return { ok: false, reason: 'Already taken' };
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
        const item = groundLoot.find(g => g.id === action.id);
        item.taken = true;
        const entry = {
          lootId: item.loot,
          quality: 'intact',
          rarity: item.rarity,
          source: 'ground'
        };
        groundHarvested.push(entry);
        events.push({ type: 'ground_taken', id: item.id });
        break;
      }

      case 'clamp': {
        const clampPoint = specimenDef.clampPoints.find(c => c.id === action.id);
        appliedClamps.add(clampPoint.id);

        const oldCal = calories;
        calories -= config.CLAMP_CALORIE_COST;
        caloriesSpent += config.CLAMP_CALORIE_COST;
        sutures -= config.CLAMP_SUTURE_COST;
        suturesUsed += config.CLAMP_SUTURE_COST;

        events.push({ type: 'clamped', id: clampPoint.id });
        events.push({ type: 'calories_changed', from: oldCal, to: calories });

        // Passive bleed applies after clamp (Section 4.2)
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
        const organ = specimenDef.organs.find(o => o.id === action.id);
        const calCost = config.RARITY_CALORIE_COST[organ.rarity] || 1;
        const oldCal = calories;
        calories -= calCost;
        caloriesSpent += calCost;
        events.push({ type: 'calories_changed', from: oldCal, to: calories });

        // Skill attempt XP
        skillXp.Surgery += config.SKILL_XP.PER_ATTEMPT;

        // Success calculation (Section 4.4)
        const surgerySkill = input.player.surgerySkill || 0;
        const precisionBonus = input.player.precisionBonus || 0;
        const rarityPenalty = config.RARITY_PENALTY[organ.rarity] || 0;
        const isWounded = input.damage?.woundedRegions?.includes(organ.region);
        const woundPenalty = isWounded ? config.WOUND_PENALTY : 0;

        let fragilePenalty = 0;
        if (organ.tags?.includes('fragile') && !isDeadFromStart && pulse < config.FRAGILE_PULSE_THRESHOLD) {
          fragilePenalty = (config.FRAGILE_PULSE_THRESHOLD - pulse) / 2;
        }

        let successPct = organ.baseSuccessPct
          + config.SKILL_BONUS * surgerySkill
          + precisionBonus
          - rarityPenalty
          - woundPenalty
          - fragilePenalty;

        successPct = Math.max(config.SUCCESS_PCT_MIN, Math.min(config.SUCCESS_PCT_MAX, successPct));

        // PRNG stream: draw exactly two numbers in order (Section 4.5)
        const r1 = rng() * 100;
        const r2 = rng() * 100;

        let quality;
        let isDestroyed = false;
        let destroyPct = 0;

        if (r1 <= successPct) {
          quality = (r1 <= successPct / 2) ? 'pristine' : 'intact';
        } else {
          const missBy = r1 - successPct;
          const baseDestroy = config.RARITY_DESTROY_BASE[organ.rarity] || 10;
          destroyPct = baseDestroy + missBy * config.MISS_DESTROY_FACTOR - surgerySkill * config.SKILL_SAVE;
          destroyPct = Math.max(config.DESTROY_PCT_MIN, Math.min(config.DESTROY_PCT_MAX, destroyPct));

          if (r2 < destroyPct) {
            isDestroyed = true;
          } else {
            quality = 'damaged';
          }
        }

        if (isDestroyed) {
          destroyedOrgans.set(organ.id, { lootId: organ.loot, reason: 'destroyed' });
          events.push({
            type: 'organ_failed',
            id: organ.id,
            quality: 'destroyed'
          });
        } else {
          // Cap quality by ceiling
          const ceiling = getQualityCeiling(organ);
          quality = minQuality(quality, ceiling);

          extractedOrgans.set(organ.id, {
            lootId: organ.loot,
            quality,
            rarity: organ.rarity,
            source: 'organ'
          });

          // Skill rewards for pristine or rare+
          if (quality === 'pristine') {
            skillXp.Surgery += config.SKILL_XP.PER_PRISTINE;
          }
          if (['rare', 'epic', 'legendary'].includes(organ.rarity)) {
            skillXp.Surgery += config.SKILL_XP.PER_RARE_PLUS;
          }

          events.push({
            type: 'organ_extracted',
            id: organ.id,
            quality
          });
        }

        rollLog.push({
          organId: organ.id,
          successPct,
          r1,
          r2,
          destroyPct,
          outcome: isDestroyed ? 'destroyed' : quality
        });

        // Pulse mechanics (Section 4.2)
        if (!isDeadFromStart && pulse > 0) {
          // Organ pulse cost
          const pCost = getOrganPulseCost(organ);
          if (pCost > 0) {
            const oldPulse = pulse;
            pulse = Math.max(0, pulse - pCost);
            events.push({ type: 'pulse_changed', from: oldPulse, to: pulse });
          }

          // killsPulse triggers after organ resolves
          if (organ.killsPulse && pulse > 0) {
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

          // Check flatline
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
          const mult = (isDeadFromStart || flatlined)
            ? config.DEAD_OR_FLATLINE_FEAST_CALORIE_MULT
            : config.LIVING_FEAST_CALORIE_MULT;
          caloriesGained = Math.round(specimenDef.feast.calories * mult);
          biomassExpGained = specimenDef.feast.biomassExp;
        }

        // Forfeit remaining organs
        for (const organ of specimenDef.organs) {
          const alreadyHarvested = extractedOrgans.has(organ.id);
          const alreadyDestroyed = destroyedOrgans.has(organ.id);
          const alreadyLost = lostOrgans.has(organ.id);
          if (!alreadyHarvested && !alreadyDestroyed && !alreadyLost) {
            lostOrgans.set(organ.id, { lootId: organ.loot, reason: 'forfeited' });
          }
        }

        // Forfeit untaken ground loot
        for (const ground of groundLoot) {
          if (!ground.taken) {
            lostOrgans.set(ground.id, { lootId: ground.loot, reason: 'forfeited' });
          }
        }

        events.push({ type: 'ended', endedBy: action.type });
        break;
      }
    }

    return events;
  }

  function isEnded() {
    return ended;
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
      extractedOrgans: Array.from(extractedOrgans.entries()).map(([id, val]) => ({ id, ...val })),
      destroyedOrgans: Array.from(destroyedOrgans.entries()).map(([id, val]) => ({ id, ...val })),
      lostOrgans: Array.from(lostOrgans.entries()).map(([id, val]) => ({ id, ...val })),
      groundLoot: groundLoot.map(g => ({ ...g })),
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

    const harvestedList = [
      ...Array.from(extractedOrgans.values()),
      ...groundHarvested
    ];

    const lostList = [
      ...Array.from(destroyedOrgans.values()),
      ...Array.from(lostOrgans.values())
    ];

    const res = {
      specimenId: input.specimenId,
      specimenKind: specimenDef.kind,
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
      flatlined: Boolean(flatlined),
      seed: input.seed
    };

    // Validate strictly against Section 6.2 schema
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
    getQualityCeiling,
    getOrganPulseCost
  };
}
