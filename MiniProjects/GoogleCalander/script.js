// script.js
const calendarId = '114c605c4a403e08817034e51cb607ffc972723336e77143e8878c52da2a5bf4@group.calendar.google.com';
const apiKey = 'AIzaSyC4TJudtEnaR4RILiwAjMFOdpgg6UeJvos';

async function fetchEvents() {
    try {
        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?key=${apiKey}`);
        const data = await response.json();
        console.log('API Response:', data);  // Log the API response
        return data.items;
    } catch (error) {
        console.error('Error fetching events:', error);  // Log any errors
    }
}

function createEventElement(event) {
    const eventElement = document.createElement('div');
    eventElement.className = 'cal-item';
    const eventDate = new Date(event.start.dateTime || event.start.date);
    const eventTime = event.start.dateTime ? eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day';
    eventElement.innerHTML = `
        <div class="cal-time"><span>${eventTime}</span></div>
        <div class="cal-task">
            <p>${event.summary}</p>
            ${event.location ? `<a><i class="fa fa-map-marker"></i>${event.location}</a>` : ''}
        </div>
    `;
    return eventElement;
}

function renderEvents(events) {
    const scheduleContent = document.getElementById('schedule-content');
    if (!scheduleContent) {
        console.error('No element with id="schedule-content" found.');
        return;
    }
    console.log('Rendering events:', events);  // Log events to be rendered
    scheduleContent.innerHTML = '';
    events.forEach(event => {
        console.log('Rendering event:', event);  // Log each event before rendering
        scheduleContent.appendChild(createEventElement(event));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const events = await fetchEvents();
    if (events) {
        renderEvents(events);
    } else {
        console.warn('No events found or failed to fetch events.');
    }
});
