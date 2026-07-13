package com.vault.theguardian.notes;

import com.vault.theguardian.user.User;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/vault/notes")
@CrossOrigin
public class SecureNoteController {
    private final SecureNoteService secureNoteService;

    public SecureNoteController(SecureNoteService secureNoteService) {
        this.secureNoteService = secureNoteService;
    }

    @PostMapping
    public SecureNoteResponse createNote(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody SecureNoteRequest request
    ) {
        return secureNoteService.createNote(user, request);
    }

    @GetMapping
    public List<SecureNoteResponse> getMyNotes(@AuthenticationPrincipal User user) {
        return secureNoteService.getMyNotes(user);
    }

    @GetMapping("/{id}")
    public SecureNoteResponse getNote(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        return secureNoteService.getNote(user, id);
    }

    @PutMapping("/{id}")
    public SecureNoteResponse updateNote(
            @AuthenticationPrincipal User user,
            @PathVariable Long id,
            @Valid @RequestBody SecureNoteRequest request
    ) {
        return secureNoteService.updateNote(user, id, request);
    }

    @DeleteMapping("/{id}")
    public void deleteNote(
            @AuthenticationPrincipal User user,
            @PathVariable Long id
    ) {
        secureNoteService.deleteNote(user, id);
    }
}
