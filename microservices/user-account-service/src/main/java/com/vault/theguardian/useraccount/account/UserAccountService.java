package com.vault.theguardian.useraccount.account;

import com.vault.theguardian.useraccount.auth.AuthClient;
import com.vault.theguardian.useraccount.auth.AuthenticatedUser;
import com.vault.theguardian.useraccount.auth.AuthUserProfileResponse;
import com.vault.theguardian.useraccount.cleanup.AccountCleanupClient;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserAccountService {
    private final AuthClient authClient;
    private final AccountCleanupClient cleanupClient;

    public UserAccountService(
            AuthClient authClient,
            AccountCleanupClient cleanupClient
    ) {
        this.authClient = authClient;
        this.cleanupClient = cleanupClient;
    }

    public UserProfileResponse getMyProfile(AuthenticatedUser user) {
        return toProfileResponse(authClient.getUserProfile(user.userId()));
    }

    public UserProfileResponse updateMyProfile(
            AuthenticatedUser user,
            UpdateProfileRequest request
    ) {
        String cleanFullName = request.fullName().trim().replaceAll("\\s+", " ");
        return toProfileResponse(
                authClient.updateUserProfile(user.userId(), cleanFullName)
        );
    }

    public DeleteAccountResponse deleteMyAccount(
            AuthenticatedUser user,
            DeleteAccountRequest request
    ) {
        if (!authClient.verifyPassword(user.userId(), request.password())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Incorrect password. Account deletion was blocked."
            );
        }

        /*
         * Each owning service deletes its own data. These calls are designed to
         * be idempotent, so the operation can safely be retried after a temporary
         * downstream failure. Auth deletion is last because it invalidates every
         * active session and removes the users row.
         */
        cleanupClient.deleteVaultData(user.userId());
        cleanupClient.deleteAccessSharingData(user.userId());
        cleanupClient.deleteBackupRecoveryData(user.userId());
        cleanupClient.deleteBillingData(user.userId());
        cleanupClient.deleteNotifications(user.userId());
        authClient.deleteUser(user.userId());

        return new DeleteAccountResponse(
                "Your account and vault data have been deleted."
        );
    }

    private UserProfileResponse toProfileResponse(AuthUserProfileResponse profile) {
        return new UserProfileResponse(
                profile.id(),
                profile.fullName(),
                profile.email()
        );
    }
}
