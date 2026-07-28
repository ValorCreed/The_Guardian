package com.vault.theguardian.internal.user;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import com.vault.theguardian.user.User;
import com.vault.theguardian.user.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

@RestController
@RequestMapping("/internal/users")
public class InternalUserController {
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Service-Key";

    private final UserRepository userRepository;
    private final byte[] expectedInternalKey;

    public InternalUserController(
            UserRepository userRepository,
            @Value("${internal.service.key}") String internalServiceKey
    ) {
        if (internalServiceKey == null || internalServiceKey.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_KEY must be configured.");
        }
        this.userRepository = userRepository;
        this.expectedInternalKey =
                internalServiceKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/by-email")
    public InternalUserResponse findByEmail(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @RequestParam String email
    ) {
        requireValidInternalKey(suppliedKey);

        User user = userRepository.findByEmailIgnoreCase(email.trim())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "User not found."
                ));

        return toResponse(user);
    }

    @GetMapping("/{userId}")
    public InternalUserResponse findById(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId
    ) {
        requireValidInternalKey(suppliedKey);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "User not found."
                ));

        return toResponse(user);
    }

    @PostMapping("/batch")
    public List<InternalUserResponse> findByIds(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @RequestBody List<Long> userIds
    ) {
        requireValidInternalKey(suppliedKey);

        if (userIds == null || userIds.isEmpty()) {
            return List.of();
        }

        return userRepository.findAllById(userIds.stream().distinct().toList())
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @PutMapping("/{userId}/profile")
    @Transactional
    public InternalUserResponse updateProfile(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId,
            @Valid @RequestBody InternalUpdateUserProfileRequest request
    ) {
        requireValidInternalKey(suppliedKey);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "User not found."
                ));

        String cleanFullName = request.fullName().trim().replaceAll("\\s+", " ");
        user.setFullName(cleanFullName);

        return toResponse(userRepository.save(user));
    }

    @DeleteMapping("/{userId}")
    @Transactional
    public void deleteUser(
            @RequestHeader(value = INTERNAL_KEY_HEADER, required = false) String suppliedKey,
            @PathVariable Long userId
    ) {
        requireValidInternalKey(suppliedKey);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "User not found."
                ));

        userRepository.delete(user);
        userRepository.flush();
    }

    private InternalUserResponse toResponse(User user) {
        return new InternalUserResponse(
                user.getId(),
                user.getFullName(),
                user.getEmail()
        );
    }

    private void requireValidInternalKey(String suppliedKey) {
        byte[] supplied = suppliedKey == null
                ? new byte[0]
                : suppliedKey.getBytes(StandardCharsets.UTF_8);

        if (!MessageDigest.isEqual(expectedInternalKey, supplied)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Invalid internal service key."
            );
        }
    }
}
