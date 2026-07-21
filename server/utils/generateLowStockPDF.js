const PDFDocument = require("pdfkit");
const {
  drawHeader,
  drawSectionTitle,
  drawTable,
  drawFooter,
} = require("./pdfLayout");

function generateLowStockPDF(lowStock) {
  const doc = new PDFDocument({ margin: 40, bufferPages: true });
  const buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  drawHeader(doc, {
    title: "Low Stock Alert",
    subtitle: `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} at or below threshold`,
  });

  drawSectionTitle(doc, "Items Needing Restock");

  if (lowStock.length === 0) {
    doc.fontSize(11).fillColor("#71717a").text("No low stock items found.");
  } else {
    drawTable(
      doc,
      [
        { key: "name", label: "PRODUCT", width: 165 },
        { key: "category", label: "CATEGORY", width: 90 },
        { key: "branchName", label: "BRANCH", width: 100 },
        { key: "color", label: "COLOR", width: 75 },
        { key: "quantity", label: "QTY LEFT", width: 85, align: "right" },
      ],
      lowStock.map((item) => ({
        name: item.name,
        category: item.category,
        branchName: item.branchName,
        color: item.color,
        quantity: item.quantity,
      }))
    );
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc);
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

module.exports = { generateLowStockPDF };
