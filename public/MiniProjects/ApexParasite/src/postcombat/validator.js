/**
 * Apex Parasite - Post-Combat Schema & Definition Validator
 * Validates SpecimenDef, LootDef, SurgeryInput, and SurgeryResult.
 */

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
  if (!loot.slot || typeof loot.slot !== 'string') errors.push('Missing or invalid "slot"');
  if (!loot.glyph || typeof loot.glyph !== 'string') errors.push('Missing or invalid "glyph"');

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a SpecimenDef against the schema and cross-reference with known lootDefs
 */
export function validateSpecimenDef(specimen, lootDefs = null) {
  const errors = [];
  if (!specimen || typeof specimen !== 'object') {
    return { ok: false, errors: ['Specimen definition must be an object'] };
  }

  // Core metadata
  if (!specimen.id || typeof specimen.id !== 'string') errors.push('Missing or invalid "id"');
  if (!specimen.displayName || typeof specimen.displayName !== 'string') errors.push('Missing or invalid "displayName"');
  if (!specimen.kind || typeof specimen.kind !== 'string') errors.push('Missing or invalid "kind"');

  // Art definition
  if (!specimen.art || typeof specimen.art !== 'object') {
    errors.push('Missing "art" object');
  } else {
    if (!specimen.art.body || typeof specimen.art.body !== 'string') {
      errors.push('Missing or invalid "art.body"');
    }
    if (!Array.isArray(specimen.art.size) || specimen.art.size.length !== 2 ||
        typeof specimen.art.size[0] !== 'number' || typeof specimen.art.size[1] !== 'number') {
      errors.push('"art.size" must be a [width, height] array of numbers');
    }
  }

  const artW = specimen.art?.size?.[0] || 0;
  const artH = specimen.art?.size?.[1] || 0;

  // Base vitals & feast
  if (!specimen.baseVitals || typeof specimen.baseVitals.pulse !== 'number') {
    errors.push('Missing or invalid "baseVitals.pulse"');
  }
  if (!specimen.feast || typeof specimen.feast.calories !== 'number' || typeof specimen.feast.biomassExp !== 'number') {
    errors.push('Missing or invalid "feast" definition (requires calories and biomassExp)');
  }

  const organIds = new Set();
  const clampIds = new Set();
  const severableIds = new Set();

  // Clamp points
  if (specimen.clampPoints) {
    if (!Array.isArray(specimen.clampPoints)) {
      errors.push('"clampPoints" must be an array');
    } else {
      specimen.clampPoints.forEach((clamp, idx) => {
        const prefix = `clampPoints[${idx}] (${clamp?.id || 'unnamed'})`;
        if (!clamp.id || typeof clamp.id !== 'string') errors.push(`${prefix}: missing or invalid "id"`);
        else if (clampIds.has(clamp.id)) errors.push(`${prefix}: duplicate clamp id "${clamp.id}"`);
        else clampIds.add(clamp.id);

        if (!clamp.name) errors.push(`${prefix}: missing "name"`);
        if (!Array.isArray(clamp.anchor) || clamp.anchor.length !== 2 ||
            typeof clamp.anchor[0] !== 'number' || typeof clamp.anchor[1] !== 'number') {
          errors.push(`${prefix}: "anchor" must be [x, y]`);
        } else if (artW > 0 && artH > 0) {
          if (clamp.anchor[0] < 0 || clamp.anchor[0] > artW || clamp.anchor[1] < 0 || clamp.anchor[1] > artH) {
            errors.push(`${prefix}: anchor [${clamp.anchor}] lies outside art.size [${artW}, ${artH}]`);
          }
        }
      });
    }
  }

  // Severable parts
  if (specimen.severable) {
    if (!Array.isArray(specimen.severable)) {
      errors.push('"severable" must be an array');
    } else {
      specimen.severable.forEach((part, idx) => {
        const prefix = `severable[${idx}] (${part?.id || 'unnamed'})`;
        if (!part.id || typeof part.id !== 'string') errors.push(`${prefix}: missing or invalid "id"`);
        else if (severableIds.has(part.id)) errors.push(`${prefix}: duplicate severable id "${part.id}"`);
        else severableIds.add(part.id);

        if (!part.name) errors.push(`${prefix}: missing "name"`);
        if (!part.loot) errors.push(`${prefix}: missing "loot" id`);
        else if (lootDefs && !lootDefs[part.loot]) {
          errors.push(`${prefix}: references unknown loot id "${part.loot}"`);
        }

        if (!Array.isArray(part.anchor) || part.anchor.length !== 2) {
          errors.push(`${prefix}: "anchor" must be [x, y]`);
        } else if (artW > 0 && artH > 0) {
          if (part.anchor[0] < 0 || part.anchor[0] > artW || part.anchor[1] < 0 || part.anchor[1] > artH) {
            errors.push(`${prefix}: anchor [${part.anchor}] lies outside art.size [${artW}, ${artH}]`);
          }
        }

        if (!part.coverShape || typeof part.coverShape !== 'object') {
          errors.push(`${prefix}: missing "coverShape"`);
        }
      });
    }
  }

  // Organs
  if (!Array.isArray(specimen.organs) || specimen.organs.length === 0) {
    errors.push('Specimen must have an "organs" array with at least one organ');
  } else {
    specimen.organs.forEach((organ, idx) => {
      const prefix = `organs[${idx}] (${organ?.id || 'unnamed'})`;
      if (!organ.id || typeof organ.id !== 'string') errors.push(`${prefix}: missing or invalid "id"`);
      else if (organIds.has(organ.id)) errors.push(`${prefix}: duplicate organ id "${organ.id}"`);
      else organIds.add(organ.id);

      if (!organ.name) errors.push(`${prefix}: missing "name"`);
      if (!organ.region) errors.push(`${prefix}: missing "region"`);
      if (!organ.loot) errors.push(`${prefix}: missing "loot"`);
      else if (lootDefs && !lootDefs[organ.loot]) {
        errors.push(`${prefix}: references unknown loot id "${organ.loot}"`);
      }

      const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      if (!validRarities.includes(organ.rarity)) {
        errors.push(`${prefix}: invalid rarity "${organ.rarity}"`);
      }

      if (typeof organ.baseSuccessPct !== 'number' || organ.baseSuccessPct < 0 || organ.baseSuccessPct > 100) {
        errors.push(`${prefix}: "baseSuccessPct" must be number 0-100`);
      }
      if (typeof organ.pulseCost !== 'number' || organ.pulseCost < 0) {
        errors.push(`${prefix}: "pulseCost" must be a non-negative number`);
      }

      // Anchor inside art bounds
      if (!Array.isArray(organ.anchor) || organ.anchor.length !== 2 ||
          typeof organ.anchor[0] !== 'number' || typeof organ.anchor[1] !== 'number') {
        errors.push(`${prefix}: "anchor" must be [x, y]`);
      } else if (artW > 0 && artH > 0) {
        if (organ.anchor[0] < 0 || organ.anchor[0] > artW || organ.anchor[1] < 0 || organ.anchor[1] > artH) {
          errors.push(`${prefix}: anchor [${organ.anchor}] lies outside art.size [${artW}, ${artH}]`);
        }
      }

      // HitShape
      if (!organ.hitShape || typeof organ.hitShape !== 'object') {
        errors.push(`${prefix}: missing "hitShape"`);
      } else {
        const t = organ.hitShape.type;
        if (!['ellipse', 'rect', 'polygon'].includes(t)) {
          errors.push(`${prefix}: invalid hitShape.type "${t}"`);
        }
      }

      // slowedByClamp references
      if (organ.slowedByClamp && Array.isArray(organ.slowedByClamp)) {
        organ.slowedByClamp.forEach((clampRef) => {
          if (!clampIds.has(clampRef)) {
            errors.push(`${prefix}: slowedByClamp references unknown clampPoint "${clampRef}"`);
          }
        });
      }
    });

    // Second pass on organs to validate `requires` cross references
    specimen.organs.forEach((organ, idx) => {
      const prefix = `organs[${idx}] (${organ.id})`;
      if (organ.requires && Array.isArray(organ.requires)) {
        organ.requires.forEach((reqId) => {
          if (!organIds.has(reqId)) {
            errors.push(`${prefix}: requires unknown organ "${reqId}"`);
          }
          if (reqId === organ.id) {
            errors.push(`${prefix}: organ cannot require itself`);
          }
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a SurgeryInput object (Section 6.1)
 */
export function validateSurgeryInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['Input must be an object'] };
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

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a SurgeryResult object strictly against Section 6.2 schema.
 * Check 19: Output validates against section 6.2 and contains nothing else.
 */
export function validateSurgeryResult(result) {
  const errors = [];
  if (!result || typeof result !== 'object') {
    return { ok: false, errors: ['Result must be an object'] };
  }

  const allowedKeys = new Set([
    'specimenId',
    'specimenKind',
    'harvested',
    'lost',
    'caloriesSpent',
    'caloriesGained',
    'biomassExpGained',
    'suppliesUsed',
    'skillXp',
    'endedBy',
    'flatlined',
    'seed'
  ]);

  // Check for any unauthorized / leaking fields
  for (const k of Object.keys(result)) {
    if (!allowedKeys.has(k)) {
      errors.push(`Unauthorized key "${k}" found in SurgeryResult`);
    }
  }

  if (typeof result.specimenId !== 'string') errors.push('Missing or invalid "specimenId"');
  if (typeof result.specimenKind !== 'string') errors.push('Missing or invalid "specimenKind"');

  // Harvested
  if (!Array.isArray(result.harvested)) {
    errors.push('"harvested" must be an array');
  } else {
    result.harvested.forEach((h, i) => {
      if (!h || typeof h !== 'object') errors.push(`harvested[${i}] must be an object`);
      else {
        if (!h.lootId || typeof h.lootId !== 'string') errors.push(`harvested[${i}]: missing lootId`);
        if (!['damaged', 'intact', 'pristine'].includes(h.quality)) errors.push(`harvested[${i}]: invalid quality "${h.quality}"`);
        if (!['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(h.rarity)) errors.push(`harvested[${i}]: invalid rarity "${h.rarity}"`);
        if (!['organ', 'ground'].includes(h.source)) errors.push(`harvested[${i}]: invalid source "${h.source}"`);
      }
    });
  }

  // Lost
  if (!Array.isArray(result.lost)) {
    errors.push('"lost" must be an array');
  } else {
    result.lost.forEach((l, i) => {
      if (!l || typeof l !== 'object') errors.push(`lost[${i}] must be an object`);
      else {
        if (!l.lootId || typeof l.lootId !== 'string') errors.push(`lost[${i}]: missing lootId`);
        if (!['destroyed', 'necrosis', 'forfeited'].includes(l.reason)) errors.push(`lost[${i}]: invalid reason "${l.reason}"`);
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
  if (typeof result.seed !== 'number') errors.push('"seed" must be a number');

  return { ok: errors.length === 0, errors };
}
