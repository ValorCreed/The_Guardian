package com.vault.theguardian.useraccount.account;

import com.vault.theguardian.useraccount.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/users")
@CrossOrigin
public class UserAccountController {
    private final UserAccountService userAccountService;

    public UserAccountController(UserAccountService userAccountService) {
        this.userAccountService = userAccountService;
    }

    @GetMapping("/me")
    public UserProfileResponse getMyProfile(
            @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return userAccountService.getMyProfile(user);
    }

    @PutMapping("/me/profile")
    public UserProfileResponse updateMyProfile(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return userAccountService.updateMyProfile(user, request);
    }

    @DeleteMapping("/me")
    public DeleteAccountResponse deleteMyAccount(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody DeleteAccountRequest request
    ) {
        return userAccountService.deleteMyAccount(user, request);
    }
}
