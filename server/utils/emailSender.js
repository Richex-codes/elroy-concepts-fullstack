
require("dotenv").config();
const nodemailer = require("nodemailer");

async function sendEmailWithPDF(buffer, to, options = {}) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: options.subject || "Inventory Summary",
    text: options.text || "Attached is the inventory summary report.",
    attachments: [
      { filename: options.filename || "Inventory-Summary.pdf", content: buffer },
    ],
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendEmailWithPDF;
