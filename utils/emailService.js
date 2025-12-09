import logger from '../utils/logger.js'; // ADD THIS

const sendEmail = async (to, subject, html) => {
    try {
        logger.info('Attempting to send email', { to, subject }); // CHANGED

        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: to }] }],
                from: {
                    email: 'bhanuprasadgummidelli@gmail.com',
                    name: 'CareerGPT'
                },
                subject: subject,
                content: [{ type: 'text/html', value: html }]
            }),
        });

        if (response.ok) {
            logger.info(' Email sent successfully', { to, subject }); // CHANGED
            return { success: true };
        } else {
            const errorText = await response.text();
            logger.error(' SendGrid API error', { // CHANGED
                status: response.status,
                error: errorText
            });
            return { success: false, error: errorText };
        }

    } catch (error) {
        logger.error(' Email service exception', { // CHANGED
            error: error.message
        });
        return { success: false, error: error.message };
    }
};

// Email templates
const emailTemplates = {
    welcome: (name) => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111827;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #7c3aed; margin-bottom: 16px;">Welcome to CareerGPT! 🎉</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>We're thrilled to have you on board! Your account has been successfully created.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="display: inline-block; background-color: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Go to Dashboard →
          </a>
        </div>
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">This email was sent by CareerGPT.</p>
      </div>
    </div>
  `,

    loginAlert: (name) => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111827;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #059669; margin-bottom: 16px;">Login Alert 🔐</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>You've successfully logged in to your CareerGPT account.</p>
        <p>If this wasn't you, please reset your password immediately.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.FRONTEND_URL}/forgot-password" 
             style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </div>
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">This email was sent automatically for your security.</p>
      </div>
    </div>
  `,

    passwordReset: (name, resetUrl) => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111827;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #dc2626; margin-bottom: 16px;">Reset Your Password</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>You requested to reset your password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; text-align: center;">This link will expire in 15 minutes.</p>
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">CareerGPT Password Reset</p>
      </div>
    </div>
  `,

    passwordResetSuccess: (name) => `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; color: #111827;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #059669; margin-bottom: 16px;">Password Changed Successfully ✅</h2>
        <p>Hi <strong>${name}</strong>,</p>
        <p>Your CareerGPT password has been successfully updated.</p>
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">This email was sent automatically for your security.</p>
      </div>
    </div>
  `
};

export { sendEmail, emailTemplates };