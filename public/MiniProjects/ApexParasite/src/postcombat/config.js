/**
 * Apex Parasite - Post-Combat Surgery Configuration
 * All gameplay tuning, balance numbers, and thresholds live here.
 */

export const CONFIG = {
  // Pulse & Bleed mechanics (Section 4.2)
  BASE_BLEED: 3,
  LOW_BLOOD_THRESHOLD: 30,
  LOW_BLOOD_BLEED_MULT: 1.5,
  BLEED_REDUCTION_CAP: 90, // Max percentage reduction from clamps

  // Action calorie costs (Section 4.3)
  RARITY_CALORIE_COST: {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 5,
    legendary: 8
  },
  CLAMP_CALORIE_COST: 1,
  CLAMP_SUTURE_COST: 1,
  GROUND_LOOT_CALORIE_COST: 0,
  GROUND_LOOT_PULSE_COST: 0,

  // Extraction success formula weights (Section 4.4)
  SKILL_BONUS: 3, // Per surgery skill level
  WOUND_PENALTY: 10, // When organ is located in a wounded region
  FRAGILE_PULSE_THRESHOLD: 50, // Pulse below which fragile penalty scales
  SUCCESS_PCT_MIN: 5,
  SUCCESS_PCT_MAX: 95,

  RARITY_PENALTY: {
    common: 0,
    uncommon: 8,
    rare: 16,
    epic: 28,
    legendary: 40
  },

  // Destruction roll parameters (Section 4.5)
  SKILL_SAVE: 2, // Per surgery skill level reducing destroy chance
  DESTROY_PCT_MIN: 0,
  DESTROY_PCT_MAX: 95,
  MISS_DESTROY_FACTOR: 0.5,

  RARITY_DESTROY_BASE: {
    common: 5,
    uncommon: 10,
    rare: 20,
    epic: 30,
    legendary: 40
  },

  // Feast scaling (Section 4.3)
  LIVING_FEAST_CALORIE_MULT: 1.0,
  DEAD_OR_FLATLINE_FEAST_CALORIE_MULT: 0.7,

  // Skill XP rewards (Section 4.9)
  SKILL_XP: {
    PER_ATTEMPT: 1,
    PER_PRISTINE: 2,
    PER_RARE_PLUS: 3 // Rare, epic, or legendary successful extraction
  },

  // Timings & UX (Section 7)
  ENTRANCE_DURATION_MS: 1400,
  CONFIRM_TIMEOUT_MS: 3000,
  FLIGHT_ANIMATION_MS: 600,

  // Quality ranking
  QUALITY_TIERS: ['damaged', 'intact', 'pristine']
};
