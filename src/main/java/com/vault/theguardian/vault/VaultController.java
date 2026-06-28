package com.vault.theguardian.vault;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vault")
@CrossOrigin
public class VaultController {

    private final VaultService vaultService;

    public VaultController(VaultService vaultService) {
        this.vaultService = vaultService;
    }

    @PostMapping
    public VaultResponse createVaultItem(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody VaultRequest request
    ) {
        return vaultService.createVaultItem(user, request);
    }

    @GetMapping
    public List<VaultResponse> getMyVaultItems(
            @AuthenticationPrincipal User user
    ) {
        return vaultService.getMyVaultItems(user);
    }

    @GetMapping("/{id}")
    public VaultResponse getVaultItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        return vaultService.getVaultItem(user, id);
    }

    @PutMapping("/{id}")
    public VaultResponse updateVaultItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @Valid @RequestBody VaultRequest request
    ) {
        return vaultService.updateVaultItem(user, id, request);
    }

    @DeleteMapping("/{id}")
    public void deleteVaultItem(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        vaultService.deleteVaultItem(user, id);
    }
}
