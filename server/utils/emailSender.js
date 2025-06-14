const nodemailer = require("nodemailer");

async function sendEmailWithPDF(buffer) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: "richardigwe2005@gmail.com",
    subject: "Daily Inventory Summary",
    text: "Attached is the daily inventory summary report.",
    attachments: [{ filename: "Inventory-Summary.pdf", content: buffer }],
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendEmailWithPDF;
