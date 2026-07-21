const path = require("path");

const LOGO_PATH = path.join(__dirname, "..", "assets", "elroy_logo.png");
const SIGNATURE_PATH = path.join(__dirname, "..", "assets", "mum_signature.png");

const COLORS = {
  heading: "#3f3f46",
  accent: "#e0142a",
  text: "#27272a",
  muted: "#71717a",
  border: "#e4e4e7",
  tableHeaderBg: "#3f3f46",
  tableHeaderText: "#ffffff",
  rowAltBg: "#f7f7f8",
};

const PAGE_MARGIN = 40;

function drawHeader(doc, { title, subtitle } = {}) {
  const startY = doc.y;

  try {
    doc.image(LOGO_PATH, PAGE_MARGIN, startY, { width: 170 });
  } catch (err) {
    // Logo missing shouldn't break report generation
  }

  doc
    .fontSize(20)
    .fillColor(COLORS.heading)
    .text(title || "", PAGE_MARGIN, startY, {
      width: doc.page.width - PAGE_MARGIN * 2,
      align: "right",
    });

  if (subtitle) {
    doc
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(subtitle, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: "right",
      });
  }

  doc.moveDown(2);
  const lineY = doc.y + 10;
  doc
    .moveTo(PAGE_MARGIN, lineY)
    .lineTo(doc.page.width - PAGE_MARGIN, lineY)
    .lineWidth(1.5)
    .strokeColor(COLORS.accent)
    .stroke();

  doc.y = lineY + 20;
  doc.fillColor(COLORS.text);
}

function drawSectionTitle(doc, text) {
  doc
    .fontSize(13)
    .fillColor(COLORS.heading)
    .text(text, PAGE_MARGIN, doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2,
    });
  doc.moveDown(0.4);
  doc.fillColor(COLORS.text);
}

function drawKeyValueRow(doc, pairs) {
  const colWidth = (doc.page.width - PAGE_MARGIN * 2) / pairs.length;
  const startX = PAGE_MARGIN;
  const startY = doc.y;

  pairs.forEach(([label, value], i) => {
    const x = startX + i * colWidth;
    doc
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(label.toUpperCase(), x, startY, { width: colWidth - 10 });
    doc
      .fontSize(11)
      .fillColor(COLORS.text)
      .text(value ?? "-", x, startY + 13, { width: colWidth - 10 });
  });

  doc.y = startY + 40;
}

/**
 * Draws a simple bordered table with a colored header row and
 * alternating row backgrounds. Columns: [{ label, width, align }]
 */
function drawTable(doc, columns, rows) {
  const tableX = PAGE_MARGIN;
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const rowHeight = 24;
  const headerHeight = 26;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  function drawHeaderRow(y) {
    doc.rect(tableX, y, tableWidth, headerHeight).fill(COLORS.tableHeaderBg);
    let x = tableX;
    columns.forEach((col) => {
      doc
        .fontSize(9)
        .fillColor(COLORS.tableHeaderText)
        .text(col.label, x + 6, y + 8, {
          width: col.width - 12,
          align: col.align || "left",
        });
      x += col.width;
    });
    return y + headerHeight;
  }

  let y = drawHeaderRow(doc.y);

  rows.forEach((row, idx) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawHeaderRow(PAGE_MARGIN);
    }

    if (idx % 2 === 1) {
      doc.rect(tableX, y, tableWidth, rowHeight).fill(COLORS.rowAltBg);
    }

    let x = tableX;
    columns.forEach((col) => {
      const value = row[col.key] ?? "-";
      doc
        .fontSize(9.5)
        .fillColor(COLORS.text)
        .text(String(value), x + 6, y + 7, {
          width: col.width - 12,
          align: col.align || "left",
        });
      x += col.width;
    });

    doc
      .moveTo(tableX, y + rowHeight)
      .lineTo(tableX + tableWidth, y + rowHeight)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();

    y += rowHeight;
  });

  doc.y = y + 15;
}

/**
 * Right-aligned summary block, e.g. Amount / Amount Paid / Balance.
 * rows: [{ label, value, emphasis?: boolean, color?: string }]
 */
function drawTotalsBlock(doc, rows) {
  const blockWidth = 220;
  const x = doc.page.width - PAGE_MARGIN - blockWidth;
  let y = doc.y;

  rows.forEach((row) => {
    doc
      .fontSize(row.emphasis ? 12 : 10)
      .fillColor(row.color || (row.emphasis ? COLORS.heading : COLORS.muted))
      .text(row.label, x, y, { width: 110 })
      .text(row.value, x + 110, y, { width: 110, align: "right" });
    y += row.emphasis ? 22 : 18;
  });

  doc.y = y + 10;
  doc.fillColor(COLORS.text);
}

/**
 * Two side-by-side signature lines: the business's authorized signature
 * (pre-filled from a saved image) on the left, and a blank line for the
 * customer to sign on the right when the invoice is printed.
 */
function drawSignatureBlock(doc) {
  const boxW = 110;
  const boxH = 55;
  const gap = 40;
  const colWidth = (doc.page.width - PAGE_MARGIN * 2 - gap) / 2;
  const leftX = PAGE_MARGIN;
  const rightX = PAGE_MARGIN + colWidth + gap;
  const topY = doc.y + 12;
  const lineY = topY + boxH + 6;

  try {
    doc.image(SIGNATURE_PATH, leftX, topY, {
      fit: [boxW, boxH],
      align: "left",
      valign: "bottom",
    });
  } catch (err) {
    // Missing signature image shouldn't break invoice generation
  }

  doc
    .moveTo(leftX, lineY)
    .lineTo(leftX + colWidth, lineY)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  doc
    .moveTo(rightX, lineY)
    .lineTo(rightX + colWidth, lineY)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  doc.fontSize(9).fillColor(COLORS.muted);
  doc.text("Authorized Signature", leftX, lineY + 6, { width: colWidth });
  doc.text("Customer Signature", rightX, lineY + 6, { width: colWidth });

  doc.y = lineY + 26;
  doc.fillColor(COLORS.text);
}

function drawFooter(doc) {
  // Writing inside the bottom margin makes pdfkit think the content
  // overflows and silently insert a blank page — disable the check
  // for this one write, then restore it.
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const bottomY = doc.page.height - 30;
  doc
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      `Elroy Concepts  •  Generated on ${new Date().toLocaleString()}`,
      PAGE_MARGIN,
      bottomY,
      { width: doc.page.width - PAGE_MARGIN * 2, align: "center" }
    );

  doc.page.margins.bottom = originalBottomMargin;
}

module.exports = {
  COLORS,
  PAGE_MARGIN,
  drawHeader,
  drawSectionTitle,
  drawKeyValueRow,
  drawTable,
  drawTotalsBlock,
  drawSignatureBlock,
  drawFooter,
};
