package com.vault.theguardian.duress;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface DuressAlertRepository extends JpaRepository<DuressAlert, Long> {
    boolean existsByDuressSessionTokenId(String tokenId);
    boolean existsByUserAndStatus(User user, DuressAlertStatus status);

    List<DuressAlert> findByUserAndStatus(User user, DuressAlertStatus status);
    long countByUserAndStatus(User user, DuressAlertStatus status);

    @Query("select a.id from DuressAlert a where a.status = :status and a.sendAt <= :now order by a.sendAt asc")
    List<Long> findDueIds(@Param("status") DuressAlertStatus status, @Param("now") LocalDateTime now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from DuressAlert a where a.id = :id")
    Optional<DuressAlert> findByIdForUpdate(@Param("id") Long id);
}
