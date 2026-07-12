package com.vault.theguardian.email;

import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private final JavaMailSender mailSender;

    /*
     * Keep DEMO_MODE=true for your school project.
     *
     * When true:
     * - Email failure will NOT crash signup/login/reset flow.
     * - The code will be printed in Render logs.
     *
     * When false:
     * - Email failure throws an error.
     */
    @Value("${DEMO_MODE:true}")
    private boolean demoMode;

    /*
     * This is the Gmail address the email is sent from.
     * Example:
     * MAIL_FROM=theguardianllc@gmail.com
     */
    @Value("${MAIL_FROM:}")
    private String mailFrom;

    /*
     * Fallback sender email.
     * This comes from application.properties:
     * spring.mail.username=${MAIL_USERNAME}
     */
    @Value("${spring.mail.username:}")
    private String mailUsername;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public boolean sendEmailVerificationCode(String toEmail, String code) {
        String html = """
                <div style="font-family: Arial, sans-serif; background-color: #f5f7f6; padding: 24px;">
                    <div style="max-width: 520px; margin: auto; background: #ffffff; padding: 28px; border-radius: 16px;">
                        <h2 style="color: #154B2D; margin-bottom: 8px;">The Guardian</h2>
                        <p style="color: #333333; font-size: 15px;">Verify your email address</p>

                        <p style="color: #555555; font-size: 15px;">
                            Your email verification code is:
                        </p>

                        <div style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #154B2D; margin: 24px 0;">
                            %s
                        </div>

                        <p style="color: #555555; font-size: 14px;">
                            This code expires in 15 minutes.
                        </p>

                        <p style="color: #888888; font-size: 13px; margin-top: 24px;">
                            If you did not request this code, you can safely ignore this email.
                        </p>

                        <p style="color: #154B2D; font-size: 13px; font-weight: bold; margin-top: 24px;">
                            Your Life. Protected.
                        </p>
                    </div>
                </div>
                """.formatted(code);

        return sendHtmlEmail(
                toEmail,
                "The Guardian Email Verification Code",
                html,
                code
        );
    }

    public boolean sendPasswordResetCode(String toEmail, String code) {
        String html = """
                <div style="font-family: Arial, sans-serif; background-color: #f5f7f6; padding: 24px;">
                    <div style="max-width: 520px; margin: auto; background: #ffffff; padding: 28px; border-radius: 16px;">
                        <h2 style="color: #154B2D; margin-bottom: 8px;">The Guardian</h2>
                        <p style="color: #333333; font-size: 15px;">Password reset request</p>

                        <p style="color: #555555; font-size: 15px;">
                            Your password reset code is:
                        </p>

                        <div style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #154B2D; margin: 24px 0;">
                            %s
                        </div>

                        <p style="color: #555555; font-size: 14px;">
                            This code expires in 15 minutes.
                        </p>

                        <p style="color: #888888; font-size: 13px; margin-top: 24px;">
                            If you did not request a password reset, please ignore this email.
                        </p>

                        <p style="color: #154B2D; font-size: 13px; font-weight: bold; margin-top: 24px;">
                            Your Life. Protected.
                        </p>
                    </div>
                </div>
                """.formatted(code);

        return sendHtmlEmail(
                toEmail,
                "The Guardian Password Reset Code",
                html,
                code
        );
    }

    public boolean sendTwoFactorCode(String toEmail, String code) {
        String html = """
                <div style="font-family: Arial, sans-serif; background-color: #f5f7f6; padding: 24px;">
                    <div style="max-width: 520px; margin: auto; background: #ffffff; padding: 28px; border-radius: 16px;">
                        <h2 style="color: #154B2D; margin-bottom: 8px;">The Guardian</h2>
                        <p style="color: #333333; font-size: 15px;">Two-factor authentication</p>

                        <p style="color: #555555; font-size: 15px;">
                            Your 2FA login code is:
                        </p>

                        <div style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #154B2D; margin: 24px 0;">
                            %s
                        </div>

                        <p style="color: #555555; font-size: 14px;">
                            This code expires in 10 minutes.
                        </p>

                        <p style="color: #888888; font-size: 13px; margin-top: 24px;">
                            If you did not try to sign in, please secure your account immediately.
                        </p>

                        <p style="color: #154B2D; font-size: 13px; font-weight: bold; margin-top: 24px;">
                            Your Life. Protected.
                        </p>
                    </div>
                </div>
                """.formatted(code);

        return sendHtmlEmail(
                toEmail,
                "The Guardian 2FA Code",
                html,
                code
        );
    }

    private boolean sendHtmlEmail(String toEmail, String subject, String html, String code) {
        try {
            String senderEmail = getSenderEmail();

            System.out.println("Attempting to send email using Gmail SMTP...");
            System.out.println("To: " + toEmail);
            System.out.println("From: " + senderEmail);
            System.out.println("Subject: " + subject);

            MimeMessage message = mailSender.createMimeMessage();

            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(senderEmail, "The Guardian");
            helper.setTo(toEmail);
            helper.setSubject(subject);
            helper.setText(html, true);

            mailSender.send(message);

            System.out.println("Email sent successfully to " + toEmail);

            return true;

        } catch (MailException mailError) {
            return handleEmailFailure(toEmail, code, mailError);

        } catch (Exception error) {
            return handleEmailFailure(toEmail, code, error);
        }
    }

    private boolean handleEmailFailure(String toEmail, String code, Exception error) {
        System.out.println("EMAIL SEND FAILED for " + toEmail);
        System.out.println("Reason: " + error.getMessage());
        System.out.println("Code for " + toEmail + " is: " + code);

        if (demoMode) {
            System.out.println("DEMO_MODE is true. Email failure will not break the user flow.");
            return false;
        }

        throw new RuntimeException(
                "We could not send the email right now. Please try again shortly."
        );
    }

    private String getSenderEmail() {
        if (mailFrom != null && !mailFrom.isBlank()) {
            return mailFrom;
        }

        if (mailUsername != null && !mailUsername.isBlank()) {
            return mailUsername;
        }

        throw new RuntimeException("MAIL_FROM or MAIL_USERNAME is missing.");
    }
}