package com.vault.theguardian.emailservice.email;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/emails")
public class EmailDeliveryController {
    private final EmailDeliveryService emailDeliveryService;

    public EmailDeliveryController(EmailDeliveryService emailDeliveryService) {
        this.emailDeliveryService = emailDeliveryService;
    }

    @PostMapping("/registration-verification")
    public EmailDeliveryResponse sendRegistrationVerification(
            @Valid @RequestBody CodeEmailRequest request
    ) {
        return emailDeliveryService.sendRegistrationVerificationCode(
                request.toEmail(),
                request.code()
        );
    }

    @PostMapping("/verification")
    public EmailDeliveryResponse sendVerification(
            @Valid @RequestBody CodeEmailRequest request
    ) {
        return emailDeliveryService.sendVerificationCode(request.toEmail(), request.code());
    }

    @PostMapping("/password-reset")
    public EmailDeliveryResponse sendPasswordReset(
            @Valid @RequestBody CodeEmailRequest request
    ) {
        return emailDeliveryService.sendPasswordResetCode(request.toEmail(), request.code());
    }

    @PostMapping("/two-factor")
    public EmailDeliveryResponse sendTwoFactor(
            @Valid @RequestBody CodeEmailRequest request
    ) {
        return emailDeliveryService.sendTwoFactorCode(request.toEmail(), request.code());
    }

    @PostMapping("/duress-alert")
    public EmailDeliveryResponse sendDuressAlert(
            @Valid @RequestBody DuressAlertEmailRequest request
    ) {
        return emailDeliveryService.sendDuressAlert(request);
    }

    @PostMapping("/continuity-drill")
    public EmailDeliveryResponse sendContinuityDrill(
            @Valid @RequestBody ContinuityDrillEmailRequest request
    ) {
        return emailDeliveryService.sendContinuityDrillNotice(request);
    }

    @PostMapping("/bug-report")
    public EmailDeliveryResponse sendBugReport(
            @Valid @RequestBody BugReportEmailRequest request
    ) {
        return emailDeliveryService.sendBugReportNotification(request);
    }
}
