package com.vault.theguardian.notes;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SecureNoteRepository extends JpaRepository<SecureNote, Long> {
    List<SecureNote> findByUserOrderByPinnedDescUpdatedAtDesc(User user);
    List<SecureNote> findByUserIn(List<User> users);
    long countByUser(User user);
}
