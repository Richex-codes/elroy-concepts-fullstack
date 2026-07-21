const mongoose = require("mongoose");

// One document per browser/device a user has enabled push on -- a user
// checking the dashboard on both their phone and laptop gets two of these,
// and both receive every notification sent to that user.
const PushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ user: 1 });

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
