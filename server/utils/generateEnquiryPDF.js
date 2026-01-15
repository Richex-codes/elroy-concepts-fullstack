const PDFDocument = require("pdfkit");

/**
 * Generates a PDF for an enquiry and returns a Buffer
 */
function generateEnquiryPDF(cart) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });

      // ---- PDF CONTENT ----
      doc.fontSize(18).text("Product Enquiry", { align: "center" });
      doc.moveDown();

      doc.fontSize(12).text("Cart Items:");
      doc.moveDown();

      cart.forEach((item, index) => {
        doc.text(
          `${index + 1}. ${item.name} — Quantity: ${item.quantity}`
        );
      });

      doc.moveDown();
      doc.text(`Generated on: ${new Date().toLocaleString()}`);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateEnquiryPDF
};
