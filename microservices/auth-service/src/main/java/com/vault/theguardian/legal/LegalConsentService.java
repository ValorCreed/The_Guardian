package com.vault.theguardian.legal;

import com.vault.theguardian.user.User;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

@Service
public class LegalConsentService {
    private final UserLegalConsentRepository repository;

    public LegalConsentService(UserLegalConsentRepository repository) {
        this.repository = repository;
    }

    public LegalConsentResponse getConsent(User user, String version) {
        String cleanVersion = normalizeVersion(version);

        return repository.findByUserAndConsentVersion(user, cleanVersion)
                .map(this::toResponse)
                .orElse(new LegalConsentResponse(
                        cleanVersion,
                        false,
                        false,
                        null,
                        "MOBILE_APP"
                ));
    }

    @Transactional
    public LegalConsentResponse saveConsent(User user, LegalConsentRequest request) {
        if (!request.privacyAccepted() || !request.termsAccepted()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Both the Privacy Policy and Terms of Service must be accepted."
            );
        }

        String cleanVersion = normalizeVersion(request.version());
        UserLegalConsent consent = repository
                .findByUserAndConsentVersion(user, cleanVersion)
                .orElseGet(UserLegalConsent::new);

        consent.setUser(user);
        consent.setConsentVersion(cleanVersion);
        consent.setPrivacyAccepted(true);
        consent.setTermsAccepted(true);
        consent.setAcceptedAt(LocalDateTime.now());
        consent.setClientSource(normalizeSource(request.clientSource()));

        return toResponse(repository.save(consent));
    }

    private String normalizeVersion(String value) {
        String clean = String.valueOf(value == null ? "" : value).trim();
        if (clean.isBlank() || clean.length() > 40) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid consent version.");
        }
        return clean;
    }

    private String normalizeSource(String value) {
        String clean = String.valueOf(value == null ? "MOBILE_APP" : value)
                .trim()
                .toUpperCase();
        if (clean.isBlank()) return "MOBILE_APP";
        return clean.length() > 40 ? clean.substring(0, 40) : clean;
    }

    private LegalConsentResponse toResponse(UserLegalConsent consent) {
        return new LegalConsentResponse(
                consent.getConsentVersion(),
                consent.isPrivacyAccepted(),
                consent.isTermsAccepted(),
                consent.getAcceptedAt(),
                consent.getClientSource()
        );
    }
}
