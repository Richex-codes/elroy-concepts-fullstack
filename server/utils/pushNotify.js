const webpush = require("web-push");
const PushSubscription = require("../models/pushSubscriptionModel");
const User = require("../models/usersModel");

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Sends to every device subscribed for these users. Never throws -- a push
// failure must not break whatever real action (a sale, an enquiry) it's
// reporting on. Dead subscriptions (410/404 -- browser data cleared,
// permission revoked, subscription expired) are cleaned up as they're found
// instead of retried forever.
async function sendToUserIds(userIds, payload) {
  if (!userIds.length) return;

  const subs = await PushSubscription.find({ user: { $in: userIds } }).lean();
  if (!subs.length) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error("Push notification failed:", err.message);
        }
      }
    })
  );
}

async function notifySuperAdmins(payload) {
  const superAdmins = await User.find({ role: "superadmin" }).select("_id").lean();
  await sendToUserIds(superAdmins.map((u) => u._id), payload);
}

// Notifies every admin assigned to this branch (a user can now hold more
// than one branch admin assignment -- see usersModel's `adminBranches`).
async function notifyBranchAdmins(branchId, payload) {
  if (!branchId) return;
  const admins = await User.find({ role: "admin", adminBranches: branchId })
    .select("_id")
    .lean();
  await sendToUserIds(admins.map((u) => u._id), payload);
}

module.exports = { sendToUserIds, notifySuperAdmins, notifyBranchAdmins };
