require("dotenv").config();
const nodemailer = require("nodemailer");

async function sendEnquiryEmail({ user, cart, pdfBuffer }) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: "richardigwe2005@gmail.com",
    subject: "New Product Enquiry",
    text:
      `New product enquiry by ${user?.name || "N/A"} ` +
      `(${user?.email || "N/A"}) (${user?.phone || "N/A"})\n\n` +
      `Cart Details:\n` +
      cart
        .map((item) => `${item.name} (Qty: ${item.quantity})`)
        .join("\n") +
      `\n\nFull details in attached PDF.`,
    attachments: [
      {
        filename: "Product-Enquiry.pdf",
        content: pdfBuffer
      }
    ]
  };

  await transporter.sendMail(mailOptions);

  console.log("Enquiry email sent successfully.");
}

module.exports = {
  sendEnquiryEmail
};
