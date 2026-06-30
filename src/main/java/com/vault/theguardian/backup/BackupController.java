package com.vault.theguardian.backup;

import com.vault.theguardian.user.User;
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
    public BackupStatusResponse getBackupStatus(@AuthenticationPrincipal User user) {
        return backupService.getBackupStatus(user);
    }

    @PostMapping("/create")
    public BackupResponse createBackup(@AuthenticationPrincipal User user) {
        return backupService.createBackup(user);
    }

    @PostMapping("/restore")
    public BackupRestoreResponse restoreBackup(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody BackupRestoreRequest request
    ) {
        return backupService.restoreBackup(user, request);
    }
}
