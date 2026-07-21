const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});
const { Worker } = require("bullmq");
const Redis = require("ioredis");

const { generateEnquiryPDF } = require("../utils/generateEnquiryPDF");
const { sendWhatsappEnquiry } = require("../utils/sendWhatsappEnquiry");
const { sendEnquiryEmail } = require("../utils/sendEnquiryEmail");


const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

new Worker(
  "enquiry-queue",
  async (job) => {
    const { user, cart } = job.data;

    const pdfBuffer = await generateEnquiryPDF(user, cart);

    try {
      await sendWhatsappEnquiry({ user, cart });
    } catch (err) {
      console.error("WhatsApp failed:", err.message);
    }

    try {
      await sendEnquiryEmail({ user, cart, pdfBuffer });
    } catch (err) {
      console.error("Email failed:", err.message);
    }
  },
  {
    connection,
    concurrency: 2
  }
);


console.log("Enquiry worker running...");
