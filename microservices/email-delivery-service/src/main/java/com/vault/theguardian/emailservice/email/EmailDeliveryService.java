package com.vault.theguardian.emailservice.email;

import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Map;
import java.util.Properties;

@Service
public class EmailDeliveryService {
    private static final Logger log = LoggerFactory.getLogger(EmailDeliveryService.class);

    private final RestClient restClient;
    private final String gmailClientId;
    private final String gmailClientSecret;
    private final String gmailRefreshToken;
    private final String gmailFrom;
    private final boolean demoMode;

    public EmailDeliveryService(
            RestClient.Builder builder,
            @Value("${gmail.client-id:}") String gmailClientId,
            @Value("${gmail.client-secret:}") String gmailClientSecret,
            @Value("${gmail.refresh-token:}") String gmailRefreshToken,
            @Value("${gmail.from:}") String gmailFrom,
            @Value("${email.demo-mode:true}") boolean demoMode
    ) {
        this.restClient = builder.build();
        this.gmailClientId = gmailClientId;
        this.gmailClientSecret = gmailClientSecret;
        this.gmailRefreshToken = gmailRefreshToken;
        this.gmailFrom = gmailFrom;
        this.demoMode = demoMode;
    }

    public EmailDeliveryResponse sendVerificationCode(String toEmail, String code) {
        String html = codeTemplate(
                "Verify your email address",
                "Your email verification code is:",
                code,
                "This code expires in 15 minutes.",
                "If you did not request this code, you can safely ignore this email."
        );
        return sendHtmlEmail(
                toEmail,
                "The Guardian Email Verification Code",
                html,
                code
        );
    }

    public EmailDeliveryResponse sendPasswordResetCode(String toEmail, String code) {
        String html = codeTemplate(
                "Password reset request",
                "Your password reset code is:",
                code,
                "This code expires in 15 minutes.",
                "If you did not request a password reset, please ignore this email."
        );
        return sendHtmlEmail(
                toEmail,
                "The Guardian Password Reset Code",
                html,
                code
        );
    }

    public EmailDeliveryResponse sendTwoFactorCode(String toEmail, String code) {
        String html = codeTemplate(
                "Two-factor authentication",
                "Your 2FA login code is:",
                code,
                "This code expires in 10 minutes.",
                "If you did not try to sign in, please secure your account immediately."
        );
        return sendHtmlEmail(
                toEmail,
                "The Guardian 2FA Code",
                html,
                code
        );
    }

    public EmailDeliveryResponse sendBugReportNotification(BugReportEmailRequest request) {
        String recipient = fallback(request.toEmail(), gmailFrom);
        String safeTitle = escapeHtml(fallback(request.title(), "Untitled bug report"));
        String safeCategory = escapeHtml(fallback(request.category(), "General"));
        String safeSeverity = escapeHtml(fallback(request.severity(), "Medium"));
        String safeReporterName = escapeHtml(fallback(request.reporterName(), "Unknown user"));
        String safeReporterEmail = escapeHtml(fallback(request.reporterEmail(), "Unknown email"));
        String safeDescription = toHtmlParagraph(request.description());
        String safeSteps = toHtmlParagraph(request.stepsToReproduce());
        String safeDeviceInfo = toHtmlParagraph(request.deviceInfo());
        String safeAppVersion = escapeHtml(fallback(request.appVersion(), "Not provided"));
        LocalDateTime createdAt = request.createdAt();
        String safeCreatedAt = escapeHtml(createdAt == null ? "Unknown time" : createdAt.toString());

        String subject = "New Bug Report #" + request.reportId() + ": "
                + fallback(request.title(), "Untitled");

        String html = """
                <div style="font-family: Arial, sans-serif; background-color: #f5f7f6; padding: 24px;">
                    <div style="max-width: 680px; margin: auto; background: #ffffff; padding: 28px; border-radius: 16px; border: 1px solid #d9eee5;">
                        <h2 style="color: #154B2D; margin: 0 0 8px;">The Guardian</h2>
                        <p style="color: #333333; font-size: 15px; margin-top: 0;">New bug report submitted</p>

                        <div style="background: #E8F8F3; border: 1px solid #BFE9D8; border-radius: 14px; padding: 16px; margin: 20px 0;">
                            <p style="margin: 0 0 8px; color: #154B2D;"><strong>Report ID:</strong> #%s</p>
                            <p style="margin: 0 0 8px; color: #154B2D;"><strong>Title:</strong> %s</p>
                            <p style="margin: 0 0 8px; color: #154B2D;"><strong>Category:</strong> %s</p>
                            <p style="margin: 0; color: #154B2D;"><strong>Severity:</strong> %s</p>
                        </div>

                        <h3 style="color: #154B2D; margin-bottom: 8px;">Reporter</h3>
                        <p style="color: #555555; line-height: 1.5;">
                            <strong>Name:</strong> %s<br />
                            <strong>Email:</strong> %s<br />
                            <strong>Submitted:</strong> %s
                        </p>

                        <h3 style="color: #154B2D; margin-bottom: 8px;">Description</h3>
                        <div style="color: #555555; line-height: 1.6; background: #fafafa; padding: 14px; border-radius: 12px; border: 1px solid #eeeeee;">%s</div>

                        <h3 style="color: #154B2D; margin-bottom: 8px;">Steps to reproduce</h3>
                        <div style="color: #555555; line-height: 1.6; background: #fafafa; padding: 14px; border-radius: 12px; border: 1px solid #eeeeee;">%s</div>

                        <h3 style="color: #154B2D; margin-bottom: 8px;">Diagnostics</h3>
                        <p style="color: #555555; line-height: 1.5;"><strong>App version:</strong> %s</p>
                        <div style="color: #555555; line-height: 1.6; background: #fafafa; padding: 14px; border-radius: 12px; border: 1px solid #eeeeee;">%s</div>

                        <p style="color: #888888; font-size: 13px; margin-top: 24px;">
                            This message contains bug-report details and safe diagnostics only. It must not contain vault secrets.
                        </p>
                        <p style="color: #154B2D; font-size: 13px; font-weight: bold; margin-top: 24px;">Your Life. Protected.</p>
                    </div>
                </div>
                """.formatted(
                request.reportId(), safeTitle, safeCategory, safeSeverity,
                safeReporterName, safeReporterEmail, safeCreatedAt,
                safeDescription, safeSteps, safeAppVersion, safeDeviceInfo
        );

        return sendHtmlEmail(recipient, subject, html, null);
    }

    private EmailDeliveryResponse sendHtmlEmail(
            String toEmail,
            String subject,
            String html,
            String fallbackCode
    ) {
        try {
            validateConfiguration();
            String accessToken = getAccessToken();
            String rawEmail = createBase64UrlEmail(toEmail, subject, html);

            restClient.post()
                    .uri("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
                    .header("Authorization", "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("raw", rawEmail))
                    .retrieve()
                    .toBodilessEntity();

            log.info("Email delivered typeSubject='{}' recipient={}", subject, toEmail);
            return new EmailDeliveryResponse(true, "Email sent successfully.");
        } catch (Exception exception) {
            log.error("Email delivery failed recipient={} subject={}: {}",
                    toEmail, subject, exception.getMessage());
            if (!isBlank(fallbackCode)) {
                log.warn("DEMO fallback code recipient={} code={}", toEmail, fallbackCode);
            }
            if (demoMode) {
                return new EmailDeliveryResponse(false,
                        "Email was not delivered; demo mode preserved the caller flow.");
            }
            throw new IllegalStateException(
                    "We could not send the email right now. Please try again shortly.",
                    exception
            );
        }
    }

    @SuppressWarnings("unchecked")
    private String getAccessToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", gmailClientId);
        form.add("client_secret", gmailClientSecret);
        form.add("refresh_token", gmailRefreshToken);
        form.add("grant_type", "refresh_token");

        Map<String, Object> response = restClient.post()
                .uri("https://oauth2.googleapis.com/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(Map.class);

        Object token = response == null ? null : response.get("access_token");
        if (token == null || token.toString().isBlank()) {
            throw new IllegalStateException("Google OAuth did not return an access token.");
        }
        return token.toString();
    }

    private String createBase64UrlEmail(String toEmail, String subject, String html)
            throws Exception {
        Session session = Session.getDefaultInstance(new Properties(), null);
        MimeMessage email = new MimeMessage(session);
        email.setFrom(new InternetAddress(gmailFrom, "The Guardian"));
        email.addRecipient(jakarta.mail.Message.RecipientType.TO, new InternetAddress(toEmail));
        email.setSubject(subject, StandardCharsets.UTF_8.name());
        email.setContent(html, "text/html; charset=UTF-8");
        email.saveChanges();

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        email.writeTo(buffer);
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(buffer.toByteArray());
    }

    private String codeTemplate(
            String heading,
            String lead,
            String code,
            String expiry,
            String warning
    ) {
        return """
                <div style="font-family: Arial, sans-serif; background-color: #f5f7f6; padding: 24px;">
                    <div style="max-width: 520px; margin: auto; background: #ffffff; padding: 28px; border-radius: 16px;">
                        <h2 style="color: #154B2D; margin-bottom: 8px;">The Guardian</h2>
                        <p style="color: #333333; font-size: 15px;">%s</p>
                        <p style="color: #555555; font-size: 15px;">%s</p>
                        <div style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #154B2D; margin: 24px 0;">%s</div>
                        <p style="color: #555555; font-size: 14px;">%s</p>
                        <p style="color: #888888; font-size: 13px; margin-top: 24px;">%s</p>
                        <p style="color: #154B2D; font-size: 13px; font-weight: bold; margin-top: 24px;">Your Life. Protected.</p>
                    </div>
                </div>
                """.formatted(
                escapeHtml(heading),
                escapeHtml(lead),
                escapeHtml(code),
                escapeHtml(expiry),
                escapeHtml(warning)
        );
    }

    private String toHtmlParagraph(String value) {
        if (isBlank(value)) return "<em>Not provided</em>";
        return escapeHtml(value)
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .replace("\n", "<br />");
    }

    private String fallback(String value, String fallback) {
        return isBlank(value) ? fallback : value.trim();
    }

    private String escapeHtml(String value) {
        if (value == null) return "";
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private void validateConfiguration() {
        if (isBlank(gmailClientId)) throw new IllegalStateException("Missing GMAIL_CLIENT_ID.");
        if (isBlank(gmailClientSecret)) throw new IllegalStateException("Missing GMAIL_CLIENT_SECRET.");
        if (isBlank(gmailRefreshToken)) throw new IllegalStateException("Missing GMAIL_REFRESH_TOKEN.");
        if (isBlank(gmailFrom)) throw new IllegalStateException("Missing GMAIL_FROM.");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
