document.addEventListener('DOMContentLoaded', () => {
  const sb1 = document.getElementById('sb-1');
  const sb2 = document.getElementById('sb-2');
  const sb3 = document.getElementById('sb-3');
  const spinBtn = document.getElementById('btn-spin');

  let baseAngles = { sb1: 0, sb2: 0, sb3: 0 };

  // Spin Button triggers full rotation animation
  spinBtn.addEventListener('click', () => {
    baseAngles.sb1 += 360;
    baseAngles.sb2 -= 360;
    baseAngles.sb3 += 720;
    
    updateStars(0, 0);
  });

  // Track mouse coordinates for interactive parallax offsets
  window.addEventListener('mousemove', (e) => {
    const xOffset = (e.clientX / window.innerWidth - 0.5) * 45; // max 22.5 deg offset
    const yOffset = (e.clientY / window.innerHeight - 0.5) * 45;

    updateStars(xOffset, yOffset);
  });

  function updateStars(xOff, yOff) {
    sb1.style.transform = `translate(${xOff * 0.4}px, ${yOff * 0.4}px) rotate(${baseAngles.sb1 + xOff}deg)`;
    sb2.style.transform = `translate(${-xOff * 0.6}px, ${-yOff * 0.6}px) rotate(${baseAngles.sb2 - yOff}deg)`;
    sb3.style.transform = `translate(${xOff * 0.8}px, ${-yOff * 0.3}px) rotate(${baseAngles.sb3 + xOff * 1.5}deg)`;
  }
});
