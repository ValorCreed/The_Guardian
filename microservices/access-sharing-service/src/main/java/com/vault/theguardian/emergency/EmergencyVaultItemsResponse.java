package com.vault.theguardian.emergency;

import java.util.List;

public record EmergencyVaultItemsResponse(
        Long requestId,
        String ownerName,
        String ownerEmail,
        boolean passwordsAllowed,
        boolean cardsAllowed,
        boolean documentsAllowed,
        boolean notesAllowed,
        List<EmergencyVaultItemResponse> passwords,
        List<EmergencyVaultItemResponse> cards,
        List<EmergencyVaultItemResponse> documents,
        List<EmergencyVaultItemResponse> notes
) {}
