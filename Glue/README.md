# Public Glue Utilities

This directory contains standalone desktop and environment glue scripts and background utilities.

## Subfolders

1. **[AntigravityHistory/](file:///f:/Github/Website/public/Glue/AntigravityHistory)**:
   * Automatic conversation history index synchronizer for the Antigravity IDE.
   * Integrated into Windows context menu (`Open with Antigravity IDE`) to ensure conversation indices in `state.vscdb` are kept in sync with on-disk trajectory databases.
2. **[USBTethering/](file:///f:/Github/Website/public/Glue/USBTethering)**:
   * Continuous background daemon for Google Pixel 6a.
   * Automatically detects when the phone is plugged in via USB (with USB debugging enabled) and toggles USB tethering on without requiring touchscreen interaction.
3. **[OurFiles/](file:///f:/Github/Website/public/Glue/OurFiles)**:
   * 1-click Windows Explorer right-click context menu utility (`⚒️ Seize the Means of Production (Take Ownership)`).
   * Eliminates the Windows *"You require permission from yourself"* absurdity by instantly taking ownership, resetting ACLs to Full Control, and clearing restrictive file attributes.

