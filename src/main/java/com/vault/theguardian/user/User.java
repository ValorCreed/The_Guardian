package com.vault.theguardian.user;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import lombok.*;

import java.time.LocalDateTime;


@Entity
@Table(name="users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User{
    //UserId variable
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    //Name variable
    private String fullName;

    //Email variable
    @Column(unique = true,nullable = false)
    private String email;

    //Password hash column

    @Column(nullable = false)
    @JsonIgnore
    private String passwordHash;

    private LocalDateTime createdAt;


}
