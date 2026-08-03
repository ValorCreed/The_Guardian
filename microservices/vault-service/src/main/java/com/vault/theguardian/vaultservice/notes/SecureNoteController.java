package com.vault.theguardian.vaultservice.notes;

import com.vault.theguardian.vaultservice.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/notes")
@CrossOrigin
public class SecureNoteController {
    private final SecureNoteService service;
    public SecureNoteController(SecureNoteService service) { this.service = service; }

    @PostMapping
    public SecureNoteResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                     @Valid @RequestBody SecureNoteRequest request) {
        return service.create(user.userId(), user.isDuress(), request);
    }
    @GetMapping
    public List<SecureNoteResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.list(user.userId(), user.isDuress());
    }
    @GetMapping("/{id}")
    public SecureNoteResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        return service.get(user.userId(), user.isDuress(), id);
    }
    @PutMapping("/{id}")
    public SecureNoteResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                     @PathVariable Long id,
                                     @Valid @RequestBody SecureNoteRequest request) {
        return service.update(user.userId(), user.isDuress(), id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable Long id) {
        service.delete(user.userId(), user.isDuress(), id);
        return ResponseEntity.noContent().build();
    }
}
