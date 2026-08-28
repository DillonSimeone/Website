/**
 * developerDebug.js - Manual trigger for AR failure testing.
 * Sequence: '3' -> '2' -> '1'
 */
export function initDeveloperDebug(onTrigger, captureTelemetry) {
    let sequence = "";
    const TARGET = "321";
    let lastKeyTime = 0;

    window.addEventListener('keydown', (e) => {
        const now = Date.now();
        if (now - lastKeyTime > 2000) sequence = ""; // Reset if too slow
        
        if (['1', '2', '3'] .includes(e.key)) {
            sequence += e.key;
            lastKeyTime = now;
            
            if (sequence.includes(TARGET)) {
                console.warn("🛠️ Dev Debug: Triggering manual AR failure alert...");
                sequence = ""; 
                
                if (onTrigger) {
                    onTrigger(new Error("MANUAL_DEBUG_TRIGGER"));
                }
                
                if (captureTelemetry) {
                    captureTelemetry("MANUAL_DEBUG_TRIGGER_321");
                }
            }
        }
    });

    console.log("🛠️ Dev Debug: Keystroke listener active (3-2-1 to test failure alert).");
}
