import express from "express";
import path from "node:path";
import {insertSoundEvent, getSoundEvents} from "./db";

const app = express();

app.use(express.json());

// The chart page and its d3 dependency are served as static files.
// __dirname is dist/ after compiling, so "../" is the project root.
app.use("/vendor/d3", express.static(path.join(__dirname, "../node_modules/d3/dist")));
app.use(express.static(path.join(__dirname, "../public")));

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

app.get("/api/sensor", async (req, res) => {

    try {
        const events = await getSoundEvents();
        res.json(events);
    } catch (err) {
        console.error("Failed to get sensor data:", err);
        res.status(500).json({ error: "Failed to get sensor data" });
    }
})

app.listen(3000, () => {
    console.log("Server running on port 3000");
});