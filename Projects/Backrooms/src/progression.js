/**
 * ProgressionSystem: Handles XP accretion, level curves,
 * and level-up state machine transitions.
 */
export class ProgressionSystem {
  constructor(onLevelUp, onNotification) {
    this.onLevelUp = onLevelUp || (() => {});
    this.onNotification = onNotification || (() => {});

    this.level = 1;
    this.xp = 0;
    this.baseXp = 60;
    this.xpNext = this.calculateNextThreshold(1);
    this.xpMultiplier = 1.0;

    this.initUI();
  }

  calculateNextThreshold(level) {
    // Roguelite XP Threshold Formula: XPnext = base * level^1.45
    return Math.floor(this.baseXp * Math.pow(level, 1.45));
  }

  addXp(rawAmount) {
    const amount = Math.floor(rawAmount * this.xpMultiplier);
    this.xp += amount;
    this.onNotification(`+${amount} XP`, 'amber');

    let leveledUp = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = this.calculateNextThreshold(this.level);
      leveledUp = true;
    }

    this.updateUI();

    if (leveledUp) {
      this.onLevelUp(this.level);
    }
  }

  initUI() {
    this.updateUI();
  }

  updateUI() {
    const lvlEl = document.getElementById('player-lvl');
    const numsEl = document.getElementById('xp-numbers');
    const fillEl = document.getElementById('xp-fill');

    if (lvlEl) lvlEl.innerText = `LVL ${this.level}`;
    if (numsEl) numsEl.innerText = `${Math.floor(this.xp)} / ${this.xpNext} XP`;
    if (fillEl) {
      const pct = Math.min(100, (this.xp / this.xpNext) * 100);
      fillEl.style.width = `${pct}%`;
    }
  }
}
