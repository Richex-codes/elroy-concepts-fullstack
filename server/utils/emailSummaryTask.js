const { getInventorySummary, computeProductTotals } = require("./inventorySummaryUtils");
const { generateInventoryPDF } = require("./pdfGenerator");
const sendEmailWithPDF = require("./emailSender");
const { notifySuperAdmins } = require("./pushNotify");

// `notifyOnComplete` is only set true by the monthly cron job (index.js) --
// an admin manually emailing a filtered report via the Inventory page
// already knows they just did that, so that path stays email-only.
async function runInventorySummaryEmail(filters = {}, to, { notifyOnComplete = false } = {}) {
  try {
    const summary = await getInventorySummary(filters);
    const totalSummary = computeProductTotals(summary);
    const pdfBuffer = await generateInventoryPDF(summary, totalSummary);

    await sendEmailWithPDF(pdfBuffer, to || process.env.EMAIL_USER, {
      subject: "Inventory Summary Report",
      text: "Attached is the inventory summary report.",
      filename: "Inventory-Summary.pdf",
    });

    console.log("✅ Inventory summary email sent");

    if (notifyOnComplete) {
      const totalUnits = totalSummary.reduce((sum, p) => sum + p.total, 0);
      await notifySuperAdmins({
        title: "Monthly inventory report sent",
        body: `Emailed just now — ${totalSummary.length} products, ${totalUnits.toLocaleString("en-NG")} units in stock across all branches.`,
        url: "/admin/inventory",
      }).catch((err) => console.error("Push notify failed:", err.message));
    }
  } catch (err) {
    console.error("❌ Inventory email failed:", err.message);
  }
}

module.exports = { runInventorySummaryEmail };