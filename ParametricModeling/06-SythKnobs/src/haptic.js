// Haptic Feedback Engine for ACCESS KNOB Configurator

export function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;

  switch (type) {
    case 'tick':
      // Extremely micro feedback for sliders and dragging rotation
      navigator.vibrate(3);
      break;
    case 'light':
      // Subtle click for standard button clicks
      navigator.vibrate(10);
      break;
    case 'medium':
      // Moderate feedback for preset load or adding items
      navigator.vibrate(25);
      break;
    case 'heavy':
      // Strong feedback for destructive actions (purge/clear) or errors
      navigator.vibrate(60);
      break;
    case 'success':
      // Distinct double tap for success confirmations
      navigator.vibrate([30, 45, 30]);
      break;
    default:
      navigator.vibrate(10);
  }
}
