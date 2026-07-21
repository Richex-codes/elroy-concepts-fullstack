const PDFDocument = require("pdfkit");
const {
  drawHeader,
  drawSectionTitle,
  drawTable,
  drawFooter,
} = require("./pdfLayout");

function generateInventoryPDF(summary, totalSummary) {
  const doc = new PDFDocument({ margin: 40, bufferPages: true });
  const buffers = [];

  doc.on("data", buffers.push.bind(buffers));

  drawHeader(doc, {
    title: "Inventory Summary Report",
    subtitle: `${summary.length} inventory line${summary.length === 1 ? "" : "s"}`,
  });

  drawSectionTitle(doc, "Detailed Breakdown");
  drawTable(
    doc,
    [
      { key: "product", label: "PRODUCT", width: 220 },
      { key: "branch", label: "BRANCH", width: 140 },
      { key: "color", label: "COLOR", width: 100 },
      { key: "totalQuantity", label: "QTY", width: 55, align: "right" },
    ],
    summary.map((item) => ({
      product: item.product,
      branch: item.branch,
      color: item.color,
      totalQuantity: item.totalQuantity,
    }))
  );

  doc.addPage();
  drawHeader(doc, { title: "Total Quantity Per Product" });
  drawTable(
    doc,
    [
      { key: "product", label: "PRODUCT", width: 380 },
      { key: "total", label: "TOTAL QTY", width: 135, align: "right" },
    ],
    totalSummary
  );

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc);
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

module.exports = {
  generateInventoryPDF,
};
