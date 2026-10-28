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
      if (levelupModal && !levelupModal.classList.contains('visible')) {
        if (startScreen) startScreen.style.display = 'flex';
      }
      if (this.callbacks.onUnlock) this.callbacks.onUnlock();
    });

    // Keyboard Navigation
    window.addEventListener('keydown', (e) => {
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
        case 'KeyQ':
          if (this.callbacks.onPhase) this.callbacks.onPhase();
          break;
        case 'Digit1':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('prybar');
          break;
        case 'Digit2':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('lantern');
          break;
        case 'Digit3':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('scaffolding');
          break;
        case 'Digit4':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('barricade');
          break;
        case 'Digit5':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('filter');
          break;
        case 'Digit6':
          if (this.callbacks.onCraftHotkey) this.callbacks.onCraftHotkey('pneumatic_ram');
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
