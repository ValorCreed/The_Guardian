package com.vault.theguardian.auth;
import com.vault.theguardian.security.JwtService;
import com.vault.theguardian.subscription.Subscription;
import com.vault.theguardian.subscription.SubscriptionRepository;
import com.vault.theguardian.subscription.SubscriptionPlan;
import com.vault.theguardian.user.UserRepository;
import com.vault.theguardian.user.User;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.time.LocalTime;

//When a user registers, we automatically give them a free plan
@Service
public class AuthService {
    private final UserRepository userRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(
            UserRepository userRepository,
            SubscriptionRepository subscriptionRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService
    ){
        this.userRepository = userRepository;
        this.subscriptionRepository = subscriptionRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public AuthResponse register(RegisterRequest registerRequest) {
        if (userRepository.findByEmail(registerRequest.email()).isPresent()){
            throw new RuntimeException("Email already exists");
        }


    User user= User.builder()
            .fullName(registerRequest.fullname())
            .email(registerRequest.email())
            .passwordHash(passwordEncoder.encode(registerRequest.password()))
            .createdAt(LocalDateTime.now())
            .build();

    User savedUser = userRepository.save(user);

    Subscription subscription = Subscription.builder()
            .user(savedUser)
            .plan(SubscriptionPlan.FREE)
            .active(true)
            .startedAt(LocalDateTime.now())
            .build();

    subscriptionRepository.save(subscription);

    String token = jwtService.generateToken(savedUser.getEmail());

    return new AuthResponse(
            token,
            savedUser.getId(),
            savedUser.getFullName(),
            savedUser.getEmail(),
            subscription.getPlan().name()
    );
}

public AuthResponse login(LoginRequest loginRequest) {
    User user= userRepository.findByEmail(loginRequest.email())
            .orElseThrow(() -> new RuntimeException("Invalid email or password"));

    boolean passwordMatches = passwordEncoder.matches(
            loginRequest.password(),
            user.getPasswordHash()
    );

    if(!passwordMatches){
        throw new RuntimeException("Invalid password");
    }
    Subscription subscription = subscriptionRepository.findByUser(user)
            .orElseThrow(() -> new RuntimeException("Subscription not found"));

    String token = jwtService.generateToken(user.getEmail());

    return new AuthResponse(
            token,
            user.getId(),
            user.getFullName(),
            user.getEmail(),
            subscription.getPlan().name()
    );}
}
