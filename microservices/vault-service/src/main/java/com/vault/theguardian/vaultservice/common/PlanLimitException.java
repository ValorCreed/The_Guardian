package com.vault.theguardian.vaultservice.common;

public class PlanLimitException extends RuntimeException {
    private final String feature;
    private final long limit;

    public PlanLimitException(String feature, long limit, String message) {
        super(message);
        this.feature = feature;
        this.limit = limit;
    }

    public String getFeature() { return feature; }
    public long getLimit() { return limit; }
}
