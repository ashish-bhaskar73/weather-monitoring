import express from "express";
import { fetchWeatherData } from "../services/weatherService.js";

const router = express.Router();

router.get("/fetch-weather", async (req, res) => {
  try {
    const weatherData = await fetchWeatherData(); // Fetch weather data
    res.status(200).json(weatherData); // Send the fetched data in the response
  } catch (error) {
    console.error("Error fetching weather data:", error); // Log error
    res.status(500).json({ error: "Failed to fetch weather data." });
  }
});

export default router;
