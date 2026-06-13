package com.vault.theguardian.user;
import org.springframework.stereotype.Service;

//This service helps other services find the logged in user
@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
    public User getUserByEmail(String email) {
        return  userRepository.findByEmail(email)
                .orElseThrow(()->new RuntimeException("User not found"));
    }
}
