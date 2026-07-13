package com.vault.theguardian.session;

import com.vault.theguardian.user.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {
    Optional<UserSession> findByTokenIdAndActiveTrue(String tokenId);

    /*
     * Keep this for history/debug views if you need it later.
     * The app screen should normally use active-only sessions.
     */
    List<UserSession> findByUserOrderByLastSeenAtDesc(User user);

    List<UserSession> findByUserAndActiveTrue(User user);

    long countByUserAndActiveTrue(User user);

    List<UserSession> findByUserAndActiveTrueOrderByLastSeenAtDesc(User user);

    /*
     * Same account + same device/app identity + same IP address = same trusted session.
     * Same device/app identity + different IP address = different trusted session.
     */
    List<UserSession> findByUserAndDeviceTypeAndDeviceNameAndIpAddressAndUserAgentAndActiveTrueOrderByLastSeenAtDesc(
            User user,
            String deviceType,
            String deviceName,
            String ipAddress,
            String userAgent
    );

    Optional<UserSession> findByIdAndUser(Long id, User user);

    boolean existsByTokenIdAndActiveTrue(String tokenId);
}
