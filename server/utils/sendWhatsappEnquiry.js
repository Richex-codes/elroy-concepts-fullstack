require("dotenv").config();
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);

const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

// Comma-separated list, e.g. "whatsapp:+2348107396206,whatsapp:+2347066313719"
// -- who gets pinged for new enquiries, configurable without a code change.
const ADMIN_WHATSAPP_NUMBERS = (process.env.ADMIN_WHATSAPP_NUMBERS || "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

async function sendWhatsappEnquiry({ user, cart }) {
  let whatsappMessage = `*New Product Enquiry*\n`;
  whatsappMessage += `From: *${user?.name || "N/A"}*\n`;
  whatsappMessage += `Email: ${user?.email || "N/A"}\n`;
  whatsappMessage += `Phone: ${user?.phone || "N/A"}\n\n`;
  whatsappMessage += `*Cart Items:*\n`;

 cart.forEach((item, index) => {
  whatsappMessage +=
    `${index + 1}. ${item.name}\n` +
    `   Qty: ${item.quantity}\n` +
    `   Color: ${item.color || "Not Selected"}\n`;
});

  whatsappMessage += `\n*Note*: Detailed enquiry in email attachment.`;

  const results = await Promise.allSettled(
    ADMIN_WHATSAPP_NUMBERS.map((number) =>
      twilioClient.messages.create({
        from: TWILIO_WHATSAPP_NUMBER,
        to: number,
        body: whatsappMessage,
      })
    )
  );

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      console.log(`WhatsApp sent to ${ADMIN_WHATSAPP_NUMBERS[i]}`);
    } else {
      console.error(
        `Failed WhatsApp to ${ADMIN_WHATSAPP_NUMBERS[i]}:`,
        result.reason?.message
      );
    }
  });
}

module.exports = { sendWhatsappEnquiry };
