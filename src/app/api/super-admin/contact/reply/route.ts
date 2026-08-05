import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, subject, body, submissionId } = await request.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Recipient, subject, and body are required.' },
        { status: 400 }
      );
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return NextResponse.json(
        { error: 'SMTP is not configured. Please add SMTP credentials to your environment.' },
        { status: 500 }
      );
    }

    const nodemailer = await import('nodemailer');
    const path = await import('path');

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: (SMTP_PORT || '587') === '465',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const { supabaseAdmin } = await import('@/lib/auth/admin-client');
    const admin = supabaseAdmin();
    
    // Fetch site name for a personalized touch
    const { data: settings } = await admin
      .from('site_settings')
      .select('site_name')
      .limit(1)
      .maybeSingle();
      
    const siteName = settings?.site_name || 'Replai';

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reply from ${siteName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #0f172a;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff; text-align: left;">
              <img src="cid:company-logo" alt="${siteName} Logo" style="height: 32px; max-width: 200px; display: block; object-fit: contain;">
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${body}</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: left;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; font-weight: 500;">
                The ${siteName} Support Team
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                This email was sent by ${siteName} in response to your inquiry. If you have any further questions, you can reply directly to this email.
              </p>
            </td>
          </tr>
          
        </table>
        
        <!-- Bottom Disclaimer -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
          <tr>
            <td align="center" style="padding: 24px 0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Try to attach logo-full.jpg, fallback to logo-icon.png if it doesn't exist
    const logoFullPath = path.join(process.cwd(), 'public', 'logo-full.jpg');
    
    await transporter.sendMail({
      from: `"${siteName} Support" <${SMTP_USER}>`,
      to,
      subject,
      html: htmlBody,
      replyTo: SMTP_USER,
      attachments: [
        {
          filename: 'logo.jpg',
          path: logoFullPath,
          cid: 'company-logo' // Same CID used in the img src
        }
      ]
    });

    // Save the reply and update submission status
    if (submissionId) {

      // Save reply to contact_replies table
      await admin.from('contact_replies').insert({
        submission_id: submissionId,
        subject,
        body,
        sent_by: 'Super Admin',
      });

      // Update submission status to "replied"
      await admin
        .from('contact_submissions')
        .update({ status: 'replied' })
        .eq('id', submissionId);
    }

    console.log('[contact-reply] Reply sent to:', to);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[contact-reply] Error sending reply:', err);
    return NextResponse.json(
      { error: 'Failed to send reply. Please check your SMTP configuration.' },
      { status: 500 }
    );
  }
}
