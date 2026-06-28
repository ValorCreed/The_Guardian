package com.vault.theguardian.family;

import java.util.List;

public record SharedFamilyItemsResponse(
        List<SharedPasswordItemResponse> passwords,
        List<SharedCardItemResponse> cards,
        List<SharedDocumentItemResponse> documents
) {}
