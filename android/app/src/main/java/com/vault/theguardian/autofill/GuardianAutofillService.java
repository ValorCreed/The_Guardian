package com.vault.theguardian.autofill;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveInfo;
import android.service.autofill.SaveRequest;
import android.text.InputType;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import com.vault.theguardian.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class GuardianAutofillService extends AutofillService {
    public static final String EXTRA_FILL_KIND = "com.vault.theguardian.autofill.FILL_KIND";
    public static final String FILL_KIND_LOGIN = "LOGIN";
    public static final String FILL_KIND_CARD = "CARD";

    public static final String EXTRA_USERNAME_IDS = "com.vault.theguardian.autofill.USERNAME_IDS";
    public static final String EXTRA_PASSWORD_IDS = "com.vault.theguardian.autofill.PASSWORD_IDS";
    public static final String EXTRA_CARDHOLDER_IDS = "com.vault.theguardian.autofill.CARDHOLDER_IDS";
    public static final String EXTRA_CARD_NUMBER_IDS = "com.vault.theguardian.autofill.CARD_NUMBER_IDS";
    public static final String EXTRA_EXPIRY_DATE_IDS = "com.vault.theguardian.autofill.EXPIRY_DATE_IDS";
    public static final String EXTRA_EXPIRY_MONTH_IDS = "com.vault.theguardian.autofill.EXPIRY_MONTH_IDS";
    public static final String EXTRA_EXPIRY_YEAR_IDS = "com.vault.theguardian.autofill.EXPIRY_YEAR_IDS";
    public static final String EXTRA_SECURITY_CODE_IDS = "com.vault.theguardian.autofill.SECURITY_CODE_IDS";
    public static final String EXTRA_PACKAGE_NAME = "com.vault.theguardian.autofill.PACKAGE_NAME";
    public static final String EXTRA_WEB_DOMAIN = "com.vault.theguardian.autofill.WEB_DOMAIN";
    public static final String EXTRA_APP_LABEL = "com.vault.theguardian.autofill.APP_LABEL";

    @Override
    public void onFillRequest(
            FillRequest request,
            CancellationSignal cancellationSignal,
            FillCallback callback
    ) {
        try {
            List<FillContext> fillContexts = request.getFillContexts();
            if (fillContexts == null || fillContexts.isEmpty()) {
                callback.onSuccess(null);
                return;
            }

            AssistStructure structure = fillContexts.get(fillContexts.size() - 1).getStructure();
            FieldCollection fields = new FieldCollection();
            PageMetadata metadata = new PageMetadata();
            findFields(structure, fields, metadata, null);

            if (!fields.hasLoginFields() && !fields.hasCardFields()) {
                callback.onSuccess(null);
                return;
            }

            FillResponse.Builder responseBuilder = new FillResponse.Builder();
            boolean hasDataset = false;

            if (fields.hasLoginFields()) {
                responseBuilder.addDataset(createLockedDataset(
                        fields.loginIds(),
                        createAuthIntent(fields, metadata, FILL_KIND_LOGIN),
                        "Unlock The Guardian logins"
                ));
                hasDataset = true;

                if (!metadata.packageName.equals(getPackageName()) && !fields.passwordIds.isEmpty()) {
                    int saveTypes = SaveInfo.SAVE_DATA_TYPE_PASSWORD;
                    if (!fields.usernameIds.isEmpty()) {
                        saveTypes |= SaveInfo.SAVE_DATA_TYPE_USERNAME;
                    }

                    SaveInfo.Builder saveBuilder = new SaveInfo.Builder(
                            saveTypes,
                            fields.passwordIds.toArray(new AutofillId[0])
                    )
                            .setDescription("Save this login to The Guardian")
                            .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE);

                    // Username fields are optional so password-only forms and
                    // multi-step sign-in flows can still trigger Android's save UI.
                    if (!fields.usernameIds.isEmpty()) {
                        saveBuilder.setOptionalIds(
                                fields.usernameIds.toArray(new AutofillId[0])
                        );
                    }

                    responseBuilder.setSaveInfo(saveBuilder.build());
                }
            }

            if (fields.hasCardFields()) {
                responseBuilder.addDataset(createLockedDataset(
                        fields.cardIds(),
                        createAuthIntent(fields, metadata, FILL_KIND_CARD),
                        "Unlock The Guardian cards"
                ));
                hasDataset = true;
            }

            callback.onSuccess(hasDataset ? responseBuilder.build() : null);
        } catch (Exception error) {
            error.printStackTrace();
            callback.onSuccess(null);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        try {
            List<FillContext> contexts = request.getFillContexts();
            if (contexts == null || contexts.isEmpty()) {
                callback.onSuccess();
                return;
            }

            PageMetadata metadata = new PageMetadata();
            CapturedLogin captured = new CapturedLogin();

            // SaveRequest can contain multiple FillContext objects when a site
            // collects the username and password on separate screens. Traverse
            // every context so the queued Guardian login contains both values.
            for (FillContext context : contexts) {
                findFields(context.getStructure(), new FieldCollection(), metadata, captured);
            }

            if (metadata.packageName.equals(getPackageName()) || captured.password.isEmpty()) {
                callback.onSuccess();
                return;
            }

            String target = !metadata.webDomain.isEmpty()
                    ? metadata.webDomain
                    : metadata.packageName;
            String title = readableTarget(metadata);

            GuardianAutofillCredential credential = new GuardianAutofillCredential(
                    "",
                    title,
                    captured.username,
                    captured.password,
                    target,
                    metadata.packageName,
                    metadata.webDomain,
                    System.currentTimeMillis()
            );

            GuardianAutofillStore.enqueuePendingCredential(this, credential);
            callback.onSuccess();
        } catch (Exception error) {
            error.printStackTrace();
            callback.onFailure("The Guardian could not securely save this login.");
        }
    }

    static RemoteViews createPresentation(android.content.Context context, String text) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.autofill_dataset);
        views.setTextViewText(R.id.autofill_dataset_text, text);
        return views;
    }

    private Dataset createLockedDataset(
            List<AutofillId> ids,
            Intent authIntent,
            String label
    ) {
        int flags = PendingIntent.FLAG_CANCEL_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                (int) (System.nanoTime() & 0x7fffffff),
                authIntent,
                flags
        );

        RemoteViews presentation = createPresentation(this, label);
        Dataset.Builder builder = new Dataset.Builder(presentation);
        for (AutofillId id : ids) {
            builder.setValue(id, null, presentation);
        }

        return builder.setAuthentication(pendingIntent.getIntentSender()).build();
    }

    private Intent createAuthIntent(
            FieldCollection fields,
            PageMetadata metadata,
            String fillKind
    ) {
        Intent intent = new Intent(this, AutofillUnlockActivity.class);
        intent.putExtra(EXTRA_FILL_KIND, fillKind);
        intent.putParcelableArrayListExtra(EXTRA_USERNAME_IDS, fields.usernameIds);
        intent.putParcelableArrayListExtra(EXTRA_PASSWORD_IDS, fields.passwordIds);
        intent.putParcelableArrayListExtra(EXTRA_CARDHOLDER_IDS, fields.cardholderIds);
        intent.putParcelableArrayListExtra(EXTRA_CARD_NUMBER_IDS, fields.cardNumberIds);
        intent.putParcelableArrayListExtra(EXTRA_EXPIRY_DATE_IDS, fields.expiryDateIds);
        intent.putParcelableArrayListExtra(EXTRA_EXPIRY_MONTH_IDS, fields.expiryMonthIds);
        intent.putParcelableArrayListExtra(EXTRA_EXPIRY_YEAR_IDS, fields.expiryYearIds);
        intent.putParcelableArrayListExtra(EXTRA_SECURITY_CODE_IDS, fields.securityCodeIds);
        intent.putExtra(EXTRA_PACKAGE_NAME, metadata.packageName);
        intent.putExtra(EXTRA_WEB_DOMAIN, metadata.webDomain);
        intent.putExtra(EXTRA_APP_LABEL, readableTarget(metadata));
        return intent;
    }

    private void findFields(
            AssistStructure structure,
            FieldCollection fields,
            PageMetadata metadata,
            CapturedLogin captured
    ) {
        if (structure.getActivityComponent() != null) {
            metadata.packageName = safeLower(structure.getActivityComponent().getPackageName());
        }

        for (int i = 0; i < structure.getWindowNodeCount(); i++) {
            parseNode(structure.getWindowNodeAt(i).getRootViewNode(), fields, metadata, captured);
        }
    }

    private void parseNode(
            AssistStructure.ViewNode node,
            FieldCollection fields,
            PageMetadata metadata,
            CapturedLogin captured
    ) {
        if (node == null) return;

        String webDomain = safeLower(node.getWebDomain());
        if (!webDomain.isEmpty() && metadata.webDomain.isEmpty()) {
            metadata.webDomain = webDomain;
        }

        AutofillId id = node.getAutofillId();
        FieldKind kind = classify(node);

        if (id != null) {
            fields.add(kind, id);
        }

        if (captured != null) {
            String value = nodeValue(node);
            if (!value.isEmpty()) {
                if (kind == FieldKind.USERNAME && captured.username.isEmpty()) {
                    captured.username = value;
                } else if (kind == FieldKind.PASSWORD && isUsablePasswordValue(value)) {
                    // The final non-empty password is normally the new/confirmed password.
                    // Ignore masked accessibility text such as "••••••" so it is never
                    // committed to the vault as though it were the real password.
                    captured.password = value;
                }
            }
        }

        for (int i = 0; i < node.getChildCount(); i++) {
            parseNode(node.getChildAt(i), fields, metadata, captured);
        }
    }

    private FieldKind classify(AssistStructure.ViewNode node) {
        String hints = joinHints(node.getAutofillHints());
        String idEntry = safeLower(node.getIdEntry());
        String hintText = safeLower(String.valueOf(node.getHint()));
        String className = safeLower(String.valueOf(node.getClassName()));
        String combined = hints + " " + idEntry + " " + hintText + " " + className;
        String compact = combined.replace("_", "").replace("-", "").replace(" ", "");

        if (containsAny(compact,
                "creditcardsecuritycode", "securitycode", "cardsecuritycode",
                "cccsc", "cvv", "cvc", "cvn")) {
            return FieldKind.CARD_SECURITY_CODE;
        }

        if (containsAny(compact,
                "creditcardexpirationmonth", "expirationmonth", "expirymonth",
                "ccmonth", "expmonth")) {
            return FieldKind.CARD_EXPIRY_MONTH;
        }

        if (containsAny(compact,
                "creditcardexpirationyear", "expirationyear", "expiryyear",
                "ccyear", "expyear")) {
            return FieldKind.CARD_EXPIRY_YEAR;
        }

        if (containsAny(compact,
                "creditcardexpirationdate", "expirationdate", "expirydate",
                "ccexp", "cardexpiry", "cardexpiration")) {
            return FieldKind.CARD_EXPIRY_DATE;
        }

        if (containsAny(compact,
                "creditcardnumber", "cardnumber", "ccnumber", "ccnum",
                "paymentcardnumber")) {
            return FieldKind.CARD_NUMBER;
        }

        if (containsAny(compact,
                "creditcardname", "cardholdername", "nameoncard", "ccname")) {
            return FieldKind.CARDHOLDER;
        }

        // Verification and one-time-code fields must never be captured as
        // reusable passwords by the Android save flow.
        if (containsAny(compact,
                "onetimecode", "otp", "verificationcode", "2facode",
                "authenticationcode", "authcode", "smscode")) {
            return FieldKind.OTHER;
        }

        int inputType = node.getInputType();
        int variation = inputType & InputType.TYPE_MASK_VARIATION;
        boolean passwordInput = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD;

        if (passwordInput || containsAny(compact,
                "newpassword", "currentpassword", "password", "passwd")) {
            return FieldKind.PASSWORD;
        }

        if (containsAny(compact,
                "username", "emailaddress", "email", "loginid", "userid",
                "accountname", "accountid", "phonenumber")) {
            return FieldKind.USERNAME;
        }

        return FieldKind.OTHER;
    }

    private String nodeValue(AssistStructure.ViewNode node) {
        AutofillValue autofillValue = node.getAutofillValue();
        if (autofillValue != null && autofillValue.isText() && autofillValue.getTextValue() != null) {
            return autofillValue.getTextValue().toString().trim();
        }

        CharSequence text = node.getText();
        return text == null ? "" : text.toString().trim();
    }

    private boolean containsAny(String value, String... tokens) {
        for (String token : tokens) {
            if (value.contains(token)) return true;
        }
        return false;
    }

    private String joinHints(String[] hints) {
        if (hints == null || hints.length == 0) return "";
        StringBuilder builder = new StringBuilder();
        for (String hint : hints) {
            if (hint != null) builder.append(hint.toLowerCase(Locale.ROOT)).append(' ');
        }
        return builder.toString();
    }

    private String readableTarget(PageMetadata metadata) {
        if (metadata != null && !metadata.webDomain.isEmpty()) {
            return readableDomain(metadata.webDomain);
        }

        String packageName = metadata == null ? "" : metadata.packageName;
        String applicationLabel = getApplicationLabel(packageName);
        if (!applicationLabel.isEmpty()) return applicationLabel;

        return humanizePackageName(packageName);
    }

    private String getApplicationLabel(String packageName) {
        String cleanPackage = packageName == null ? "" : packageName.trim();
        if (cleanPackage.isEmpty()) return "";

        try {
            PackageManager packageManager = getPackageManager();
            ApplicationInfo applicationInfo = packageManager.getApplicationInfo(cleanPackage, 0);
            CharSequence label = packageManager.getApplicationLabel(applicationInfo);
            return label == null ? "" : label.toString().trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    private String readableDomain(String target) {
        String clean = target == null ? "" : target.trim().toLowerCase(Locale.ROOT);
        if (clean.isEmpty()) return "Saved login";

        clean = clean.replace("https://", "").replace("http://", "").replace("www.", "");
        int slash = clean.indexOf('/');
        if (slash >= 0) clean = clean.substring(0, slash);

        String[] parts = clean.split("\\.");
        if (parts.length == 0) return "Saved login";

        int candidateIndex = Math.max(0, parts.length - 2);
        String candidate = parts[candidateIndex];
        if ((candidate.equals("accounts") || candidate.equals("login") || candidate.equals("auth"))
                && candidateIndex > 0) {
            candidate = parts[candidateIndex - 1];
        }

        return titleCase(candidate);
    }

    private String humanizePackageName(String packageName) {
        String clean = safeLower(packageName);
        if (clean.isEmpty()) return "Saved login";
        if (clean.equals("host.exp.exponent")) return "Expo Go";

        String[] parts = clean.split("\\.");
        String candidate = parts.length == 0 ? clean : parts[parts.length - 1];
        if ((candidate.equals("app") || candidate.equals("mobile") || candidate.equals("android"))
                && parts.length > 1) {
            candidate = parts[parts.length - 2];
        }

        return titleCase(candidate);
    }

    private String titleCase(String value) {
        String clean = value == null ? "" : value.trim().replace('_', ' ').replace('-', ' ');
        if (clean.isEmpty()) return "Saved login";

        StringBuilder result = new StringBuilder();
        for (String part : clean.split("\\s+")) {
            if (part.isEmpty()) continue;
            if (result.length() > 0) result.append(' ');
            result.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) result.append(part.substring(1).toLowerCase(Locale.ROOT));
        }
        return result.length() == 0 ? "Saved login" : result.toString();
    }

    private boolean isUsablePasswordValue(String value) {
        String clean = value == null ? "" : value.trim();
        if (clean.isEmpty()) return false;

        // Android and some WebViews expose redacted password text using only
        // repeated mask glyphs. Real mixed passwords must continue to pass.
        return !clean.matches("^[•●▪◦*\\u2022\\u25CF\\u25AA]+$");
    }

    private String safeLower(String value) {
        if (value == null || value.equals("null")) return "";
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private enum FieldKind {
        USERNAME,
        PASSWORD,
        CARDHOLDER,
        CARD_NUMBER,
        CARD_EXPIRY_DATE,
        CARD_EXPIRY_MONTH,
        CARD_EXPIRY_YEAR,
        CARD_SECURITY_CODE,
        OTHER
    }

    private static class CapturedLogin {
        String username = "";
        String password = "";
    }

    private static class PageMetadata {
        String packageName = "";
        String webDomain = "";
    }

    private static class FieldCollection {
        final ArrayList<AutofillId> usernameIds = new ArrayList<>();
        final ArrayList<AutofillId> passwordIds = new ArrayList<>();
        final ArrayList<AutofillId> cardholderIds = new ArrayList<>();
        final ArrayList<AutofillId> cardNumberIds = new ArrayList<>();
        final ArrayList<AutofillId> expiryDateIds = new ArrayList<>();
        final ArrayList<AutofillId> expiryMonthIds = new ArrayList<>();
        final ArrayList<AutofillId> expiryYearIds = new ArrayList<>();
        final ArrayList<AutofillId> securityCodeIds = new ArrayList<>();

        void add(FieldKind kind, AutofillId id) {
            if (kind == FieldKind.USERNAME) addUnique(usernameIds, id);
            else if (kind == FieldKind.PASSWORD) addUnique(passwordIds, id);
            else if (kind == FieldKind.CARDHOLDER) addUnique(cardholderIds, id);
            else if (kind == FieldKind.CARD_NUMBER) addUnique(cardNumberIds, id);
            else if (kind == FieldKind.CARD_EXPIRY_DATE) addUnique(expiryDateIds, id);
            else if (kind == FieldKind.CARD_EXPIRY_MONTH) addUnique(expiryMonthIds, id);
            else if (kind == FieldKind.CARD_EXPIRY_YEAR) addUnique(expiryYearIds, id);
            else if (kind == FieldKind.CARD_SECURITY_CODE) addUnique(securityCodeIds, id);
        }

        boolean hasLoginFields() {
            return !passwordIds.isEmpty();
        }

        boolean hasCardFields() {
            return !cardNumberIds.isEmpty()
                    || (!expiryDateIds.isEmpty() && !cardholderIds.isEmpty())
                    || (!expiryMonthIds.isEmpty() && !expiryYearIds.isEmpty());
        }

        ArrayList<AutofillId> loginIds() {
            ArrayList<AutofillId> ids = new ArrayList<>();
            ids.addAll(usernameIds);
            ids.addAll(passwordIds);
            return ids;
        }

        ArrayList<AutofillId> cardIds() {
            ArrayList<AutofillId> ids = new ArrayList<>();
            ids.addAll(cardholderIds);
            ids.addAll(cardNumberIds);
            ids.addAll(expiryDateIds);
            ids.addAll(expiryMonthIds);
            ids.addAll(expiryYearIds);
            ids.addAll(securityCodeIds);
            return ids;
        }

        private static void addUnique(ArrayList<AutofillId> list, AutofillId id) {
            if (!list.contains(id)) list.add(id);
        }
    }
}
