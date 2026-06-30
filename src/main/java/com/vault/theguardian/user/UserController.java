package com.vault.theguardian.user;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/vault/users")
@CrossOrigin
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @DeleteMapping("/me")
    public DeleteAccountResponse deleteMyAccount(@AuthenticationPrincipal User user) {
        return userService.deleteMyAccount(user);
    }
}
