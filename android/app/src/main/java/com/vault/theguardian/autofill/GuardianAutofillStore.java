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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

class GuardianAutofillStore {
    private static final String PREFS = "guardian_autofill_store";
    private static final String ENCRYPTED_CREDENTIALS = "encrypted_credentials";
    private static final String ENCRYPTED_CARDS = "encrypted_cards";
    private static final String ENCRYPTED_PENDING_CREDENTIALS = "encrypted_pending_credentials";
    private static final String KEY_ALIAS = "guardian_autofill_credentials_key";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final int IV_SIZE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    static void saveCredentials(Context context, String credentialsJson) throws Exception {
        JSONArray incoming = parseArray(credentialsJson);
        JSONArray sanitized = new JSONArray();

        for (int i = 0; i < incoming.length(); i++) {
            JSONObject object = incoming.optJSONObject(i);
            if (object == null) continue;

            GuardianAutofillCredential credential = GuardianAutofillCredential.fromJson(object);
            if (credential.password.isEmpty()) continue;
            sanitized.put(credential.toJson());
        }

        saveEncryptedArray(context, ENCRYPTED_CREDENTIALS, sanitized);
    }

    static void saveCards(Context context, String cardsJson) throws Exception {
        JSONArray incoming = parseArray(cardsJson);
        JSONArray sanitized = new JSONArray();

        for (int i = 0; i < incoming.length(); i++) {
            JSONObject object = incoming.optJSONObject(i);
            if (object == null) continue;

            GuardianAutofillCard card = GuardianAutofillCard.fromJson(object);
            if (card.cardNumber.length() < 12) continue;
            sanitized.put(card.toJson());
        }

        saveEncryptedArray(context, ENCRYPTED_CARDS, sanitized);
    }

    static void clearCredentials(Context context) {
        prefs(context).edit()
                .remove(ENCRYPTED_CREDENTIALS)
                .remove(ENCRYPTED_CARDS)
                .remove(ENCRYPTED_PENDING_CREDENTIALS)
                .apply();
    }

    static List<GuardianAutofillCredential> loadCredentials(Context context) {
        Map<String, GuardianAutofillCredential> merged = new LinkedHashMap<>();

        for (GuardianAutofillCredential credential : loadCredentialArray(context, ENCRYPTED_CREDENTIALS)) {
            merged.put(credential.matchKey(), credential);
        }

        /*
         * Credentials captured by Android's SaveInfo flow are immediately usable
         * even before React Native next opens and synchronizes them to the backend.
         */
        for (GuardianAutofillCredential credential : loadPendingCredentials(context)) {
            merged.put(credential.matchKey(), credential);
        }

        return new ArrayList<>(merged.values());
    }

    static List<GuardianAutofillCard> loadCards(Context context) {
        List<GuardianAutofillCard> cards = new ArrayList<>();

        for (JSONObject object : loadObjects(context, ENCRYPTED_CARDS)) {
            GuardianAutofillCard card = GuardianAutofillCard.fromJson(object);
            if (card.cardNumber.length() >= 12) cards.add(card);
        }

        return cards;
    }

    static int countCredentials(Context context) {
        return loadCredentials(context).size();
    }

    static int countCards(Context context) {
        return loadCards(context).size();
    }

    static void enqueuePendingCredential(
            Context context,
            GuardianAutofillCredential credential
    ) throws Exception {
        List<GuardianAutofillCredential> pending = loadPendingCredentials(context);
        Map<String, GuardianAutofillCredential> merged = new LinkedHashMap<>();

        for (GuardianAutofillCredential existing : pending) {
            merged.put(existing.matchKey(), existing);
        }
        merged.put(credential.matchKey(), credential);

        JSONArray array = new JSONArray();
        for (GuardianAutofillCredential item : merged.values()) {
            array.put(item.toJson());
        }

        saveEncryptedArray(context, ENCRYPTED_PENDING_CREDENTIALS, array);
    }

    static List<GuardianAutofillCredential> loadPendingCredentials(Context context) {
        return loadCredentialArray(context, ENCRYPTED_PENDING_CREDENTIALS);
    }

    static String pendingCredentialsJson(Context context) {
        JSONArray array = new JSONArray();
        try {
            for (GuardianAutofillCredential credential : loadPendingCredentials(context)) {
                array.put(credential.toJson());
            }
        } catch (Exception ignored) {
            return "[]";
        }
        return array.toString();
    }

    static void removePendingCredential(Context context, String id) throws Exception {
        String cleanId = id == null ? "" : id.trim();
        JSONArray remaining = new JSONArray();

        for (GuardianAutofillCredential credential : loadPendingCredentials(context)) {
            if (!credential.id.equals(cleanId)) {
                remaining.put(credential.toJson());
            }
        }

        saveEncryptedArray(context, ENCRYPTED_PENDING_CREDENTIALS, remaining);
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
            String credentialDomain = normalizeDomain(credential.webDomain);
            String credentialPackage = safeLower(credential.packageName);
            String titleDomain = normalizeDomain(credential.title);
            String targetText = safeLower(credential.website + " " + credential.webDomain);

            boolean domainMatches = !cleanDomain.isEmpty()
                    && ((!website.isEmpty() && domainsOverlap(website, cleanDomain))
                    || (!credentialDomain.isEmpty() && domainsOverlap(credentialDomain, cleanDomain))
                    || (!titleDomain.isEmpty() && domainsOverlap(titleDomain, cleanDomain)));

            boolean packageMatches = !cleanPackage.isEmpty()
                    && (cleanPackage.equals(credentialPackage)
                    || packageMatches(cleanPackage, targetText));

            if (domainMatches || packageMatches) {
                matches.add(credential);
            }
        }

        return matches;
    }

    private static boolean domainsOverlap(String first, String second) {
        return first.equals(second)
                || first.endsWith("." + second)
                || second.endsWith("." + first);
    }

    private static List<GuardianAutofillCredential> loadCredentialArray(
            Context context,
            String key
    ) {
        List<GuardianAutofillCredential> credentials = new ArrayList<>();

        for (JSONObject object : loadObjects(context, key)) {
            GuardianAutofillCredential credential = GuardianAutofillCredential.fromJson(object);
            if (!credential.password.isEmpty()) credentials.add(credential);
        }

        return credentials;
    }

    private static List<JSONObject> loadObjects(Context context, String key) {
        List<JSONObject> objects = new ArrayList<>();

        try {
            String encrypted = prefs(context).getString(key, "");
            if (encrypted == null || encrypted.trim().isEmpty()) return objects;

            JSONArray array = new JSONArray(decrypt(encrypted));
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.optJSONObject(i);
                if (object != null) objects.add(object);
            }
        } catch (Exception ignored) {
            return new ArrayList<>();
        }

        return objects;
    }

    private static JSONArray parseArray(String json) {
        try {
            return new JSONArray(json == null ? "[]" : json);
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void saveEncryptedArray(Context context, String key, JSONArray array) throws Exception {
        if (array.length() == 0) {
            prefs(context).edit().remove(key).apply();
            return;
        }

        String encrypted = encrypt(array.toString());
        prefs(context).edit().putString(key, encrypted).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String encrypt(String plainText) throws Exception {
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
        if (input.length <= IV_SIZE_BYTES) throw new IllegalArgumentException("Invalid encrypted autofill payload.");

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

        int portIndex = result.indexOf(':');
        if (portIndex >= 0) result = result.substring(0, portIndex);

        return result.trim();
    }

    private static boolean packageMatches(String packageName, String haystack) {
        if (packageName.trim().isEmpty() || haystack.trim().isEmpty()) return false;

        String[] ignored = {"com", "org", "net", "android", "app", "mobile", "google", "chrome"};
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
