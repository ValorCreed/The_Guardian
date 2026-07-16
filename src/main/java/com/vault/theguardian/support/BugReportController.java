package com.vault.theguardian.support;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

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
            @AuthenticationPrincipal User user,
            @Valid @RequestBody BugReportRequest request
    ) {
        return bugReportService.createBugReport(user, request);
    }

    @GetMapping("/my")
    public List<BugReportResponse> getMyBugReports(@AuthenticationPrincipal User user) {
        return bugReportService.getMyBugReports(user);
    }
}
