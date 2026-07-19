package com.vault.theguardian.vaultservice.internal;

public record InternalDownloadedDocument(
        byte[] bytes,
        String fileName,
        String contentType
) {}
