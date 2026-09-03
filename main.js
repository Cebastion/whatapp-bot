import {bot} from "./bot.js";

const sock = await bot.connect()

bot.watchMessage(sock)
