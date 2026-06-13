package com.vault.theguardian.auth;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

//These would be the apis that the frontend would call for login and registration

@RestController
@RequestMapping("vault/auth")
@CrossOrigin
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authservice){
        this.authService = authservice;
    }

    @PostMapping("/register")
    public AuthResponse register(@Valid  @RequestBody RegisterRequest request){
        return authService.register(request);
    }
    @PostMapping("/login")
    public AuthResponse login(@Valid  @RequestBody LoginRequest request){
        return  authService.login(request);
    }
    @PostMapping("/logout")
    public LogoutResponse logout(LoginRequest request){
        return new LogoutResponse("Successfully logged out");
    }
}
