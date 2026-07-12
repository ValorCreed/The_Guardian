package com.vault.theguardian.email;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Service
public class EmailService {

    private final WebClient webClient;

    @Value("${RESEND_API_KEY}")
    private String resendApiKey;

    @Value("${MAIL_FROM:The Guardian <onboarding@resend.dev>}")
    private String mailFrom;

    public EmailService(WebClient.Builder builder) {
        this.webClient = builder
                .baseUrl("https://api.resend.com")
                .build();
    }

    public void sendEmailVerificationCode(String toEmail, String code) {
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

        sendEmail(
                toEmail,
                "The Guardian Email Verification Code",
                html
        );
    }

    public void sendPasswordResetCode(String toEmail, String code) {
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

        sendEmail(
                toEmail,
                "The Guardian Password Reset Code",
                html
        );
    }

    public void sendTwoFactorCode(String toEmail, String code) {
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

        sendEmail(
                toEmail,
                "The Guardian 2FA Code",
                html
        );
    }

    private void sendEmail(String toEmail, String subject, String html) {
        if (resendApiKey == null || resendApiKey.isBlank()) {
            throw new RuntimeException("Email service is not configured. Missing RESEND_API_KEY.");
        }

        Map<String, Object> requestBody = Map.of(
                "from", mailFrom,
                "to", List.of(toEmail),
                "subject", subject,
                "html", html
        );

        try {
            String response = webClient.post()
                    .uri("/emails")
                    .header("Authorization", "Bearer " + resendApiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            System.out.println("Email sent successfully to " + toEmail);
            System.out.println("Resend response: " + response);

        } catch (Exception error) {
            System.out.println("EMAIL SEND FAILED for " + toEmail);
            System.out.println("Reason: " + error.getMessage());

            throw new RuntimeException(
                    "We could not send the email right now. Please try again shortly."
            );
        }
    }
}