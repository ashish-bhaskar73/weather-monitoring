import axios from "axios";
import cron from "node-cron";
import db from "../config/dbConfig.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Function to convert Kelvin to Celsius
const kelvinToCelsius = (kelvin) => (kelvin - 273.15).toFixed(2);

// List of cities to monitor
const cities = [
  "Delhi",
  "Mumbai",
  "Chennai",
  "Bangalore",
  "Kolkata",
  "Hyderabad",
];

// Fetch weather data for a single city
export const fetchCityWeather = async (city) => {
  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHERMAP_API_KEY}`
    );
    const { main, weather, dt } = response.data;
    const tempCelsius = kelvinToCelsius(main.temp);
    const weatherCondition = weather[0].main;
    const timestamp = dt;

    return {
      city,
      temperature: tempCelsius,
      condition: weatherCondition,
      timestamp,
    };
  } catch (error) {
    console.error(`Error fetching weather data for ${city}:`, error.message);
    return null;
  }
};

// Fetch weather data for all cities
export const fetchWeatherData = async () => {
  const weatherData = await Promise.all(
    cities.map((city) => fetchCityWeather(city))
  );
  return weatherData.filter((data) => data !== null);
};

// Save weather data into MySQL
const saveWeatherDataToDB = async (weatherData) => {
  for (let data of weatherData) {
    const { city, temperature, condition, timestamp } = data;
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // Convert Unix timestamp to YYYY-MM-DD

    try {
      // Check if weather data for this city and date already exists
      const [results] = await db.query(
        `SELECT * FROM weather_data WHERE city = ? AND date = ?`,
        [city, date]
      );

      let alertTriggered = false;
      if (temperature > 25) {
        alertTriggered = true;
        await sendAlert(city, temperature); // Send an email alert if temperature exceeds threshold
      }

      if (results.length > 0) {
        // Data already exists, so we update the entry
        let temperatures = results[0].temperatures
          ? JSON.parse(results[0].temperatures)
          : [];

        if (!Array.isArray(temperatures)) {
          temperatures = []; // Reset to an empty array if it's not an array
        }

        temperatures.push(parseFloat(temperature)); // Push the new temperature to the array

        const maxTemp = Math.max(...temperatures);
        const minTemp = Math.min(...temperatures);
        const avgTemp = (
          temperatures.reduce((a, b) => a + b, 0) / temperatures.length
        ).toFixed(2);

        await db.query(
          `UPDATE weather_data SET temperatures = ?, max_temp = ?, min_temp = ?, avg_temp = ?, dominant_weather = ?, alert_triggered = ? WHERE id = ?`,
          [
            JSON.stringify(temperatures),
            maxTemp,
            minTemp,
            avgTemp,
            condition,
            alertTriggered,
            results[0].id,
          ]
        );
        console.log(`Updated weather data for ${city} on ${date}`);
      } else {
        // Data does not exist, so we insert a new entry
        await db.query(
          `INSERT INTO weather_data (city, date, temperatures, max_temp, min_temp, avg_temp, dominant_weather, alert_triggered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            city,
            date,
            JSON.stringify([parseFloat(temperature)]), // Initialize the array with the first temperature
            parseFloat(temperature),
            parseFloat(temperature),
            parseFloat(temperature),
            condition,
            alertTriggered,
          ]
        );
        console.log(`Inserted weather data for ${city} on ${date}`);
      }
    } catch (error) {
      console.error(`Error saving weather data for ${city}:`, error.message);
    }
  }
};

// Function to send an email alert if the temperature exceeds a threshold
const sendAlert = async (city, temp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: "user@example.com", // Replace with recipient email
    subject: `Weather Alert for ${city}`,
    text: `The temperature in ${city} has exceeded the threshold: ${temp}°C`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Alert email sent for ${city}: ${temp}°C`);
  } catch (error) {
    console.log(`Error sending alert email for ${city}: ${error.message}`);
  }
};

// Cron job to fetch and save weather data every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("Fetching weather data...");
  const weatherData = await fetchWeatherData();
  await saveWeatherDataToDB(weatherData);
});
