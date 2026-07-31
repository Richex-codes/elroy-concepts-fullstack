require("dotenv").config();
const { resend } = require("./resendClient");

async function sendEnquiryEmail({ user, cart, pdfBuffer }) {
  await resend.emails.send({
    from: `Elroy Concepts <${process.env.EMAIL_FROM}>`,
    to: process.env.ENQUIRY_NOTIFICATION_EMAIL || process.env.EMAIL_FROM,
    subject: "New Product Enquiry",
    text:
    `New product enquiry by ${user?.name || "N/A"} ` +
    `(${user?.email || "N/A"}) (${user?.phone || "N/A"})\n\n` +
    `Cart Details:\n` +
    cart
      .map(
        (item) =>
          `${item.name} | Qty: ${item.quantity} | Color: ${
            item.color || "Not Selected"
          }`
      )
      .join("\n") +
    `\n\nFull details in attached PDF.`,
    attachments: [
      {
        filename: "Product-Enquiry.pdf",
        content: pdfBuffer
      }
    ]
  });

  console.log("Enquiry email sent successfully.");
}

module.exports = {
  sendEnquiryEmail
};
