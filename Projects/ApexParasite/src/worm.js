/**
 * Apex Parasite - The Worm (Persistent True Meta-Entity)
 * Survives across runs. Holds permanent meta-stat arrays, baseline efficiency,
 * synapse thresholds, socket caps, and mutation limit arrays.
 */

const STORAGE_KEY = 'apex_parasite_worm_save_v1';

export class WormMeta {
  constructor() {
    this.metabolicEfficiency = 1; // Level 1-5 (+10% calorie conservation per level)
    this.synapseStability = 30;    // Neural complexity threshold before stutter/glitches (30-80)
    this.socketCapacity = 6;       // Innate base sockets (up to 8)
    this.mutationLimitCap = 3;     // Mutation cap (up to 10)
    
    this.bioEssence = 0;           // Persistent meta-currency
    this.totalRuns = 0;
    this.hostsInfected = 0;
    this.organsHarvested = 0;
    this.apexAscensions = 0;

    this.activeMutations = [];     // Unlocked permanent aberration mutations

    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.metabolicEfficiency = data.metabolicEfficiency ?? 1;
        this.synapseStability = data.synapseStability ?? 30;
        this.socketCapacity = data.socketCapacity ?? 6;
        this.mutationLimitCap = data.mutationLimitCap ?? 3;
        this.bioEssence = data.bioEssence ?? 0;
        this.totalRuns = data.totalRuns ?? 0;
        this.hostsInfected = data.hostsInfected ?? 0;
        this.organsHarvested = data.organsHarvested ?? 0;
        this.apexAscensions = data.apexAscensions ?? 0;
        this.activeMutations = data.activeMutations ?? [];
      }
    } catch (e) {
      console.warn('WormMeta: Failed to load save file, initializing fresh meta.', e);
    }
  }

  save() {
    try {
      const data = {
        metabolicEfficiency: this.metabolicEfficiency,
        synapseStability: this.synapseStability,
        socketCapacity: this.socketCapacity,
        mutationLimitCap: this.mutationLimitCap,
        bioEssence: this.bioEssence,
        totalRuns: this.totalRuns,
        hostsInfected: this.hostsInfected,
        organsHarvested: this.organsHarvested,
        apexAscensions: this.apexAscensions,
        activeMutations: this.activeMutations
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('WormMeta: Failed to save meta-entity.', e);
    }
  }

  /**
   * End of run bio-essence calculation
   */
  recordRunCompletion({ survivedTurns = 0, organsHarvested = 0, depravity = 0, ascended = false }) {
    this.totalRuns++;
    this.organsHarvested += organsHarvested;

    let earnedEssence = Math.floor(survivedTurns * 0.5) + (organsHarvested * 4) + Math.floor(depravity * 1.5);
    if (ascended) {
      this.apexAscensions++;
      earnedEssence += 250;
    }

    this.bioEssence += earnedEssence;
    this.save();
    return earnedEssence;
  }

  upgradeMetabolism() {
    const cost = this.metabolicEfficiency * 40;
    if (this.bioEssence >= cost && this.metabolicEfficiency < 5) {
      this.bioEssence -= cost;
      this.metabolicEfficiency++;
      this.save();
      return true;
    }
    return false;
  }

  upgradeSynapse() {
    const cost = (this.synapseStability - 20) * 3;
    if (this.bioEssence >= cost && this.synapseStability < 80) {
      this.bioEssence -= cost;
      this.synapseStability += 10;
      this.save();
      return true;
    }
    return false;
  }

  upgradeSockets() {
    const cost = this.socketCapacity * 60;
    if (this.bioEssence >= cost && this.socketCapacity < 8) {
      this.bioEssence -= cost;
      this.socketCapacity++;
      this.save();
      return true;
    }
    return false;
  }
}
