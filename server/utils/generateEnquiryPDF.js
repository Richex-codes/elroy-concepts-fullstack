const PDFDocument = require("pdfkit");
const {
  drawHeader,
  drawSectionTitle,
  drawKeyValueRow,
  drawTable,
  drawFooter,
} = require("./pdfLayout");

/**
 * Generates a PDF for an enquiry and returns a Buffer
 */
function generateEnquiryPDF(user, cart) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        resolve(Buffer.concat(buffers));
      });

      drawHeader(doc, {
        title: "Product Enquiry",
        subtitle: `${cart.length} item${cart.length === 1 ? "" : "s"} requested`,
      });

      drawSectionTitle(doc, "Customer Details");
      drawKeyValueRow(doc, [
        ["Name", user?.name || "N/A"],
        ["Email", user?.email || "N/A"],
        ["Phone", user?.phone || "N/A"],
      ]);

      doc.moveDown(0.5);
      drawSectionTitle(doc, "Requested Items");
      drawTable(
        doc,
        [
          { key: "index", label: "#", width: 30 },
          { key: "name", label: "PRODUCT", width: 300 },
          { key: "color", label: "COLOR", width: 120 },
          { key: "quantity", label: "QTY", width: 65, align: "right" },
        ],
        cart.map((item, i) => ({
          index: i + 1,
          name: item.name,
          color: item.color || "Not specified",
          quantity: item.quantity,
        }))
      );

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        drawFooter(doc);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateEnquiryPDF,
};
