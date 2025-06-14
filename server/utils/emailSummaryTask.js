const Product = require("../models/productModel");
const  { generateInventoryPDF } = require("./pdfGenerator"); 
const sendEmailWithPDF = require("./emailSender"); // or keep logic inline here

async function runInventorySummaryEmail() {
  try {
    const products = await Product.find().populate("inventory.branch", "name");

    const inventorySummary = products.flatMap((product) =>
      product.inventory.map((inv) => ({
        name: product.name,
        branch: inv.branch.name,
        quantity: inv.quantity,
      }))
    );

    const totals = {};
    inventorySummary.forEach((item) => {
      totals[item.name] = (totals[item.name] || 0) + item.quantity;
    });
    const totalSummary = Object.entries(totals).map(([name, total]) => ({
      name,
      total,
    }));

    const pdfBuffer = await generateInventoryPDF(inventorySummary, totalSummary);
    await sendEmailWithPDF(pdfBuffer);

    console.log("✅ Daily inventory summary email sent.");
  } catch (err) {
    console.error("❌ Failed to send daily inventory email:", err.message);
  }
}

module.exports = runInventorySummaryEmail;
