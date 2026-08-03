package com.vault.theguardian.vaultservice.common;

import com.fasterxml.jackson.core.JsonParseException;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import org.springframework.core.MethodParameter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.time.temporal.Temporal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Enforces request validation and conservative text sanitization before a
 * controller or service can process a payload. Secret and encrypted fields are
 * validated without being modified so existing credentials/ciphertext remain
 * byte-for-byte intact.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
public class InputSecurityAdvice extends RequestBodyAdviceAdapter {
    private final Validator validator;

    public InputSecurityAdvice(Validator validator) {
        this.validator = validator;
    }

    @Override
    public boolean supports(
            MethodParameter methodParameter,
            Type targetType,
            Class<? extends HttpMessageConverter<?>> converterType
    ) {
        return true;
    }

    @Override
    public Object afterBodyRead(
            Object body,
            HttpInputMessage inputMessage,
            MethodParameter parameter,
            Type targetType,
            Class<? extends HttpMessageConverter<?>> converterType
    ) {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        String rootName = StringUtils.hasText(parameter.getParameterName())
                ? parameter.getParameterName()
                : "request";
        Object sanitized = InputSanitizer.sanitize(body, "", rootName, errors);
        collectValidationErrors(sanitized, "", errors, Collections.newSetFromMap(new IdentityHashMap<>()));

        if (!errors.isEmpty()) {
            throw new InputValidationException(errors);
        }
        return sanitized;
    }

    @ExceptionHandler(InputValidationException.class)
    public ResponseEntity<Map<String, Object>> handleInputValidation(
            InputValidationException exception,
            HttpServletRequest request
    ) {
        return badRequest(
                "VALIDATION_ERROR",
                firstMessage(exception.getFieldErrors(), "Request validation failed."),
                exception.getFieldErrors(),
                request
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleBeanValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request
    ) {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error ->
                errors.putIfAbsent(error.getField(), safeMessage(error.getDefaultMessage(), "Invalid value."))
        );
        exception.getBindingResult().getGlobalErrors().forEach(error ->
                errors.putIfAbsent("request", safeMessage(error.getDefaultMessage(), "Invalid request."))
        );
        return badRequest("VALIDATION_ERROR", firstMessage(errors, "Request validation failed."), errors, request);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraintViolation(
            ConstraintViolationException exception,
            HttpServletRequest request
    ) {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        exception.getConstraintViolations().forEach(violation ->
                errors.putIfAbsent(normalizePath(violation.getPropertyPath().toString()), violation.getMessage())
        );
        return badRequest("VALIDATION_ERROR", firstMessage(errors, "Request validation failed."), errors, request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadableBody(
            HttpMessageNotReadableException exception,
            HttpServletRequest request
    ) {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        UnrecognizedPropertyException unknown = findCause(exception, UnrecognizedPropertyException.class);
        InvalidFormatException invalid = findCause(exception, InvalidFormatException.class);
        MismatchedInputException mismatch = findCause(exception, MismatchedInputException.class);
        JsonParseException parse = findCause(exception, JsonParseException.class);

        if (unknown != null) {
            String field = pathOf(unknown);
            errors.put(field, "Unexpected field '" + unknown.getPropertyName() + "' is not allowed.");
        } else if (invalid != null) {
            String field = pathOf(invalid);
            String expected = invalid.getTargetType() == null
                    ? "the required type"
                    : invalid.getTargetType().getSimpleName();
            errors.put(field, "Value has an invalid format; expected " + expected + ".");
        } else if (mismatch != null) {
            errors.put(pathOf(mismatch), "Value is missing or has the wrong JSON type.");
        } else if (parse != null) {
            errors.put("request", "Request body contains malformed or duplicate JSON.");
        } else {
            errors.put("request", "Request body is missing, malformed, or uses an invalid value.");
        }

        return badRequest("INVALID_REQUEST", firstMessage(errors, "Invalid request body."), errors, request);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception,
            HttpServletRequest request
    ) {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        errors.put(exception.getName(), "Value has an invalid format.");
        return badRequest("INVALID_PARAMETER", firstMessage(errors, "Invalid request parameter."), errors, request);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParameter(
            MissingServletRequestParameterException exception,
            HttpServletRequest request
    ) {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        errors.put(exception.getParameterName(), "Required parameter is missing.");
        return badRequest("MISSING_PARAMETER", firstMessage(errors, "Required parameter is missing."), errors, request);
    }

    private void collectValidationErrors(
            Object value,
            String prefix,
            Map<String, String> errors,
            Set<Object> visited
    ) {
        if (value == null || InputSanitizer.isSimpleValue(value.getClass()) || visited.contains(value)) {
            return;
        }
        visited.add(value);

        for (ConstraintViolation<Object> violation : validator.validate(value)) {
            String propertyPath = violation.getPropertyPath().toString();
            String path = joinPath(prefix, propertyPath);
            errors.putIfAbsent(path, safeMessage(violation.getMessage(), "Invalid value."));
        }

        if (value instanceof Collection<?> collection) {
            int index = 0;
            for (Object item : collection) {
                collectValidationErrors(item, prefix + "[" + index + "]", errors, visited);
                index++;
            }
            return;
        }

        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                collectValidationErrors(entry.getValue(), joinPath(prefix, String.valueOf(entry.getKey())), errors, visited);
            }
            return;
        }

        Class<?> type = value.getClass();
        if (!type.isRecord()) return;

        for (RecordComponent component : type.getRecordComponents()) {
            try {
                Object nested = component.getAccessor().invoke(value);
                collectValidationErrors(nested, joinPath(prefix, component.getName()), errors, visited);
            } catch (IllegalAccessException | InvocationTargetException exception) {
                errors.putIfAbsent(joinPath(prefix, component.getName()), "Value could not be validated safely.");
            }
        }
    }

    private ResponseEntity<Map<String, Object>> badRequest(
            String code,
            String message,
            Map<String, String> errors,
            HttpServletRequest request
    ) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("timestamp", LocalDateTime.now().toString());
        response.put("status", HttpStatus.BAD_REQUEST.value());
        response.put("code", code);
        response.put("message", message);
        response.put("path", request.getRequestURI());
        response.put("fieldErrors", errors.entrySet().stream()
                .map(entry -> Map.of("field", entry.getKey(), "message", entry.getValue()))
                .toList());
        response.put("errors", errors);
        return ResponseEntity.badRequest().body(response);
    }

    private static String pathOf(JsonMappingException exception) {
        if (exception.getPath() == null || exception.getPath().isEmpty()) return "request";
        StringBuilder path = new StringBuilder();
        for (JsonMappingException.Reference reference : exception.getPath()) {
            if (reference.getFieldName() != null) {
                if (!path.isEmpty()) path.append('.');
                path.append(reference.getFieldName());
            } else if (reference.getIndex() >= 0) {
                path.append('[').append(reference.getIndex()).append(']');
            }
        }
        return path.isEmpty() ? "request" : path.toString();
    }

    private static <T extends Throwable> T findCause(Throwable throwable, Class<T> type) {
        Throwable current = throwable;
        while (current != null) {
            if (type.isInstance(current)) return type.cast(current);
            if (current.getCause() == current) break;
            current = current.getCause();
        }
        return null;
    }

    private static String firstMessage(Map<String, String> errors, String fallback) {
        return errors.values().stream().findFirst().orElse(fallback);
    }

    private static String safeMessage(String message, String fallback) {
        return StringUtils.hasText(message) ? message : fallback;
    }

    private static String normalizePath(String path) {
        if (!StringUtils.hasText(path)) return "request";
        int parameterSeparator = path.indexOf('.');
        return parameterSeparator >= 0 && parameterSeparator < path.length() - 1
                ? path.substring(parameterSeparator + 1)
                : path;
    }

    private static String joinPath(String prefix, String child) {
        if (!StringUtils.hasText(prefix)) return StringUtils.hasText(child) ? child : "request";
        if (!StringUtils.hasText(child)) return prefix;
        return child.startsWith("[") ? prefix + child : prefix + "." + child;
    }
}

final class InputValidationException extends RuntimeException {
    private final Map<String, String> fieldErrors;

    InputValidationException(Map<String, String> fieldErrors) {
        super(fieldErrors.values().stream().findFirst().orElse("Request validation failed."));
        this.fieldErrors = Collections.unmodifiableMap(new LinkedHashMap<>(fieldErrors));
    }

    Map<String, String> getFieldErrors() {
        return fieldErrors;
    }
}

final class InputSanitizer {
    private static final int DEFAULT_TEXT_LIMIT = 4_000;
    private static final int LARGE_OPAQUE_LIMIT = 64 * 1024 * 1024;
    private static final int SECRET_LIMIT = 4_096;
    private static final int COLLECTION_LIMIT = 1_000;

    private static final Pattern HTML_TAG = Pattern.compile("(?is)<!--.*?-->|<\\s*/?\\s*[a-z][^>]*>");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@<>]{1,64}@[^\\s@<>]{1,255}$");
    private static final Pattern SAFE_ACTION_ROUTE = Pattern.compile("^/[A-Za-z0-9/_?=&%.,:+~-]{0,254}$");
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[A-Za-z0-9._~:+\\-/=]{1,4096}$");
    private static final Pattern UNSAFE_SCHEME = Pattern.compile("(?i)^\\s*(javascript|data|vbscript|file):");

    private InputSanitizer() {
    }

    static Object sanitize(Object value, String path, String fieldName, Map<String, String> errors) {
        return sanitize(value, path, fieldName, errors, new IdentityHashMap<>());
    }

    private static Object sanitize(
            Object value,
            String path,
            String fieldName,
            Map<String, String> errors,
            IdentityHashMap<Object, Object> visited
    ) {
        if (value == null) return null;
        if (value instanceof String text) {
            return sanitizeString(text, fieldName, currentPath(path, fieldName), errors);
        }
        if (isSimpleValue(value.getClass())) {
            validateSimpleValue(value, fieldName, currentPath(path, fieldName), errors);
            return value;
        }
        if (visited.containsKey(value)) return visited.get(value);

        String currentPath = currentPath(path, fieldName);

        if (value instanceof Collection<?> collection) {
            if (collection.size() > COLLECTION_LIMIT) {
                errors.putIfAbsent(currentPath, "No more than " + COLLECTION_LIMIT + " values are allowed.");
            }
            List<Object> sanitized = new ArrayList<>(Math.min(collection.size(), COLLECTION_LIMIT));
            visited.put(value, sanitized);
            int index = 0;
            for (Object item : collection) {
                String itemPath = currentPath + "[" + index + "]";
                if (item == null) {
                    errors.putIfAbsent(itemPath, "Null collection values are not allowed.");
                    sanitized.add(null);
                } else {
                    sanitized.add(sanitize(item, itemPath, fieldName, errors, visited));
                }
                index++;
            }
            return sanitized;
        }

        if (value instanceof Map<?, ?> map) {
            if (map.size() > COLLECTION_LIMIT) {
                errors.putIfAbsent(currentPath, "No more than " + COLLECTION_LIMIT + " fields are allowed.");
            }
            Map<String, Object> sanitized = new LinkedHashMap<>();
            visited.put(value, sanitized);
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = sanitizeMapKey(String.valueOf(entry.getKey()), currentPath, errors);
                sanitized.put(key, sanitize(entry.getValue(), currentPath, key, errors, visited));
            }
            return sanitized;
        }

        Class<?> type = value.getClass();
        if (type.isArray()) {
            int length = Array.getLength(value);
            if (length > COLLECTION_LIMIT) {
                errors.putIfAbsent(currentPath, "No more than " + COLLECTION_LIMIT + " values are allowed.");
            }
            Object sanitized = Array.newInstance(type.getComponentType(), length);
            visited.put(value, sanitized);
            for (int index = 0; index < length; index++) {
                Array.set(sanitized, index,
                        sanitize(Array.get(value, index), currentPath + "[" + index + "]", "item", errors, visited));
            }
            return sanitized;
        }

        if (!type.isRecord()) {
            return value;
        }

        try {
            RecordComponent[] components = type.getRecordComponents();
            Class<?>[] parameterTypes = new Class<?>[components.length];
            Object[] arguments = new Object[components.length];

            for (int index = 0; index < components.length; index++) {
                RecordComponent component = components[index];
                component.getAccessor().setAccessible(true);
                parameterTypes[index] = component.getType();
                Object componentValue = component.getAccessor().invoke(value);
                arguments[index] = sanitize(componentValue, currentPath, component.getName(), errors, visited);
            }

            boolean allNullableValuesMissing = components.length > 0;
            for (int index = 0; index < components.length; index++) {
                if (components[index].getType().isPrimitive() || arguments[index] != null) {
                    allNullableValuesMissing = false;
                    break;
                }
            }
            if (allNullableValuesMissing) {
                errors.putIfAbsent(currentPath, "At least one supported field is required.");
            }

            Constructor<?> constructor = type.getDeclaredConstructor(parameterTypes);
            constructor.setAccessible(true);
            Object sanitized = constructor.newInstance(arguments);
            visited.put(value, sanitized);
            return sanitized;
        } catch (InvocationTargetException exception) {
            Throwable cause = exception.getCause();
            errors.putIfAbsent(currentPath,
                    cause == null || !StringUtils.hasText(cause.getMessage())
                            ? "Request values are invalid."
                            : cause.getMessage());
            return value;
        } catch (ReflectiveOperationException | RuntimeException exception) {
            errors.putIfAbsent(currentPath, "Request values could not be processed safely.");
            return value;
        }
    }

    static boolean isSimpleValue(Class<?> type) {
        return type.isPrimitive()
                || Number.class.isAssignableFrom(type)
                || Boolean.class == type
                || Character.class == type
                || Enum.class.isAssignableFrom(type)
                || Temporal.class.isAssignableFrom(type)
                || java.util.Date.class.isAssignableFrom(type)
                || java.util.UUID.class == type;
    }

    private static String sanitizeString(
            String value,
            String fieldName,
            String path,
            Map<String, String> errors
    ) {
        String normalizedName = normalizeFieldName(fieldName);

        if (value.indexOf('\0') >= 0) {
            errors.putIfAbsent(path, "Null bytes are not allowed.");
        }

        if (isOpaque(normalizedName)) {
            validateOpaque(value, normalizedName, path, errors);
            return value;
        }

        String sanitized = Normalizer.normalize(value, Normalizer.Form.NFKC);
        sanitized = removeUnsafeUnicode(sanitized, isMultiline(normalizedName));
        sanitized = HTML_TAG.matcher(sanitized).replaceAll("");
        sanitized = sanitized.replace("<", "").replace(">", "").trim();

        int limit = textLimit(normalizedName);
        if (sanitized.length() > limit) {
            errors.putIfAbsent(path, "Must be " + limit + " characters or fewer.");
        }

        if (normalizedName.contains("email") && !sanitized.isBlank() && !EMAIL.matcher(sanitized).matches()) {
            errors.putIfAbsent(path, "Enter a valid email address.");
        }

        if (normalizedName.contains("actionroute") && !sanitized.isBlank()) {
            if (!SAFE_ACTION_ROUTE.matcher(sanitized).matches()
                    || sanitized.contains("..")
                    || sanitized.contains("\\")) {
                errors.putIfAbsent(path, "Action route must be a safe in-app path.");
            }
        }

        if (isUrlField(normalizedName) && !sanitized.isBlank() && UNSAFE_SCHEME.matcher(sanitized).find()) {
            errors.putIfAbsent(path, "URL scheme is not allowed.");
        }

        return sanitized;
    }

    private static void validateOpaque(
            String value,
            String normalizedName,
            String path,
            Map<String, String> errors
    ) {
        int limit = normalizedName.contains("password")
                ? 1_024
                : isLargeOpaque(normalizedName) ? LARGE_OPAQUE_LIMIT : SECRET_LIMIT;
        if (value.length() > limit) {
            errors.putIfAbsent(path, "Value is too long; maximum is " + limit + " characters.");
        }

        if (isIdentifier(normalizedName) && !value.isBlank() && !SAFE_IDENTIFIER.matcher(value).matches()) {
            errors.putIfAbsent(path, "Contains unsupported identifier characters.");
        }
    }

    private static void validateSimpleValue(
            Object value,
            String fieldName,
            String path,
            Map<String, String> errors
    ) {
        if (!(value instanceof Number number)) return;
        String name = normalizeFieldName(fieldName);
        if (looksLikeIdentifier(name) && number.longValue() <= 0) {
            errors.putIfAbsent(path, "Identifier must be greater than zero.");
        }
    }

    private static String sanitizeMapKey(String key, String path, Map<String, String> errors) {
        String sanitized = Normalizer.normalize(key, Normalizer.Form.NFKC)
                .replaceAll("[\\p{Cntrl}<>]", "")
                .trim();
        if (sanitized.isBlank() || sanitized.length() > 100) {
            errors.putIfAbsent(path, "Object contains an invalid field name.");
        }
        return sanitized;
    }

    private static String removeUnsafeUnicode(String value, boolean multiline) {
        StringBuilder sanitized = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); ) {
            int codePoint = value.codePointAt(index);
            index += Character.charCount(codePoint);

            boolean lineBreak = codePoint == '\n' || codePoint == '\r' || codePoint == '\t';
            boolean control = Character.isISOControl(codePoint);
            boolean bidiOrInvisible = codePoint == 0x200B
                    || codePoint == 0x200C
                    || codePoint == 0x200D
                    || codePoint == 0x2060
                    || (codePoint >= 0x202A && codePoint <= 0x202E)
                    || (codePoint >= 0x2066 && codePoint <= 0x2069)
                    || codePoint == 0xFEFF;

            if (bidiOrInvisible) continue;
            if (control && !(multiline && lineBreak)) continue;
            if (!multiline && lineBreak) {
                sanitized.append(' ');
                continue;
            }
            sanitized.appendCodePoint(codePoint);
        }
        return sanitized.toString()
                .replace("\r\n", "\n")
                .replace('\r', '\n');
    }

    private static boolean isOpaque(String name) {
        return name.contains("password")
                || name.contains("encrypted")
                || name.contains("cipher")
                || name.contains("token")
                || name.contains("secret")
                || name.contains("credential")
                || name.contains("authorization")
                || name.contains("internalkey")
                || name.contains("signature")
                || name.contains("hash")
                || name.contains("recoverykey")
                || name.contains("recoverycode")
                || name.contains("resetcode")
                || name.equals("code")
                || isIdentifier(name);
    }

    private static boolean isLargeOpaque(String name) {
        return name.contains("encrypted")
                || name.contains("cipher")
                || name.contains("backup")
                || name.contains("content") && name.contains("secure");
    }

    private static boolean isIdentifier(String name) {
        return name.equals("reference")
                || name.endsWith("publicid")
                || name.endsWith("requestid")
                || name.endsWith("recoveryid")
                || name.endsWith("installationid");
    }

    private static boolean looksLikeIdentifier(String name) {
        return name.equals("id")
                || name.endsWith("id")
                || name.endsWith("ids")
                || name.contains("userid")
                || name.contains("itemid")
                || name.contains("contactid")
                || name.contains("membershipid")
                || name.contains("reportid");
    }

    private static boolean isMultiline(String name) {
        return name.contains("message")
                || name.contains("description")
                || name.contains("note")
                || name.contains("instruction")
                || name.contains("steps")
                || name.contains("roles")
                || name.contains("deviceinfo");
    }

    private static boolean isUrlField(String name) {
        return name.contains("website")
                || name.endsWith("url")
                || name.endsWith("uri")
                || name.contains("link");
    }

    private static int textLimit(String name) {
        if (name.contains("email")) return 320;
        if (name.contains("title")) return 255;
        if (name.contains("fullname") || name.contains("ownername") || name.contains("contactname")
                || name.contains("reportername")) return 200;
        if (name.endsWith("name")) return 255;
        if (name.contains("relationship")) return 100;
        if (name.contains("category") || name.contains("severity") || name.contains("type")
                || name.contains("platform") || name.contains("version") || name.contains("source")) return 100;
        if (isUrlField(name)) return 2_048;
        if (name.contains("deviceinfo")) return 1_500;
        if (name.contains("notes")) return 10_000;
        if (name.contains("message") || name.contains("description") || name.contains("instruction")
                || name.contains("steps") || name.contains("note") || name.contains("roles")) return 4_000;
        return DEFAULT_TEXT_LIMIT;
    }

    private static String normalizeFieldName(String fieldName) {
        return fieldName == null ? "value" : fieldName.replaceAll("[^A-Za-z0-9]", "").toLowerCase(Locale.ROOT);
    }

    private static String currentPath(String path, String fieldName) {
        if (!StringUtils.hasText(path)) return StringUtils.hasText(fieldName) ? fieldName : "request";
        if (!StringUtils.hasText(fieldName) || "item".equals(fieldName)) return path;

        String normalizedField = fieldName.replaceAll("[^A-Za-z0-9_]", "");
        if (path.equals(normalizedField)
                || path.endsWith("." + normalizedField)
                || path.matches(".*\\." + Pattern.quote(normalizedField) + "\\[\\d+\\]$")) {
            return path;
        }
        return path + "." + normalizedField;
    }
}

@Order(Ordered.HIGHEST_PRECEDENCE)
@org.springframework.stereotype.Component
final class RequestInputSecurityFilter extends OncePerRequestFilter {
    private static final int MAX_URI_LENGTH = 2_048;
    private static final int MAX_QUERY_LENGTH = 8_192;
    private static final int MAX_PARAMETER_LENGTH = 4_096;
    private static final int MAX_HEADER_LENGTH = 8_192;
    private static final Pattern PARAMETER_NAME = Pattern.compile("^[A-Za-z0-9_.-]{1,100}$");
    private static final Pattern PATH_SEGMENT = Pattern.compile("^[A-Za-z0-9._~-]{1,255}$");
    private static final Pattern EMAIL_PARAMETER = Pattern.compile("^[^\\s@<>]{1,64}@[^\\s@<>]{1,255}$");
    private static final Pattern IDENTIFIER_PARAMETER = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._~-]{0,511}$");
    private static final Pattern ENCODED_TRAVERSAL = Pattern.compile("(?i)(%00|%0d|%0a|%2e%2e|%2f|%5c)");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri != null && (uri.startsWith("/actuator/") || uri.equals("/actuator"));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        LinkedHashMap<String, String> errors = new LinkedHashMap<>();
        validateTransportInput(request, errors);

        if (!errors.isEmpty()) {
            writeBadRequest(response, request, errors);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private void validateTransportInput(HttpServletRequest request, Map<String, String> errors) {
        String uri = request.getRequestURI();
        if (uri != null) {
            if (uri.length() > MAX_URI_LENGTH) {
                errors.put("request.path", "Request path is too long.");
            }
            if (hasUnsafeTransportCharacters(uri) || ENCODED_TRAVERSAL.matcher(uri).find()) {
                errors.put("request.path", "Request path contains unsafe characters.");
            } else {
                try {
                    String decoded = URLDecoder.decode(uri, StandardCharsets.UTF_8);
                    if (decoded.contains("../") || decoded.contains("..\\") || decoded.contains("\\")) {
                        errors.put("request.path", "Path traversal is not allowed.");
                    } else {
                        validatePathSegments(decoded, errors);
                    }
                } catch (IllegalArgumentException exception) {
                    errors.put("request.path", "Request path contains invalid percent-encoding.");
                }
            }
        }

        String query = request.getQueryString();
        if (query != null && query.length() > MAX_QUERY_LENGTH) {
            errors.put("request.query", "Query string is too long.");
        }

        request.getParameterMap().forEach((name, values) -> {
            if (!PARAMETER_NAME.matcher(name).matches()) {
                errors.putIfAbsent("request.query", "Query contains an invalid parameter name.");
                return;
            }
            if (values == null) return;
            for (String value : values) {
                if (value == null) continue;
                if (value.length() > MAX_PARAMETER_LENGTH) {
                    errors.putIfAbsent(name, "Parameter is too long.");
                } else if (hasUnsafeTransportCharacters(value)) {
                    errors.putIfAbsent(name, "Parameter contains unsafe characters.");
                } else {
                    validateNamedParameter(name, value, errors);
                }
            }
        });

        if (request.getHeaderNames() != null) {
            Collections.list(request.getHeaderNames()).forEach(name -> {
                if (request.getHeaders(name) == null) return;
                Collections.list(request.getHeaders(name)).forEach(value -> {
                    if (value != null && (value.length() > MAX_HEADER_LENGTH || hasHeaderInjection(value))) {
                        errors.putIfAbsent("header." + name, "Header contains an invalid value.");
                    }
                });
            });
        }
    }

    private void validatePathSegments(String decodedPath, Map<String, String> errors) {
        for (String segment : decodedPath.split("/")) {
            if (segment.isEmpty()) continue;
            if (!PATH_SEGMENT.matcher(segment).matches()) {
                errors.putIfAbsent("request.path", "Request path contains an invalid segment.");
                return;
            }
            if (segment.chars().allMatch(Character::isDigit)) {
                try {
                    if (Long.parseLong(segment) <= 0) {
                        errors.putIfAbsent("request.path", "Numeric identifiers must be greater than zero.");
                        return;
                    }
                } catch (NumberFormatException exception) {
                    errors.putIfAbsent("request.path", "Numeric identifier is too large.");
                    return;
                }
            } else if (segment.matches("-\\d+")) {
                errors.putIfAbsent("request.path", "Numeric identifiers must be greater than zero.");
                return;
            }
        }
    }

    private void validateNamedParameter(String name, String value, Map<String, String> errors) {
        String normalizedName = name.toLowerCase(Locale.ROOT);
        String trimmed = value.trim();

        if (normalizedName.contains("email")
                && !trimmed.isEmpty()
                && !EMAIL_PARAMETER.matcher(trimmed).matches()) {
            errors.putIfAbsent(name, "Enter a valid email address.");
        }

        if ((normalizedName.equals("reference")
                || normalizedName.endsWith("requestid")
                || normalizedName.endsWith("installationid"))
                && !trimmed.isEmpty()
                && !IDENTIFIER_PARAMETER.matcher(trimmed).matches()) {
            errors.putIfAbsent(name, "Contains unsupported identifier characters.");
        }

        if (normalizedName.endsWith("sizebytes") && !trimmed.isEmpty()) {
            try {
                if (Long.parseLong(trimmed) <= 0) {
                    errors.putIfAbsent(name, "File size must be greater than zero.");
                }
            } catch (NumberFormatException exception) {
                errors.putIfAbsent(name, "File size must be a valid whole number.");
            }
        }
    }

    private boolean hasUnsafeTransportCharacters(String value) {
        if (value.indexOf('\0') >= 0 || value.indexOf('<') >= 0 || value.indexOf('>') >= 0) return true;
        for (int index = 0; index < value.length(); ) {
            int codePoint = value.codePointAt(index);
            index += Character.charCount(codePoint);
            if (codePoint == '\r' || codePoint == '\n') return true;
            if ((codePoint >= 0x202A && codePoint <= 0x202E)
                    || (codePoint >= 0x2066 && codePoint <= 0x2069)
                    || codePoint == 0xFEFF) return true;
        }
        return false;
    }

    private boolean hasHeaderInjection(String value) {
        return value.indexOf('\0') >= 0 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0;
    }

    private void writeBadRequest(
            HttpServletResponse response,
            HttpServletRequest request,
            Map<String, String> errors
    ) throws IOException {
        response.setStatus(HttpStatus.BAD_REQUEST.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        String message = errors.values().stream().findFirst().orElse("Invalid request input.");
        StringBuilder json = new StringBuilder(256);
        json.append('{')
                .append("\"timestamp\":\"").append(jsonEscape(LocalDateTime.now().toString())).append("\",")
                .append("\"status\":400,")
                .append("\"code\":\"INVALID_REQUEST\",")
                .append("\"message\":\"").append(jsonEscape(message)).append("\",")
                .append("\"path\":\"").append(jsonEscape(request.getRequestURI())).append("\",")
                .append("\"fieldErrors\":[");

        boolean first = true;
        for (Map.Entry<String, String> entry : errors.entrySet()) {
            if (!first) json.append(',');
            first = false;
            json.append("{\"field\":\"").append(jsonEscape(entry.getKey()))
                    .append("\",\"message\":\"").append(jsonEscape(entry.getValue())).append("\"}");
        }

        json.append("],\"errors\":{");
        first = true;
        for (Map.Entry<String, String> entry : errors.entrySet()) {
            if (!first) json.append(',');
            first = false;
            json.append('\"').append(jsonEscape(entry.getKey())).append("\":\"")
                    .append(jsonEscape(entry.getValue())).append('\"');
        }
        json.append("}}");
        response.getWriter().write(json.toString());
    }

    private String jsonEscape(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "\\r")
                .replace("\n", "\\n")
                .replace("\t", "\\t");
    }
}
