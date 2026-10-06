/**
 * Apex Parasite - Post-Combat Surgery Configuration (Phase 2)
 * All gameplay tuning, balance numbers, and thresholds live here.
 * TUNING LIVES IN CONFIG FILES, NOT LOGIC.
 */

export const CONFIG = {
  // Schema
  SCHEMA_VERSION: 2,

  // Body Generation (Section 3.2)
  BODY_COND_MEAN: 80,
  BODY_COND_SPREAD: 15,
  REGION_DAMAGE_FACTOR: 0.8, // 0.8 * regionDamage (0-100)
  DEAD_PENALTY: 8,
  SEVER_PENALTY: 15,

  // Condition Model & Cut Formula (Section 4.2)
  SKILL_FLOOR: 26,
  SKILL_RANGE: 65,
  SKILL_MAX: 10,

  RARITY_DIFFICULTY: {
    common: 10,
    uncommon: 25,
    rare: 40,
    epic: 55,
    legendary: 70
  },

  SPREAD_BASE: 30,
  SPREAD_SKILL_MULT: 25,
  CUT_FACTOR_BASE: 0.60,
  DESTROY_THRESHOLD: 10, // Below 10 is destroyed

  // Fragility (Section 4.2)
  FRAGILE_PULSE_THRESHOLD: 50,
  FRAGILE_BASE: 0.4,
  FRAGILE_SLOPE: 0.012, // pulse >= 50 ? 1 : 0.4 + 0.012 * pulse

  // Flatline Multipliers (Section 4.4)
  FLATLINE_MULT_FRAGILE: 0.25,
  FLATLINE_MULT_OTHER: 0.70,

  // Budget Guidance & Validation (Section 5.1, 5.2, 6)
  TYPICAL_START_PULSE: 35,
  PULSE_COST_RATIO_MIN: 1.6,
  PULSE_COST_RATIO_MAX: 2.4,
  CLAMP_COVERAGE_MIN_PCT: 75,
  MIN_CLAMP_POINTS: 2,

  // Calorie Costs (Section 5.3)
  RARITY_CALORIE_COST: {
    common: 3,
    uncommon: 5,
    rare: 8,
    epic: 12,
    legendary: 18
  },
  PART_CALORIE_ADD: 3,
  CLAMP_CALORIE_COST: 1,
  CLAMP_SUTURE_COST: 1,
  LOOSE_CALORIE_COST: 0,
  LOOSE_PULSE_COST: 0,

  // Bleed mechanics (Section 1 - Phase 1 baseline preserved)
  BASE_BLEED: 3,
  LOW_BLOOD_THRESHOLD: 30,
  LOW_BLOOD_BLEED_MULT: 1.5,
  BLEED_REDUCTION_CAP: 90,

  // Rarity Values for Balance Analysis (Section 5.4)
  RARITY_VALUE: {
    common: 1,
    uncommon: 2.5,
    rare: 6,
    epic: 14,
    legendary: 30
  },

  // Condition Display Bands (Section 4.1)
  CONDITION_BANDS: [
    { min: 90, label: 'FLAWLESS', color: '#00f0ff' },
    { min: 70, label: 'GOOD', color: '#10b981' },
    { min: 40, label: 'FAIR', color: '#f59e0b' },
    { min: 10, label: 'POOR', color: '#f43f5e' },
    { min: 0,  label: 'RUINED', color: '#64748b' }
  ],

  // Feast Multipliers (Section 4.4 / Section 5.3)
  LIVING_FEAST_CALORIE_MULT: 1.0,
  DEAD_OR_FLATLINE_FEAST_CALORIE_MULT: 0.7,

  // Skill XP rewards (Section 8.4)
  SKILL_XP: {
    PER_ATTEMPT: 1,
    CONDITION_70_BONUS: 1,
    RARE_PLUS_50_BONUS: 2
  },

  // Timings & UX (Section 7 / 9)
  ENTRANCE_DURATION_MS: 1400,
  CONFIRM_TIMEOUT_MS: 3000,
  FLIGHT_ANIMATION_MS: 600,

  // Combat-Aware Weapon Damage Type Biases
  DAMAGE_TYPE_BIAS: {
    normal: {
      name: 'Standard',
      fragileCondMult: 1.0,
      peltCondMult: 1.0,
      slotBiases: {}
    },
    blunt: {
      name: 'Blunt (Crushing)',
      fragileCondMult: 1.5, // Ruptures fragile fluid sacs, brains, and eyes; preserves outer pelts/hides
      peltCondMult: 0.5,
      slotBiases: {
        brain: 1.5,
        eye: 1.5,
        bile_sac: 1.6,
        carapace: 1.3,
        hide: 0.5,
        pelt: 0.5,
        fur: 0.5
      }
    },
    piercing: {
      name: 'Piercing (Puncturing)',
      fragileCondMult: 1.0,
      peltCondMult: 0.7,
      slotBiases: {
        heart: 1.6,
        bramble_heart: 1.6,
        lungs: 1.5,
        torso: 1.3,
        hide: 0.7,
        pelt: 0.7,
        leg: 0.6,
        arm: 0.6,
        tail: 0.5,
        head: 0.7
      }
    },
    slashing: {
      name: 'Slashing (Lacerating)',
      fragileCondMult: 0.8,
      peltCondMult: 1.7, // Slices open and shreds pelts/hides; deep vitals remain shielded
      slotBiases: {
        hide: 1.7,
        pelt: 1.7,
        fur: 1.7,
        flank_meat: 1.5,
        leg: 1.3,
        arm: 1.3,
        tail: 1.3,
        heart: 0.6,
        bramble_heart: 0.6,
        brain: 0.6
      }
    }
  },

  // Biomass Nutrition Values (Calories gained from feasting on unharvested parts)
  BASE_CARCASS_CALORIES: 12,
  DEFAULT_SLOT_CALORIES: {
    meat: 16,
    flank_meat: 16,
    torso: 14,
    heart: 10,
    leg: 6,
    arm: 6,
    liver: 6,
    lungs: 5,
    tail: 4,
    brain: 4,
    organ: 4,
    trait: 3,
    eye: 2,
    hide: 3,
    carapace: 2,
    gear: 0,
    loose: 0
  }
};
