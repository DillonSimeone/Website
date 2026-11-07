# Public Glue Utilities

This directory contains standalone desktop and environment glue scripts and background utilities.

## Subfolders

1. **[DaemonCommandCenter/](file:///f:/Github/Website/public/Glue/DaemonCommandCenter)**:
   * **Master Supervisor & Status Tray Dashboard** for Windows 11.
   * Houses the system tray application that supervises, monitors, and controls both the `USBTethering` and `Wifi5GSentinel` daemons.
   * Provides real-time hardware & link telemetry, 1-click manual recovery actions (`⚡ Force 5GHz Nudge`, `🔄 Re-trigger Tether`), and history/log inspection buttons.
2. **[Daemons/](file:///f:/Github/Website/public/Glue/Daemons)**:
   * **[USBTethering/](file:///f:/Github/Website/public/Glue/Daemons/USBTethering)**:
     * Continuous background daemon for Google Pixel 6a.
     * Automatically detects when the phone is plugged in via USB and toggles tethering on without requiring touchscreen interaction.
   * **[Wifi5GSentinel/](file:///f:/Github/Website/public/Glue/Daemons/Wifi5GSentinel)**:
     * Continuous background Wi-Fi frequency monitor.
     * Detects when the bridged connection drifts to 2.4 GHz, chimes an alert, and auto-nudges it back onto 5 GHz via ADB.
   * **[EnergyDaemon/](file:///f:/Github/Website/public/Glue/Daemons/EnergyDaemon)**:
     * Background energy and power governor for the phone.
     * Throttles display refresh to 60 Hz, sleeps screen, and minimizes brightness to prevent thermal degradation and keep battery charging off front PC USB ports.
   * **[AudioHaptics/](file:///f:/Github/Website/public/Glue/Daemons/AudioHaptics)**:
     * Real-time WASAPI loopback audio-to-haptics converter.
     * Analyzes sub-bass transients and synthesizes 155 Hz resonant PWM waveforms to the Pixel 6a's X-axis LRA motor.
   * **[TokenTracker/](file:///f:/Github/Website/public/Glue/Daemons/TokenTracker)**:
     * Desktop LLM token usage tracker and analytics daemon.
     * Scans and aggregates active tokens across Google AntiGravity and Cursor IDE sessions with real-time caching.
3. **[AntigravityHistory/](file:///f:/Github/Website/public/Glue/AntigravityHistory)**:
   * Automatic conversation history index synchronizer for the Antigravity IDE.
   * Integrated into Windows context menu (`Open with Antigravity IDE`) to ensure conversation indices in `state.vscdb` are kept in sync with on-disk trajectory databases.
4. **[OurFiles/](file:///f:/Github/Website/public/Glue/OurFiles)**:
   * 1-click Windows Explorer right-click context menu utility (`⚒️ Seize the Means of Production (Take Ownership)`).
   * Eliminates the Windows *"You require permission from yourself"* absurdity by instantly taking ownership, resetting ACLs to Full Control, and clearing restrictive file attributes.
