package com.vault.theguardian.supportservice.common;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(
            ResponseStatusException exception,
            HttpServletRequest request
    ) {
        HttpStatus status = HttpStatus.resolve(exception.getStatusCode().value());
        if (status == null) status = HttpStatus.BAD_REQUEST;
        String message = exception.getReason();
        if (message == null || message.isBlank()) message = status.getReasonPhrase();
        return ResponseEntity.status(status)
                .body(body(status.name(), message, request.getRequestURI()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getDefaultMessage() == null
                        ? error.getField() + " is invalid."
                        : error.getDefaultMessage())
                .orElse("Some details are missing or invalid.");
        return ResponseEntity.badRequest()
                .body(body("VALIDATION_ERROR", message, request.getRequestURI()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadableBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request
    ) {
        return ResponseEntity.badRequest()
                .body(body("INVALID_REQUEST", "The request body is missing or malformed.",
                        request.getRequestURI()));
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> handleDatabase(
            DataAccessException exception,
            HttpServletRequest request
    ) {
        log.error("Database operation failed path={}", request.getRequestURI(), exception);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(body("DATABASE_UNAVAILABLE", "Support records are temporarily unavailable.",
                        request.getRequestURI()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(
            Exception exception,
            HttpServletRequest request
    ) {
        log.error("Unhandled request failure path={}", request.getRequestURI(), exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(body("INTERNAL_ERROR", "An unexpected error occurred.",
                        request.getRequestURI()));
    }

    private Map<String, Object> body(String code, String message, String path) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("timestamp", LocalDateTime.now().toString());
        response.put("code", code);
        response.put("message", message);
        response.put("path", path);
        return response;
    }
}
