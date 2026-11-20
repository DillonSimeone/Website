autowatch = 1;
outlets = 1;

function bang() {

    fetch("https://api.weather.gov/points/39.7456,-97.0892")
        .then(response => {
            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }
            return response.json();
        })
        .then(data => {
            // Output the entire JSON object to the Max console.
            post("Full JSON:\n" + JSON.stringify(data, null, 2) + "\n");

            // Example: Extract a specific field.
            // For instance, get the forecast URL from data.properties.forecast.
            var forecastURL = (data.properties && data.properties.forecast) ? data.properties.forecast : "No forecast URL found";
            post("Forecast URL: " + forecastURL + "\n");

            // Optionally, output the forecast URL via outlet 0.
            outlet(0, forecastURL);
        })
        .catch(err => {
            post("Fetch error: " + err + "\n");
        });
}