package com.vault.theguardian.vaultservice.vault;

import com.vault.theguardian.vaultservice.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vault")
@CrossOrigin
public class VaultController {
    private final VaultService vaultService;

    public VaultController(VaultService vaultService) { this.vaultService = vaultService; }

    @PostMapping
    public VaultResponse create(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody VaultRequest request
    ) { return vaultService.createVaultItem(user.userId(), request); }

    @GetMapping
    public List<VaultResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return vaultService.getMyVaultItems(user.userId());
    }

    @GetMapping("/{id}")
    public VaultResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        return vaultService.getVaultItem(user.userId(), id);
    }

    @PutMapping("/{id}")
    public VaultResponse update(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long id,
            @Valid @RequestBody VaultRequest request
    ) { return vaultService.updateVaultItem(user.userId(), id, request); }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id
    ) {
        vaultService.deleteVaultItem(user.userId(), id);
        return ResponseEntity.noContent().build();
    }
}
