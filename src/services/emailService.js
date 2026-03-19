const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const env = require('../../lib/configs/env.config');
const { logInfo, logError } = require('../../lib/helpers/logger');

/**
 * Email Service for sending OTP and other emails via SMTP
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
     * Initialize nodemailer transporter with SMTP configuration
     */
  initializeTransporter() {
    try {
      if (!env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM_EMAIL) {
        logError('SMTP credentials not configured. Email service unavailable.');
        this.transporter = null;
        return;
      }

      const smtpHost = env.SMTP_HOST || 'smtp-mail.outlook.com';
      const isAwsSes = smtpHost.includes('amazonaws.com');

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE || false, // false for port 587 (STARTTLS)
        requireTLS: true, // Force STARTTLS upgrade
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        },
        tls: {
          // For AWS SES, use more permissive TLS settings
          rejectUnauthorized: !isAwsSes,
          minVersion: 'TLSv1.2',
          ciphers: 'HIGH:MEDIUM:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
        },
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 30000,
        socketTimeout: 60000,
      });

      logInfo(`Initializing SMTP connection to ${smtpHost}...`);

      // Verify connection asynchronously (non-blocking)
      this.transporter.verify((error) => {
        if (error) {
          // Log full error with console.log for debugging
          console.error('SMTP Full Error Object:', error);
          logError(`SMTP connection verification failed: ${error.message || error.toString()}`);
          logError(`SMTP error details: code=${error.code}, responseCode=${error.responseCode}, command=${error.command}`);
          if (error.response) {
            logError(`SMTP response: ${error.response}`);
          }
        } else {
          logInfo('SMTP server ready');
        }
      });
    } catch (error) {
      logError('Failed to initialize email transporter:', error.message);
      this.transporter = null;
    }
  }

  /**
     * Load and render email template
     * @param {string} templateName - Name of the template file (without extension)
     * @param {Object} variables - Variables to replace in template
     * @returns {Object} - Object with html and text content
     */
  // eslint-disable-next-line class-methods-use-this
  loadTemplate(templateName, variables = {}) {
    try {
      const templateDir = path.join(__dirname, '../../lib/templates/email');
      const htmlPath = path.join(templateDir, `${templateName}.html`);
      const textPath = path.join(templateDir, `${templateName}-text.txt`);

      let htmlContent = '';
      let textContent = '';

      if (fs.existsSync(htmlPath)) {
        htmlContent = fs.readFileSync(htmlPath, 'utf8');
      }

      if (fs.existsSync(textPath)) {
        textContent = fs.readFileSync(textPath, 'utf8');
      }

      // Replace variables in templates
      const replaceVariables = (content) => {
        let result = content;
        Object.keys(variables).forEach((key) => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          result = result.replace(regex, variables[key]);
        });
        return result;
      };

      return {
        html: replaceVariables(htmlContent),
        text: replaceVariables(textContent),
      };
    } catch (error) {
      logError(`Error loading email template ${templateName}:`, error.message);
      return { html: '', text: '' };
    }
  }

  /**
     * Send OTP email
     * @param {string} to - Recipient email address
     * @param {string} otpCode - 6-digit OTP code
     * @param {string} purpose - Purpose of OTP (e.g., 'authentication', 'password reset')
     * @param {number} expiryMinutes - OTP expiry time in minutes
     * @returns {Promise<Object>} - Send result
     */
  async sendOtpEmail(to, otpCode, purpose = 'authentication', expiryMinutes = 10) {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      if (!env.SMTP_FROM_EMAIL || !env.SMTP_USER) {
        throw new Error('SMTP configuration missing');
      }

      const templateVars = {
        otpCode,
        purpose: purpose === 'auth' ? 'authentication' : purpose,
        expiryMinutes: expiryMinutes.toString(),
        currentYear: new Date().getFullYear().toString(),
      };

      const { html, text } = this.loadTemplate('otp-email', templateVars);

      if (!html || !text) {
        throw new Error('Failed to load email template');
      }

      const mailOptions = {
        from: `"${env.SMTP_FROM_NAME || 'TalkHub'}" <${env.SMTP_FROM_EMAIL}>`,
        to,
        subject: `Your TalkHub Verification Code: ${otpCode}`,
        html,
        text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logInfo(`OTP email sent to ${to}`);

      return {
        success: true,
        messageId: info.messageId,
        to,
      };
    } catch (error) {
      logError(`Failed to send OTP email to ${to}:`, error.message);
      throw error;
    }
  }

  /**
     * Send generic email with custom template
     * @param {string} to - Recipient email address
     * @param {string} subject - Email subject
     * @param {string} templateName - Template name (without extension)
     * @param {Object} variables - Template variables
     * @returns {Promise<Object>} - Send result
     */
  async sendEmail(to, subject, templateName, variables = {}) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const { html, text } = this.loadTemplate(templateName, variables);

      if (!html || !text) {
        throw new Error(`Failed to load email template: ${templateName}`);
      }

      const mailOptions = {
        from: `"${env.SMTP_FROM_NAME || 'TalkHub'}" <${env.SMTP_FROM_EMAIL}>`,
        to,
        subject,
        html,
        text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logInfo(`Email sent to ${to}`);

      return {
        success: true,
        messageId: info.messageId,
        to,
      };
    } catch (error) {
      logError(`Failed to send email to ${to}:`, error.message);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
