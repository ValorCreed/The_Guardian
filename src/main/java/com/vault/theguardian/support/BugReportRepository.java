package com.vault.theguardian.support;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BugReportRepository extends JpaRepository<BugReport, Long> {
    List<BugReport> findByUserOrderByCreatedAtDesc(User user);
}
