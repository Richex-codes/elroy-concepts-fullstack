require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const usersRoute = require("./routes/index");
const AdminRoute = require("./routes/admin");
const ProductRoute = require("./routes/product");
const Redis = require("ioredis");
const cron = require("node-cron");
const { runInventorySummaryEmail } = require("./utils/emailSummaryTask");
const User = require("./models/usersModel");




const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redisConnection.on("connect", () => {
  console.log("✅ Redis connected");
});

redisConnection.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

const app = express();

// Comma-separated list of frontend origins allowed to call this API, e.g.
// "https://elroy-concepts-fullstack.vercel.app,http://localhost:3000" --
// keeps prod/staging/dev URLs configurable per-deployment instead of baked
// into the code.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use("/", usersRoute);
app.use("/admin", AdminRoute);
app.use("/products", ProductRoute);

// Catch-all error handler -- without this, any error a route doesn't
// handle itself (a thrown multer error, an unexpected exception) falls
// through to Express's default handler, which returns an HTML page instead
// of the JSON every client here expects, and in non-production would leak
// the stack trace back to the caller.
app.use((err, req, res, next) => {
  if (err?.name === "MulterError" || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ msg: err.message || "Upload failed" });
  }
  if (err?.message === "Only image files are allowed") {
    return res.status(400).json({ msg: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ msg: "Server error" });
});



// every month 1st day 8am
cron.schedule("0 8 1 * *", async () => {
  // no filters = full report; also pushes a notification to superadmins so
  // they know it went out even if they never open the email.
  await runInventorySummaryEmail({}, undefined, { notifyOnComplete: true });
});

const PORT = process.env.PORT || 3001;

// start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected");

    // One-time role backfill: before branch-scoped admins existed, isAdmin
    // meant unrestricted access -- so every pre-existing admin account is
    // promoted to superadmin. Safe to run on every boot: it only touches
    // accounts with no role yet or still on the schema's default
    // "customer" (pre-existing documents don't actually have a `role`
    // field stored until re-saved, so Mongoose's schema default alone
    // never shows up in a raw query -- $exists:false has to be matched
    // explicitly), so it never re-touches (or downgrades) an account
    // already assigned a role.
    const result = await User.updateMany(
      { isAdmin: true, $or: [{ role: { $exists: false } }, { role: "customer" }] },
      { $set: { role: "superadmin" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`Promoted ${result.modifiedCount} existing admin(s) to superadmin`);
    }
  })
  .catch((err) => console.error(err));
