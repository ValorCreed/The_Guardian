package com.vault.theguardian.resetpassword;

import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;


@Service
public class PasswordResetService {

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;

    public PasswordResetService(
            UserRepository userRepository,
            PasswordResetTokenRepository tokenRepository,
            PasswordEncoder passwordEncoder

    ){
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public String forgotPassword(ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElse(null);
        if (user == null) {
            return "Reset link has been sent";
        }

        String token = generateSecureToken();

        PasswordResetToken resetToken = PasswordResetToken.builder()
                .token(token)
                .user(user)
                .used(false)
                .createdAt(LocalDateTime.now())
                .expiresAt(LocalDateTime.now().plusMinutes(15))
                .build();
        tokenRepository.save(resetToken);

        return token;
    }

    public String resetPassword(ResetPasswordRequest request) {
        PasswordResetToken resetToken = tokenRepository.findByToken(request.token())
                .orElseThrow(()-> new RuntimeException("Invalid Reset Token"));

        if (resetToken.isUsed()) {
            throw new RuntimeException("Reset Token has been used");
        }

        if (resetToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Reset Token has expired");
        }

        User user = resetToken.getUser();

        //Encode new password before saving
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));

        resetToken.setUsed(true);

        userRepository.save(user);
        tokenRepository.save(resetToken);

        return "Password reset successful";
    }

    private String generateSecureToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);

        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes);
    }

}
