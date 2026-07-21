const nodemailer = require("nodemailer");
const { renderActionEmail } = require("./emailTemplate");

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Strips the inline HTML tags renderActionEmail wraps each line in, so the
// same content can double as the plain-text part.
function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

// A plain-text alternative alongside the HTML. Mail with only an HTML part
// is one of the more common signals spam filters weigh against transactional
// email sent through a plain Gmail account (no custom-domain SPF/DKIM/DMARC
// alignment to lean on instead).
function toPlainText({ heading, bodyLines, buttonText, buttonUrl, footerNote }) {
  return [
    heading,
    "",
    ...bodyLines.map(stripTags),
    "",
    `${buttonText}: ${buttonUrl}`,
    footerNote ? `\n${stripTags(footerNote)}` : "",
    "\n— Elroy Concepts",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// Every account-related transactional email (verify, reset, resend) goes
// through this one place, so deliverability tweaks only need to happen once.
async function sendActionEmail(to, { subject, heading, bodyLines, buttonText, buttonUrl, footerNote }) {
  await transporter.sendMail({
    from: `"Elroy Concepts" <${process.env.EMAIL_USER}>`,
    replyTo: process.env.EMAIL_USER,
    to,
    subject,
    html: renderActionEmail({ heading, bodyLines, buttonText, buttonUrl, footerNote }),
    text: toPlainText({ heading, bodyLines, buttonText, buttonUrl, footerNote }),
  });
}

module.exports = { sendActionEmail };
