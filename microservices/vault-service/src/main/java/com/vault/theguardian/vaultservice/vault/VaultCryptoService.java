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

    private static final String NORMAL_PREFIX = "v1";
    private static final String DECOY_PREFIX = "v1d";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();
    private final SecretKeySpec normalKeySpec;
    private final SecretKeySpec decoyKeySpec;

    public VaultCryptoService(@Value("${vault.password.secret}") String secret) {
        if (secret == null || secret.isBlank() || secret.length() < 32) {
            throw new IllegalStateException(
                    "vault.password.secret must be set and should be at least 32 characters long."
            );
        }

        this.normalKeySpec = deriveKey(secret);
        /*
         * Preserve the existing normal-vault key derivation for backward
         * compatibility, but place decoy values in a separate cryptographic
         * domain. A database-query mistake therefore cannot decrypt a real value
         * through the decoy code path, or vice versa.
         */
        this.decoyKeySpec = deriveKey(secret + "\u0000guardian-decoy-v1");
    }

    public String encryptNullable(String plainText) {
        return encryptNullable(plainText, false);
    }

    public String encryptNullable(String plainText, boolean decoy) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }

        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.ENCRYPT_MODE,
                    keyFor(decoy),
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );

            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            String prefix = decoy ? DECOY_PREFIX : NORMAL_PREFIX;

            return prefix + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(iv) + ":" +
                    Base64.getUrlEncoder().withoutPadding().encodeToString(cipherText);
        } catch (Exception error) {
            throw new RuntimeException("Could not encrypt vault value.", error);
        }
    }

    public String decryptForResponse(String storedValue) {
        return decryptForResponse(storedValue, false);
    }

    public String decryptForResponse(String storedValue, boolean decoy) {
        if (storedValue == null || storedValue.isBlank()) {
            return storedValue;
        }

        String expectedPrefix = decoy ? DECOY_PREFIX : NORMAL_PREFIX;
        String otherPrefix = decoy ? NORMAL_PREFIX : DECOY_PREFIX;

        if (storedValue.startsWith(otherPrefix + ":")) {
            return "[Protected item unavailable in this vault session.]";
        }

        if (!storedValue.startsWith(expectedPrefix + ":")) {
            /* Legacy plain/URL-encoded values belong only to the normal vault. */
            return decoy
                    ? "[Protected item unavailable in this vault session.]"
                    : decodeLegacyFrontendValue(storedValue);
        }

        try {
            String[] parts = storedValue.split(":", 3);

            if (parts.length != 3) {
                return "[Unable to decrypt. Please update this item.]";
            }

            byte[] iv = Base64.getUrlDecoder().decode(parts[1]);
            byte[] cipherText = Base64.getUrlDecoder().decode(parts[2]);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    keyFor(decoy),
                    new GCMParameterSpec(TAG_LENGTH_BITS, iv)
            );

            byte[] plainText = cipher.doFinal(cipherText);
            return new String(plainText, StandardCharsets.UTF_8);
        } catch (Exception error) {
            return "[Unable to decrypt. Please update this item.]";
        }
    }

    private SecretKeySpec keyFor(boolean decoy) {
        return decoy ? decoyKeySpec : normalKeySpec;
    }

    private SecretKeySpec deriveKey(String material) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] key = digest.digest(material.getBytes(StandardCharsets.UTF_8));
            return new SecretKeySpec(key, "AES");
        } catch (Exception error) {
            throw new IllegalStateException("Could not initialize vault encryption.", error);
        }
    }

    private String decodeLegacyFrontendValue(String value) {
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
