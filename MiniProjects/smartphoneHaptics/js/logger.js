// js/logger.js
const LOG_FORM_ID = '1FAIpQLSc4lWN7KZfdDaN3vlFUE6ETLxky1kfHNy8GcrW-oZ1hgaWeBg';
const ENTRY_IDS = {
    pageName: 'entry.1229971229',
    userAgent: 'entry.1314080497',
    deviceInfo: 'entry.410556950',
    timeStamp: 'entry.1250312556'
};

let hasLoggedThisSession = false;

function logInteraction() {
    if (hasLoggedThisSession) return; // Prevent spamming if button is clicked multiple times
    
    const formUrl = `https://docs.google.com/forms/d/e/${LOG_FORM_ID}/formResponse`;
    
    // Gather Data
    const pageName = window.location.pathname.split('/').pop() || 'index.html';
    const userAgent = navigator.userAgent;
    const deviceInfo = `Screen: ${window.screen.width}x${window.screen.height}, Platform: ${navigator.platform}, Touch: ${'ontouchstart' in window}`;
    const timeStamp = new Date().toLocaleString(); // User's local time

    // Construct URL Params
    const params = new URLSearchParams();
    params.append(ENTRY_IDS.pageName, pageName);
    params.append(ENTRY_IDS.userAgent, userAgent);
    params.append(ENTRY_IDS.deviceInfo, deviceInfo);
    params.append(ENTRY_IDS.timeStamp, timeStamp);

    // Send Request silently
    // mode: 'no-cors' is essential for opaque response from Google Forms
    fetch(`${formUrl}?${params.toString()}`, {
        method: 'POST',
        mode: 'no-cors' 
    }).then(() => {
        console.log('Interaction logged anonymously.');
        hasLoggedThisSession = true;
    }).catch(err => {
        console.warn('Logging failed (this is expected on some blocked networks):', err);
    });
}
