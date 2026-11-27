/**
 * Apex Parasite - Post-Combat Headless Runner & Script Execution (Phase 2)
 * Pure headless execution of action scripts:
 *   x:<slotId> -> extract
 *   c:<clampId> -> clamp
 *   t:<id>      -> take from tray (loose/severed)
 *   f           -> feast
 *   l           -> leave
 */

import { createSession } from './core.js';
import { validateSurgeryResult } from './validator.js';

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

export function runHeadlessScript(specimenDef, templates, lootDefs, input, scriptStr) {
  // Support both 4-arg and 5-arg signatures
  let session;
  if (scriptStr === undefined && typeof input === 'string') {
    scriptStr = input;
    input = lootDefs;
    lootDefs = templates;
    templates = {};
    session = createSession(specimenDef, templates, lootDefs, input);
  } else {
    session = createSession(specimenDef, templates, lootDefs, input);
  }

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

  if (!session.isEnded()) {
    session.act({ type: 'leave' });
  }

  const result = session.result();
  return { session, result, history };
}
