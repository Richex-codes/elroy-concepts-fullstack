const { getLowStock } = require("./lowStockUtils");
const { generateLowStockPDF } = require("./generateLowStockPDF");
const sendEmailWithPDF = require("./emailSender");
const { notifySuperAdmins } = require("./pushNotify");

// Daily proactive sweep across every branch -- catches stock that's
// ALREADY sitting low, not just stock that just crossed the threshold from
// a fresh sale (that case is already covered by the real-time push inside
// routes/admin.js POST /sales). Silently does nothing when nothing is low,
// so this never becomes noise on a healthy day.
async function runLowStockDigest() {
  try {
    const lowStock = await getLowStock({});
    if (lowStock.length === 0) {
      console.log("Low-stock digest: nothing at or below threshold, skipping.");
      return;
    }

    const pdfBuffer = await generateLowStockPDF(lowStock);

    await sendEmailWithPDF(pdfBuffer, process.env.EMAIL_FROM, {
      subject: `Low Stock Alert -- ${lowStock.length} item(s) need restocking`,
      text: "Attached is today's low stock report.",
      filename: "Low-Stock-Alert.pdf",
    });

    console.log(`✅ Low-stock digest email sent (${lowStock.length} item(s))`);

    await notifySuperAdmins({
      title: "Low stock alert",
      body: `${lowStock.length} item(s) across your branches are at or below threshold.`,
      url: "/admin/inventory",
    }).catch((err) => console.error("Push notify failed:", err.message));
  } catch (err) {
    console.error("❌ Low-stock digest failed:", err.message);
  }
}

module.exports = { runLowStockDigest };
