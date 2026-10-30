/* ==========================================
   WEATHERLY — WEATHER APPLICATION
   Uses the free Open-Meteo API (no API key required)
========================================== */

"use strict";

/* ------------------------------------------
   1. DOM ELEMENTS AND APP STATE
------------------------------------------ */

const searchForm = document.querySelector("#search-form");
const citySearch = document.querySelector("#city-search");
const searchButton = document.querySelector("#search-button");
const unitToggle = document.querySelector("#unit-toggle");

const cityNameElement = document.querySelector("#city-name");
const currentDateElement = document.querySelector("#current-date");
const temperatureElement = document.querySelector("#temperature");
const feelsLikeElement = document.querySelector("#feels-like");
const weatherIconElement = document.querySelector("#weather-icon");
const weatherDescriptionElement = document.querySelector("#weather-description");
const highTemperatureElement = document.querySelector("#high-temperature");
const lowTemperatureElement = document.querySelector("#low-temperature");
const sunriseElement = document.querySelector("#sunrise-time");
const sunsetElement = document.querySelector("#sunset-time");

const humidityElement = document.querySelector("#humidity");
const windSpeedElement = document.querySelector("#wind-speed");
const windUnitElement = document.querySelector("#wind-unit");
const windDirectionElement = document.querySelector("#wind-direction");
const uvIndexElement = document.querySelector("#uv-index");
const uvDescriptionElement = document.querySelector("#uv-description");
const visibilityElement = document.querySelector("#visibility");
const pressureElement = document.querySelector("#pressure");
const rainChanceElement = document.querySelector("#rain-chance");

const hourlyContainer = document.querySelector("#hourly-container");
const weeklyContainer = document.querySelector("#weekly-container");
const loadingMessage = document.querySelector("#loading-message");
const errorMessage = document.querySelector("#error-message");
const currentYearElement = document.querySelector("#current-year");

let temperatureUnit = "celsius";
let latestWeatherData = null;
let latestLocation = null;
let activeRequestController = null;
let activeRequestId = 0;
const geocodingCache = new Map();
const weatherCache = new Map();
const cacheDuration = 5 * 60 * 1000;


/* ------------------------------------------
   2. WEATHER CODE DESCRIPTIONS AND ICONS
------------------------------------------ */

function getWeatherDetails(code) {
    if (code === 0) {
        return {
            description: "Clear sky",
            icon: "sunny"
        };
    }

    if (code === 1) {
        return {
            description: "Mainly clear",
            icon: "mainly-clear"
        };
    }

    if (code === 2) {
        return {
            description: "Partly cloudy",
            icon: "partly-cloudy"
        };
    }

    if (code === 3) {
        return {
            description: "Cloudy",
            icon: "cloudy"
        };
    }

    if ([45, 48].includes(code)) {
        return {
            description: "Fog",
            icon: "fog"
        };
    }

    if ([51, 53, 55, 56, 57].includes(code)) {
        return {
            description: "Drizzle",
            icon: "drizzle"
        };
    }

    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
        return {
            description: "Rain",
            icon: "rain"
        };
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) {
        return {
            description: "Snow",
            icon: "snow"
        };
    }

    if ([95, 96, 99].includes(code)) {
        return {
            description: "Thunderstorm",
            icon: "thunderstorm"
        };
    }

    return {
        description: "Weather unavailable",
        icon: "fallback"
    };
}

function setWeatherIcon(element, iconName, description) {
    if (!element) return;

    const iconUse = element.querySelector("use");

    if (!iconUse) return;

    const symbolId = document.getElementById(`weather-${iconName}`)
        ? `weather-${iconName}`
        : "weather-fallback";

    iconUse.setAttribute("href", `#${symbolId}`);
    element.setAttribute("aria-label", description);
}


/* ------------------------------------------
   3. FORMATTERS
------------------------------------------ */

function formatTemperature(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "—";
    }

    const convertedValue = temperatureUnit === "fahrenheit"
        ? (Number(value) * 9 / 5) + 32
        : Number(value);

    return `${Math.round(convertedValue)}°${temperatureUnit === "fahrenheit" ? "F" : "C"}`;
}

function formatWindSpeed(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "—";
    }

    // Wind speed stays in km/h regardless of temperature unit.
    return Math.round(Number(value));
}

function formatRoundedValue(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        return "—";
    }

    return Math.round(Number(value));
}

function getWindUnit() {
    return "km/h";
}

function formatDate(dateString, options = {}) {
    if (!dateString) return "—";

    const datePart = String(dateString).slice(0, 10);
    const date = new Date(`${datePart}T12:00:00Z`);

    if (Number.isNaN(date.getTime())) {
        return String(dateString);
    }

    return new Intl.DateTimeFormat(undefined, {
        ...options,
        timeZone: "UTC"
    }).format(date);
}

function formatTime(dateTimeString) {
    if (!dateTimeString) return "—";

    const timePart = dateTimeString.split("T")[1];

    if (!timePart) return "—";

    const [hours, minutes] = timePart.split(":").map(Number);
    const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC"
    }).format(date);
}

function formatHour(dateTimeString) {
    if (!dateTimeString) return "—";

    const timePart = dateTimeString.split("T")[1];

    if (!timePart) return "—";

    const [hours, minutes] = timePart.split(":").map(Number);
    const date = new Date(Date.UTC(2000, 0, 1, hours, minutes));

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        timeZone: "UTC"
    }).format(date);
}

function getWindDirection(degrees) {
    if (degrees === null || degrees === undefined || Number.isNaN(Number(degrees))) {
        return "—";
    }

    const directions = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
    ];
    const normalizedDegrees = ((Number(degrees) % 360) + 360) % 360;
    const direction = directions[Math.round(normalizedDegrees / 22.5) % 16];

    return `${direction} (${Math.round(normalizedDegrees)}°)`;
}

function getCachedValue(cache, key) {
    const entry = cache.get(key);

    if (!entry || Date.now() - entry.timestamp >= cacheDuration) {
        cache.delete(key);
        return null;
    }

    return entry.value;
}

function setCachedValue(cache, key, value) {
    cache.set(key, {
        value,
        timestamp: Date.now()
    });
}

function setText(element, value) {
    if (element) {
        element.textContent = value ?? "—";
    }
}


/* ------------------------------------------
   4. LOADING AND ERROR STATES
------------------------------------------ */

function showLoading(isLoading) {
    if (loadingMessage) loadingMessage.hidden = !isLoading;

    if (isLoading && errorMessage) errorMessage.hidden = true;

    if (searchButton) {
        searchButton.textContent = isLoading ? "Loading..." : "Search";
        searchButton.setAttribute("aria-busy", String(isLoading));
    }

    if (citySearch) {
        citySearch.setAttribute("aria-busy", String(isLoading));
    }
}

function showError(message) {
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.hidden = false;
    }

    if (loadingMessage) {
        loadingMessage.hidden = true;
    }
}

function hideError() {
    if (errorMessage) {
        errorMessage.hidden = true;
    }
}


/* ------------------------------------------
   5. CITY GEOCODING
------------------------------------------ */

async function findCity(city, signal) {
    const cacheKey = city.trim().toLocaleLowerCase();
    const cachedLocation = getCachedValue(geocodingCache, cacheKey);

    if (cachedLocation) return cachedLocation;

    const endpoint = new URL(
        "https://geocoding-api.open-meteo.com/v1/search"
    );

    endpoint.search = new URLSearchParams({
        name: city,
        count: "1",
        language: "en",
        format: "json"
    });

    const response = await fetch(endpoint, { signal });

    if (!response.ok) {
        throw new Error(
            "The city search service is unavailable. Please try again."
        );
    }

    const result = await response.json();

    if (!result || !Array.isArray(result.results) || result.results.length === 0) {
        throw new Error(
            "We couldn't find that city. Check the spelling and try again."
        );
    }

    const location = result.results[0];
    setCachedValue(geocodingCache, cacheKey, location);

    return location;
}


/* ------------------------------------------
   6. FETCH WEATHER FORECAST
------------------------------------------ */

async function fetchWeather(location, signal) {
    const cacheKey = `${location.latitude},${location.longitude}`;
    const cachedWeather = getCachedValue(weatherCache, cacheKey);

    if (cachedWeather) return cachedWeather;

    const endpoint = new URL(
        "https://api.open-meteo.com/v1/forecast"
    );

    endpoint.search = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),

        timezone: "auto",
        forecast_days: "7",

        temperature_unit: "celsius",
        wind_speed_unit: "kmh",

        current: [
            "temperature_2m",
            "relative_humidity_2m",
            "apparent_temperature",
            "is_day",
            "precipitation",
            "rain",
            "showers",
            "weather_code",
            "cloud_cover",
            "pressure_msl",
            "surface_pressure",
            "wind_speed_10m",
            "wind_direction_10m",
            "visibility"
        ].join(","),

        hourly: [
            "temperature_2m",
            "precipitation_probability",
            "weather_code",
            "is_day",
            "uv_index"
        ].join(","),

        daily: [
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "sunrise",
            "sunset",
            "uv_index_max",
            "precipitation_probability_max"
        ].join(",")
    });

    const response = await fetch(endpoint, { signal });

    if (!response.ok) {
        throw new Error(
            "Weather data couldn't be loaded. Please try again."
        );
    }

    const data = await response.json();

    const requiredArrays = [
        [data?.hourly, "time"],
        [data?.hourly, "temperature_2m"],
        [data?.hourly, "weather_code"],
        [data?.daily, "time"],
        [data?.daily, "weather_code"],
        [data?.daily, "temperature_2m_max"],
        [data?.daily, "temperature_2m_min"],
        [data?.daily, "sunrise"],
        [data?.daily, "sunset"]
    ];

    if (
        !data?.current ||
        requiredArrays.some(([section, field]) => !Array.isArray(section?.[field]))
    ) {
        throw new Error(
            "The weather service returned incomplete forecast data. Please try again."
        );
    }

    setCachedValue(weatherCache, cacheKey, data);
    return data;
}


/* ------------------------------------------
   7. DISPLAY CURRENT WEATHER
------------------------------------------ */

function renderCurrentWeather(data, location) {
    const current = data.current;
    const daily = data.daily;

    const currentWeather = getWeatherDetails(current.weather_code);

    const cityParts = [location.name];

    if (location.admin1 && location.admin1 !== location.name) {
        cityParts.push(location.admin1);
    }

    if (location.country) {
        cityParts.push(location.country);
    }

    setText(cityNameElement, cityParts.join(", "));

    setText(
        currentDateElement,
        formatDate(current.time, {
            weekday: "long",
            month: "long",
            day: "numeric"
        })
    );

    setText(
        temperatureElement,
        formatTemperature(current.temperature_2m)
    );

    setText(
        feelsLikeElement,
        `Feels like ${formatTemperature(current.apparent_temperature)}`
    );

    setText(
        weatherDescriptionElement,
        currentWeather.description
    );

    setWeatherIcon(
        weatherIconElement,
        currentWeather.icon,
        currentWeather.description
    );

    setText(
        highTemperatureElement,
        formatTemperature(daily.temperature_2m_max[0])
    );

    setText(
        lowTemperatureElement,
        formatTemperature(daily.temperature_2m_min[0])
    );

    setText(
        sunriseElement,
        formatTime(daily.sunrise[0])
    );

    setText(
        sunsetElement,
        formatTime(daily.sunset[0])
    );

    setText(
        humidityElement,
        formatRoundedValue(current.relative_humidity_2m)
    );

    setText(
        windSpeedElement,
        formatWindSpeed(current.wind_speed_10m)
    );

    setText(
        windUnitElement,
        getWindUnit()
    );

    setText(
        windDirectionElement,
        getWindDirection(current.wind_direction_10m)
    );

    setText(
        pressureElement,
        formatRoundedValue(current.surface_pressure ?? current.pressure_msl)
    );

    const visibilityKm = current.visibility == null ||
        !Number.isFinite(Number(current.visibility))
        ? null
        : Number(current.visibility) / 1000;

    setText(
        visibilityElement,
        visibilityKm == null ? "—" : visibilityKm.toFixed(1)
    );

    const currentHourIndex = findCurrentHourIndex(
        data.hourly.time,
        current.time
    );

    const currentUvIndex = currentHourIndex >= 0
        ? data.hourly.uv_index?.[currentHourIndex]
        : daily.uv_index_max?.[0];

    setText(
        uvIndexElement,
        formatRoundedValue(currentUvIndex)
    );

    setText(
        uvDescriptionElement,
        describeUvIndex(currentUvIndex)
    );

    const rainChance = currentHourIndex >= 0
        ? data.hourly.precipitation_probability?.[currentHourIndex]
        : daily.precipitation_probability_max?.[0];

    setText(
        rainChanceElement,
        formatRoundedValue(rainChance)
    );
}

function describeUvIndex(value) {
    if (value == null || Number.isNaN(Number(value))) {
        return "Unavailable";
    }

    if (value < 3) return "Low";
    if (value < 6) return "Moderate";
    if (value < 8) return "High";
    if (value < 11) return "Very high";

    return "Extreme";
}

function findCurrentHourIndex(times, currentTime) {
    if (!Array.isArray(times) || !times.length) {
        return -1;
    }

    const currentHour = String(currentTime || "").slice(0, 13);

    let index = times.findIndex(
        time => String(time).slice(0, 13) === currentHour
    );

    if (index === -1) {
        const currentDate = new Date(currentTime).getTime();

        index = times.findIndex(
            time => new Date(time).getTime() >= currentDate
        );
    }

    return index;
}


/* ------------------------------------------
   8. DISPLAY HOURLY FORECAST
------------------------------------------ */

function renderHourlyForecast(data) {
    if (!hourlyContainer) return;

    const times = data.hourly.time;
    const currentTime = data.current.time;

    let startIndex = findCurrentHourIndex(
        times,
        currentTime
    );

    if (startIndex < 0) startIndex = 0;

    const cards = Array.from(
        hourlyContainer.querySelectorAll(".hourly-card")
    );

    // Keep exactly 24 forecast cards regardless of the initial HTML count.
    while (cards.length < 24) {
        const card = document.createElement("article");

        card.className = "hourly-card";

        card.innerHTML = `
            <time></time>
            <svg class="hourly-icon" role="img" viewBox="0 0 64 64">
                <use href="#weather-fallback"></use>
            </svg>
            <p class="hourly-temperature"></p>
            <p class="hourly-rain"></p>
        `;

        hourlyContainer.appendChild(card);
        cards.push(card);
    }

    const availableHours = Math.min(24, times.length - startIndex);

    cards.forEach((card, cardIndex) => {
        if (cardIndex >= availableHours) {
            card.hidden = true;
            return;
        }

        card.hidden = false;

        const dataIndex = startIndex + cardIndex;

        const timeElement = card.querySelector("time");
        const iconElement = card.querySelector(".hourly-icon");
        const temperature = card.querySelector(".hourly-temperature");
        const rain = card.querySelector(".hourly-rain");

        const weather = getWeatherDetails(
            data.hourly.weather_code[dataIndex]
        );

        if (timeElement) {
            timeElement.textContent = formatHour(times[dataIndex]);

            timeElement.dateTime = times[dataIndex];
        }

        setWeatherIcon(
            iconElement,
            weather.icon,
            weather.description
        );

        setText(
            temperature,
            formatTemperature(data.hourly.temperature_2m[dataIndex])
        );

        const rainChance =
            data.hourly.precipitation_probability?.[dataIndex];

        setText(
            rain,
            rainChance == null ? "Rain —" : `${Math.round(rainChance)}% rain`
        );
    });
}


/* ------------------------------------------
   9. DISPLAY SEVEN-DAY FORECAST
------------------------------------------ */

function renderWeeklyForecast(data) {
    if (!weeklyContainer) return;

    const daily = data.daily;

    const cards = Array.from(
        weeklyContainer.querySelectorAll(".forecast-day")
    );

    // Create cards if the HTML doesn't contain enough.
    while (cards.length < daily.time.length) {
        const card = document.createElement("article");

        card.className = "forecast-day";

        card.innerHTML = `
            <h3></h3>
            <svg class="forecast-icon" role="img" viewBox="0 0 64 64">
                <use href="#weather-fallback"></use>
            </svg>
            <p class="forecast-condition"></p>

            <div class="forecast-temperatures">
                <span class="forecast-high"></span>
                <span class="forecast-low"></span>
            </div>
            <p class="forecast-rain"></p>
        `;

        weeklyContainer.appendChild(card);
        cards.push(card);
    }

    cards.forEach((card, index) => {
        if (index >= daily.time.length) {
            card.hidden = true;
            return;
        }

        card.hidden = false;

        const dayName = index === 0
            ? "Today"
            : formatDate(daily.time[index], {
                weekday: "long"
            });

        const weather = getWeatherDetails(daily.weather_code[index]);

        setText(
            card.querySelector("h3"),
            dayName
        );

        setText(
            card.querySelector(".forecast-condition"),
            weather.description
        );

        setText(
            card.querySelector(".forecast-high"),
            formatTemperature(daily.temperature_2m_max[index])
        );

        setText(
            card.querySelector(".forecast-low"),
            formatTemperature(daily.temperature_2m_min[index])
        );

        setWeatherIcon(
            card.querySelector(".forecast-icon"),
            weather.icon,
            weather.description
        );

        let rainElement = card.querySelector(".forecast-rain");

        if (!rainElement) {
            rainElement = document.createElement("p");
            rainElement.className = "forecast-rain";
            card.appendChild(rainElement);
        }

        const rainChance = daily.precipitation_probability_max?.[index];
        setText(
            rainElement,
            rainChance == null ? "Rain —" : `Rain ${Math.round(rainChance)}%`
        );
    });
}


/* ------------------------------------------
   10. RENDER AND REFRESH ALL WEATHER DATA
------------------------------------------ */

function renderWeather(data, location) {
    latestWeatherData = data;
    latestLocation = location;

    renderCurrentWeather(data, location);
    renderHourlyForecast(data);
    renderWeeklyForecast(data);

    setText(
        currentYearElement,
        new Date().getFullYear()
    );
}

async function loadWeatherForCity(city) {
    const trimmedCity = city.trim();

    if (!trimmedCity) {
        showError(
            "Enter a city name to search for its weather."
        );

        citySearch?.focus();
        return;
    }

    if (activeRequestController) {
        activeRequestController.abort();
    }

    const requestId = ++activeRequestId;
    const requestController = new AbortController();
    activeRequestController = requestController;
    showLoading(true);

    try {
        const location = await findCity(
            trimmedCity,
            requestController.signal
        );

        if (requestId !== activeRequestId) return;

        const weatherData = await fetchWeather(
            location,
            requestController.signal
        );

        if (requestId !== activeRequestId) return;
        renderWeather(weatherData, location);
        hideError();

    } catch (error) {
        if (
            requestId !== activeRequestId ||
            (error instanceof Error && error.name === "AbortError")
        ) return;

        console.error("Weatherly:", error);

        showError(
            error instanceof TypeError
                ? "Unable to connect to the weather service. Check your internet connection and try again."
                : error instanceof Error
                    ? error.message
                    : "Something went wrong while loading weather data."
        );

    } finally {
        if (requestId === activeRequestId) {
            activeRequestController = null;
            showLoading(false);
        }
    }
}


/* ------------------------------------------
   11. TEMPERATURE UNIT SWITCH
------------------------------------------ */

function updateTemperatureUnit() {
    if (!latestWeatherData || !latestLocation) return;

    renderWeather(
        latestWeatherData,
        latestLocation
    );

    if (unitToggle) {
        unitToggle.setAttribute(
            "aria-label",
            temperatureUnit === "celsius"
                ? "Temperatures currently shown in Celsius. Switch to Fahrenheit."
                : "Temperatures currently shown in Fahrenheit. Switch to Celsius."
        );

        unitToggle.setAttribute(
            "aria-pressed",
            String(temperatureUnit === "fahrenheit")
        );
    }
}

if (unitToggle) {
    unitToggle.addEventListener("click", () => {
        temperatureUnit = temperatureUnit === "celsius"
            ? "fahrenheit"
            : "celsius";

        updateTemperatureUnit();
    });
}


/* ------------------------------------------
   12. SEARCH EVENT
------------------------------------------ */

if (searchForm) {
    searchForm.addEventListener("submit", event => {
        event.preventDefault();

        loadWeatherForCity(
            citySearch?.value || ""
        );
    });
}


/* ------------------------------------------
   13. INITIALIZE APP
------------------------------------------ */

// Display the current year.
setText(
    currentYearElement,
    new Date().getFullYear()
);

// Load Lagos weather when the website opens.
loadWeatherForCity("Lagos");