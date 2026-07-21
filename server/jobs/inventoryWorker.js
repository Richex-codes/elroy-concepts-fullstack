const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
const mongoose = require("mongoose")
const { Worker } = require("bullmq");
const Redis = require("ioredis");

const { runInventorySummaryEmail } = require("../utils/emailSummaryTask");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected (worker)"))
  .catch(console.error);


const Redisconnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});


const worker = new Worker(
  "inventory-queue",
  async (job) => {
    console.log("📦 Inventory job received:", job.data);

    const { filters, to } = job.data;

    await runInventorySummaryEmail(filters, to);
  },
  {
    connection: Redisconnection,
    concurrency: 2,
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Inventory job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Inventory job ${job.id} failed:`, err.message);
});

console.log("🚀 Inventory worker running...");