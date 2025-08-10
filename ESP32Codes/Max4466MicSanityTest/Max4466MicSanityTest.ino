#include <arduinoFFT.h>

#define MIC_PIN 2
#define SAMPLES 512
#define SAMPLING_FREQUENCY 10000  // Hz

double vReal[SAMPLES];
double vImag[SAMPLES];

ArduinoFFT<double> FFT = ArduinoFFT<double>(vReal, vImag, SAMPLES, SAMPLING_FREQUENCY);

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);              // 12-bit ADC
  analogSetAttenuation(ADC_11db);        // Max range (0–3.3V)
}

void loop() {
  unsigned long startMicros;

  // 1. Fill sample buffer
  for (int i = 0; i < SAMPLES; i++) {
    startMicros = micros();
    int raw = analogRead(MIC_PIN);
    double centered = raw - 2048.0;
    vReal[i] = centered;
    vImag[i] = 0;
    while (micros() - startMicros < (1000000UL / SAMPLING_FREQUENCY));  // consistent sample rate
  }

  // 2. Windowing & FFT
  FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
  FFT.compute(FFT_FORWARD);
  FFT.complexToMagnitude();

  // 3. Peak frequency detection
  double maxAmp = 0;
  int maxIndex = 0;

  for (int i = 1; i < SAMPLES / 2; i++) {
    if (vReal[i] > maxAmp) {
      maxAmp = vReal[i];
      maxIndex = i;
    }
  }

  double peakFrequency = (maxIndex * 1.0 * SAMPLING_FREQUENCY) / SAMPLES;
  int rawSample = analogRead(MIC_PIN);

  // 4. Noise gate and output
  if (maxAmp > 20) {  // tweak this threshold as needed
    Serial.print("Raw: ");
    Serial.print(rawSample);
    Serial.print("   PeakFreq: ");
    Serial.print(peakFrequency, 1);
    Serial.println(" Hz");
  } else {
    Serial.print("Raw: ");
    Serial.print(rawSample);
    Serial.println("   PeakFreq: 0 Hz (quiet)");
  }

  delay(20);
}
