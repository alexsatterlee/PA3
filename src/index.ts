import express from "express";
import { insertSoundEvent } from "./db";

const app = express();

app.use(express.json());

app.post("/api/sensor", async (req, res) => {
    const level = req.body?.level;

    if (!Number.isInteger(level)) {
        res.status(400).json({ error: "level must be an integer" });
        return;
    }

    try {
        await insertSoundEvent(level);
        res.json({ message: "Sensor data received" });
    } catch (err) {
        console.error("Failed to insert sound event:", err);
        res.status(500).json({ error: "Failed to store sensor data" });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
