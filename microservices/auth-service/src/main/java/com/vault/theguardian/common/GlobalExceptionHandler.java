package com.vault.theguardian.common;

import com.vault.theguardian.subscription.PlanLimitException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(PlanLimitException.class)
    public ResponseEntity<Map<String, Object>> handlePlanLimit(
            PlanLimitException ex,
            HttpServletRequest request
    ) {
        Map<String, Object> body = baseBody(
                "PLAN_LIMIT_REACHED",
                ex.getMessage(),
                request.getRequestURI()
        );
        body.put("feature", ex.getFeature());
        body.put("limit", ex.getLimit());

        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(
            ResponseStatusException ex,
            HttpServletRequest request
    ) {
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) status = HttpStatus.BAD_REQUEST;

        String message = ex.getReason();
        if (message == null || message.isBlank()) {
            message = status.getReasonPhrase();
        }

        String code = status.name();
        if (status.value() == 423 && message.startsWith("ACCOUNT_LOCKDOWN_ACTIVE:")) {
            code = "ACCOUNT_LOCKDOWN_ACTIVE";
            message = message.substring("ACCOUNT_LOCKDOWN_ACTIVE:".length()).trim();
        }

        return ResponseEntity.status(status).body(baseBody(
                code,
                message,
                request.getRequestURI()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException ex,
            HttpServletRequest request
    ) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .orElse("Some details are missing or invalid.");

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(baseBody(
                "VALIDATION_ERROR",
                message,
                request.getRequestURI()
        ));
    }

    private Map<String, Object> baseBody(String code, String message, String path) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("code", code);
        body.put("message", message);
        body.put("path", path);
        return body;
    }
}
