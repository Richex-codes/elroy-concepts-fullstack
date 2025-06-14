require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const usersRoute = require("./routes/index");
const AdminRoute = require("./routes/admin");
const ProductRoute = require("./routes/product");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const runInventorySummaryEmail = require("./utils/emailSummaryTask");

const app = express();
app.use(
  cors({
    origin: "https://elroy-concepts-fullstack.vercel.app", // allow your React frontend
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/", usersRoute);
app.use("/admin", AdminRoute);
app.use("/products", ProductRoute);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

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
