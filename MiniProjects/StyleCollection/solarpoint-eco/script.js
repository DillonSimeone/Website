const slider = document.getElementById('solar-slider');
const cell1 = document.getElementById('solar-cell-1');
const cell2 = document.getElementById('solar-cell-2');
const powerVal = document.getElementById('power-val');

slider.addEventListener('input', (e) => {
  const angle = e.target.value;
  
  // Rotate cells based on angle. Match visual rotation (offset 90 degrees)
  const rotation = angle - 90;
  cell1.style.transform = `rotate(${rotation}deg)`;
  cell2.style.transform = `rotate(${rotation}deg)`;
  
  // Maximum power output at 90 degrees (direct overhead sun).
  // Math.sin of angle in radians
  const rad = (angle * Math.PI) / 180;
  const efficiency = Math.sin(rad);
  const power = (efficiency * 2.4).toFixed(2);
  
  powerVal.textContent = `${power} kW`;
});
