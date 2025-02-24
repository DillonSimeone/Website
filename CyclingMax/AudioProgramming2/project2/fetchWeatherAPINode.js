// fetchWeatherAPI.js
const maxApi = require('max-api');

// Helper: Parse wind speed strings (averages ranges like "5 to 10 mph")
function parseWindSpeed(str) {
    // Remove "mph" (case-insensitive) and trim extra whitespace.
    str = str.replace(/mph/gi, '').trim();
    if (str.includes("to")) {
        let parts = str.split("to");
        let num1 = parseFloat(parts[0].trim());
        let num2 = parseFloat(parts[1].trim());
        return (num1 + num2) / 2;
    }
    return parseFloat(str);
}

async function getWeather(lat, lon) {
    try {
        // Step 1: Fetch the points JSON.
        const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
        maxApi.post("Requesting points data: " + pointsUrl);

        const pointsResponse = await fetch(pointsUrl, {
            headers: {
                'User-Agent': 'CyclingMax/1.0',
                'Accept': 'application/ld+json'
            }
        });
        if (!pointsResponse.ok) {
            throw new Error("HTTP error in points request: " + pointsResponse.status);
        }
        const pointsData = await pointsResponse.json();
        maxApi.post("Points JSON received.");

        // Step 2: Extract the forecast URL.
        const forecastURL = pointsData.forecast;
        if (!forecastURL) {
            throw new Error("Forecast URL not found in points data.");
        }
        maxApi.post("Forecast URL: " + forecastURL);

        // Step 3: Fetch the forecast JSON.
        const forecastResponse = await fetch(forecastURL, {
            headers: {
                'User-Agent': 'CyclingMax/1.0 (myemail@example.com)',
                'Accept': 'application/ld+json'
            }
        });
        if (!forecastResponse.ok) {
            throw new Error("HTTP error in forecast request: " + forecastResponse.status);
        }
        const forecastData = await forecastResponse.json();
        maxApi.post("Forecast JSON received.");

        // Step 4: Process the periods array.
        const periods = forecastData.periods;
        if (!periods) {
            throw new Error("Periods not found in forecast data.");
        }

        let temperatureTable = [];
        let windSpeedTable = [];

        periods.forEach(period => {
            temperatureTable.push(period.temperature);
            let windSpeedAvg = parseWindSpeed(period.windSpeed);
            windSpeedTable.push(windSpeedAvg);
        });

        maxApi.post("Temperature Table: " + JSON.stringify(temperatureTable));
        maxApi.post("Wind Speed Table: " + JSON.stringify(windSpeedTable));

        // Step 5: Output a dictionary containing both tables.
        const result = {
            temperatureTable: temperatureTable,
            windSpeedTable: windSpeedTable
        };

        maxApi.outlet(result);
    } catch (error) {
        maxApi.post("Error: " + error + "\n");
    }
}

// Register the handler for messages coming from Max.
maxApi.addHandler("getWeather", getWeather);