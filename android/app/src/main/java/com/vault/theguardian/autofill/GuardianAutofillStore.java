package com.vault.theguardian.autofill;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

class GuardianAutofillStore {
    private static final String PREFS = "guardian_autofill_store";
    private static final String ENCRYPTED_CREDENTIALS = "encrypted_credentials";
    private static final String KEY_ALIAS = "guardian_autofill_credentials_key";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final int IV_SIZE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    static void saveCredentials(Context context, String credentialsJson) throws Exception {
        JSONArray incoming = new JSONArray(credentialsJson == null ? "[]" : credentialsJson);
        JSONArray sanitized = new JSONArray();

        for (int i = 0; i < incoming.length(); i++) {
            JSONObject object = incoming.optJSONObject(i);
            if (object == null) continue;

            GuardianAutofillCredential credential = GuardianAutofillCredential.fromJson(object);
            if (credential.username.trim().isEmpty() || credential.password.trim().isEmpty()) continue;
            sanitized.put(credential.toJson());
        }

        String encrypted = encrypt(sanitized.toString());
        prefs(context).edit().putString(ENCRYPTED_CREDENTIALS, encrypted).apply();
    }

    static void clearCredentials(Context context) {
        prefs(context).edit().remove(ENCRYPTED_CREDENTIALS).apply();
    }

    static List<GuardianAutofillCredential> loadCredentials(Context context) {
        List<GuardianAutofillCredential> credentials = new ArrayList<>();

        try {
            String encrypted = prefs(context).getString(ENCRYPTED_CREDENTIALS, "");
            if (encrypted == null || encrypted.trim().isEmpty()) return credentials;

            String decrypted = decrypt(encrypted);
            JSONArray array = new JSONArray(decrypted);

            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.optJSONObject(i);
                if (object == null) continue;

                GuardianAutofillCredential credential = GuardianAutofillCredential.fromJson(object);
                if (!credential.username.trim().isEmpty() && !credential.password.trim().isEmpty()) {
                    credentials.add(credential);
                }
            }
        } catch (Exception ignored) {
            return new ArrayList<>();
        }

        return credentials;
    }

    static int countCredentials(Context context) {
        return loadCredentials(context).size();
    }

    static List<GuardianAutofillCredential> filterCredentials(
            List<GuardianAutofillCredential> credentials,
            String packageName,
            String webDomain
    ) {
        List<GuardianAutofillCredential> matches = new ArrayList<>();

        String cleanDomain = normalizeDomain(webDomain);
        String cleanPackage = safeLower(packageName);

        for (GuardianAutofillCredential credential : credentials) {
            String website = normalizeDomain(credential.website);
            String haystack = safeLower(credential.title + " " + credential.website);

            boolean domainMatches = !cleanDomain.trim().isEmpty()
                    && (!website.trim().isEmpty() && (website.contains(cleanDomain) || cleanDomain.contains(website))
                    || haystack.contains(cleanDomain));

            boolean packageMatches = packageMatches(cleanPackage, haystack);

            if (domainMatches || packageMatches) {
                matches.add(credential);
            }
        }

        return matches.isEmpty() ? credentials : matches;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String encrypt(String plainText) throws Exception {
        /*
         * Android Keystore keys created with randomized encryption enabled do not allow
         * us to pass our own IV during ENCRYPT_MODE. If we do, Android throws:
         * "Caller-provided IV not permitted".
         *
         * Correct flow:
         * 1. Initialize encryption without a GCMParameterSpec.
         * 2. Let Android Keystore generate a secure random IV.
         * 3. Read the generated IV using cipher.getIV().
         * 4. Store IV + ciphertext together so decrypt() can use that IV later.
         */
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());

        byte[] iv = cipher.getIV();

        if (iv == null || iv.length != IV_SIZE_BYTES) {
            throw new IllegalStateException("Android Keystore did not return a valid encryption IV.");
        }

        byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        byte[] output = new byte[iv.length + cipherText.length];
        System.arraycopy(iv, 0, output, 0, iv.length);
        System.arraycopy(cipherText, 0, output, iv.length, cipherText.length);

        return Base64.encodeToString(output, Base64.NO_WRAP);
    }

    private static String decrypt(String encryptedText) throws Exception {
        byte[] input = Base64.decode(encryptedText, Base64.NO_WRAP);

        byte[] iv = new byte[IV_SIZE_BYTES];
        byte[] cipherText = new byte[input.length - IV_SIZE_BYTES];

        System.arraycopy(input, 0, iv, 0, IV_SIZE_BYTES);
        System.arraycopy(input, IV_SIZE_BYTES, cipherText, 0, cipherText.length);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));

        return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);

        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build();

        keyGenerator.init(spec);
        return keyGenerator.generateKey();
    }

    private static String normalizeDomain(String value) {
        String result = safeLower(value)
                .replace("https://", "")
                .replace("http://", "")
                .replace("www.", "");

        int slashIndex = result.indexOf('/');
        if (slashIndex >= 0) result = result.substring(0, slashIndex);

        return result.trim();
    }

    private static boolean packageMatches(String packageName, String haystack) {
        if (packageName.trim().isEmpty() || haystack.trim().isEmpty()) return false;

        String[] ignored = {"com", "org", "net", "android", "app", "mobile", "google"};
        String[] parts = packageName.split("\\.");

        for (String part : parts) {
            String token = safeLower(part);
            if (token.length() < 3) continue;

            boolean skip = false;
            for (String ignoredToken : ignored) {
                if (ignoredToken.equals(token)) {
                    skip = true;
                    break;
                }
            }

            if (!skip && haystack.contains(token)) return true;
        }

        return false;
    }

    private static String safeLower(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
