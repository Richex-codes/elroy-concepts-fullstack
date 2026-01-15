require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const usersRoute = require("./routes/index");
const AdminRoute = require("./routes/admin");
const ProductRoute = require("./routes/product");
const Redis = require("ioredis");
const cron = require("node-cron");
const runInventorySummaryEmail = require("./utils/emailSummaryTask");

const redisConnection = new Redis(process.env.REDIS_URL, {
  tls: {},                // required for rediss://
  maxRetriesPerRequest: null, // Upstash requirement
  enableReadyCheck: false     // Upstash requirement
});

redisConnection.on("connect", () => {
  console.log("✅ Redis connected via:", process.env.REDIS_URL);
});

redisConnection.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

const app = express();
app.use(
  cors({
    origin: "https://elroy-concepts-fullstack.vercel.app", // allow your React frontend
    credentials: true,
  })
);

app.use(express.json());
// app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // <-- REMOVE OR COMMENT OUT THIS LINE
app.use("/", usersRoute);
app.use("/admin", AdminRoute);
app.use("/products", ProductRoute);

// const uploadDir = path.join(__dirname, "uploads"); // <-- REMOVE THIS
// if (!fs.existsSync(uploadDir)) {                  // <-- REMOVE THIS
//   fs.mkdirSync(uploadDir);                         // <-- REMOVE THIS
// }

// 🕗 Example → Runs every day at 8 AM
cron.schedule("0 8 * * *", () => {
  console.log("📧 Sending daily inventory summary...");
  runInventorySummaryEmail();
});

const PORT = process.env.PORT || 3001;

// start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));
