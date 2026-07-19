package com.vault.theguardian.supportservice.support;

import com.vault.theguardian.supportservice.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/vault/support/bug-reports")
@CrossOrigin
public class BugReportController {
    private final BugReportService bugReportService;

    public BugReportController(BugReportService bugReportService) {
        this.bugReportService = bugReportService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BugReportResponse createBugReport(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody BugReportRequest request
    ) {
        return bugReportService.createBugReport(user, request);
    }

    @GetMapping("/my")
    public List<BugReportResponse> getMyBugReports(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return bugReportService.getMyBugReports(user);
    }
}
