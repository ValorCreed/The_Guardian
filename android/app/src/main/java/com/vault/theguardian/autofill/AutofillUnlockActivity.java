package com.vault.theguardian.autofill;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.service.autofill.Dataset;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillManager;
import android.view.autofill.AutofillValue;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class AutofillUnlockActivity extends Activity {
    private static final int REQUEST_UNLOCK = 8107;

    private ArrayList<AutofillId> usernameIds = new ArrayList<>();
    private ArrayList<AutofillId> passwordIds = new ArrayList<>();
    private ArrayList<AutofillId> cardholderIds = new ArrayList<>();
    private ArrayList<AutofillId> cardNumberIds = new ArrayList<>();
    private ArrayList<AutofillId> expiryDateIds = new ArrayList<>();
    private ArrayList<AutofillId> expiryMonthIds = new ArrayList<>();
    private ArrayList<AutofillId> expiryYearIds = new ArrayList<>();
    private ArrayList<AutofillId> securityCodeIds = new ArrayList<>();

    private String fillKind = GuardianAutofillService.FILL_KIND_LOGIN;
    private String packageName = "";
    private String webDomain = "";
    private String appLabel = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        readIntentExtras();
        requireDeviceUnlockThenShowPicker();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_UNLOCK) {
            if (resultCode == RESULT_OK) {
                showPicker();
                return;
            }

            finishCancelled();
        }
    }

    @SuppressWarnings("deprecation")
    private void readIntentExtras() {
        Intent intent = getIntent();
        usernameIds = listExtra(intent, GuardianAutofillService.EXTRA_USERNAME_IDS);
        passwordIds = listExtra(intent, GuardianAutofillService.EXTRA_PASSWORD_IDS);
        cardholderIds = listExtra(intent, GuardianAutofillService.EXTRA_CARDHOLDER_IDS);
        cardNumberIds = listExtra(intent, GuardianAutofillService.EXTRA_CARD_NUMBER_IDS);
        expiryDateIds = listExtra(intent, GuardianAutofillService.EXTRA_EXPIRY_DATE_IDS);
        expiryMonthIds = listExtra(intent, GuardianAutofillService.EXTRA_EXPIRY_MONTH_IDS);
        expiryYearIds = listExtra(intent, GuardianAutofillService.EXTRA_EXPIRY_YEAR_IDS);
        securityCodeIds = listExtra(intent, GuardianAutofillService.EXTRA_SECURITY_CODE_IDS);

        fillKind = stringExtra(intent, GuardianAutofillService.EXTRA_FILL_KIND);
        packageName = stringExtra(intent, GuardianAutofillService.EXTRA_PACKAGE_NAME);
        webDomain = stringExtra(intent, GuardianAutofillService.EXTRA_WEB_DOMAIN);
        appLabel = stringExtra(intent, GuardianAutofillService.EXTRA_APP_LABEL);

        if (!GuardianAutofillService.FILL_KIND_CARD.equals(fillKind)) {
            fillKind = GuardianAutofillService.FILL_KIND_LOGIN;
        }
    }

    @SuppressWarnings("deprecation")
    private ArrayList<AutofillId> listExtra(Intent intent, String key) {
        ArrayList<AutofillId> values = intent.getParcelableArrayListExtra(key);
        return values == null ? new ArrayList<>() : values;
    }

    private String stringExtra(Intent intent, String key) {
        String value = intent.getStringExtra(key);
        return value == null ? "" : value;
    }

    private void requireDeviceUnlockThenShowPicker() {
        KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);

        if (keyguardManager == null || !keyguardManager.isDeviceSecure()) {
            showEmptyState(
                    "Screen lock required",
                    "Set a device PIN, password, fingerprint, or face unlock before using Guardian Autofill."
            );
            return;
        }

        String itemLabel = isCardFill() ? "saved card" : "saved login";
        Intent unlockIntent = keyguardManager.createConfirmDeviceCredentialIntent(
                "Unlock The Guardian",
                "Confirm your screen lock to choose a " + itemLabel + "."
        );

        if (unlockIntent == null) {
            cancelWithMessage("The Guardian could not start device authentication.");
            return;
        }

        startActivityForResult(unlockIntent, REQUEST_UNLOCK);
    }

    private void showPicker() {
        if (isCardFill()) {
            showCardPicker();
        } else {
            showCredentialPicker();
        }
    }

    private void showCredentialPicker() {
        List<GuardianAutofillCredential> allCredentials =
                GuardianAutofillStore.loadCredentials(this);
        List<GuardianAutofillCredential> matchingCredentials =
                GuardianAutofillStore.filterCredentials(
                        allCredentials,
                        packageName,
                        webDomain
                );

        if (allCredentials.isEmpty()) {
            showEmptyState(
                    "No synced logins",
                    "Open The Guardian → Settings → Auto-fill and sync your vault."
            );
            return;
        }

        /*
         * Relevant app/domain matches remain first for convenience, but the
         * user can always choose any saved login. This avoids locking users
         * out when a credential was saved with a different app title, package
         * name, or website.
         */
        List<GuardianAutofillCredential> orderedCredentials = new ArrayList<>();
        Set<String> addedIds = new HashSet<>();

        for (GuardianAutofillCredential credential : matchingCredentials) {
            if (addedIds.add(credential.id)) {
                orderedCredentials.add(credential);
            }
        }

        for (GuardianAutofillCredential credential : allCredentials) {
            if (addedIds.add(credential.id)) {
                orderedCredentials.add(credential);
            }
        }

        String subtitle = matchingCredentials.isEmpty()
                ? targetLabel() + " · All saved logins"
                : targetLabel() + " · Suggested first, all logins available";

        LinearLayout root = createPickerRoot("Choose a saved login", subtitle);
        for (GuardianAutofillCredential credential : orderedCredentials) {
            root.addView(createCredentialRow(credential));
        }
        addCancelButton(root);
    }

    private void showCardPicker() {
        List<GuardianAutofillCard> cards = GuardianAutofillStore.loadCards(this);

        if (cards.isEmpty()) {
            showEmptyState("No synced cards", "Open The Guardian → Settings → Auto-fill and sync your saved cards.");
            return;
        }

        LinearLayout root = createPickerRoot("Choose a saved card", targetLabel());
        for (GuardianAutofillCard card : cards) {
            root.addView(createCardRow(card));
        }
        addCancelButton(root);
    }

    private LinearLayout createPickerRoot(String titleText, String subtitleText) {
        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(28), dp(20), dp(24));
        root.setBackgroundColor(backgroundColor());
        scrollView.addView(root);

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(24);
        title.setTextColor(primaryTextColor());
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(subtitleText);
        subtitle.setTextSize(14);
        subtitle.setTextColor(secondaryTextColor());
        subtitle.setPadding(0, dp(6), 0, dp(18));
        root.addView(subtitle);

        setContentView(scrollView);
        return root;
    }

    private View createCredentialRow(GuardianAutofillCredential credential) {
        LinearLayout row = createRowContainer();
        String friendlyTitle = friendlyCredentialTitle(credential);

        TextView title = createRowTitle(friendlyTitle);
        row.addView(title);

        if (!credential.username.isEmpty()) {
            row.addView(createRowSubtitle(credential.username));
        }

        String friendlyTarget = friendlyTargetName(credential.website);
        if (!friendlyTarget.isEmpty() && !friendlyTarget.equalsIgnoreCase(friendlyTitle)) {
            TextView website = createRowSubtitle(friendlyTarget);
            website.setTextColor(0xFF1D9E75);
            row.addView(website);
        }

        row.setOnClickListener(view -> returnCredential(credential));
        return row;
    }

    private View createCardRow(GuardianAutofillCard card) {
        LinearLayout row = createRowContainer();
        row.addView(createRowTitle(card.presentationTitle()));

        if (!card.cardholderName.isEmpty()) {
            row.addView(createRowSubtitle(card.cardholderName));
        }

        if (!card.expiry.isEmpty()) {
            TextView expiry = createRowSubtitle("Expires " + card.expiry);
            expiry.setTextColor(0xFF1D9E75);
            row.addView(expiry);
        }

        row.setOnClickListener(view -> returnCard(card));
        return row;
    }

    private LinearLayout createRowContainer() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));
        row.setBackground(makeRoundedBackground(surfaceColor(), borderColor()));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(12));
        row.setLayoutParams(params);
        return row;
    }

    private TextView createRowTitle(String value) {
        TextView title = new TextView(this);
        title.setText(value);
        title.setTextSize(16);
        title.setTextColor(primaryTextColor());
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return title;
    }

    private TextView createRowSubtitle(String value) {
        TextView subtitle = new TextView(this);
        subtitle.setText(value);
        subtitle.setTextSize(13);
        subtitle.setTextColor(secondaryTextColor());
        subtitle.setPadding(0, dp(4), 0, 0);
        return subtitle;
    }

    private void returnCredential(GuardianAutofillCredential credential) {
        try {
            if (usernameIds.isEmpty() && passwordIds.isEmpty()) {
                cancelWithMessage("No fillable login fields were found.");
                return;
            }

            Dataset.Builder builder = new Dataset.Builder(
                    GuardianAutofillService.createPresentation(this, credential.presentationTitle())
            );

            if (!credential.username.isEmpty()) {
                for (AutofillId id : usernameIds) {
                    builder.setValue(
                            id,
                            AutofillValue.forText(credential.username),
                            GuardianAutofillService.createPresentation(this, credential.username)
                    );
                }
            }

            for (AutofillId id : passwordIds) {
                builder.setValue(
                        id,
                        AutofillValue.forText(credential.password),
                        GuardianAutofillService.createPresentation(
                                this,
                                friendlyCredentialTitle(credential)
                        )
                );
            }

            returnDataset(builder.build());
        } catch (Exception error) {
            cancelWithMessage("Could not return this login to Android Autofill.");
        }
    }

    private void returnCard(GuardianAutofillCard card) {
        try {
            if (cardNumberIds.isEmpty() && expiryDateIds.isEmpty()
                    && expiryMonthIds.isEmpty() && expiryYearIds.isEmpty()) {
                cancelWithMessage("No fillable card fields were found.");
                return;
            }

            Dataset.Builder builder = new Dataset.Builder(
                    GuardianAutofillService.createPresentation(this, card.presentationTitle())
            );

            setTextValues(builder, cardholderIds, card.cardholderName, card.presentationTitle());
            setTextValues(builder, cardNumberIds, card.cardNumber, card.presentationTitle());
            setTextValues(builder, expiryDateIds, card.expiry, card.presentationTitle());
            setTextValues(builder, expiryMonthIds, card.expiryMonth(), card.presentationTitle());
            setTextValues(builder, expiryYearIds, card.expiryYear(), card.presentationTitle());
            setTextValues(builder, securityCodeIds, card.cvv, card.presentationTitle());

            returnDataset(builder.build());
        } catch (Exception error) {
            cancelWithMessage("Could not return this card to Android Autofill.");
        }
    }

    private void setTextValues(
            Dataset.Builder builder,
            List<AutofillId> ids,
            String value,
            String label
    ) {
        if (value == null || value.trim().isEmpty()) return;
        for (AutofillId id : ids) {
            builder.setValue(
                    id,
                    AutofillValue.forText(value),
                    GuardianAutofillService.createPresentation(this, label)
            );
        }
    }

    private void returnDataset(Dataset dataset) {
        Intent result = new Intent();
        result.putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset);
        setResult(RESULT_OK, result);
        finish();
    }

    private void finishCancelled() {
        // Android 12 requires a non-null result Intent for Autofill
        // authentication activities, even when the user cancels.
        Intent result = new Intent();
        result.putExtras(Bundle.EMPTY);
        setResult(RESULT_CANCELED, result);
        finish();
    }

    private void addCancelButton(LinearLayout root) {
        Button cancelButton = new Button(this);
        cancelButton.setText("Cancel");
        cancelButton.setAllCaps(false);
        cancelButton.setOnClickListener(view -> {
            finishCancelled();
        });
        root.addView(cancelButton);
    }

    private void showEmptyState(String titleText, String messageText) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));
        root.setBackgroundColor(backgroundColor());

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(22);
        title.setTextColor(primaryTextColor());
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView message = new TextView(this);
        message.setText(messageText);
        message.setTextSize(14);
        message.setTextColor(secondaryTextColor());
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(10), 0, dp(18));
        root.addView(message);

        Button openApp = new Button(this);
        openApp.setText("Open The Guardian");
        openApp.setAllCaps(false);
        openApp.setOnClickListener(view -> openGuardianAutofillScreen());
        root.addView(openApp);

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setAllCaps(false);
        cancel.setOnClickListener(view -> {
            finishCancelled();
        });
        root.addView(cancel);

        setContentView(root);
    }

    private void cancelWithMessage(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        finishCancelled();
    }

    private void openGuardianAutofillScreen() {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("theguardian://autofill"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        try {
            startActivity(intent);
        } catch (Exception ignored) {
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
            }
        }

        finishCancelled();
    }

    private String targetLabel() {
        if (!appLabel.trim().isEmpty()) return "For " + appLabel.trim();

        String webLabel = friendlyTargetName(webDomain);
        if (!webLabel.isEmpty()) return "For " + webLabel;

        String appLabel = friendlyTargetName(packageName);
        if (!appLabel.isEmpty()) return "For " + appLabel;

        return isCardFill()
                ? "The Guardian will fill the detected payment fields."
                : "The Guardian will fill the detected login fields.";
    }

    private String friendlyCredentialTitle(GuardianAutofillCredential credential) {
        String title = friendlyTargetName(credential.title);
        if (!title.isEmpty()) return title;

        String target = friendlyTargetName(credential.website);
        return target.isEmpty() ? "Saved login" : target;
    }

    private String friendlyTargetName(String rawValue) {
        String value = rawValue == null ? "" : rawValue.trim();
        if (value.isEmpty()) return "";

        String normalized = value.toLowerCase(Locale.ROOT);
        if (normalized.equals("host.exp.exponent")
                || normalized.equals("com.exponent.group")
                || normalized.equals("com.exponent.app")) {
            return "Expo Go";
        }

        if (looksLikeAndroidPackage(normalized)) {
            String installedLabel = installedApplicationLabel(normalized);
            if (!installedLabel.isEmpty()) return installedLabel;
            return humanizeIdentifier(normalized);
        }

        String host = normalized
                .replaceFirst("^[a-z][a-z0-9+.-]*://", "")
                .replaceFirst("^www\\.", "")
                .split("/", 2)[0]
                .split("\\?", 2)[0]
                .split("#", 2)[0];

        if (looksLikeAndroidPackage(host)) {
            String installedLabel = installedApplicationLabel(host);
            if (!installedLabel.isEmpty()) return installedLabel;
            return humanizeIdentifier(host);
        }

        if (host.contains(".")) {
            String[] parts = host.split("\\.");
            if (parts.length >= 2) {
                return titleCase(parts[parts.length - 2]);
            }
        }

        return value;
    }

    private boolean looksLikeAndroidPackage(String value) {
        return value.matches("^(?:com|org|net|io|app|dev|me|co|host)(?:\\.[a-z][a-z0-9_]*){2,}$");
    }

    private String installedApplicationLabel(String applicationId) {
        try {
            PackageManager packageManager = getPackageManager();
            ApplicationInfo applicationInfo = packageManager.getApplicationInfo(applicationId, 0);
            CharSequence label = packageManager.getApplicationLabel(applicationInfo);
            return label == null ? "" : label.toString().trim();
        } catch (PackageManager.NameNotFoundException ignored) {
            return "";
        }
    }

    private String humanizeIdentifier(String value) {
        String[] segments = value.split("\\.");
        Set<String> generic = new HashSet<>();
        generic.add("app");
        generic.add("apps");
        generic.add("android");
        generic.add("mobile");
        generic.add("client");
        generic.add("group");
        generic.add("release");
        generic.add("prod");
        generic.add("production");
        generic.add("debug");
        generic.add("dev");

        for (int index = segments.length - 1; index >= 0; index--) {
            String segment = segments[index];
            if (!generic.contains(segment)) return titleCase(segment);
        }

        return segments.length == 0 ? "Saved app" : titleCase(segments[segments.length - 1]);
    }

    private String titleCase(String value) {
        String cleaned = value
                .replace('_', ' ')
                .replace('-', ' ')
                .trim();
        if (cleaned.isEmpty()) return "";

        StringBuilder result = new StringBuilder();
        for (String part : cleaned.split("\\s+")) {
            if (part.isEmpty()) continue;
            if (result.length() > 0) result.append(' ');
            result.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                result.append(part.substring(1).toLowerCase(Locale.ROOT));
            }
        }
        return result.toString();
    }

    private boolean isCardFill() {
        return GuardianAutofillService.FILL_KIND_CARD.equals(fillKind);
    }

    private boolean isDarkMode() {
        int mask = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mask == Configuration.UI_MODE_NIGHT_YES;
    }

    private int backgroundColor() { return isDarkMode() ? 0xFF07110C : 0xFFF5F7FA; }
    private int surfaceColor() { return isDarkMode() ? 0xFF102019 : 0xFFFFFFFF; }
    private int primaryTextColor() { return isDarkMode() ? 0xFFF4FFF9 : 0xFF10251A; }
    private int secondaryTextColor() { return isDarkMode() ? 0xFFA7B8AF : 0xFF667085; }
    private int borderColor() { return isDarkMode() ? 0xFF294238 : 0xFFE2E8F0; }

    private android.graphics.drawable.Drawable makeRoundedBackground(int fillColor, int strokeColor) {
        android.graphics.drawable.GradientDrawable drawable = new android.graphics.drawable.GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(dp(18));
        drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }
}
