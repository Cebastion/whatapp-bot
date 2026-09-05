import {bot} from "./bot.js";
import  express from 'express';

const app = express();
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.send("OK"));

app.listen(process.env.PORT || 3000, () => {
    console.log("Health check server started");
});

const sock = await bot.connect()

bot.watchMessage(sock)
