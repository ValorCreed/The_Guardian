package com.vault.theguardian.resetpassword;

import com.vault.theguardian.user.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name="password_reset_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    //Random token sent to the user's email.
    @Column(nullable = false, unique = true)
    private String token;

    //Token should expire quickly for security reasons
    @Column(nullable = false)
    private LocalDateTime expiresAt;

    //The user who requested the token
    @ManyToOne
    @JoinColumn(name= "user_id",nullable = false)
    private User user;

    //Prevents the same token from being used again
    @Column(nullable = false)
    private boolean used;

    private LocalDateTime createdAt;


}
