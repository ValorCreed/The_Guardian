package com.vault.theguardian.supportservice.support;

import com.vault.theguardian.supportservice.auth.AuthenticatedUser;
import com.vault.theguardian.supportservice.email.BugReportEmailRequest;
import com.vault.theguardian.supportservice.email.EmailClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class BugReportService {
    private static final Logger log = LoggerFactory.getLogger(BugReportService.class);

    private final BugReportRepository bugReportRepository;
    private final EmailClient emailClient;
    private final String adminSupportEmail;

    public BugReportService(
            BugReportRepository bugReportRepository,
            EmailClient emailClient,
            @Value("${support.admin-email:}") String adminSupportEmail
    ) {
        this.bugReportRepository = bugReportRepository;
        this.emailClient = emailClient;
        this.adminSupportEmail = adminSupportEmail;
    }

    @Transactional
    public BugReportResponse createBugReport(
            AuthenticatedUser user,
            BugReportRequest request
    ) {
        requireUser(user);

        LocalDateTime now = LocalDateTime.now();
        BugReport bugReport = BugReport.builder()
                .userId(user.userId())
                .title(clean(request.title()))
                .category(cleanOrDefault(request.category(), "General"))
                .severity(cleanOrDefault(request.severity(), "Medium"))
                .description(clean(request.description()))
                .stepsToReproduce(cleanNullable(request.stepsToReproduce()))
                .includeDiagnostics(request.includeDiagnostics())
                .deviceInfo(request.includeDiagnostics()
                        ? cleanNullable(request.deviceInfo()) : null)
                .appVersion(request.includeDiagnostics()
                        ? cleanNullable(request.appVersion()) : null)
                .status("OPEN")
                .createdAt(now)
                .updatedAt(now)
                .build();

        BugReport saved = bugReportRepository.save(bugReport);
        sendAdminNotificationSafely(user, saved);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<BugReportResponse> getMyBugReports(AuthenticatedUser user) {
        requireUser(user);
        return bugReportRepository.findByUserIdOrderByCreatedAtDesc(user.userId())
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private void sendAdminNotificationSafely(AuthenticatedUser user, BugReport report) {
        boolean sent = emailClient.sendBugReport(new BugReportEmailRequest(
                isBlank(adminSupportEmail) ? null : adminSupportEmail.trim(),
                safeReporterName(user),
                safeReporterEmail(user),
                report.getId(),
                report.getTitle(),
                report.getCategory(),
                report.getSeverity(),
                report.getDescription(),
                report.getStepsToReproduce(),
                report.getDeviceInfo(),
                report.getAppVersion(),
                report.getCreatedAt()
        ));

        if (!sent) {
            log.warn("Bug report #{} is stored, but its admin email was not delivered.",
                    report.getId());
        }
    }

    private void requireUser(AuthenticatedUser user) {
        if (user == null || user.userId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Authenticated user could not be resolved."
            );
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

    private String safeReporterName(AuthenticatedUser user) {
        if (!isBlank(user.fullName())) return user.fullName().trim();
        if (!isBlank(user.email())) return user.email().trim();
        return "User #" + user.userId();
    }

    private String safeReporterEmail(AuthenticatedUser user) {
        return isBlank(user.email()) ? "Unknown email" : user.email().trim();
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String cleanOrDefault(String value, String fallback) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? fallback : cleaned;
    }

    private String cleanNullable(String value) {
        String cleaned = clean(value);
        return cleaned.isBlank() ? null : cleaned;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
