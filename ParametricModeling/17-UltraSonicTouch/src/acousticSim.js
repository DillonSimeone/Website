/**
 * Rayleigh-Sommerfeld Acoustic Pressure Field Estimator
 * Calculates acoustic pressure & SPL at focal point for 40kHz ultrasound in air
 */

export function calculateAcousticPressure(count, focalDistanceMm, transDiamMm) {
  const f = 40000;              // 40kHz Frequency (Hz)
  const c = 343;                // Speed of sound in air (m/s)
  const wavelength = c / f;     // ~8.575 mm wavelength
  const k = (2 * Math.PI) / wavelength; // Wavenumber
  
  // Single transducer peak sound pressure at 10cm (~105 dB SPL ref 20 uPa = ~0.35 Pa peak)
  const P0_10cm = 0.35; // Pascals per transducer at 0.1m
  const r_m = focalDistanceMm / 1000.0;
  
  // In-phase coherent addition at geometric focal point
  const totalPascalPeak = count * (P0_10cm * (0.1 / r_m));
  const totalRmsPascal = totalPascalPeak / Math.SQRT2;
  
  // Convert to dB SPL (ref 20 microPascals)
  const pRef = 20e-6;
  const dbSPL = 20 * Math.log10(Math.max(1e-6, totalRmsPascal / pRef));
  
  // Calculate radiation pressure (P_rad = <p^2> / (rho * c^2))
  const rho = 1.225; // air density kg/m^3
  const radiationPressurePa = (totalRmsPascal * totalRmsPascal) / (rho * c * c);
  
  // Estimated tactile perception index (Threshold ~130 dB SPL / 0.1 Pa rad pressure)
  const tactileFeasible = dbSPL >= 125.0;

  return {
    frequencyHz: f,
    wavelengthMm: wavelength * 1000.0,
    focalDistanceMm,
    totalPascalPeak: totalPascalPeak.toFixed(2),
    dbSPL: dbSPL.toFixed(1),
    radiationPressurePa: radiationPressurePa.toFixed(4),
    tactileFeasible
  };
}
