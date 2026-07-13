package com.vault.theguardian.autofill;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Intent;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillValue;
import android.widget.RemoteViews;

import com.vault.theguardian.R;

import java.util.ArrayList;
import java.util.List;

public class GuardianAutofillService extends AutofillService {
    public static final String EXTRA_USERNAME_IDS = "com.vault.theguardian.autofill.USERNAME_IDS";
    public static final String EXTRA_PASSWORD_IDS = "com.vault.theguardian.autofill.PASSWORD_IDS";
    public static final String EXTRA_PACKAGE_NAME = "com.vault.theguardian.autofill.PACKAGE_NAME";
    public static final String EXTRA_WEB_DOMAIN = "com.vault.theguardian.autofill.WEB_DOMAIN";

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

            ArrayList<AutofillId> usernameFields = new ArrayList<>();
            ArrayList<AutofillId> passwordFields = new ArrayList<>();
            PageMetadata metadata = new PageMetadata();

            findLoginFields(structure, usernameFields, passwordFields, metadata);

            if (usernameFields.isEmpty() && passwordFields.isEmpty()) {
                callback.onSuccess(null);
                return;
            }

            Intent authIntent = new Intent(this, AutofillUnlockActivity.class);
            authIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            authIntent.putParcelableArrayListExtra(EXTRA_USERNAME_IDS, usernameFields);
            authIntent.putParcelableArrayListExtra(EXTRA_PASSWORD_IDS, passwordFields);
            authIntent.putExtra(EXTRA_PACKAGE_NAME, metadata.packageName);
            authIntent.putExtra(EXTRA_WEB_DOMAIN, metadata.webDomain);

            PendingIntent pendingIntent = PendingIntent.getActivity(
                    this,
                    (int) System.currentTimeMillis(),
                    authIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            RemoteViews presentation = createPresentation("Unlock The Guardian");
            Dataset.Builder datasetBuilder = new Dataset.Builder(presentation);

            for (AutofillId id : usernameFields) {
                datasetBuilder.setValue(id, AutofillValue.forText(""), presentation);
            }

            for (AutofillId id : passwordFields) {
                datasetBuilder.setValue(id, AutofillValue.forText(""), presentation);
            }

            Dataset lockedDataset = datasetBuilder
                    .setAuthentication(pendingIntent.getIntentSender())
                    .build();

            FillResponse response = new FillResponse.Builder()
                    .addDataset(lockedDataset)
                    .build();

            callback.onSuccess(response);
        } catch (Exception error) {
            error.printStackTrace();
            callback.onSuccess(null);
        }
    }

    @Override
    public void onSaveRequest(SaveRequest request, SaveCallback callback) {
        callback.onSuccess();
    }

    static RemoteViews createPresentation(android.content.Context context, String text) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.autofill_dataset);
        views.setTextViewText(R.id.autofill_dataset_text, text);
        return views;
    }

    private RemoteViews createPresentation(String text) {
        return createPresentation(this, text);
    }

    private void findLoginFields(
            AssistStructure structure,
            ArrayList<AutofillId> usernameFields,
            ArrayList<AutofillId> passwordFields,
            PageMetadata metadata
    ) {
        if (structure.getActivityComponent() != null) {
            metadata.packageName = structure.getActivityComponent().getPackageName();
        }

        int windowCount = structure.getWindowNodeCount();

        for (int i = 0; i < windowCount; i++) {
            AssistStructure.WindowNode windowNode = structure.getWindowNodeAt(i);
            AssistStructure.ViewNode rootNode = windowNode.getRootViewNode();
            parseNode(rootNode, usernameFields, passwordFields, metadata);
        }
    }

    private void parseNode(
            AssistStructure.ViewNode node,
            ArrayList<AutofillId> usernameFields,
            ArrayList<AutofillId> passwordFields,
            PageMetadata metadata
    ) {
        if (node == null) return;

        AutofillId autofillId = node.getAutofillId();

        String hint = joinHints(node.getAutofillHints());
        String idEntry = safeLower(node.getIdEntry());
        String hintText = safeLower(String.valueOf(node.getHint()));
        String text = safeLower(String.valueOf(node.getText()));
        String className = safeLower(String.valueOf(node.getClassName()));
        String webDomain = safeLower(node.getWebDomain());

        if (!webDomain.trim().isEmpty() && metadata.webDomain.trim().isEmpty()) {
            metadata.webDomain = webDomain;
        }

        String combined = hint + " " + idEntry + " " + hintText + " " + text + " " + className;

        if (autofillId != null) {
            if (isPasswordField(combined)) {
                if (!passwordFields.contains(autofillId)) passwordFields.add(autofillId);
            } else if (isUsernameField(combined)) {
                if (!usernameFields.contains(autofillId)) usernameFields.add(autofillId);
            }
        }

        int childCount = node.getChildCount();

        for (int i = 0; i < childCount; i++) {
            parseNode(node.getChildAt(i), usernameFields, passwordFields, metadata);
        }
    }

    private boolean isUsernameField(String value) {
        return value.contains("username")
                || value.contains("user")
                || value.contains("email")
                || value.contains("e-mail")
                || value.contains("login")
                || value.contains("account")
                || value.contains("phone");
    }

    private boolean isPasswordField(String value) {
        return value.contains("password")
                || value.contains("passwd")
                || value.contains("passcode")
                || value.contains("pin");
    }

    private String joinHints(String[] hints) {
        if (hints == null || hints.length == 0) return "";

        StringBuilder builder = new StringBuilder();

        for (String hint : hints) {
            if (hint != null) builder.append(hint.toLowerCase()).append(" ");
        }

        return builder.toString();
    }

    private String safeLower(String value) {
        if (value == null || value.equals("null")) return "";
        return value.toLowerCase();
    }

    private static class PageMetadata {
        String packageName = "";
        String webDomain = "";
    }
}
