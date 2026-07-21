const mongoose = require("mongoose");
const schema = mongoose.Schema;

const userSchema = new schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      // "Test@X.com" and "test@x.com" are the same mailbox -- normalizing
      // on every save means the unique index actually catches that, instead
      // of letting casing differences slip a duplicate account through.
      lowercase: true,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: { type: String },
    verificationTokenExpiry: Date,
    // Cooldown guard so "resend verification email" can't be fired more
    // than once a minute, whether the client's own cooldown UI is bypassed
    // or not.
    lastVerificationSentAt: Date,
    password: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    isAdmin: {
      type: Boolean,
      default: false, // Set to true for admin users (both branch admins and superadmins)
    },
    // Checked by the user at signup ("I am a business admin, not a
    // customer") -- this alone grants nothing. It only makes them visible
    // in the superadmin's "Pending Admin Requests" list so a role/branch
    // can actually be assigned. Reset to false whenever an admin is
    // relieved of all their branches, so re-requesting is explicit.
    adminRequested: {
      type: Boolean,
      default: false,
    },
    // "customer" -- regular storefront account, no admin access.
    // "admin" -- branch-scoped admin; can only manage inventory/sales for `adminBranches`.
    // "superadmin" -- unrestricted access to every branch, audit logs, and can create admins.
    role: {
      type: String,
      enum: ["customer", "admin", "superadmin"],
      default: "customer",
    },
    // Branches this admin can manage. Usually one, but the same account can
    // be handed a second (or third) branch later -- e.g. someone who ends up
    // overseeing two locations -- without needing a separate account per
    // branch. Always empty for "customer"/"superadmin".
    adminBranches: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Branch" }],
      default: [],
    },
    // Forgot password fields
    resetPasswordToken: { type: String },
    resetPasswordTokenExpiry: Date,
    // Same cooldown purpose as lastVerificationSentAt, but for "resend
    // reset link" on the forgot-password page.
    lastPasswordResetRequestedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
