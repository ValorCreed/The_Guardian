package com.vault.theguardian.resetpassword;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Integer> {

    //Finds a reset token from the database
    Optional<PasswordResetToken> findByToken(String token);
}
