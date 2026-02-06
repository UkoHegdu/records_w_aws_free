/**
 * Send email via Gmail (backend only). Uses EMAIL_USER and EMAIL_PASS like your other project.
 */
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    throw new Error('EMAIL_USER and EMAIL_PASS required for email');
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

async function sendEmail(to, subject, text) {
  const from = process.env.EMAIL_USER;
  if (!from) throw new Error('EMAIL_USER required for email from address');
  const transport = getTransporter();
  const info = await transport.sendMail({
    from,
    to,
    subject,
    text,
  });
  console.log(`✅ Email sent to ${to}, messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendEmail };
