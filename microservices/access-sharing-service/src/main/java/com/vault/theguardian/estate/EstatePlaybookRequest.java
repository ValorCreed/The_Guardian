package com.vault.theguardian.estate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record EstatePlaybookRequest(
        @NotBlank(message = "Vault item type is required")
        String itemType,

        @NotNull(message = "Vault item is required")
        Long itemId,

        @NotBlank(message = "Action type is required")
        String actionType,

        @NotBlank(message = "Trigger type is required")
        String triggerType,

        Long recipientContactId,

        @Size(max = 4000, message = "Instructions must be 4000 characters or fewer")
        String instructions
) {}
