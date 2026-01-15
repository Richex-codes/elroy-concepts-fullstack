require("dotenv").config();
const { Worker } = require("bullmq");
const Redis = require("ioredis");

const { generateEnquiryPDF } = require("../utils/generateEnquiryPDF");
const { sendWhatsappEnquiry } = require("../utils/sendWhatsappEnquiry");
const { sendEnquiryEmail } = require("../utils/sendEnquiryEmail");

const Redisconnection = new Redis(process.env.REDIS_URL, {
  tls: {},
  maxRetriesPerRequest: null,   // ✅ REQUIRED
  enableReadyCheck: false       // ✅ REQUIRED (Upstash)
});

console.log("REDIS_URL:", process.env.REDIS_URL);


new Worker(
  "enquiry-queue",
  async (job) => {
    const { user, cart } = job.data;

    const pdfBuffer = await generateEnquiryPDF(cart);

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
    connection: Redisconnection,
    concurrency: 2
  }
);


console.log("Enquiry worker running...");
