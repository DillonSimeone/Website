// ---------------------------------------------------------
// Phase: Dark Transition (The Mugging)
// ---------------------------------------------------------

export function drawDarkTransition(ctx, w, h, alpha, time, chapterProgress, currentState) {
  // Deep black hole in header
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, w, h);

  if (currentState === 'DARK_TRANSITION') {
    // Dynamic Flash based on local progress
    if (chapterProgress > 0.3) {
      const flashIntensity = (chapterProgress - 0.3) * 1.5;
      const flashFreq = 5 + (chapterProgress * 20);
      
      if (Math.sin(time * 0.02 * flashFreq) > 0.85) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * flashIntensity * 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
    
    // Tiny drifting particles of "forgotten thoughts"
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * alpha})`;
    for(let i = 0; i < 5; i++) {
        const x = (Math.sin(time * 0.001 + i) * 0.5 + 0.5) * w;
        const y = (Math.cos(time * 0.0008 + i) * 0.5 + 0.5) * h;
        ctx.fillRect(x, y, 2, 2);
    }
  }
}
