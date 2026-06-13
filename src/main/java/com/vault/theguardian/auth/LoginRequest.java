package com.vault.theguardian.auth;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

//This receives userlogin data
public record LoginRequest(
        @Email
        @NotBlank
        String email,

        @NotBlank String password

) {
}
