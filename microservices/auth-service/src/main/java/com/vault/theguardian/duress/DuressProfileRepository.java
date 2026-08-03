package com.vault.theguardian.duress;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

import java.util.Optional;

public interface DuressProfileRepository extends JpaRepository<DuressProfile, Long> {
    Optional<DuressProfile> findByUserAndEnabledTrue(User user);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from DuressProfile p where p.userId = :userId")
    Optional<DuressProfile> findByIdForUpdate(@Param("userId") Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from DuressProfile p where p.user = :user and p.enabled = true")
    Optional<DuressProfile> findByUserAndEnabledTrueForUpdate(@Param("user") User user);
}
