/**
 * Thresholds — Application Controller
 * Handles media layering (video over high-res poster plate),
 * cinematic fade-to-black scene transitions, and procedural audio.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const stageImage = document.getElementById('stage-image');
  const stageVideo = document.getElementById('stage-video');
  const fadeCurtain = document.getElementById('fade-curtain');
  const narrativeCard = document.getElementById('narrative-card');
  const sceneCulture = document.getElementById('scene-culture');
  const sceneTitle = document.getElementById('scene-title');
  const sceneProse = document.getElementById('scene-prose');
  const metaElement = document.getElementById('meta-element');
  const metaMotif = document.getElementById('meta-motif');
  const metaMediaBadge = document.getElementById('meta-media-badge');

  const btnAudio = document.getElementById('btn-audio');
  const iconSoundOff = btnAudio.querySelector('.icon-sound-off');
  const iconSoundOn = btnAudio.querySelector('.icon-sound-on');
  const audioLabel = btnAudio.querySelector('.audio-label');

  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPause = btnPlayPause.querySelector('.icon-pause');
  const iconPlay = btnPlayPause.querySelector('.icon-play');
  const timerTrack = document.querySelector('.timer-track');
  const timerFill = document.getElementById('timer-fill');

  const btnZen = document.getElementById('btn-zen');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  const btnDrawerToggle = document.getElementById('btn-drawer-toggle');
  const btnDrawerClose = document.getElementById('btn-drawer-close');
  const drawerCounter = document.getElementById('drawer-counter');
  const scenesDrawer = document.getElementById('scenes-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerList = document.getElementById('drawer-list');

  const audioPromptBanner = document.getElementById('audio-prompt-banner');
  const btnEnableAudioBanner = document.getElementById('btn-enable-audio-banner');
  const btnDismissAudioBanner = document.getElementById('btn-dismiss-audio-banner');

  // State
  let currentIdx = 0;
  let isPlaying = true;
  let isZenMode = false;
  let isTransitioning = false;
  let lastTimestamp = performance.now();
  let sceneProgressMs = 0;
  let activeVideoToken = 0;
  let hasActiveVideo = false;

  // Initialize Audio Engine
  const soundEngine = new AmbientSoundEngine();

  // Populate Drawer List
  function populateDrawer() {
    drawerList.innerHTML = '';
    SCENES.forEach((scene, idx) => {
      const item = document.createElement('button');
      item.className = `drawer-item ${idx === currentIdx ? 'active' : ''}`;
      item.innerHTML = `
        <span class="drawer-item-idx">${String(idx + 1).padStart(2, '0')}</span>
        <div class="drawer-item-info">
          <div class="drawer-item-title">${scene.title}</div>
          <div class="drawer-item-culture">${scene.culture}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        transitionToScene(idx);
        closeDrawer();
      });
      drawerList.appendChild(item);
    });
  }

  function updateDrawerActiveState() {
    const items = drawerList.querySelectorAll('.drawer-item');
    items.forEach((item, idx) => {
      item.classList.toggle('active', idx === currentIdx);
    });
    drawerCounter.textContent = `${currentIdx + 1} / ${SCENES.length}`;
  }

  // Load Scene Media
  function loadScene(idx) {
    currentIdx = (idx + SCENES.length) % SCENES.length;
    const scene = SCENES[currentIdx];
    sceneProgressMs = 0;
    hasActiveVideo = false;
    activeVideoToken++;
    const currentToken = activeVideoToken;

    applySceneContent(scene);

    // 1. Display still poster plate
    stageImage.src = scene.image;
    stageImage.classList.add('visible');

    // 2. Reset video element (non-looping so it can fade to black on finish)
    stageVideo.classList.remove('visible');
    stageVideo.pause();
    stageVideo.loop = false;
    stageVideo.removeAttribute('src');
    stageVideo.load();

    metaMediaBadge.textContent = 'Poster Plate';
    metaMediaBadge.classList.remove('badge-live-video');

    if (scene.video || scene.id) {
      loadVideoLayer(scene, currentToken);
    }

    soundEngine.setMood(scene.audioMood);
    updateDrawerActiveState();
  }

  function loadVideoLayer(scene, token) {
    const filename = `${scene.id}.mp4`;
    const candidates = [
      scene.video,
      `assets/videos/${filename}`,
      `videos/${filename}`
    ];
    const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

    let candidateIdx = 0;

    function tryNext() {
      if (token !== activeVideoToken) return;
      if (candidateIdx >= uniqueCandidates.length) {
        hasActiveVideo = false;
        metaMediaBadge.textContent = 'Poster Plate';
        metaMediaBadge.classList.remove('badge-live-video');
        return;
      }

      const src = uniqueCandidates[candidateIdx++];
      stageVideo.muted = true;
      stageVideo.defaultMuted = true;
      stageVideo.loop = false; // Fade out instead of looping!
      stageVideo.playsInline = true;
      stageVideo.src = src;

      let resolved = false;

      const handleSuccess = () => {
        if (resolved || token !== activeVideoToken) return;
        resolved = true;
        cleanup();
        hasActiveVideo = true;

        if (isPlaying) {
          stageVideo.play().catch(e => console.log('Autoplay deferred:', e));
        }

        stageVideo.classList.add('visible');
        metaMediaBadge.textContent = '✦ Video Passage';
        metaMediaBadge.classList.add('badge-live-video');
      };

      const handleFail = () => {
        if (resolved || token !== activeVideoToken) return;
        resolved = true;
        cleanup();
        tryNext();
      };

      const cleanup = () => {
        stageVideo.removeEventListener('loadeddata', handleSuccess);
        stageVideo.removeEventListener('canplay', handleSuccess);
        stageVideo.removeEventListener('playing', handleSuccess);
        stageVideo.removeEventListener('error', handleFail);
      };

      stageVideo.addEventListener('loadeddata', handleSuccess, { once: true });
      stageVideo.addEventListener('canplay', handleSuccess, { once: true });
      stageVideo.addEventListener('playing', handleSuccess, { once: true });
      stageVideo.addEventListener('error', handleFail, { once: true });

      stageVideo.load();
    }

    tryNext();
  }

  // Fade out into black and advance to next slide
  function transitionToScene(targetIdx) {
    if (isTransitioning) return;
    isTransitioning = true;

    // 1. Slow fade into pitch black
    fadeCurtain.classList.add('faded-out');
    narrativeCard.classList.add('fading');

    setTimeout(() => {
      // 2. Mount new scene while screen is black
      loadScene(targetIdx);

      setTimeout(() => {
        // 3. Fade in from black
        fadeCurtain.classList.remove('faded-out');
        narrativeCard.classList.remove('fading');
        isTransitioning = false;
      }, 300);
    }, 1400);
  }

  // Monitor Video Playback for Fade-to-Black near end
  stageVideo.addEventListener('timeupdate', () => {
    if (!hasActiveVideo || isTransitioning || !stageVideo.duration) return;
    
    // When 1.4 seconds remain before video ends, trigger fade to black
    const timeLeft = stageVideo.duration - stageVideo.currentTime;
    if (timeLeft <= 1.4 && isPlaying) {
      transitionToScene(currentIdx + 1);
    }
  });

  stageVideo.addEventListener('ended', () => {
    if (!isTransitioning && isPlaying) {
      transitionToScene(currentIdx + 1);
    }
  });

  function applySceneContent(scene) {
    sceneCulture.textContent = scene.culture;
    sceneTitle.textContent = scene.title;
    sceneProse.textContent = `“${scene.prose}”`;
    metaElement.textContent = scene.element;
    metaMotif.textContent = scene.motif;
  }

  function nextScene() {
    transitionToScene(currentIdx + 1);
  }

  function prevScene() {
    transitionToScene(currentIdx - 1);
  }

  function togglePlayPause() {
    isPlaying = !isPlaying;
    iconPause.classList.toggle('hidden', !isPlaying);
    iconPlay.classList.toggle('hidden', isPlaying);

    if (isPlaying) {
      if (stageVideo.src && stageVideo.classList.contains('visible')) {
        stageVideo.play().catch(() => {});
      }
    } else {
      if (stageVideo.src) {
        stageVideo.pause();
      }
    }
  }

  function toggleAudio() {
    const active = soundEngine.toggleMute();
    updateAudioUI(active);
    if (active) {
      soundEngine.setMood(SCENES[currentIdx].audioMood);
      audioPromptBanner.classList.remove('show');
    }
  }

  function updateAudioUI(active) {
    btnAudio.classList.toggle('active', active);
    iconSoundOff.classList.toggle('hidden', active);
    iconSoundOn.classList.toggle('hidden', !active);
    audioLabel.textContent = active ? 'Sound On' : 'Sound Off';
  }

  function toggleZenMode() {
    isZenMode = !isZenMode;
    document.body.classList.toggle('zen-mode', isZenMode);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  function openDrawer() {
    scenesDrawer.classList.add('open');
    drawerBackdrop.classList.add('active');
    scenesDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    scenesDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('active');
    scenesDrawer.setAttribute('aria-hidden', 'true');
  }

  // Animation Loop & Timer
  function tick(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const currentScene = SCENES[currentIdx];

    if (isPlaying && currentScene && !isTransitioning) {
      if (hasActiveVideo && stageVideo.duration) {
        // Video-driven progress
        const ratio = Math.min(stageVideo.currentTime / stageVideo.duration, 1);
        timerFill.style.width = `${ratio * 100}%`;
      } else {
        // Image plate timer
        sceneProgressMs += dt;
        const progressRatio = Math.min(sceneProgressMs / currentScene.duration, 1);
        timerFill.style.width = `${progressRatio * 100}%`;

        // 1.4s before timer completes, fade to black
        if (sceneProgressMs >= currentScene.duration - 1400) {
          transitionToScene(currentIdx + 1);
        }
      }
    }

    requestAnimationFrame(tick);
  }

  // Event Listeners
  btnNext.addEventListener('click', nextScene);
  btnPrev.addEventListener('click', prevScene);
  btnPlayPause.addEventListener('click', togglePlayPause);
  btnAudio.addEventListener('click', toggleAudio);
  btnZen.addEventListener('click', toggleZenMode);
  btnFullscreen.addEventListener('click', toggleFullscreen);

  btnDrawerToggle.addEventListener('click', openDrawer);
  btnDrawerClose.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', closeDrawer);

  timerTrack.addEventListener('click', (e) => {
    const rect = timerTrack.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (hasActiveVideo && stageVideo.duration) {
      stageVideo.currentTime = ratio * stageVideo.duration;
    } else {
      const scene = SCENES[currentIdx];
      sceneProgressMs = ratio * scene.duration;
    }
  });

  // Audio Banner prompt
  btnEnableAudioBanner.addEventListener('click', () => {
    soundEngine.enableAudio();
    updateAudioUI(true);
    soundEngine.setMood(SCENES[currentIdx].audioMood);
    audioPromptBanner.classList.remove('show');
  });

  btnDismissAudioBanner.addEventListener('click', () => {
    audioPromptBanner.classList.remove('show');
  });

  setTimeout(() => {
    if (soundEngine.isMuted) {
      audioPromptBanner.classList.add('show');
    }
  }, 1800);

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextScene();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevScene();
        break;
      case 'KeyM':
        toggleAudio();
        break;
      case 'KeyH':
        toggleZenMode();
        break;
      case 'KeyF':
        toggleFullscreen();
        break;
      case 'Escape':
        closeDrawer();
        break;
    }
  });

  // Initialize
  populateDrawer();
  loadScene(0);
  requestAnimationFrame(tick);
});
