package com.vault.theguardian.documents;
import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DocumentRepository extends JpaRepository<DocumentVault, Long> {
    List<DocumentVault> findByUser(User user);
}