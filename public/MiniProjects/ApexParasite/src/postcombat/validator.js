/**
 * Apex Parasite - Post-Combat Schema & Definition Validator (v2)
 * Validates BodyTemplate, SpecimenDef (v2), LootDef, SurgeryInput (v2), and SurgeryResult (v2).
 * Enforces clamp coverage, pulse budget guidelines, and strict result contracts.
 */

import { CONFIG } from './config.js';

export class ValidationError extends Error {
  constructor(errors) {
    super(`Validation failed with ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

/**
 * Validate a LootDef object
 */
export function validateLootDef(loot) {
  const errors = [];
  if (!loot || typeof loot !== 'object') {
    return { ok: false, errors: ['Loot definition must be an object'] };
  }
  if (!loot.id || typeof loot.id !== 'string') errors.push('Missing or invalid "id"');
  if (!loot.name || typeof loot.name !== 'string') errors.push('Missing or invalid "name"');
  if (!loot.glyph || typeof loot.glyph !== 'string') errors.push('Missing or invalid "glyph"');

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a single Slot definition (used in templates and specimen add/patch)
 */
export function validateSlot(slot, prefix = 'slot') {
  const errors = [];
  const warnings = [];

  if (!slot || typeof slot !== 'object') {
    return { ok: false, errors: [`${prefix} must be an object`], warnings };
  }

  const requiredFields = ['id', 'name', 'kind', 'slotType', 'region', 'anchor', 'hitShape', 'rarity', 'presencePct', 'pulseCost'];
  for (const f of requiredFields) {
    if (slot[f] === undefined || slot[f] === null) {
      errors.push(`${prefix} (${slot.id || 'unnamed'}): missing required field "${f}"`);
    }
  }

  const validKinds = ['part', 'organ', 'trait'];
  if (slot.kind && !validKinds.includes(slot.kind)) {
    errors.push(`${prefix} (${slot.id}): invalid kind "${slot.kind}" (must be part, organ, or trait)`);
  }

  const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  if (slot.rarity && !validRarities.includes(slot.rarity)) {
    errors.push(`${prefix} (${slot.id}): invalid rarity "${slot.rarity}"`);
  }

  if (typeof slot.presencePct === 'number' && (slot.presencePct < 0 || slot.presencePct > 100)) {
    errors.push(`${prefix} (${slot.id}): presencePct must be between 0 and 100`);
  }

  if (typeof slot.pulseCost === 'number' && slot.pulseCost < 0) {
    errors.push(`${prefix} (${slot.id}): pulseCost must be non-negative`);
  }

  if (slot.anchor) {
    if (!Array.isArray(slot.anchor) || slot.anchor.length !== 2 ||
        typeof slot.anchor[0] !== 'number' || typeof slot.anchor[1] !== 'number') {
      errors.push(`${prefix} (${slot.id}): anchor must be [x, y] numbers`);
    }
  }

  if (slot.hitShape) {
    if (typeof slot.hitShape !== 'object' || !['ellipse', 'rect', 'polygon'].includes(slot.hitShape.type)) {
      errors.push(`${prefix} (${slot.id}): hitShape must be ellipse, rect, or polygon`);
    }
  }

  if (slot.yield) {
    if (typeof slot.yield.min !== 'number' || typeof slot.yield.max !== 'number' || slot.yield.min > slot.yield.max) {
      errors.push(`${prefix} (${slot.id}): invalid yield range {min, max}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate a BodyTemplate object (Section 8.1)
 */
export function validateBodyTemplate(template) {
  const errors = [];
  const warnings = [];

  if (!template || typeof template !== 'object') {
    return { ok: false, errors: ['Template must be an object'], warnings };
  }

  if (template.schemaVersion === 1) {
    return { ok: false, errors: ['v1 schema, needs migration'], warnings };
  }
  if (template.schemaVersion !== 2) {
    return { ok: false, errors: [`Unsupported template schemaVersion "${template.schemaVersion}", expected 2`], warnings };
  }

  if (!template.id || typeof template.id !== 'string') errors.push('Missing or invalid template "id"');

  const slotIds = new Set();
  let totalPulseCost = 0;

  if (!Array.isArray(template.slots) || template.slots.length === 0) {
    errors.push('Template must have a non-empty "slots" array');
  } else {
    template.slots.forEach((slot, idx) => {
      if (slotIds.has(slot.id)) {
        errors.push(`Duplicate slot id "${slot.id}" in template`);
      } else {
        slotIds.add(slot.id);
      }
      const val = validateSlot(slot, `slots[${idx}]`);
      errors.push(...val.errors);
      warnings.push(...val.warnings);
      if (typeof slot.pulseCost === 'number') {
        totalPulseCost += slot.pulseCost;
      }
    });
  }

  // Validate Clamp Points (Section 6 & 8.1)
  const clampIds = new Set();
  const coveredRegions = new Set();
  const regionClaimants = new Map(); // region -> clampId

  if (!Array.isArray(template.clampPoints) || template.clampPoints.length < CONFIG.MIN_CLAMP_POINTS) {
    warnings.push(`Living template should have at least ${CONFIG.MIN_CLAMP_POINTS} clamp points (found ${template.clampPoints?.length || 0})`);
  } else {
    template.clampPoints.forEach((clamp, idx) => {
      const prefix = `clampPoints[${idx}] (${clamp?.id || 'unnamed'})`;
      if (!clamp.id) errors.push(`${prefix}: missing id`);
      else if (clampIds.has(clamp.id)) errors.push(`${prefix}: duplicate clamp id "${clamp.id}"`);
      else clampIds.add(clamp.id);

      if (!clamp.name) errors.push(`${prefix}: missing name`);
      if (!Array.isArray(clamp.anchor) || clamp.anchor.length !== 2) {
        errors.push(`${prefix}: anchor must be [x, y]`);
      }

      if (!Array.isArray(clamp.protects) || clamp.protects.length === 0) {
        warnings.push(`${prefix}: protects must be a non-empty array of regions`);
      } else {
        for (const reg of clamp.protects) {
          if (regionClaimants.has(reg)) {
            warnings.push(`${prefix}: region "${reg}" is claimed by both "${regionClaimants.get(reg)}" and "${clamp.id}" (protects must be disjoint)`);
          } else {
            regionClaimants.set(reg, clamp.id);
          }
          coveredRegions.add(reg);
        }
      }

      if (typeof clamp.drainReductionPct !== 'number' || clamp.drainReductionPct < 0 || clamp.drainReductionPct > 100) {
        errors.push(`${prefix}: drainReductionPct must be 0-100`);
      }
      if (typeof clamp.bleedReductionPct !== 'number' || clamp.bleedReductionPct < 0 || clamp.bleedReductionPct > 100) {
        errors.push(`${prefix}: bleedReductionPct must be 0-100`);
      }
    });

    // Check clamp coverage (Section 6: >= 75% of total pulse cost, excluding killsPulse)
    let protectablePulseCost = 0;
    let clampedPulseCost = 0;
    template.slots?.forEach(slot => {
      if (!slot.killsPulse) {
        protectablePulseCost += (slot.pulseCost || 0);
        if (coveredRegions.has(slot.region)) {
          clampedPulseCost += (slot.pulseCost || 0);
        }
      }
    });

    if (protectablePulseCost > 0) {
      const coveragePct = Math.round((clampedPulseCost / protectablePulseCost) * 100);
      if (coveragePct < CONFIG.CLAMP_COVERAGE_MIN_PCT) {
        warnings.push(`Clamp points cover ${coveragePct}% of protectable pulse cost (guideline requires >= ${CONFIG.CLAMP_COVERAGE_MIN_PCT}%)`);
      }
    }
  }

  // Budget validation (Section 5.2)
  const typicalPulse = CONFIG.TYPICAL_START_PULSE;
  const minTarget = Math.round(typicalPulse * CONFIG.PULSE_COST_RATIO_MIN);
  const maxTarget = Math.round(typicalPulse * CONFIG.PULSE_COST_RATIO_MAX);
  if (totalPulseCost < minTarget || totalPulseCost > maxTarget) {
    warnings.push(`Total slot pulse cost (${totalPulseCost}) outside recommended band ${minTarget}-${maxTarget} (~1.6x-2.4x typical start pulse ${typicalPulse})`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate a SpecimenDef v2 object (Section 8.2)
 */
export function validateSpecimenDef(specimen, templates = null, lootDefs = null) {
  const errors = [];
  const warnings = [];

  if (!specimen || typeof specimen !== 'object') {
    return { ok: false, errors: ['Specimen definition must be an object'], warnings };
  }

  // Check 1: Check for v1 schema
  if (specimen.schemaVersion === 1 || !specimen.schemaVersion) {
    return { ok: false, errors: ['v1 schema, needs migration'], warnings };
  }
  if (specimen.schemaVersion !== 2) {
    return { ok: false, errors: [`Unsupported specimen schemaVersion "${specimen.schemaVersion}", expected 2`], warnings };
  }

  // Core metadata
  if (!specimen.id || typeof specimen.id !== 'string') errors.push('Missing or invalid "id"');
  if (!specimen.displayName || typeof specimen.displayName !== 'string') errors.push('Missing or invalid "displayName"');
  if (!specimen.kind || typeof specimen.kind !== 'string') errors.push('Missing or invalid "kind"');
  if (!specimen.template || typeof specimen.template !== 'string') errors.push('Missing or invalid "template" reference');

  // Art definition
  if (!specimen.art || typeof specimen.art !== 'object') {
    errors.push('Missing "art" object');
  } else {
    if (!Array.isArray(specimen.art.size) || specimen.art.size.length !== 2 ||
        typeof specimen.art.size[0] !== 'number' || typeof specimen.art.size[1] !== 'number') {
      errors.push('"art.size" must be a [width, height] array of numbers');
    }
  }

  // Base vitals & feast
  if (!specimen.baseVitals || typeof specimen.baseVitals.pulse !== 'number') {
    errors.push('Missing or invalid "baseVitals.pulse"');
  }
  if (!specimen.feast || typeof specimen.feast.calories !== 'number' || typeof specimen.feast.biomassExp !== 'number') {
    errors.push('Missing or invalid "feast" definition (requires calories and biomassExp)');
  }

  // Validate loose items (Section 7 & 8.2)
  if (specimen.loose) {
    if (!Array.isArray(specimen.loose)) {
      errors.push('"loose" must be an array');
    } else {
      specimen.loose.forEach((item, idx) => {
        const prefix = `loose[${idx}] (${item?.id || 'unnamed'})`;
        if (!item.id) errors.push(`${prefix}: missing id`);
        if (!item.name) errors.push(`${prefix}: missing name`);
        if (!['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(item.rarity)) {
          errors.push(`${prefix}: invalid rarity "${item.rarity}"`);
        }
        if (typeof item.presencePct !== 'number' || item.presencePct < 0 || item.presencePct > 100) {
          errors.push(`${prefix}: presencePct must be 0-100`);
        }
      });
    }
  }

  // Validate severable parts (Section 8.2)
  if (specimen.severable) {
    if (!Array.isArray(specimen.severable)) {
      errors.push('"severable" must be an array');
    } else {
      specimen.severable.forEach((sev, idx) => {
        const prefix = `severable[${idx}]`;
        if (!sev.id || typeof sev.id !== 'string') errors.push(`${prefix}: missing id`);
        if (!sev.slotId || typeof sev.slotId !== 'string') errors.push(`${prefix}: missing slotId`);
      });
    }
  }

  // Validate added slots
  if (specimen.add && Array.isArray(specimen.add)) {
    specimen.add.forEach((slot, idx) => {
      const val = validateSlot(slot, `add[${idx}]`);
      errors.push(...val.errors);
      warnings.push(...val.warnings);
    });
  }

  // Cross-reference with template if provided
  if (templates && templates[specimen.template]) {
    const tmpl = templates[specimen.template];
    const tmplVal = validateBodyTemplate(tmpl);
    if (!tmplVal.ok) {
      errors.push(`Template "${specimen.template}" has errors: ${tmplVal.errors.join('; ')}`);
    }
    warnings.push(...tmplVal.warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Validate a SurgeryInput object (Section 8.3)
 */
export function validateSurgeryInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Input must be an object'] };
  }

  if (input.schemaVersion && input.schemaVersion !== 2) {
    errors.push(`Expected schemaVersion 2, got "${input.schemaVersion}"`);
  }

  if (!input.specimenId || typeof input.specimenId !== 'string') errors.push('Missing "specimenId"');
  if (input.state !== 'living' && input.state !== 'dead') errors.push('"state" must be "living" or "dead"');
  if (input.state === 'living' && (typeof input.pulsePct !== 'number' || input.pulsePct < 0 || input.pulsePct > 100)) {
    errors.push('Living specimen must have "pulsePct" between 0 and 100');
  }
  if (typeof input.bloodPct !== 'number' || input.bloodPct < 0 || input.bloodPct > 100) {
    errors.push('"bloodPct" must be between 0 and 100');
  }

  if (!input.player || typeof input.player !== 'object') {
    errors.push('Missing "player" state');
  } else {
    if (typeof input.player.calories !== 'number') errors.push('Missing "player.calories"');
    if (typeof input.player.surgerySkill !== 'number') errors.push('Missing "player.surgerySkill"');
  }

  if (typeof input.seed !== 'number') {
    errors.push('"seed" must be a number');
  }

  // Validate damage object
  if (input.damage) {
    if (input.damage.severedParts && !Array.isArray(input.damage.severedParts)) {
      errors.push('damage.severedParts must be an array of strings');
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a SurgeryResult object strictly against Section 8.4 schema.
 * Check 22: Result validates against 8.4 and contains nothing else.
 */
export function validateSurgeryResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['Result must be an object'] };
  }

  const allowedKeys = new Set([
    'schemaVersion',
    'specimenId',
    'specimenKind',
    'seed',
    'harvested',
    'lost',
    'caloriesSpent',
    'caloriesGained',
    'biomassExpGained',
    'suppliesUsed',
    'skillXp',
    'endedBy',
    'flatlined'
  ]);

  // Check for any unauthorized / leaking fields
  for (const k of Object.keys(result)) {
    if (!allowedKeys.has(k)) {
      errors.push(`Unauthorized key "${k}" found in SurgeryResult`);
    }
  }

  if (result.schemaVersion !== 2) {
    errors.push(`Missing or invalid "schemaVersion", expected 2, got "${result.schemaVersion}"`);
  }
  if (typeof result.specimenId !== 'string') errors.push('Missing or invalid "specimenId"');
  if (typeof result.specimenKind !== 'string') errors.push('Missing or invalid "specimenKind"');
  if (typeof result.seed !== 'number') errors.push('Missing or invalid "seed"');

  // Harvested items
  if (!Array.isArray(result.harvested)) {
    errors.push('"harvested" must be an array');
  } else {
    result.harvested.forEach((h, i) => {
      if (!h || typeof h !== 'object') {
        errors.push(`harvested[${i}] must be an object`);
        return;
      }
      if (!h.lootId || typeof h.lootId !== 'string') errors.push(`harvested[${i}]: missing lootId`);
      if (!h.slotId || typeof h.slotId !== 'string') errors.push(`harvested[${i}]: missing slotId`);
      if (!h.slotType || typeof h.slotType !== 'string') errors.push(`harvested[${i}]: missing slotType`);
      if (h.side !== null && typeof h.side !== 'string') errors.push(`harvested[${i}]: side must be string or null`);
      if (!['part', 'organ', 'trait', 'loose'].includes(h.kind)) errors.push(`harvested[${i}]: invalid kind "${h.kind}"`);
      if (!['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(h.rarity)) errors.push(`harvested[${i}]: invalid rarity "${h.rarity}"`);
      
      // Condition must be integer 1-100 (Section 8.4)
      if (typeof h.condition !== 'number' || !Number.isInteger(h.condition) || h.condition < 1 || h.condition > 100) {
        errors.push(`harvested[${i}]: condition must be an integer 1-100 (got ${h.condition})`);
      }
      if (typeof h.quantity !== 'number' || !Number.isInteger(h.quantity) || h.quantity < 1) {
        errors.push(`harvested[${i}]: quantity must be an integer >= 1`);
      }
      if (!['body', 'severed', 'loose'].includes(h.source)) {
        errors.push(`harvested[${i}]: invalid source "${h.source}" (must be body, severed, or loose)`);
      }
    });
  }

  // Lost items
  if (!Array.isArray(result.lost)) {
    errors.push('"lost" must be an array');
  } else {
    result.lost.forEach((l, i) => {
      if (!l || typeof l !== 'object') {
        errors.push(`lost[${i}] must be an object`);
        return;
      }
      if (!l.slotId || typeof l.slotId !== 'string') errors.push(`lost[${i}]: missing slotId`);
      if (!['destroyed', 'ruptured', 'forfeited'].includes(l.reason)) {
        errors.push(`lost[${i}]: invalid reason "${l.reason}" (must be destroyed, ruptured, or forfeited)`);
      }
      if (l.condition !== undefined && typeof l.condition !== 'number') {
        errors.push(`lost[${i}]: condition must be a number`);
      }
    });
  }

  if (typeof result.caloriesSpent !== 'number') errors.push('"caloriesSpent" must be a number');
  if (typeof result.caloriesGained !== 'number') errors.push('"caloriesGained" must be a number');
  if (typeof result.biomassExpGained !== 'number') errors.push('"biomassExpGained" must be a number');

  if (!result.suppliesUsed || typeof result.suppliesUsed.sutures !== 'number') {
    errors.push('"suppliesUsed" must contain sutures count');
  }

  if (!result.skillXp || typeof result.skillXp.Surgery !== 'number') {
    errors.push('"skillXp" must contain Surgery number');
  }

  if (result.endedBy !== 'feast' && result.endedBy !== 'leave') {
    errors.push('"endedBy" must be "feast" or "leave"');
  }

  if (typeof result.flatlined !== 'boolean') errors.push('"flatlined" must be a boolean');

  return { ok: errors.length === 0, errors };
}
