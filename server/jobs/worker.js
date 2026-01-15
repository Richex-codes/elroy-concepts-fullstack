const { Worker } = require("bullmq");
const Redis = require("ioredis");

const { generateEnquiryPDF } = require("../utils/generateEnquiryPDF");
const { sendWhatsappEnquiry } = require("../utils/sendWhatsappEnquiry");
const { sendEnquiryEmail } = require("../utils/sendEnquiryEmail");

const Redisconnection = new Redis();

new Worker(
  "enquiry-queue",
  async (job) => {
    const { user, cart } = job.data;

    const pdfBuffer = await generateEnquiryPDF(cart);

    await sendWhatsappEnquiry({ user, cart });

    await sendEnquiryEmail({ user, cart, pdfBuffer });
  },
  {
    connection: Redisconnection,
    concurrency: 2
  }
);

console.log("Enquiry worker running...");
