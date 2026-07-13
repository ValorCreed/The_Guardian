package com.vault.theguardian.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.UUID;

// This service creates and checks JWT tokens.
@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String jwtSecret;

    @Value("${jwt.expiration}")
    private long jwtExpiration;

    private SecretKey getSigningKey() {
        return Keys.hmacShaKeyFor(jwtSecret.getBytes());
    }

    /*
     * Backward-compatible method.
     * New login code should call generateToken(email, tokenId) so the token
     * can be linked to a trusted device/session record.
     */
    public String generateToken(String email) {
        return generateToken(email, UUID.randomUUID().toString());
    }

    public String generateToken(String email, String tokenId) {
        return Jwts.builder()
                .subject(email)
                .id(tokenId)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtExpiration))
                .signWith(getSigningKey())
                .compact();
    }

    public String extractEmail(String token) {
        return getClaims(token).getSubject();
    }

    public String extractTokenId(String token) {
        return getClaims(token).getId();
    }

    public boolean isTokenValid(String token) {
        try {
            Claims claims = getClaims(token);

            if (claims.getExpiration() == null || claims.getExpiration().before(new Date())) {
                return false;
            }

            return claims.getSubject() != null && !claims.getSubject().isBlank();
        } catch (Exception e) {
            return false;
        }
    }

    private Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
