import { bot } from "./bot.js";
import express from 'express';

const app = express();
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Health check server started");
});

// Периодическое действие каждые 5 минут — не блокирует основной поток
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 минут

setInterval(() => {
    // Лёгкий self-ping на собственный health endpoint
    fetch(`http://localhost:${PORT}/health`)
        .then(() => console.log(`[keep-alive] ping ok — ${new Date().toISOString()}`))
        .catch((err) => console.error("[keep-alive] ping failed", err.message));
}, PING_INTERVAL_MS);

await bot.connect();