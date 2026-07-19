package com.vault.theguardian.vaultservice.vault;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@Service
public class VaultCryptoService {

    private static final String PREFIX = "v1";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec keySpec;

    public VaultCryptoService(@Value("${vault.password.secret}") String secret) {
        if (secret == null || secret.isBlank() || secret.length() < 32) {
            throw new IllegalStateException(
                    "vault.password.secret must be set and should be at least 32 characters long."
            );
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] key = digest.digest(secret.getBytes(StandardCharsets.UTF_8));
            this.keySpec = new SecretKeySpec(key, "AES");
        } catch (Exception error) {
            throw new IllegalStateException("Could not initialize vault encryption.", error);
        }
    }

    public String encryptNullable(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }

        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));

            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            return PREFIX + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(iv) + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(cipherText);
        } catch (Exception error) {
            throw new RuntimeException("Could not encrypt vault value.", error);
        }
    }

    public String decryptForResponse(String storedValue) {
        if (storedValue == null || storedValue.isBlank()) {
            return storedValue;
        }

        if (!storedValue.startsWith(PREFIX + ":")) {
            return decodeLegacyFrontendValue(storedValue);
        }

        try {
            String[] parts = storedValue.split(":", 3);

            if (parts.length != 3) {
                return "[Unable to decrypt. Please update this item.]";
            }

            byte[] iv = Base64.getUrlDecoder().decode(parts[1]);
            byte[] cipherText = Base64.getUrlDecoder().decode(parts[2]);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));

            byte[] plainText = cipher.doFinal(cipherText);
            return new String(plainText, StandardCharsets.UTF_8);
        } catch (Exception error) {
            /*
             * Do not crash a whole vault screen because one row cannot be decrypted.
             * This usually happens only when old test data exists or the encryption
             * secret was changed after saving items.
             */
            return "[Unable to decrypt. Please update this item.]";
        }
    }

    private String decodeLegacyFrontendValue(String value) {
        // Old frontend values were often saved with encodeURIComponent.
        // Avoid changing normal plain values unless they actually look URL-encoded.
        if (!value.contains("%")) {
            return value;
        }

        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            return value;
        }
    }
}
