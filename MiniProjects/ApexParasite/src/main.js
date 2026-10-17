/**
 * Apex Parasite: Chimera Odyssey - Application Bootstrapper
 * Connects GameEngine, ParallaxStage, Audio Context, and Keyboard dispatch.
 */

import { GameEngine } from './game.js';
import { StartMenu } from './start_menu.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new GameEngine();

  // Initialize Start Menu (The Awakening)
  const startMenu = new StartMenu(game, () => {
    game.startHostCycle();
  });
  game.startMenu = startMenu;

  game.init();

  // Unlock Web Audio API on first user gesture
  const unlockAudio = () => game.audio.ensureContext();
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    const key = e.key.toLowerCase();

    // Hotkey: Tab or C -> Toggle Chimera Assembly Rig
    if (key === 'tab' || key === 'c') {
      e.preventDefault();
      const modal = document.getElementById('assembly-modal');
      if (modal.classList.contains('hidden')) {
        game.hud.openAssemblyModal();
      } else {
        modal.classList.add('hidden');
      }
      return;
    }

    // Hotkey: K -> Toggle Skills
    if (key === 'k') {
      e.preventDefault();
      const modal = document.getElementById('skills-modal');
      if (modal.classList.contains('hidden')) {
        game.hud.openSkillsModal();
      } else {
        modal.classList.add('hidden');
      }
      return;
    }

    // Hotkey: Escape -> Close all modals
    if (key === 'escape') {
      e.preventDefault();
      document.querySelectorAll('.p5-modal-backdrop').forEach(m => m.classList.add('hidden'));
      return;
    }

    // Hotkey: M -> Toggle Audio Mute
    if (key === 'm') {
      e.preventDefault();
      const isMuted = game.audio.toggleMute();
      game.hud.log({ text: isMuted ? 'Audio muted.' : 'Audio unmuted.', type: 'info' });
      return;
    }

    // Hotkeys 1-4: Trigger Combat limb targeting if in combat
    if (game.combat.activeBattle && ['1', '2', '3', '4', '5'].includes(key)) {
      const idx = parseInt(key) - 1;
      const limbs = game.combat.activeBattle.limbs.filter(l => !l.isSevered);
      if (idx < limbs.length) {
        game.combat.playerStrikeLimb(limbs[idx].id, game.hud.selectedWeaponNode);
        game.hud.renderCombatHUD();
      }
    }
  });
});
