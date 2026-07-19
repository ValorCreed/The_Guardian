package com.vault.theguardian.supportservice.support;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BugReportRepository extends JpaRepository<BugReport, Long> {
    List<BugReport> findByUserIdOrderByCreatedAtDesc(Long userId);
}
