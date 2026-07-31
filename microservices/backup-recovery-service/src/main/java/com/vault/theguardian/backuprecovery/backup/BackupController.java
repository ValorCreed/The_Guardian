package com.vault.theguardian.backuprecovery.backup;

import com.vault.theguardian.backuprecovery.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/backup")
@CrossOrigin
public class BackupController {
    private final BackupService backupService;

    public BackupController(BackupService backupService) {
        this.backupService = backupService;
    }

    @GetMapping("/status")
    public BackupStatusResponse getBackupStatus(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return backupService.getBackupStatus(user);
    }

    @PostMapping("/create")
    public BackupResponse createBackup(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return backupService.createBackup(user);
    }

    @PostMapping("/restore")
    public BackupRestoreResponse restoreBackup(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody BackupRestoreRequest request
    ) {
        return backupService.restoreBackup(user, request);
    }
}
