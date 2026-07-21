const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
const { Queue } = require("bullmq");
const Redis = require("ioredis");

const Redisconnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});


const inventoryQueue = new Queue("inventory-queue", {
  connection: Redisconnection,
});

module.exports = {
  inventoryQueue,
};