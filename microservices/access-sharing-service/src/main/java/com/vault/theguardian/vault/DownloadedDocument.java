package com.vault.theguardian.vault;

public record DownloadedDocument(byte[] bytes, String fileName, String contentType) {}
