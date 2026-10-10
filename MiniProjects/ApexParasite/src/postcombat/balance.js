/**
 * Apex Parasite - Post-Combat Balance & Statistical Verification Engine (Phase 2)
 * Pure logic simulation of 200 seeds across specimens, skill ranks {1, mid, max},
 * and clamp loadouts {0 sutures, 2 sutures}.
 * Evaluates random order, best order, and worst order against body potential value.
 */

import { CONFIG } from './config.js';
import { createSession } from './core.js';
import { generateBody, resolveSpecimen, mulberry32, fnv1a } from './body.js';

/**
 * Verify Section 4.3 Table targets with bodyCondition = 80
 */
export function runTable43Test(iterations = 2000) {
  const skills = [
    { label: 'Skill 1', skill: 1 },
    { label: 'Skill mid (5)', skill: 5 },
    { label: 'Skill max (10)', skill: 10 }
  ];
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  const results = {};

  skills.forEach(({ label, skill }) => {
    results[label] = {};
    rarities.forEach(rarity => {
      let sumCond = 0;
      let destroyedCount = 0;

      const difficulty = CONFIG.RARITY_DIFFICULTY[rarity];
      const skillScore = CONFIG.SKILL_FLOOR + CONFIG.SKILL_RANGE * (skill - 1) / (CONFIG.SKILL_MAX - 1);
      const margin = skillScore - difficulty;
      const spread = Math.max(5, CONFIG.SPREAD_BASE - CONFIG.SPREAD_SKILL_MULT * (skill - 1) / (CONFIG.SKILL_MAX - 1));

      const rng = mulberry32(fnv1a(`table43:${label}:${rarity}`));

      for (let i = 0; i < iterations; i++) {
        const u1 = rng();
        const u2 = rng();
        const cutFactor = Math.max(0.10, Math.min(1.00, CONFIG.CUT_FACTOR_BASE + margin / 100 + (u1 + u2 - 1) * spread / 100));
        const cond = Math.round(80 * cutFactor);
        if (cond < CONFIG.DESTROY_THRESHOLD) {
          destroyedCount++;
        }
        sumCond += cond;
      }

      const avgCond = parseFloat((sumCond / iterations).toFixed(1));
      const destroyPct = parseFloat(((destroyedCount / iterations) * 100).toFixed(1));
      results[label][rarity] = {
        avgCondition: avgCond,
        destroyedPct: destroyPct
      };
    });
  });

  return results;
}

/**
 * Compute the potential value of a body (all present items at bodyCondition)
 */
export function computePotentialValue(bodyInstance, resolvedSpecimen) {
  let total = 0;
  bodyInstance.items.forEach(item => {
    if (item.present) {
      const rarityVal = CONFIG.RARITY_VALUE[item.slot.rarity] || 1;
      total += (item.bodyCondition / 100) * rarityVal * item.quantity;
    }
  });
  return total;
}

/**
 * Compute harvested value from a completed SurgeryResult
 */
export function computeHarvestedValue(surgeryResult) {
  let total = 0;
  surgeryResult.harvested.forEach(item => {
    const rarityVal = CONFIG.RARITY_VALUE[item.rarity] || 1;
    total += (item.condition / 100) * rarityVal * item.quantity;
  });
  return total;
}

/**
 * Evaluate an ordered sequence of slot IDs with an optional clamp strategy
 */
function evaluateSequence(specimenDef, templates, input, slotIdSequence, clampIdsToApply = [], stopOnFlatline = false) {
  const session = createSession(specimenDef, templates, {}, input);

  for (const cId of clampIdsToApply) {
    if (session.canAct({ type: 'clamp', id: cId }).ok) {
      session.act({ type: 'clamp', id: cId });
    }
  }

  for (const slotId of slotIdSequence) {
    if (stopOnFlatline && session.getState().pulse <= 0) {
      break;
    }
    if (session.canAct({ type: 'extract', id: slotId }).ok) {
      session.act({ type: 'extract', id: slotId });
    }
  }

  session.act({ type: 'leave' });
  return computeHarvestedValue(session.result());
}

/**
 * Search best, worst, and random order values for a given specimen state
 */
export function searchOrders(resolvedSpec, templates, input, presentSlotIds) {
  const clampSets = [[]];
  if (input.player.supplies?.sutures >= 2 && resolvedSpec.clampPoints?.length >= 2) {
    clampSets.push(['aorta', 'carotid']);
    clampSets.push(['aorta', 'femoral']);
    clampSets.push(['femoral', 'carotid']);
  }

  const slots = presentSlotIds.map(id => resolvedSpec.slots.find(x => x.id === id)).filter(Boolean);
  const fragile = slots.filter(x => x.tags?.includes('fragile') && !x.killsPulse);
  const normal = slots.filter(x => !x.tags?.includes('fragile') && !x.killsPulse);
  const killPulse = slots.filter(x => x.killsPulse);

  const headSlot = slots.find(x => x.id === 'head');
  const brainSlot = slots.find(x => x.id === 'brain');

  const candidateBestOrders = [];
  const carcassParts = ['foreleg_l', 'foreleg_r', 'hindleg_l', 'hindleg_r', 'tail', 'hide'];

  // Strategy A: Fine neuro-visceral extraction (brain/eyes/fragile vitals first, then heart)
  const orderA = [];
  fragile.filter(x => x.id !== 'head')
    .sort((a, b) => (CONFIG.RARITY_VALUE[b.rarity] || 1) - (CONFIG.RARITY_VALUE[a.rarity] || 1))
    .forEach(x => orderA.push(x.id));
  normal.filter(x => x.id !== 'head' && !carcassParts.includes(x.id))
    .sort((a, b) => (CONFIG.RARITY_VALUE[b.rarity] || 1) - (CONFIG.RARITY_VALUE[a.rarity] || 1))
    .forEach(x => orderA.push(x.id));
  killPulse.filter(x => x.id !== 'head').forEach(x => orderA.push(x.id));
  carcassParts.filter(id => presentSlotIds.includes(id)).forEach(id => orderA.push(id));
  candidateBestOrders.push(orderA);

  // Strategy B: Decapitation trophy strategy
  const orderB = [];
  if (headSlot) orderB.push('head');
  fragile.filter(x => x.id !== 'brain' && x.region !== 'head')
    .sort((a, b) => (CONFIG.RARITY_VALUE[b.rarity] || 1) - (CONFIG.RARITY_VALUE[a.rarity] || 1))
    .forEach(x => orderB.push(x.id));
  normal.filter(x => x.id !== 'head' && !carcassParts.includes(x.id))
    .sort((a, b) => (CONFIG.RARITY_VALUE[b.rarity] || 1) - (CONFIG.RARITY_VALUE[a.rarity] || 1))
    .forEach(x => orderB.push(x.id));
  killPulse.filter(x => x.id !== 'head').forEach(x => orderB.push(x.id));
  carcassParts.filter(id => presentSlotIds.includes(id)).forEach(id => orderB.push(id));
  candidateBestOrders.push(orderB);

  let bestVal = -1;
  for (const clamps of clampSets) {
    for (const ord of candidateBestOrders) {
      const val = evaluateSequence(resolvedSpec, templates, input, ord, clamps, false);
      if (val > bestVal) bestVal = val;
    }
  }

  // Sample 25 additional smart permutations with clamps
  for (let i = 0; i < 25; i++) {
    const shuffled = [...presentSlotIds].sort(() => Math.random() - 0.5);
    for (const clamps of clampSets) {
      const val = evaluateSequence(resolvedSpec, templates, input, shuffled, clamps, false);
      if (val > bestVal) bestVal = val;
    }
  }

  // Worst order: heart first (killsPulse), then leave or stop
  const worstOrder = killPulse.length > 0 ? [killPulse[0].id] : presentSlotIds;
  const worstVal = evaluateSequence(resolvedSpec, templates, input, worstOrder, [], true);

  // Random order: 20 uniform random permutations of present items, stopping on flatline
  let randomValSum = 0;
  const rRuns = 20;
  for (let r = 0; r < rRuns; r++) {
    const shuffled = [...presentSlotIds].sort(() => Math.random() - 0.5);
    const rVal = evaluateSequence(resolvedSpec, templates, input, shuffled, [], true);
    randomValSum += rVal;
  }
  const randomVal = randomValSum / rRuns;

  return {
    best: Math.max(0, bestVal),
    worst: Math.max(0, worstVal),
    random: Math.max(0, randomVal)
  };
}

/**
 * Run comprehensive balance test across specimens and seeds 1..200 (Section 5.4)
 */
export function runBalanceTest(specimens, templates, seedsCount = 200) {
  const table43 = runTable43Test();
  const presenceFrequencies = {};

  const report = {
    schemaVersion: 2,
    timestamp: new Date().toISOString(),
    seedsCount,
    table43,
    scenarios: {},
    presenceFrequencies,
    checks: {}
  };

  const testSpecimens = ['dire_wolf', 'verdant_thorn_beast'];
  const skillRanks = [
    { label: 'skill_1', skill: 1 },
    { label: 'skill_mid', skill: 5 },
    { label: 'skill_max', skill: 10 }
  ];

  for (const specId of testSpecimens) {
    const rawDef = specimens[specId];
    if (!rawDef) continue;
    const resolvedSpec = resolveSpecimen(rawDef, templates);

    presenceFrequencies[specId] = {};
    resolvedSpec.slots.forEach(slot => {
      presenceFrequencies[specId][slot.id] = { count: 0, pct: 0, declared: slot.presencePct };
    });

    report.scenarios[specId] = {};

    for (const { label: skillLabel, skill } of skillRanks) {
      for (const sutures of [0, 2]) {
        const scenarioKey = `${skillLabel}_sutures_${sutures}`;
        let totalPotential = 0;
        let totalBest = 0;
        let totalWorst = 0;
        let totalRandom = 0;

        for (let seed = 1; seed <= seedsCount; seed++) {
          const input = {
            specimenId: specId,
            state: 'living',
            pulsePct: CONFIG.TYPICAL_START_PULSE,
            bloodPct: 30,
            damage: { severedParts: [], regionDamage: {} },
            player: {
              calories: 100,
              maxCalories: 100,
              surgerySkill: skill,
              precisionBonus: 0,
              supplies: { sutures }
            },
            seed,
            options: { skipEntrance: true }
          };

          const body = generateBody(resolvedSpec, input);
          const potVal = computePotentialValue(body, resolvedSpec);
          totalPotential += potVal;

          if (skill === 1 && sutures === 0) {
            body.items.forEach(item => {
              if (item.present && presenceFrequencies[specId][item.slotId]) {
                presenceFrequencies[specId][item.slotId].count++;
              }
            });
          }

          const presentSlotIds = body.items.filter(i => i.present).map(i => i.slotId);
          const { best, worst, random } = searchOrders(resolvedSpec, templates, input, presentSlotIds);

          totalBest += best;
          totalWorst += worst;
          totalRandom += random;
        }

        const bestPct = totalPotential > 0 ? (totalBest / totalPotential) * 100 : 0;
        const worstPct = totalPotential > 0 ? (totalWorst / totalPotential) * 100 : 0;
        const randomPct = totalPotential > 0 ? (totalRandom / totalPotential) * 100 : 0;

        report.scenarios[specId][scenarioKey] = {
          bestFractionPct: parseFloat(bestPct.toFixed(1)),
          worstFractionPct: parseFloat(worstPct.toFixed(1)),
          randomFractionPct: parseFloat(randomPct.toFixed(1))
        };
      }
    }

    Object.keys(presenceFrequencies[specId]).forEach(slotId => {
      const entry = presenceFrequencies[specId][slotId];
      entry.pct = parseFloat(((entry.count / seedsCount) * 100).toFixed(1));
    });
  }

  // Acceptance Checks Evaluation (Section 11)
  const dw1 = report.scenarios['dire_wolf']?.['skill_1_sutures_2'];
  const vtb1 = report.scenarios['verdant_thorn_beast']?.['skill_1_sutures_2'];
  const check13Pass = dw1 && vtb1 &&
    dw1.bestFractionPct <= 65 && dw1.worstFractionPct <= 35 &&
    vtb1.bestFractionPct <= 65 && vtb1.worstFractionPct <= 35;

  const dwDiff = dw1 ? parseFloat((dw1.bestFractionPct - dw1.randomFractionPct).toFixed(1)) : 0;
  const vtbDiff = vtb1 ? parseFloat((vtb1.bestFractionPct - vtb1.randomFractionPct).toFixed(1)) : 0;
  const check14Pass = dwDiff >= 20 && vtbDiff >= 20;

  const dwMax = report.scenarios['dire_wolf']?.['skill_max_sutures_2'];
  const vtbMax = report.scenarios['verdant_thorn_beast']?.['skill_max_sutures_2'];
  const check15Pass = dwMax && vtbMax &&
    dwMax.bestFractionPct >= 75 && vtbMax.bestFractionPct >= 75;

  report.checks = {
    check13_budgetTightness: {
      passed: Boolean(check13Pass),
      direWolf: dw1,
      thornBeast: vtb1,
      requirement: 'best <= 65% and worst <= 35%'
    },
    check14_orderMatters: {
      passed: Boolean(check14Pass),
      dwDiff,
      vtbDiff,
      requirement: 'best - random >= 20 percentage points'
    },
    check15_skillProgression: {
      passed: Boolean(check15Pass),
      dwBestMax: dwMax?.bestFractionPct,
      vtbBestMax: vtbMax?.bestFractionPct,
      requirement: 'skill max best >= 75%'
    }
  };

  return report;
}

/**
 * Format balance test report as human-readable plain text
 */
export function formatPlainTextReport(report) {
  let text = '==================================================\n';
  text += 'APEX PARASITE — POST-COMBAT BALANCE TEST REPORT (v2)\n';
  text += `Seeds evaluated: ${report.seedsCount} (Living, Pulse 35, Cal 100)\n`;
  text += '==================================================\n\n';

  text += '--- 1. SECTION 4.3 CONDITION TARGETS (Body Condition = 80) ---\n';
  text += 'Skill rank     Common     Uncommon   Rare       Epic       Legendary\n';
  for (const [sLabel, rarities] of Object.entries(report.table43)) {
    const pad = (s, w) => String(s).padEnd(w);
    let line = pad(sLabel, 15);
    for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
      const data = rarities[r];
      line += pad(`${data.avgCondition} (${data.destroyedPct}%)`, 11);
    }
    text += line + '\n';
  }

  text += '\n--- 2. HARVEST EFFICIENCY BY SCENARIO (% of Potential Value) ---\n';
  for (const [specId, scens] of Object.entries(report.scenarios)) {
    text += `\n[ ${specId.toUpperCase()} ]\n`;
    text += 'Scenario                  Best %     Random %   Worst %    Order Diff %\n';
    for (const [scenKey, data] of Object.entries(scens)) {
      const pad = (s, w) => String(s).padEnd(w);
      const diff = (data.bestFractionPct - data.randomFractionPct).toFixed(1);
      text += `${pad(scenKey, 26)} ${pad(data.bestFractionPct + '%', 11)} ${pad(data.randomFractionPct + '%', 11)} ${pad(data.worstFractionPct + '%', 11)} +${diff}%\n`;
    }
  }

  text += '\n--- 3. ACCEPTANCE CHECKS EVALUATION ---\n';
  text += `Check 13 (Budget Tightness: Best <= 65%, Worst <= 35%): ${report.checks.check13_budgetTightness.passed ? 'PASSED ✓' : 'FAILED ✗'}\n`;
  text += `Check 14 (Order Matters: Best - Random >= 20%):          ${report.checks.check14_orderMatters.passed ? 'PASSED ✓' : 'FAILED ✗'}\n`;
  text += `       Dire Wolf diff: +${report.checks.check14_orderMatters.dwDiff}%, Thorn Beast diff: +${report.checks.check14_orderMatters.vtbDiff}%\n`;
  text += `Check 15 (Skill Progression: Max Skill Best >= 75%):    ${report.checks.check15_skillProgression.passed ? 'PASSED ✓' : 'FAILED ✗'}\n`;
  text += `       Dire Wolf Max: ${report.checks.check15_skillProgression.dwBestMax}%, Thorn Beast Max: ${report.checks.check15_skillProgression.vtbBestMax}%\n`;

  text += '\n--- 4. PRESENCE FREQUENCIES (200 Seeds) ---\n';
  for (const [specId, freqMap] of Object.entries(report.presenceFrequencies)) {
    text += `\n[ ${specId} ]\n`;
    for (const [slotId, data] of Object.entries(freqMap)) {
      text += `  - ${slotId.padEnd(16)}: ${data.pct}% (declared ${data.declared}%)\n`;
    }
  }

  return text;
}

export { formatPlainTextReport as formatBalanceReportText };
