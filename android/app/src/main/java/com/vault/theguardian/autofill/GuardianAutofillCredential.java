package com.vault.theguardian.autofill;

import org.json.JSONObject;

class GuardianAutofillCredential {
    final String id;
    final String title;
    final String username;
    final String password;
    final String website;

    GuardianAutofillCredential(
            String id,
            String title,
            String username,
            String password,
            String website
    ) {
        this.id = value(id);
        this.title = value(title).trim().isEmpty() ? "Saved login" : value(title);
        this.username = value(username);
        this.password = value(password);
        this.website = value(website);
    }

    static GuardianAutofillCredential fromJson(JSONObject object) {
        return new GuardianAutofillCredential(
                object.optString("id", ""),
                object.optString("title", "Saved login"),
                object.optString("username", ""),
                object.optString("password", ""),
                object.optString("website", "")
        );
    }

    JSONObject toJson() throws org.json.JSONException {
        JSONObject object = new JSONObject();
        object.put("id", id);
        object.put("title", title);
        object.put("username", username);
        object.put("password", password);
        object.put("website", website);
        return object;
    }

    String presentationTitle() {
        if (!title.trim().isEmpty() && !username.trim().isEmpty()) return title + " · " + username;
        if (!title.trim().isEmpty()) return title;
        if (!website.trim().isEmpty()) return website;
        return "Saved login";
    }

    private static String value(String input) {
        return input == null ? "" : input.trim();
    }
}
