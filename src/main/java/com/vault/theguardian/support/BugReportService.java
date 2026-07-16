package com.vault.theguardian.support;

import com.vault.theguardian.email.EmailService;
import com.vault.theguardian.user.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class BugReportService {
    private final BugReportRepository bugReportRepository;
    private final EmailService emailService;

    /*
     * Set this in Render as ADMIN_SUPPORT_EMAIL.
     * In application.properties it falls back to GMAIL_FROM if ADMIN_SUPPORT_EMAIL is not set.
     */
    @Value("${support.admin-email:}")
    private String adminSupportEmail;

    public BugReportService(
            BugReportRepository bugReportRepository,
            EmailService emailService
    ) {
        this.bugReportRepository = bugReportRepository;
        this.emailService = emailService;
    }

    @Transactional
    public BugReportResponse createBugReport(User user, BugReportRequest request) {
        BugReport bugReport = BugReport.builder()
                .user(user)
                .title(clean(request.title()))
                .category(cleanOrDefault(request.category(), "General"))
                .severity(cleanOrDefault(request.severity(), "Medium"))
                .description(clean(request.description()))
                .stepsToReproduce(cleanNullable(request.stepsToReproduce()))
                .includeDiagnostics(request.includeDiagnostics())
                .deviceInfo(request.includeDiagnostics() ? cleanNullable(request.deviceInfo()) : null)
                .appVersion(request.includeDiagnostics() ? cleanNullable(request.appVersion()) : null)
                .status("OPEN")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        BugReport savedBugReport = bugReportRepository.save(bugReport);

        sendAdminNotificationSafely(user, savedBugReport);

        return toResponse(savedBugReport);
    }

    public List<BugReportResponse> getMyBugReports(User user) {
        return bugReportRepository.findByUserOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private void sendAdminNotificationSafely(User user, BugReport bugReport) {
        if (isBlank(adminSupportEmail)) {
            System.out.println("Bug report #" + bugReport.getId() + " saved, but no support.admin-email is configured.");
            return;
        }

        try {
            boolean sent = emailService.sendBugReportNotification(
                    adminSupportEmail,
                    safeUserName(user),
                    safeUserEmail(user),
                    bugReport.getId(),
                    bugReport.getTitle(),
                    bugReport.getCategory(),
                    bugReport.getSeverity(),
                    bugReport.getDescription(),
                    bugReport.getStepsToReproduce(),
                    bugReport.getDeviceInfo(),
                    bugReport.getAppVersion(),
                    bugReport.getCreatedAt()
            );

            if (sent) {
                System.out.println("Bug report #" + bugReport.getId() + " email notification sent to " + adminSupportEmail);
            } else {
                System.out.println("Bug report #" + bugReport.getId() + " saved, but email notification was not sent. Check email logs.");
            }
        } catch (Exception error) {
            /*
             * Do not fail the user's bug report submission just because email failed.
             * The report is already saved in the database.
             */
            System.out.println("Bug report #" + bugReport.getId() + " saved, but email notification failed: " + error.getMessage());
        }
    }

    private BugReportResponse toResponse(BugReport bugReport) {
        return new BugReportResponse(
                bugReport.getId(),
                bugReport.getTitle(),
                bugReport.getCategory(),
                bugReport.getSeverity(),
                bugReport.getDescription(),
                bugReport.getStepsToReproduce(),
                bugReport.isIncludeDiagnostics(),
                bugReport.getDeviceInfo(),
                bugReport.getAppVersion(),
                bugReport.getStatus(),
                bugReport.getCreatedAt(),
                bugReport.getUpdatedAt()
        );
    }

    private String safeUserName(User user) {
        if (user == null || isBlank(user.getFullName())) {
            return "Unknown user";
        }
        return user.getFullName().trim();
    }

    private String safeUserEmail(User user) {
        if (user == null || isBlank(user.getEmail())) {
            return "Unknown email";
        }
        return user.getEmail().trim();
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String cleanNullable(String value) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? null : cleaned;
    }

    private String cleanOrDefault(String value, String fallback) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? fallback : cleaned;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
