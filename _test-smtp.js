require('dotenv').config({ path: '.env.local' });
const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

(async () => {
  try {
    const info = await transport.sendMail({
      from: `"Replai" <${process.env.SMTP_FROM}>`,
      to: 'gunmanaimcompetitive@gmail.com',
      subject: 'SMTP Test - Email Change',
      text: 'This is a test email to verify SMTP delivery.',
      html: '<p>This is a <strong>test email</strong> to verify SMTP delivery.</p>',
    });
    console.log('Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Response:', info.response);
  } catch (err) {
    console.error('Send FAILED:', err.message);
  }
})();
