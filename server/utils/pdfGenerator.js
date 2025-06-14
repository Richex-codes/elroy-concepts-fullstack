const PDFDocument = require("pdfkit");

function generateInventoryPDF(inventorySummary, totalSummary) {
  const doc = new PDFDocument();
  const buffers = [];

  doc.on("data", buffers.push.bind(buffers));
  doc.fontSize(16).text("Inventory Summary by Branch\n", { underline: true });

  inventorySummary.forEach((item) => {
    doc.fontSize(12).text(`${item.name} (${item.branch}): ${item.quantity}`);
  });

  doc
    .addPage()
    .fontSize(16)
    .text("Total Quantity per Product\n", { underline: true });

  totalSummary.forEach((item) => {
    doc.fontSize(12).text(`${item.name}: ${item.total}`);
  });

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

function generateEnquiryPDF(emailContent) {
  const doc = new PDFDocument();
  const buffers = [];

  doc.on("data", buffers.push.bind(buffers));
  doc.fontSize(16).text("Product Enquiry\n", { underline: true });

  emailContent.forEach((item) => {
    doc.fontSize(12).text(`${item.name}: ${item.quantity}`);
  });

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}

module.exports = {
  generateInventoryPDF,
  generateEnquiryPDF,
};

