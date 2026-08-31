import nodemailer from 'nodemailer';

// DSPLN's own transactional mail — password resets and verification.
//
// Sent through Google Workspace SMTP with an app password rather than a
// dedicated provider: the mailbox already exists, so this needs no new vendor
// and no DNS. A provider (Resend, Postmark) would give better deliverability
// reporting and bounce handling if volume ever justifies it.
//
// Nothing here throws into the caller's path: an auth flow must not fail
// because mail is unconfigured or the relay is briefly down. It logs and
// returns false, and the caller decides what the user is told.

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
  });
  return transporter;
}

export const mailIsConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The Locker's visual language: near-black on white, letterspaced caps. */
function layout({ heading, body, actionLabel, actionUrl, footnote }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1b1b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e5e5e2" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 32px;border-bottom:1px solid #eee">
        <span style="font-size:13px;font-weight:700;letter-spacing:.22em">DSPLN</span>
        <span style="font-size:10px;letter-spacing:.18em;color:#8a8580;margin-left:10px">THE DISCIPLINE OF JIU JITSU</span>
      </td></tr>
      <tr><td style="padding:34px 32px">
        <h1 style="margin:0 0 16px;font-size:19px;letter-spacing:.04em;text-transform:uppercase">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4a4843">${escapeHtml(body)}</p>
        ${actionUrl ? `<a href="${actionUrl}" style="display:inline-block;background:#1c1b1b;color:#fff;text-decoration:none;padding:14px 28px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(actionLabel)}</a>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8a8580;word-break:break-all">Or paste this into your browser:<br>${actionUrl}</p>` : ''}
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #eee;font-size:11px;line-height:1.6;color:#8a8580">
        ${escapeHtml(footnote ?? '')}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function send({ to, subject, html }) {
  const mail = getTransporter();
  if (!mail) {
    console.warn('[mailer] SMTP is not configured — skipping', subject);
    return false;
  }
  try {
    await mail.sendMail({
      from: { name: 'DSPLN', address: process.env.SMTP_FROM || process.env.SMTP_USER },
      replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER,
      to, subject, html,
    });
    return true;
  } catch (error) {
    console.error('[mailer] send failed', { subject, error: error?.message });
    return false;
  }
}

export function sendPasswordReset({ to, url, name }) {
  return send({
    to,
    subject: 'Reset your DSPLN password',
    html: layout({
      heading: 'Reset your password',
      body: `${name ? `${name}, s` : 'S'}omeone asked to reset the password for your DSPLN Locker. This link works once and expires in an hour.`,
      actionLabel: 'Choose a new password',
      actionUrl: url,
      footnote: 'If this was not you, ignore this email — your password stays as it is.',
    }),
  });
}

export function sendVerification({ to, url, name }) {
  return send({
    to,
    subject: 'Confirm your email for DSPLN',
    html: layout({
      heading: 'Confirm your email',
      body: `${name ? `Welcome, ${name}. ` : 'Welcome. '}Confirm this address and your Locker is ready — your designs, uploads and orders in one place.`,
      actionLabel: 'Confirm email',
      actionUrl: url,
      footnote: 'If you did not create a DSPLN account, ignore this email.',
    }),
  });
}
