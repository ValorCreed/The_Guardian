package com.vault.theguardian.autofill;

import org.json.JSONObject;

import java.util.Locale;
import java.util.UUID;

class GuardianAutofillCredential {
    final String id;
    final String title;
    final String username;
    final String password;
    final String website;
    final String packageName;
    final String webDomain;
    final long capturedAt;

    GuardianAutofillCredential(
            String id,
            String title,
            String username,
            String password,
            String website
    ) {
        this(id, title, username, password, website, "", "", 0L);
    }

    GuardianAutofillCredential(
            String id,
            String title,
            String username,
            String password,
            String website,
            String packageName,
            String webDomain,
            long capturedAt
    ) {
        this.id = value(id).isEmpty() ? "pending-" + UUID.randomUUID() : value(id);
        this.title = value(title).isEmpty() ? "Saved login" : value(title);
        this.username = value(username);
        this.password = value(password);
        this.website = value(website);
        this.packageName = value(packageName);
        this.webDomain = value(webDomain);
        this.capturedAt = capturedAt > 0 ? capturedAt : System.currentTimeMillis();
    }

    static GuardianAutofillCredential fromJson(JSONObject object) {
        return new GuardianAutofillCredential(
                object.optString("id", ""),
                object.optString("title", "Saved login"),
                object.optString("username", ""),
                object.optString("password", ""),
                object.optString("website", ""),
                object.optString("packageName", ""),
                object.optString("webDomain", ""),
                object.optLong("capturedAt", 0L)
        );
    }

    JSONObject toJson() throws org.json.JSONException {
        JSONObject object = new JSONObject();
        object.put("id", id);
        object.put("title", title);
        object.put("username", username);
        object.put("password", password);
        object.put("website", website);
        object.put("packageName", packageName);
        object.put("webDomain", webDomain);
        object.put("capturedAt", capturedAt);
        return object;
    }

    String presentationTitle() {
        if (!title.isEmpty() && !username.isEmpty()) return title + " · " + username;
        if (!title.isEmpty()) return title;
        if (!website.isEmpty()) return website;
        return "Saved login";
    }

    String matchKey() {
        String target = normalizeTarget(!webDomain.isEmpty() ? webDomain : website);
        if (target.isEmpty()) target = normalizeTarget(packageName);
        return username.toLowerCase(Locale.ROOT) + "|" + target;
    }

    private static String normalizeTarget(String input) {
        String result = value(input).toLowerCase(Locale.ROOT)
                .replace("https://", "")
                .replace("http://", "")
                .replace("www.", "");
        int slash = result.indexOf('/');
        if (slash >= 0) result = result.substring(0, slash);
        return result.trim();
    }

    private static String value(String input) {
        return input == null ? "" : input.trim();
    }
}
