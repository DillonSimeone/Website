const morphBtn = document.getElementById('btn-morph');
const blobs = [
  document.getElementById('blob-card-1'),
  document.getElementById('blob-card-2'),
  document.getElementById('blob-card-3')
];

// Presets of beautiful asymmetric fluid shapes
const shapes = [
  [
    '60% 40% 30% 70% / 60% 30% 70% 40%',
    '40% 60% 70% 30% / 50% 60% 40% 50%',
    '50% 50% 30% 70% / 40% 40% 60% 60%'
  ],
  [
    '55% 45% 60% 40% / 40% 55% 45% 60%',
    '70% 30% 50% 50% / 60% 40% 60% 40%',
    '45% 55% 65% 35% / 50% 45% 55% 50%'
  ],
  [
    '30% 70% 40% 60% / 50% 60% 40% 50%',
    '60% 40% 45% 55% / 45% 60% 40% 55%',
    '65% 35% 70% 30% / 60% 50% 50% 40%'
  ]
];

let currentShapeIndex = 0;

morphBtn.addEventListener('click', () => {
  currentShapeIndex = (currentShapeIndex + 1) % shapes.length;
  const activeSet = shapes[currentShapeIndex];
  
  blobs.forEach((blob, idx) => {
    blob.style.borderRadius = activeSet[idx];
  });
});
