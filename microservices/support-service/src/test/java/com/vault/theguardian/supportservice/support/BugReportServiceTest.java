package com.vault.theguardian.supportservice.support;

import com.vault.theguardian.supportservice.auth.AuthenticatedUser;
import com.vault.theguardian.supportservice.email.EmailClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BugReportServiceTest {
    private BugReportRepository repository;
    private EmailClient emailClient;
    private BugReportService service;

    @BeforeEach
    void setUp() {
        repository = mock(BugReportRepository.class);
        emailClient = mock(EmailClient.class);
        service = new BugReportService(repository, emailClient, "support@example.com");
    }

    @Test
    void savesReportForAuthenticatedUser() {
        when(repository.save(any(BugReport.class))).thenAnswer(invocation -> {
            BugReport report = invocation.getArgument(0);
            report.setId(45L);
            return report;
        });
        when(emailClient.sendBugReport(any())).thenReturn(true);

        BugReportResponse response = service.createBugReport(
                new AuthenticatedUser(7L, "user@example.com", "Example User"),
                new BugReportRequest(
                        "Crash", "Vault", "High", "App crashed", "Open vault",
                        true, "Android", "1.0"
                )
        );

        assertEquals(45L, response.id());
        ArgumentCaptor<BugReport> captor = ArgumentCaptor.forClass(BugReport.class);
        verify(repository).save(captor.capture());
        assertEquals(7L, captor.getValue().getUserId());
    }

    @Test
    void listsOnlyAuthenticatedUsersReports() {
        when(repository.findByUserIdOrderByCreatedAtDesc(7L)).thenReturn(List.of());
        assertEquals(0, service.getMyBugReports(
                new AuthenticatedUser(7L, "user@example.com", null)).size());
        verify(repository).findByUserIdOrderByCreatedAtDesc(7L);
    }
}
