package com.vault.theguardian.autofill;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class GuardianAutofillModule extends ReactContextBaseJavaModule {
    public GuardianAutofillModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "GuardianAutofill";
    }

    @ReactMethod
    public void syncVaultData(String credentialsJson, String cardsJson, Promise promise) {
        try {
            GuardianAutofillStore.saveCredentials(getReactApplicationContext(), credentialsJson);
            GuardianAutofillStore.saveCards(getReactApplicationContext(), cardsJson);
            promise.resolve(buildCounts());
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_SYNC_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void syncCredentials(String credentialsJson, Promise promise) {
        try {
            GuardianAutofillStore.saveCredentials(getReactApplicationContext(), credentialsJson);
            promise.resolve(GuardianAutofillStore.countCredentials(getReactApplicationContext()));
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_SYNC_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void syncCards(String cardsJson, Promise promise) {
        try {
            GuardianAutofillStore.saveCards(getReactApplicationContext(), cardsJson);
            promise.resolve(GuardianAutofillStore.countCards(getReactApplicationContext()));
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_CARD_SYNC_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void clearCredentials(Promise promise) {
        try {
            GuardianAutofillStore.clearCredentials(getReactApplicationContext());
            promise.resolve(true);
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_CLEAR_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void getCredentialCount(Promise promise) {
        try {
            promise.resolve(GuardianAutofillStore.countCredentials(getReactApplicationContext()));
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_COUNT_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void getCardCount(Promise promise) {
        try {
            promise.resolve(GuardianAutofillStore.countCards(getReactApplicationContext()));
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_CARD_COUNT_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void getCounts(Promise promise) {
        try {
            promise.resolve(buildCounts());
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_COUNT_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void getPendingSavedCredentials(Promise promise) {
        try {
            promise.resolve(GuardianAutofillStore.pendingCredentialsJson(getReactApplicationContext()));
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_PENDING_READ_FAILED", error.getMessage(), error);
        }
    }

    @ReactMethod
    public void removePendingSavedCredential(String id, Promise promise) {
        try {
            GuardianAutofillStore.removePendingCredential(getReactApplicationContext(), id);
            promise.resolve(true);
        } catch (Exception error) {
            promise.reject("GUARDIAN_AUTOFILL_PENDING_REMOVE_FAILED", error.getMessage(), error);
        }
    }

    private WritableMap buildCounts() {
        WritableMap result = Arguments.createMap();
        result.putInt("credentials", GuardianAutofillStore.countCredentials(getReactApplicationContext()));
        result.putInt("cards", GuardianAutofillStore.countCards(getReactApplicationContext()));
        result.putInt("pending", GuardianAutofillStore.loadPendingCredentials(getReactApplicationContext()).size());
        return result;
    }
}
