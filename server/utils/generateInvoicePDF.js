const PDFDocument = require("pdfkit");
const {
  drawHeader,
  drawSectionTitle,
  drawKeyValueRow,
  drawTable,
  drawTotalsBlock,
  drawSignatureBlock,
  drawFooter,
  COLORS,
} = require("./pdfLayout");

function formatNaira(value) {
  const n = Number(value) || 0;
  return `NGN ${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function invoiceNumberFor(saleId) {
  return `INV-${String(saleId).slice(-8).toUpperCase()}`;
}

/**
 * sale: { _id, customerName, branchName, saleDate, amount, amountPaid,
 *         balance, items: [{ productName, color, quantitySold, amount }] }
 */
function generateInvoicePDF(sale) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, bufferPages: true });
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      drawHeader(doc, {
        title: "Invoice",
        subtitle: invoiceNumberFor(sale._id),
      });

      drawSectionTitle(doc, "Bill To");
      drawKeyValueRow(doc, [
        ["Customer", sale.customerName || "N/A"],
        ["Date", new Date(sale.saleDate).toLocaleDateString()],
        ["Branch", sale.branchName || "N/A"],
      ]);

      doc.moveDown(0.5);
      const items = sale.items || [];
      drawSectionTitle(doc, `Items (${items.length})`);
      drawTable(
        doc,
        [
          { key: "product", label: "PRODUCT", width: 190 },
          { key: "color", label: "COLOR", width: 85 },
          { key: "qty", label: "QTY", width: 50, align: "right" },
          { key: "rate", label: "RATE", width: 100, align: "right" },
          { key: "amount", label: "AMOUNT", width: 95, align: "right" },
        ],
        items.map((item) => ({
          product: item.productName || "N/A",
          color: item.color || "-",
          qty: item.quantitySold,
          rate: item.rate != null ? formatNaira(item.rate) : "-",
          amount: formatNaira(item.amount),
        }))
      );

      doc.moveDown(0.5);
      drawTotalsBlock(doc, [
        { label: "Amount", value: formatNaira(sale.amount) },
        { label: "Amount Paid", value: formatNaira(sale.amountPaid) },
        {
          label: "Balance Due",
          value: formatNaira(sale.balance),
          emphasis: true,
          color: Number(sale.balance) > 0 ? COLORS.accent : COLORS.heading,
        },
      ]);

      doc.moveDown(1);
      drawSignatureBlock(doc);

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
  generateInvoicePDF,
  invoiceNumberFor,
};
