
require("dotenv").config();
const { resend } = require("./resendClient");

async function sendEmailWithPDF(buffer, to, options = {}) {
  await resend.emails.send({
    from: `Elroy Concepts <${process.env.EMAIL_FROM}>`,
    to,
    subject: options.subject || "Inventory Summary",
    text: options.text || "Attached is the inventory summary report.",
    attachments: [
      { filename: options.filename || "Inventory-Summary.pdf", content: buffer },
    ],
  });
}

module.exports = sendEmailWithPDF;
