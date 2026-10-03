/**
 * Apex Parasite - Post-Combat Headless Runner & Statistical Analysis
 * Parses headless script tokens, runs automated tests, and computes rarity/skill distributions.
 */

import { createSession } from './core.js';
import { validateSurgeryResult } from './validator.js';

/**
 * Parse a comma-separated script string into action objects.
 * Tokens:
 *   x:<organId> -> { type: 'extract', id: <organId> }
 *   c:<clampId> -> { type: 'clamp', id: <clampId> }
 *   t:<severedId> -> { type: 'take', id: <severedId> }
 *   f -> { type: 'feast' }
 *   l -> { type: 'leave' }
 */
export function parseScript(scriptStr) {
  if (!scriptStr) return [];
  const tokens = scriptStr.split(',').map(s => s.trim()).filter(Boolean);
  const actions = [];

  for (const token of tokens) {
    if (token === 'f') {
      actions.push({ type: 'feast' });
    } else if (token === 'l') {
      actions.push({ type: 'leave' });
    } else if (token.startsWith('x:')) {
      actions.push({ type: 'extract', id: token.slice(2) });
    } else if (token.startsWith('c:')) {
      actions.push({ type: 'clamp', id: token.slice(2) });
    } else if (token.startsWith('t:')) {
      actions.push({ type: 'take', id: token.slice(2) });
    } else {
      throw new Error(`Unknown script token: "${token}"`);
    }
  }

  return actions;
}

/**
 * Execute a script against a specimen and return the session, result, and event log.
 */
export function runHeadlessScript(specimenDef, lootDefs, input, scriptStr) {
  const session = createSession(specimenDef, lootDefs, input);
  const actions = parseScript(scriptStr);
  const history = [];

  for (const action of actions) {
    const check = session.canAct(action);
    if (!check.ok) {
      history.push({ action, error: check.reason });
      break;
    }
    const events = session.act(action);
    history.push({ action, events });
  }

  // If not explicitly ended by feast or leave, end with leave
  if (!session.isEnded()) {
    session.act({ type: 'leave' });
  }

  const result = session.result();
  return { session, result, history };
}

/**
 * Check 12: Ordering Matters test
 * Thorn-Beast fixture at the same seed:
 * Script A: extract deep/damaging parts first (e.g. vascular_root_core killsPulse, causing flatline) -> deep first, fragile last
 * Script B: clamp first, fragile organs first while pulse is high, deep last
 */
export function testOrderingMatters(thornBeastDef, lootDefs, seed = 42424) {
  const baseInput = {
    specimenId: 'verdant_thorn_beast',
    state: 'living',
    pulsePct: 75,
    bloodPct: 40,
    damage: { severedParts: ['antler_left'], woundedRegions: [] },
    player: {
      calories: 100,
      maxCalories: 100,
      surgerySkill: 2,
      precisionBonus: 0,
      supplies: { sutures: 2 }
    },
    seed,
    options: { skipEntrance: true }
  };

  // Script A: Extract vascular_root_core (killsPulse -> flatline), then try fragile bile_sac_thorax
  // Expect: Bile sac is destroyed/lost to necrosis on flatline or capped at damaged
  const scriptA = 'x:vascular_root_core,x:bile_sac_thorax,f';

  // Script B: Clamp artery first, extract fragile bile_sac_thorax while living and protected, then vascular_root_core
  // Expect: Bile sac extracted intact/pristine, vascular root extracted after
  const scriptB = 'c:thorax_artery,x:bile_sac_thorax,x:vascular_root_core,f';

  const resA = runHeadlessScript(thornBeastDef, lootDefs, { ...baseInput, seed }, scriptA).result;
  const resB = runHeadlessScript(thornBeastDef, lootDefs, { ...baseInput, seed }, scriptB).result;

  const different = JSON.stringify(resA.harvested) !== JSON.stringify(resB.harvested) ||
                    JSON.stringify(resA.lost) !== JSON.stringify(resB.lost);

  return {
    seed,
    resA,
    resB,
    different,
    summaryA: { harvestedCount: resA.harvested.length, lostCount: resA.lost.length },
    summaryB: { harvestedCount: resB.harvested.length, lostCount: resB.lost.length }
  };
}

/**
 * Check 14: Statistical analysis over 1000 seeds per scenario
 * Verifies that:
 * 1. Destroy rate rises with rarity
 * 2. Destroy rate falls with surgerySkill
 */
export function runStatsTest(specimens, lootDefs, iterations = 1000) {
  const thornBeast = specimens['verdant_thorn_beast'] || Object.values(specimens)[0];

  const rarities = ['common', 'uncommon', 'rare', 'epic'];
  const skills = [0, 2, 5];

  const resultsByRarity = {};
  const resultsBySkill = {};

  // 1. Vary rarity with fixed skill = 1
  for (const rarity of rarities) {
    let attempts = 0;
    let destroyed = 0;
    let pristine = 0;
    let intact = 0;
    let damaged = 0;

    // Create a mock organ of this rarity
    const testOrgan = {
      id: `test_${rarity}`,
      name: `Test ${rarity}`,
      region: 'thorax',
      anchor: [500, 300],
      hitShape: { type: 'ellipse', rx: 40, ry: 40 },
      loot: thornBeast.organs[0].loot,
      rarity,
      baseSuccessPct: 80,
      pulseCost: 5,
      tags: [],
      requires: [],
      killsPulse: false
    };

    const mockSpecimen = {
      ...thornBeast,
      organs: [testOrgan]
    };

    for (let seed = 1; seed <= iterations; seed++) {
      const input = {
        specimenId: mockSpecimen.id,
        state: 'living',
        pulsePct: 90,
        bloodPct: 50,
        damage: { severedParts: [], woundedRegions: [] },
        player: {
          calories: 50,
          maxCalories: 50,
          surgerySkill: 1,
          precisionBonus: 0,
          supplies: { sutures: 0 }
        },
        seed,
        options: { skipEntrance: true }
      };

      const { result } = runHeadlessScript(mockSpecimen, lootDefs, input, `x:${testOrgan.id},f`);
      attempts++;
      const wasHarvested = result.harvested.find(h => h.lootId === testOrgan.loot);
      const wasLost = result.lost.find(l => l.lootId === testOrgan.loot && l.reason === 'destroyed');

      if (wasLost) {
        destroyed++;
      } else if (wasHarvested) {
        if (wasHarvested.quality === 'pristine') pristine++;
        else if (wasHarvested.quality === 'intact') intact++;
        else damaged++;
      }
    }

    resultsByRarity[rarity] = {
      attempts,
      destroyed,
      destroyRatePct: ((destroyed / attempts) * 100).toFixed(2),
      pristineRatePct: ((pristine / attempts) * 100).toFixed(2),
      intactRatePct: ((intact / attempts) * 100).toFixed(2),
      damagedRatePct: ((damaged / attempts) * 100).toFixed(2)
    };
  }

  // 2. Vary skill with fixed rarity = 'rare'
  for (const skill of skills) {
    let attempts = 0;
    let destroyed = 0;
    let pristine = 0;
    let intact = 0;
    let damaged = 0;

    const testOrgan = {
      id: `test_skill_${skill}`,
      name: `Test Rare`,
      region: 'thorax',
      anchor: [500, 300],
      hitShape: { type: 'ellipse', rx: 40, ry: 40 },
      loot: thornBeast.organs[0].loot,
      rarity: 'rare',
      baseSuccessPct: 75,
      pulseCost: 5,
      tags: [],
      requires: [],
      killsPulse: false
    };

    const mockSpecimen = {
      ...thornBeast,
      organs: [testOrgan]
    };

    for (let seed = 1; seed <= iterations; seed++) {
      const input = {
        specimenId: mockSpecimen.id,
        state: 'living',
        pulsePct: 90,
        bloodPct: 50,
        damage: { severedParts: [], woundedRegions: [] },
        player: {
          calories: 50,
          maxCalories: 50,
          surgerySkill: skill,
          precisionBonus: 0,
          supplies: { sutures: 0 }
        },
        seed,
        options: { skipEntrance: true }
      };

      const { result } = runHeadlessScript(mockSpecimen, lootDefs, input, `x:${testOrgan.id},f`);
      attempts++;
      const wasHarvested = result.harvested.find(h => h.lootId === testOrgan.loot);
      const wasLost = result.lost.find(l => l.lootId === testOrgan.loot && l.reason === 'destroyed');

      if (wasLost) {
        destroyed++;
      } else if (wasHarvested) {
        if (wasHarvested.quality === 'pristine') pristine++;
        else if (wasHarvested.quality === 'intact') intact++;
        else damaged++;
      }
    }

    resultsBySkill[`skill_${skill}`] = {
      skill,
      attempts,
      destroyed,
      destroyRatePct: ((destroyed / attempts) * 100).toFixed(2),
      pristineRatePct: ((pristine / attempts) * 100).toFixed(2),
      intactRatePct: ((intact / attempts) * 100).toFixed(2),
      damagedRatePct: ((damaged / attempts) * 100).toFixed(2)
    };
  }

  // Validate monotonicity
  const rCommon = parseFloat(resultsByRarity['common'].destroyRatePct);
  const rRare = parseFloat(resultsByRarity['rare'].destroyRatePct);
  const rEpic = parseFloat(resultsByRarity['epic'].destroyRatePct);
  const rarityRises = rCommon <= rRare && rRare <= rEpic;

  const s0 = parseFloat(resultsBySkill['skill_0'].destroyRatePct);
  const s2 = parseFloat(resultsBySkill['skill_2'].destroyRatePct);
  const s5 = parseFloat(resultsBySkill['skill_5'].destroyRatePct);
  const skillFalls = s0 >= s2 && s2 >= s5;

  return {
    iterations,
    resultsByRarity,
    resultsBySkill,
    checksPassed: {
      destroyRisesWithRarity: rarityRises,
      destroyFallsWithSkill: skillFalls
    }
  };
}
