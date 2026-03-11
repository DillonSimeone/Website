// ---------------------------------------------------------
// Phase: Optimization (The Magical Substrate)
// ---------------------------------------------------------

export function drawOptimization(ctx, w, h, alpha, complex, time) {
  // complex is 0.0 to 3.0+ (V1=0-1, V2=1-2, V3=2-3)
  
  ctx.fillStyle = `rgba(5, 5, 16, ${alpha})`;
  ctx.fillRect(0, 0, w, h);

  // Level 0: Monochrome Lines (The Raw Code)
  const lineAlpha = complex > 1 ? 0.2 : 0.4;
  ctx.strokeStyle = `rgba(255, 255, 255, ${lineAlpha * alpha})`;
  ctx.lineWidth = 1;
  const lineCount = 6;
  for (let i = 0; i < lineCount; i++) {
    const y = (h / lineCount) * i + Math.sin(time * 0.001 + i) * 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y - 50, w * 0.7, y + 50, w, y);
    ctx.stroke();
  }

  // Level 1: Runes & Logical Nodes (Complexity > 0.5)
  if (complex > 0.5) {
    const l1Alpha = Math.min(1, (complex - 0.5) * 2);
    ctx.save();
    ctx.globalAlpha = l1Alpha * alpha;
    
    const runeCount = 4;
    for (let i = 0; i < runeCount; i++) {
      const rx = (w / (runeCount + 1)) * (i + 1);
      const ry = h / 2 + Math.cos(time * 0.001 + i) * 25;
      
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(time * 0.0008 * (i % 2 === 0 ? 1 : -1));
      
      // Rune geometry (Varied shapes)
      ctx.strokeStyle = complex > 1.8 ? '#00e5ff' : '#ffffff';
      if (complex > 2.8) {
        ctx.strokeStyle = `hsl(${(time * 0.1) % 360}, 100%, 70%)`; // Rainbow shift
      }

      const shape = i % 3;
      if (shape === 0) { // Square
        ctx.strokeRect(-20, -20, 40, 40);
        ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(15, 15); ctx.stroke();
      } else if (shape === 1) { // Triangle
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.lineTo(20, 15); ctx.lineTo(-20, 15);
        ctx.closePath(); ctx.stroke();
      } else { // Hexagon
        ctx.beginPath();
        for(let side=0; side<6; side++) {
          ctx.lineTo(22 * Math.cos(side * Math.PI/3), 22 * Math.sin(side * Math.PI/3));
        }
        ctx.closePath(); ctx.stroke();
      }
      
      ctx.restore();
    }
    ctx.restore();
  }

  // Level 2: Vibrant Colors & Efficient Flow (Complexity > 1.5)
  if (complex > 1.5) {
    const l2Alpha = Math.min(1, (complex - 1.5) * 2);
    ctx.save();
    ctx.globalAlpha = l2Alpha * alpha;
    
    const pulse = Math.sin(time * 0.004) * 0.2 + 0.8;
    ctx.shadowBlur = 30 * pulse;
    
    // Glowing particles in the flow
    const pCount = 20;
    for(let i = 0; i < pCount; i++) {
      const px = (w * i / pCount + time * 0.15) % w;
      const py = h / 2 + Math.sin(time * 0.002 + i) * 10;
      ctx.fillStyle = complex > 2.8 ? `hsl(${(time * 0.1 + i*10) % 360}, 100%, 70%)` : '#00e5ff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    }
    
    // Connections
    ctx.strokeStyle = complex > 2.8 ? `hsla(${(time * 0.05) % 360}, 100%, 70%, 0.4)` : 'rgba(0, 229, 255, 0.3)';
    ctx.setLineDash([10, 20]);
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
    
    ctx.restore();
  }

  // Level 3: Peak Optimization / Aura (Complexity > 2.5)
  if (complex > 2.5) {
    const l3Alpha = Math.min(1, (complex - 2.5) * 2);
    ctx.save();
    ctx.globalAlpha = l3Alpha * alpha;
    
    const auraGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (complex > 2.8) {
      auraGrad.addColorStop(0, 'rgba(0,0,0,0)');
      auraGrad.addColorStop(0.5, `hsla(${(time * 0.1) % 360}, 100%, 50%, 0.2)`);
      auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      auraGrad.addColorStop(0, 'rgba(79, 70, 229, 0)');
      auraGrad.addColorStop(0.5, 'rgba(0, 229, 255, 0.2)');
      auraGrad.addColorStop(1, 'rgba(79, 70, 229, 0)');
    }
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, w, h);
    
    ctx.restore();
  }
}
