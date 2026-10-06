/**
 * Apex Parasite - Post-Combat Body Generation Engine (Phase 2)
 * Pure, deterministic functions: resolveSpecimen, generateBody, and hashing helpers.
 * Per-slot independent PRNG stream guarantees slot reordering/additions do not alter other slots.
 */

import { CONFIG } from './config.js';

/**
 * 32-bit FNV-1a Hash function
 */
export function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 32-bit deterministic Mulberry32 PRNG
 */
export function mulberry32(a) {
  return function next() {
    let t = (a = (a + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Resolve a SpecimenDef v2 against templates (Section 8.2)
 * Template slots - remove + patch + add
 */
export function resolveSpecimen(specimenDef, templates) {
  const templateId = specimenDef.template;
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Template "${templateId}" not found for specimen "${specimenDef.id}"`);
  }

  const removeSet = new Set(specimenDef.remove || []);
  const patches = specimenDef.patch || {};

  // 1. Filter and patch template slots
  const slots = (template.slots || [])
    .filter(s => !removeSet.has(s.id))
    .map(s => {
      if (patches[s.id]) {
        return { ...s, ...patches[s.id] };
      }
      return { ...s };
    });

  // 2. Append added slots
  if (specimenDef.add && Array.isArray(specimenDef.add)) {
    specimenDef.add.forEach(addSlot => {
      slots.push({ ...addSlot });
    });
  }

  // 3. Ensure every slot has a loot id synthesized if not explicitly specified
  slots.forEach(slot => {
    if (!slot.loot) {
      slot.loot = `${specimenDef.id}:${slot.id}`;
    }
  });

  // 4. Biological Single Source of Truth Invariants:
  // Decapitation (head), encephalectomy (brain), and cardiectomy (heart) are universally fatal to living specimens
  slots.forEach(slot => {
    if (slot.slotType === 'head' || slot.slotType === 'brain' || slot.slotType === 'heart' || slot.id === 'head' || slot.id === 'brain' || slot.id === 'heart') {
      slot.killsPulse = true;
    }
    // Remove contradictory head dependency on cranial internals
    if (slot.requires && slot.requires.includes('head')) {
      slot.requires = slot.requires.filter(r => r !== 'head');
      if (slot.requires.length === 0) {
        delete slot.requires;
      }
    }
  });

  // Clamp points: specimen overrides template if defined
  const clampPoints = (specimenDef.clampPoints && specimenDef.clampPoints.length > 0)
    ? specimenDef.clampPoints
    : (template.clampPoints || []);

  const art = specimenDef.art || template.art;

  return {
    ...template,
    ...specimenDef,
    art,
    slots,
    clampPoints,
    loose: specimenDef.loose || [],
    severable: specimenDef.severable || []
  };
}

/**
 * Pure function: generate deterministic BodyInstance from resolved specimen definition and input.
 * (Section 3.2)
 */
export function generateBody(resolvedSpecimen, input) {
  const seed = input.seed ?? 12345;
  const isDead = input.state === 'dead';
  const forceAll = Boolean(input.options?.forceAllPresent && !input.options?.production);

  // Region damage map (convert legacy woundedRegions if needed)
  const regionDamage = {};
  if (input.damage?.regionDamage) {
    Object.assign(regionDamage, input.damage.regionDamage);
  } else if (input.damage?.woundedRegions && Array.isArray(input.damage.woundedRegions)) {
    input.damage.woundedRegions.forEach(r => {
      regionDamage[r] = 30;
    });
  }

  // Severed parts from combat
  const severedInputSet = new Set(input.damage?.severedParts || []);
  const severableMap = new Map(); // slotId -> severableDef
  (resolvedSpecimen.severable || []).forEach(sev => {
    severableMap.set(sev.slotId, sev);
  });

  const items = [];
  const severedParts = [];

  // Generate each slot independently with its own stream
  resolvedSpecimen.slots.forEach(slot => {
    const slotSeedStr = `${seed}:${slot.id}`;
    const rng = mulberry32(fnv1a(slotSeedStr));

    // Per slot, always draw four numbers in this exact order:
    // u_presence, u_cond1, u_cond2, u_qty
    const u_presence = rng();
    const u_cond1 = rng();
    const u_cond2 = rng();
    const u_qty = rng();

    // Anatomy Skill Recognition (User Proposal 5):
    // For rare/epic/exotic organs, lower skill reduces discovery/identification chance
    let effectivePresencePct = slot.presencePct;
    if (input.options?.applySkillPresence && (slot.kind === 'trait' || ['rare', 'epic', 'legendary'].includes(slot.rarity))) {
      const skill = input.player?.surgerySkill ?? input.player?.anatomySkill ?? 1;
      const skillFactor = 0.5 + 0.5 * ((skill - 1) / (CONFIG.SKILL_MAX - 1));
      effectivePresencePct = Math.round(slot.presencePct * skillFactor);
    }
    const rolledPresent = effectivePresencePct >= 100 || (u_presence * 100 < effectivePresencePct);
    const present = forceAll ? true : rolledPresent;

    const quantity = slot.yield
      ? slot.yield.min + Math.floor(u_qty * (slot.yield.max - slot.yield.min + 1))
      : 1;

    const regDmg = regionDamage[slot.region] || 0;
    const damageType = input.damage?.damageType || 'normal';
    const bias = CONFIG.DAMAGE_TYPE_BIAS[damageType] || CONFIG.DAMAGE_TYPE_BIAS.normal;

    let biasMult = 1.0;
    if (bias.slotBiases?.[slot.id]) {
      biasMult = bias.slotBiases[slot.id];
    } else if (bias.slotBiases?.[slot.slotType]) {
      biasMult = bias.slotBiases[slot.slotType];
    } else if (slot.tags?.includes('fragile') && bias.fragileCondMult) {
      biasMult = bias.fragileCondMult;
    }

    const effectiveRegDmg = regDmg * biasMult;
    const rawCond = CONFIG.BODY_COND_MEAN
      + (u_cond1 + u_cond2 - 1) * CONFIG.BODY_COND_SPREAD
      - effectiveRegDmg * CONFIG.REGION_DAMAGE_FACTOR
      - (isDead ? CONFIG.DEAD_PENALTY : 0);

    const bodyCondition = Math.max(10, Math.min(100, Math.round(rawCond)));

    // Damage-type specific trauma pre-ruin check (e.g. blunt crushing organs, slashing shredding hides)
    let damageTypeRuined = false;
    let ruinReason = null;
    if (!forceAll && regDmg >= 30 && biasMult >= 1.3 && u_presence < 0.25) {
      damageTypeRuined = true;
      ruinReason = damageType === 'blunt' ? 'crushed' : damageType === 'piercing' ? 'punctured' : 'shredded';
    }

    const isSlotPresent = forceAll ? true : (present && !damageTypeRuined);

    const nutritionalCalories = slot.calories !== undefined
      ? slot.calories
      : (CONFIG.DEFAULT_SLOT_CALORIES[slot.id] || CONFIG.DEFAULT_SLOT_CALORIES[slot.slotType] || CONFIG.DEFAULT_SLOT_CALORIES[slot.kind] || 4);

    // Check if severed in combat
    const isCombatSevered = severableMap.has(slot.id) && severedInputSet.has(slot.id);

    if (isCombatSevered) {
      // Severed part goes to the loose tray with condition penalty
      const sevDef = severableMap.get(slot.id);
      const severedCondition = Math.max(10, Math.min(100, Math.round(bodyCondition - CONFIG.SEVER_PENALTY)));
      severedParts.push({
        id: sevDef.id || slot.id,
        slotId: slot.id,
        name: slot.name,
        lootId: slot.loot || `${resolvedSpecimen.id}:${slot.id}`,
        slotType: slot.slotType,
        side: slot.side || null,
        kind: 'part',
        rarity: slot.rarity,
        condition: severedCondition,
        quantity: 1,
        taken: false,
        nutritionalCalories: 0
      });

      items.push({
        slotId: slot.id,
        slot,
        present: false,
        reason: 'severed',
        quantity: 1,
        bodyCondition,
        taken: false,
        regionDamageApplied: regDmg,
        effectiveRegDmg,
        biasMult,
        damageType,
        nutritionalCalories: 0
      });
    } else if (!isSlotPresent) {
      items.push({
        slotId: slot.id,
        slot,
        present: false,
        reason: ruinReason || slot.reasonAbsent || (slot.kind === 'trait' ? 'absent' : 'mangled'),
        quantity: 1,
        bodyCondition,
        taken: false,
        regionDamageApplied: regDmg,
        effectiveRegDmg,
        biasMult,
        damageType,
        nutritionalCalories: 0
      });
    } else {
      items.push({
        slotId: slot.id,
        slot,
        present: true,
        reason: null,
        quantity,
        bodyCondition,
        taken: false,
        regionDamageApplied: regDmg,
        effectiveRegDmg,
        biasMult,
        damageType,
        nutritionalCalories
      });
    }
  });

  // Generate Loose Items (Section 7)
  const looseItems = [];
  (resolvedSpecimen.loose || []).forEach(looseDef => {
    const looseSeedStr = `${seed}:${looseDef.id}`;
    const rng = mulberry32(fnv1a(looseSeedStr));

    const u_presence = rng();
    const u_cond1 = rng();
    const u_cond2 = rng();
    const u_qty = rng();

    const rolledPresent = looseDef.presencePct >= 100 || (u_presence * 100 < looseDef.presencePct);
    const present = forceAll ? true : rolledPresent;

    const quantity = looseDef.yield
      ? looseDef.yield.min + Math.floor(u_qty * (looseDef.yield.max - looseDef.yield.min + 1))
      : 1;

    if (present) {
      looseItems.push({
        id: looseDef.id,
        slotId: looseDef.id,
        name: looseDef.name,
        lootId: looseDef.loot || `${resolvedSpecimen.id}:${looseDef.id}`,
        slotType: looseDef.slotType || 'gear',
        side: null,
        kind: 'loose',
        rarity: looseDef.rarity || 'common',
        condition: 100, // Section 7: taking is free, reported as condition: 100
        quantity,
        taken: false
      });
    }
  });

  return {
    items,
    severedParts,
    looseItems
  };
}
