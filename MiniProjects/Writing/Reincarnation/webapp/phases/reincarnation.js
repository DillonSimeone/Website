// ---------------------------------------------------------
// Phase: Reincarnation (The Merge)
// ---------------------------------------------------------

export function drawReincarnation(ctx, w, h, alpha, time, chapterProgress, currentState) {
  ctx.fillStyle = `rgba(5, 5, 26, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
  
  // Use a local progress if merge is active, otherwise static for fade out
  const mP = currentState === 'REINCARNATION' ? chapterProgress : 1;
  const mVal = Math.max(0, (mP - 0.1) * 1.5); // Maps progress to overlap range
  
  // Font scales based on width and progress
  const baseScale = Math.min(1, w / 1200);
  const fontSize = (1.5 + Math.min(1.2, mVal) * 3) * (0.6 + baseScale * 0.4);
  
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const drawGlitchText = (text, x, y, color, a) => {
    ctx.save();
    ctx.globalAlpha = a * alpha;
    ctx.fillStyle = color;
    ctx.font = `800 ${fontSize}rem Syne`;
    
    // Jitter / Glitch
    let ox = 0, oy = 0;
    if (Math.random() > 0.94 - (Math.min(1, mVal) * 0.1)) {
       ox = (Math.random() - 0.5) * 60 * mVal;
       oy = (Math.random() - 0.5) * 20 * mVal;
       
       // Chromatic aberration-ish effect
       ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
       ctx.fillText(text, x + ox + 5, y + oy + 2);
    }
    
    ctx.fillStyle = color;
    ctx.fillText(text, x + ox, y + oy);

    // Static horizontal lines
    if (mVal > 0.6 && Math.random() > 0.9) {
      ctx.fillStyle = 'white';
      ctx.fillRect(x - w * 0.4, y + (Math.random() - 0.5) * 80, w * 0.8, 2);
    }
    
    ctx.restore();
  };

  // Names meet at center (0.5w) and then fully merge
  // Constant progression from sides to center
  const progX = w * 0.25 + (mVal * w * 0.25); 
  const demonX = w * 0.75 - (mVal * w * 0.25); 

  drawGlitchText('MARCUS', progX, h / 2, '#00e5ff', Math.max(0, 1 - mVal * 1.2));
  drawGlitchText('GRAK', demonX, h / 2, '#9d50bb', Math.min(1, mVal * 1.5));
  
  // Fusion burst
  if (mVal > 0.95 && mVal < 1.15) {
    const burst = (mVal - 0.95) * 5;
    ctx.fillStyle = `rgba(255, 255, 255, ${1 - burst})`;
    ctx.beginPath();
    ctx.arc(w/2, h/2, burst * 400, 0, Math.PI * 2);
    ctx.fill();
  }
}
