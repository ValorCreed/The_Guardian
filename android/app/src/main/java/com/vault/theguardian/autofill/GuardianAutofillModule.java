package com.vault.theguardian.autofill;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class GuardianAutofillModule extends ReactContextBaseJavaModule {
    public GuardianAutofillModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "GuardianAutofill";
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
}
