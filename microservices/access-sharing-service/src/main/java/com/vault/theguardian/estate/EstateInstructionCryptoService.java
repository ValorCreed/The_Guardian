package com.vault.theguardian.estate;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class EstateInstructionCryptoService {
    private static final String PREFIX = "estate-v1";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec keySpec;

    public EstateInstructionCryptoService(
            @Value("${estate.playbook.secret}") String secret
    ) {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "ESTATE_PLAYBOOK_SECRET must be configured."
            );
        }

        try {
            byte[] key = MessageDigest.getInstance("SHA-256")
                    .digest(secret.getBytes(StandardCharsets.UTF_8));
            this.keySpec = new SecretKeySpec(key, "AES");
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not initialize estate playbook encryption.",
                    exception
            );
        }
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank()) return "";

        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    keySpec,
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );

            byte[] cipherText = cipher.doFinal(
                    plainText.trim().getBytes(StandardCharsets.UTF_8)
            );

            return PREFIX + ":"
                    + Base64.getUrlEncoder().withoutPadding().encodeToString(iv)
                    + ":"
                    + Base64.getUrlEncoder().withoutPadding().encodeToString(cipherText);
        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Could not encrypt estate playbook instructions.",
                    exception
            );
        }
    }

    public String decrypt(String storedValue) {
        if (storedValue == null || storedValue.isBlank()) return "";
        if (!storedValue.startsWith(PREFIX + ":")) {
            return "[Instructions unavailable. Re-save this playbook.]";
        }

        try {
            String[] parts = storedValue.split(":", 3);
            if (parts.length != 3) throw new IllegalArgumentException("Invalid value");

            byte[] iv = Base64.getUrlDecoder().decode(parts[1]);
            byte[] cipherText = Base64.getUrlDecoder().decode(parts[2]);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    keySpec,
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );

            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            return "[Instructions unavailable. Re-save this playbook.]";
        }
    }
}
