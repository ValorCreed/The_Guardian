package com.vault.theguardian.autofill;

import org.json.JSONObject;

class GuardianAutofillCard {
    final String id;
    final String title;
    final String cardholderName;
    final String cardNumber;
    final String expiry;
    final String cvv;
    final String brand;
    final String last4;

    GuardianAutofillCard(
            String id,
            String title,
            String cardholderName,
            String cardNumber,
            String expiry,
            String cvv,
            String brand,
            String last4
    ) {
        this.id = value(id);
        this.title = value(title).isEmpty() ? "Saved card" : value(title);
        this.cardholderName = value(cardholderName);
        this.cardNumber = digits(cardNumber);
        this.expiry = normalizeExpiry(expiry);
        this.cvv = digits(cvv);
        this.brand = value(brand);
        String suppliedLast4 = digits(last4);
        this.last4 = !suppliedLast4.isEmpty()
                ? suppliedLast4.substring(Math.max(0, suppliedLast4.length() - 4))
                : this.cardNumber.substring(Math.max(0, this.cardNumber.length() - 4));
    }

    static GuardianAutofillCard fromJson(JSONObject object) {
        return new GuardianAutofillCard(
                object.optString("id", ""),
                object.optString("title", object.optString("cardName", "Saved card")),
                object.optString("cardholderName", ""),
                object.optString("cardNumber", ""),
                object.optString("expiry", ""),
                object.optString("cvv", ""),
                object.optString("brand", ""),
                object.optString("last4", "")
        );
    }

    JSONObject toJson() throws org.json.JSONException {
        JSONObject object = new JSONObject();
        object.put("id", id);
        object.put("title", title);
        object.put("cardholderName", cardholderName);
        object.put("cardNumber", cardNumber);
        object.put("expiry", expiry);
        object.put("cvv", cvv);
        object.put("brand", brand);
        object.put("last4", last4);
        return object;
    }

    String presentationTitle() {
        String suffix = last4.isEmpty() ? "" : " •••• " + last4;
        if (!brand.isEmpty()) return brand + suffix;
        if (!title.isEmpty()) return title + suffix;
        return "Saved card" + suffix;
    }

    String expiryMonth() {
        String[] parts = expiry.split("/");
        return parts.length > 0 ? parts[0] : "";
    }

    String expiryYear() {
        String[] parts = expiry.split("/");
        if (parts.length < 2) return "";
        String year = digits(parts[1]);
        if (year.length() == 2) return "20" + year;
        return year;
    }

    String expiryShortYear() {
        String year = expiryYear();
        return year.length() >= 2 ? year.substring(year.length() - 2) : year;
    }

    private static String normalizeExpiry(String input) {
        String value = value(input).replace("-", "/").replace(" ", "");
        if (value.contains("/")) {
            String[] parts = value.split("/");
            String month = parts.length > 0 ? digits(parts[0]) : "";
            String year = parts.length > 1 ? digits(parts[1]) : "";
            if (month.length() == 1) month = "0" + month;
            if (year.length() == 4) year = year.substring(2);
            if (!month.isEmpty() && !year.isEmpty()) return month + "/" + year;
        }

        String compact = digits(value);
        if (compact.length() >= 4) {
            String month = compact.substring(0, 2);
            String year = compact.substring(compact.length() - 2);
            return month + "/" + year;
        }
        return value;
    }

    private static String digits(String input) {
        return value(input).replaceAll("\\D", "");
    }

    private static String value(String input) {
        return input == null ? "" : input.trim();
    }
}
