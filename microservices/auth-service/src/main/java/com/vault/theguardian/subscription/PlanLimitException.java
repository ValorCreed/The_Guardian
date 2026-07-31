package com.vault.theguardian.subscription;

public class PlanLimitException extends RuntimeException {
    private final String code;
    private final String feature;
    private final long limit;

    public PlanLimitException(String feature, long limit, String message) {
        super(message);
        this.code = "PLAN_LIMIT_REACHED";
        this.feature = feature;
        this.limit = limit;
    }

    public String getCode() {
        return code;
    }

    public String getFeature() {
        return feature;
    }

    public long getLimit() {
        return limit;
    }
}
