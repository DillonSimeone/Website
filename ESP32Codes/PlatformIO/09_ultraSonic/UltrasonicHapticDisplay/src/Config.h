#ifndef ULTRASONIC_CONFIG_H
#define ULTRASONIC_CONFIG_H

/**
 * BENCH_TEST — louder continuous-carrier mode for hardware bring-up.
 * Toggle via platformio.ini: build_flags = -DBENCH_TEST=0 to restore conservative limits.
 */
#ifndef BENCH_TEST
#define BENCH_TEST 1
#endif

#if BENCH_TEST
constexpr float DRIVE_MIN_PERCENT     = 25.0f;
constexpr float DRIVE_MAX_PERCENT     = 50.0f;
constexpr float DUTY_HARD_LIMIT_PERCENT = 50.0f;
constexpr bool  AM_MODULATION_ENABLED = false;
constexpr bool  USE_STRONG_GPIO_DRIVE = true;
#else
constexpr float DRIVE_MIN_PERCENT     = 1.0f;
constexpr float DRIVE_MAX_PERCENT     = 20.0f;
constexpr float DUTY_HARD_LIMIT_PERCENT = 50.0f;
constexpr bool  AM_MODULATION_ENABLED = true;
constexpr bool  USE_STRONG_GPIO_DRIVE = false;
#endif

#endif // ULTRASONIC_CONFIG_H
