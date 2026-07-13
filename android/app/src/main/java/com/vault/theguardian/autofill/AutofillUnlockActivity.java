package com.vault.theguardian.autofill;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillManager;
import android.view.autofill.AutofillValue;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.service.autofill.Dataset;

import java.util.ArrayList;
import java.util.List;

public class AutofillUnlockActivity extends Activity {
    private static final int REQUEST_UNLOCK = 8107;

    private ArrayList<AutofillId> usernameIds = new ArrayList<>();
    private ArrayList<AutofillId> passwordIds = new ArrayList<>();
    private String packageName = "";
    private String webDomain = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        readIntentExtras();
        requireDeviceUnlockThenShowPicker();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_UNLOCK) {
            if (resultCode == RESULT_OK) {
                showCredentialPicker();
                return;
            }

            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @SuppressWarnings("deprecation")
    private void readIntentExtras() {
        Intent intent = getIntent();

        ArrayList<AutofillId> providedUsernameIds =
                intent.getParcelableArrayListExtra(GuardianAutofillService.EXTRA_USERNAME_IDS);
        ArrayList<AutofillId> providedPasswordIds =
                intent.getParcelableArrayListExtra(GuardianAutofillService.EXTRA_PASSWORD_IDS);

        if (providedUsernameIds != null) usernameIds = providedUsernameIds;
        if (providedPasswordIds != null) passwordIds = providedPasswordIds;

        packageName = intent.getStringExtra(GuardianAutofillService.EXTRA_PACKAGE_NAME);
        webDomain = intent.getStringExtra(GuardianAutofillService.EXTRA_WEB_DOMAIN);

        if (packageName == null) packageName = "";
        if (webDomain == null) webDomain = "";
    }

    private void requireDeviceUnlockThenShowPicker() {
        KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);

        if (keyguardManager != null && keyguardManager.isDeviceSecure()) {
            Intent unlockIntent = keyguardManager.createConfirmDeviceCredentialIntent(
                    "Unlock The Guardian",
                    "Confirm your screen lock to choose a saved login."
            );

            if (unlockIntent != null) {
                startActivityForResult(unlockIntent, REQUEST_UNLOCK);
                return;
            }
        }

        showCredentialPicker();
    }

    private void showCredentialPicker() {
        List<GuardianAutofillCredential> allCredentials = GuardianAutofillStore.loadCredentials(this);
        List<GuardianAutofillCredential> credentials = GuardianAutofillStore.filterCredentials(
                allCredentials,
                packageName,
                webDomain
        );

        if (credentials.isEmpty()) {
            showEmptyState();
            return;
        }

        ScrollView scrollView = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(28), dp(20), dp(24));
        root.setBackgroundColor(0xFFF5F7FA);
        scrollView.addView(root);

        TextView title = new TextView(this);
        title.setText("Choose a saved login");
        title.setTextSize(24);
        title.setTextColor(0xFF10251A);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(targetLabel());
        subtitle.setTextSize(14);
        subtitle.setTextColor(0xFF667085);
        subtitle.setPadding(0, dp(6), 0, dp(18));
        root.addView(subtitle);

        for (GuardianAutofillCredential credential : credentials) {
            root.addView(createCredentialRow(credential));
        }

        Button cancelButton = new Button(this);
        cancelButton.setText("Cancel");
        cancelButton.setAllCaps(false);
        cancelButton.setOnClickListener(view -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        root.addView(cancelButton);

        setContentView(scrollView);
    }

    private View createCredentialRow(GuardianAutofillCredential credential) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));
        row.setBackground(makeRoundedBackground(0xFFFFFFFF, 0xFFE2E8F0));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(0, 0, 0, dp(12));
        row.setLayoutParams(params);

        TextView title = new TextView(this);
        title.setText(credential.title);
        title.setTextSize(16);
        title.setTextColor(0xFF10251A);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        row.addView(title);

        TextView username = new TextView(this);
        username.setText(credential.username);
        username.setTextSize(13);
        username.setTextColor(0xFF667085);
        username.setPadding(0, dp(4), 0, 0);
        row.addView(username);

        if (!credential.website.trim().isEmpty()) {
            TextView website = new TextView(this);
            website.setText(credential.website);
            website.setTextSize(12);
            website.setTextColor(0xFF1D9E75);
            website.setPadding(0, dp(4), 0, 0);
            row.addView(website);
        }

        row.setOnClickListener(view -> returnCredential(credential));
        return row;
    }

    private void returnCredential(GuardianAutofillCredential credential) {
        try {
            Dataset.Builder builder = new Dataset.Builder(
                    GuardianAutofillService.createPresentation(this, credential.presentationTitle())
            );

            for (AutofillId id : usernameIds) {
                builder.setValue(
                        id,
                        AutofillValue.forText(credential.username),
                        GuardianAutofillService.createPresentation(this, credential.username)
                );
            }

            for (AutofillId id : passwordIds) {
                builder.setValue(
                        id,
                        AutofillValue.forText(credential.password),
                        GuardianAutofillService.createPresentation(this, credential.title)
                );
            }

            Intent result = new Intent();
            result.putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, builder.build());
            setResult(RESULT_OK, result);
        } catch (Exception error) {
            setResult(RESULT_CANCELED);
        }

        finish();
    }

    private void showEmptyState() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));
        root.setBackgroundColor(0xFFF5F7FA);

        TextView title = new TextView(this);
        title.setText("No synced logins");
        title.setTextSize(22);
        title.setTextColor(0xFF10251A);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView message = new TextView(this);
        message.setText("Open The Guardian → Settings → Auto-fill and sync your saved passwords for autofill.");
        message.setTextSize(14);
        message.setTextColor(0xFF667085);
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
            setResult(RESULT_CANCELED);
            finish();
        });
        root.addView(cancel);

        setContentView(root);
    }

    private void openGuardianAutofillScreen() {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("theguardian://autofill"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

        try {
            startActivity(intent);
        } catch (Exception ignored) {
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());

            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
            }
        }

        setResult(RESULT_CANCELED);
        finish();
    }

    private String targetLabel() {
        if (webDomain != null && !webDomain.trim().isEmpty()) return "For " + webDomain;
        if (packageName != null && !packageName.trim().isEmpty()) return "For " + packageName;
        return "The Guardian will fill the username and password fields.";
    }

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
