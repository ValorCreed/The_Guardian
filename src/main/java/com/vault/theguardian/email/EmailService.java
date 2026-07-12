package com.vault.theguardian.email;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Properties;

@Service
public class EmailService {

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    @Value("${GMAIL_CLIENT_ID:}")
    private String gmailClientId;

    @Value("${GMAIL_CLIENT_SECRET:}")
    private String gmailClientSecret;

    @Value("${GMAIL_REFRESH_TOKEN:}")
    private String gmailRefreshToken;

    @Value("${GMAIL_FROM:}")
    private String gmailFrom;

    /*
     * Keep this true for your school project.
     *
     * If Gmail API fails:
     * - signup will not crash
     * - forgot password will not crash
     * - the code will be printed in Render logs
     */
    @Value("${DEMO_MODE:true}")
    private boolean demoMode;

    public EmailService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
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
            validateGmailApiConfig();

            System.out.println("Attempting to send email using Gmail API...");
            System.out.println("To: " + toEmail);
            System.out.println("From: " + gmailFrom);
            System.out.println("Subject: " + subject);

            String accessToken = getAccessToken();
            String rawEmail = createBase64UrlEmail(toEmail, subject, html);

            String requestBody = objectMapper
                    .createObjectNode()
                    .put("raw", rawEmail)
                    .toString();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://gmail.googleapis.com/gmail/v1/users/me/messages/send"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + accessToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                System.out.println("Email sent successfully to " + toEmail);
                System.out.println("Gmail API response: " + response.body());
                return true;
            }

            throw new RuntimeException(
                    "Gmail API send failed. Status: " + response.statusCode() +
                            ", Body: " + response.body()
            );

        } catch (Exception error) {
            return handleEmailFailure(toEmail, code, error);
        }
    }

    private String getAccessToken() throws Exception {
        String formBody =
                "client_id=" + urlEncode(gmailClientId) +
                        "&client_secret=" + urlEncode(gmailClientSecret) +
                        "&refresh_token=" + urlEncode(gmailRefreshToken) +
                        "&grant_type=refresh_token";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("https://oauth2.googleapis.com/token"))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(formBody))
                .build();

        HttpResponse<String> response = httpClient.send(
                request,
                HttpResponse.BodyHandlers.ofString()
        );

        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new RuntimeException(
                    "Failed to get Gmail access token. Status: " +
                            response.statusCode() +
                            ", Body: " + response.body()
            );
        }

        JsonNode json = objectMapper.readTree(response.body());

        if (!json.has("access_token")) {
            throw new RuntimeException(
                    "No access_token returned by Google. Response: " + response.body()
            );
        }

        return json.get("access_token").asText();
    }

    private String createBase64UrlEmail(String toEmail, String subject, String html) throws Exception {
        Properties props = new Properties();
        Session session = Session.getDefaultInstance(props, null);

        MimeMessage email = new MimeMessage(session);
        email.setFrom(new InternetAddress(gmailFrom, "The Guardian"));
        email.addRecipient(jakarta.mail.Message.RecipientType.TO, new InternetAddress(toEmail));
        email.setSubject(subject, "UTF-8");
        email.setContent(html, "text/html; charset=UTF-8");
        email.saveChanges();

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        email.writeTo(buffer);

        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(buffer.toByteArray());
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

    private void validateGmailApiConfig() {
        if (isBlank(gmailClientId)) {
            throw new RuntimeException("Missing GMAIL_CLIENT_ID.");
        }

        if (isBlank(gmailClientSecret)) {
            throw new RuntimeException("Missing GMAIL_CLIENT_SECRET.");
        }

        if (isBlank(gmailRefreshToken)) {
            throw new RuntimeException("Missing GMAIL_REFRESH_TOKEN.");
        }

        if (isBlank(gmailFrom)) {
            throw new RuntimeException("Missing GMAIL_FROM.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}