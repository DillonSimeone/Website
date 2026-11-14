import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * InputManager: Binds PointerLockControls, keyboard navigation,
 * action hotkeys, and mouse interaction triggers.
 */
export class InputManager {
  constructor(camera, domElement, callbacks = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.callbacks = callbacks; // onLock, onUnlock, onCraftHotkey, onBarricade, onPhase, onLantern

    this.controls = new PointerLockControls(this.camera, document.body);

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.canJump = true;
    this.isMining = false;

    this.initEventListeners();
  }

  initEventListeners() {
    const startScreen = document.getElementById('start-screen');
    const levelupModal = document.getElementById('levelup-modal');
    const buildModal = document.getElementById('build-menu-modal');
    const invModal = document.getElementById('inventory-modal');
    const wlvModal = document.getElementById('weapon-level-modal');
    const gameoverModal = document.getElementById('gameover-modal');

    if (startScreen) {
      startScreen.addEventListener('click', () => {
        this.controls.lock();
        if (this.callbacks.onStart) this.callbacks.onStart();
      });
    }

    this.controls.addEventListener('lock', () => {
      if (startScreen) startScreen.style.display = 'none';
      if (this.callbacks.onLock) this.callbacks.onLock();
    });

    this.controls.addEventListener('unlock', () => {
      const levelupOpen = levelupModal && levelupModal.classList.contains('visible');
      const buildOpen = buildModal && buildModal.classList.contains('visible');
      const invOpen = invModal && invModal.classList.contains('visible');
      const wlvOpen = wlvModal && wlvModal.classList.contains('visible');
      const overOpen = gameoverModal && gameoverModal.style.display === 'flex';
      if (!levelupOpen && !buildOpen && !invOpen && !wlvOpen && !overOpen) {
        if (startScreen) startScreen.style.display = 'flex';
      }
      this.clearMovement();
      if (this.callbacks.onUnlock) this.callbacks.onUnlock();
    });

    // Keyboard Navigation
    window.addEventListener('keydown', (e) => {
      if (gameoverModal && gameoverModal.style.display === 'flex') return;

      // E toggles Inventory & Loadout Modal
      if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.callbacks.onToggleInventory) {
          this.callbacks.onToggleInventory();
        }
        return;
      }

      // Tab toggles Build Menu (always prevent browser focus shift)
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.callbacks.onToggleBuildMenu) {
          this.callbacks.onToggleBuildMenu();
        }
        return;
      }

      if ((invModal && invModal.classList.contains('visible')) || (wlvModal && wlvModal.classList.contains('visible'))) {
        return;
      }

      // Level-Up Modal keyboard selection (1, 2, 3)
      if (levelupModal && levelupModal.classList.contains('visible')) {
        if (e.code === 'Digit1' && this.callbacks.onLevelupChoice) this.callbacks.onLevelupChoice(0);
        if (e.code === 'Digit2' && this.callbacks.onLevelupChoice) this.callbacks.onLevelupChoice(1);
        if (e.code === 'Digit3' && this.callbacks.onLevelupChoice) this.callbacks.onLevelupChoice(2);
        return;
      }

      // Build Menu WASD + Enter navigation
      if (buildModal && buildModal.classList.contains('visible')) {
        switch (e.code) {
          case 'KeyW':
          case 'ArrowUp':
            e.preventDefault();
            if (this.callbacks.onBuildMenuMove) this.callbacks.onBuildMenuMove(0, -1);
            break;
          case 'KeyS':
          case 'ArrowDown':
            e.preventDefault();
            if (this.callbacks.onBuildMenuMove) this.callbacks.onBuildMenuMove(0, 1);
            break;
          case 'KeyA':
          case 'ArrowLeft':
            e.preventDefault();
            if (this.callbacks.onBuildMenuMove) this.callbacks.onBuildMenuMove(-1, 0);
            break;
          case 'KeyD':
          case 'ArrowRight':
            e.preventDefault();
            if (this.callbacks.onBuildMenuMove) this.callbacks.onBuildMenuMove(1, 0);
            break;
          case 'Enter':
          case 'Space':
            e.preventDefault();
            if (this.callbacks.onBuildMenuCraft) this.callbacks.onBuildMenuCraft();
            break;
        }
        return;
      }

      switch (e.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = true; break;
        case 'Space':
          if (this.canJump && this.callbacks.onJump) {
            this.canJump = false;
            this.callbacks.onJump();
          }
          break;
        case 'KeyF':
          if (this.callbacks.onLantern) this.callbacks.onLantern();
          break;
        case 'KeyB':
          if (this.callbacks.onBarricade) this.callbacks.onBarricade();
          break;
        case 'KeyL':
          if (this.callbacks.onScaffolding) this.callbacks.onScaffolding();
          break;
        case 'KeyG':
          if (this.callbacks.onBeacon) this.callbacks.onBeacon();
          break;
        case 'KeyV':
          if (this.callbacks.onJumpPad) this.callbacks.onJumpPad();
          break;
        case 'KeyQ':
          if (this.callbacks.onPhase) this.callbacks.onPhase();
          break;
        case 'KeyO':
          if (this.callbacks.onToggleBloom) this.callbacks.onToggleBloom();
          break;
        case 'Digit1':
          if (this.callbacks.onHotbarSelect) this.callbacks.onHotbarSelect(0);
          break;
        case 'Digit2':
          if (this.callbacks.onHotbarSelect) this.callbacks.onHotbarSelect(1);
          break;
        case 'Digit3':
          if (this.callbacks.onHotbarSelect) this.callbacks.onHotbarSelect(2);
          break;
        case 'Digit4':
          if (this.callbacks.onHotbarSelect) this.callbacks.onHotbarSelect(3);
          break;
        case 'Digit5':
          if (this.callbacks.onHotbarSelect) this.callbacks.onHotbarSelect(4);
          break;
        case 'Digit6':
          if (this.callbacks.onHotbarSelect) this.callbacks.onHotbarSelect(5);
          break;
        case 'Digit7':
        case 'KeyR':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('rover');
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyD': this.moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = false; break;
        case 'Space': this.canJump = true; break;
      }
    });

    // Mouse Interaction
    window.addEventListener('mousedown', (e) => {
      if (!this.controls.isLocked) return;

      if (e.button === 0) {
        // LMB: Mine / Deconstruct
        this.isMining = true;
        const cross = document.getElementById('crosshair');
        if (cross) cross.classList.add('mining');
      } else if (e.button === 2) {
        // RMB: Place barricade
        e.preventDefault();
        if (this.callbacks.onBarricade) this.callbacks.onBarricade();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMining = false;
        const cross = document.getElementById('crosshair');
        if (cross) cross.classList.remove('mining');
      }
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.controls.isLocked) e.preventDefault();
    });
  }

  clearMovement() {
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isMining = false;
    const cross = document.getElementById('crosshair');
    if (cross) cross.classList.remove('mining');
  }

  isLocked() {
    return this.controls.isLocked;
  }

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }
}
