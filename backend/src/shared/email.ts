import nodemailer from 'nodemailer';
import logger from './logger.js';

/**
 * Send an alert email to specified recipients.
 * Reads SMTP config from environment variables.
 * Returns false (never throws) if SMTP is not configured or send fails.
 */
export async function sendAlert(to: string, subject: string, html: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'BK Admin <noreply@baby-kingdom.com>';

  if (!host || !user || !pass) {
    logger.warn('SMTP not configured, skipping alert email');
    return false;
  }

  if (!to) {
    logger.warn('No recipients specified, skipping alert email');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({ from, to, subject, html });
    logger.info({ to, subject }, 'Alert email sent');
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send alert email');
    return false;
  }
}
