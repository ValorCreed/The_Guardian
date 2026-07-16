# The Guardian Backend API Reference

This API reference was generated from the uploaded backend controller and DTO files. The backend is a Spring Boot REST API that primarily requires JWT authentication, except for registration, login, email verification, password reset, recovery-kit account recovery, and the Paystack callback page.

Base URL examples:

```txt
Local development: http://localhost:8080
Render production: https://the-guardian-op6t.onrender.com
```

Protected endpoints require:

```http
Authorization: Bearer <JWT_TOKEN>
```

Device-aware login/session features also use the frontend-provided headers:

```http
X-Guardian-Device-Id: <stable-device-id>
X-Guardian-Device-Name: <friendly-device-name>
X-Guardian-Device-Type: android | ios | web | unknown
```

## Endpoints

| Module | Method | Endpoint | Auth | Purpose | Request | Response |
|---|---:|---|---|---|---|---|
| Authentication | POST | /vault/auth/register | Public | Create user account, default Free subscription, verification code, login session. | RegisterRequest | AuthResponse |
| Authentication | POST | /vault/auth/login | Public | Authenticate user with email/password; may require 2FA; creates device session. | LoginRequest | AuthResponse |
| Authentication | POST | /vault/auth/verify-2fa | Public | Complete two-factor login using emailed code. | VerifyTwoFactorRequest | AuthResponse |
| Authentication | GET | /vault/auth/me/security | JWT | Return email verification and 2FA settings. | - | SecuritySettingsResponse |
| Authentication | PUT | /vault/auth/2fa | JWT | Enable or disable two-factor authentication. | TwoFactorToggleRequest | SecuritySettingsResponse |
| Authentication | POST | /vault/auth/verify-email | Public | Verify account email using verification code. | VerifyEmailRequest | MessageResponse |
| Authentication | POST | /vault/auth/resend-verification | Public | Send a new email verification code. | ResendVerificationRequest | MessageResponse |
| Authentication | POST | /vault/auth/forgot-password | Public | Send password reset code by email. | ForgotPasswordRequest | MessageResponse |
| Authentication | POST | /vault/auth/reset-password | Public | Reset password using email and code. | ResetPasswordRequest | MessageResponse |
| Authentication | POST | /vault/auth/logout | Public | Returns logout acknowledgement. Client removes token. | - | LogoutResponse |
| Vault passwords | POST | /api/vault | JWT | Create password/login vault item. Free users are limited. | VaultRequest | VaultResponse |
| Vault passwords | GET | /api/vault | JWT | List current user password/login items. | - | List<VaultResponse> |
| Vault passwords | GET | /api/vault/{id} | JWT | Read one owned password item. | - | VaultResponse |
| Vault passwords | PUT | /api/vault/{id} | JWT | Update an owned password item. | VaultRequest | VaultResponse |
| Vault passwords | DELETE | /api/vault/{id} | JWT | Delete an owned password item. | - | void |
| Cards | POST | /vault/cards | JWT | Create encrypted credit/debit card record. | CreditCardRequest | CreditCardResponse |
| Cards | GET | /vault/cards | JWT | List current user cards. | - | List<CreditCardResponse> |
| Cards | GET | /vault/cards/{id} | JWT | Read one owned card. | - | CreditCardResponse |
| Cards | PUT | /vault/cards/{id} | JWT | Update one owned card. | CreditCardRequest | CreditCardResponse |
| Cards | DELETE | /vault/cards/{id} | JWT | Delete one owned card. | - | void |
| Documents | POST | /vault/documents | JWT | Create legacy/document metadata record from JSON payload. | DocumentRequest | DocumentResponse |
| Documents | POST | /vault/documents/upload | JWT | Upload multipart file; backend encrypts and stores in DB/B2 depending config. | multipart file + metadata | DocumentResponse |
| Documents | GET | /vault/documents | JWT | List current user documents. | - | List<DocumentResponse> |
| Documents | GET | /vault/documents/{id} | JWT | Read one document metadata record. | - | DocumentResponse |
| Documents | GET | /vault/documents/{id}/download | JWT | Download decrypted file bytes for owned document. | - | binary response |
| Documents | PUT | /vault/documents/{id} | JWT | Update document metadata. | DocumentRequest | DocumentResponse |
| Documents | DELETE | /vault/documents/{id} | JWT | Delete document metadata and B2 object when applicable. | - | void |
| Secure notes | POST | /vault/notes | JWT | Create encrypted secure note. Free users are limited. | SecureNoteRequest | SecureNoteResponse |
| Secure notes | GET | /vault/notes | JWT | List secure notes. | - | List<SecureNoteResponse> |
| Secure notes | GET | /vault/notes/{id} | JWT | Read one owned note. | - | SecureNoteResponse |
| Secure notes | PUT | /vault/notes/{id} | JWT | Update one owned note. | SecureNoteRequest | SecureNoteResponse |
| Secure notes | DELETE | /vault/notes/{id} | JWT | Delete one owned note. | - | void |
| Subscription | GET | /vault/api/subscriptions/me | JWT | Return current user subscription; creates Free subscription if missing and refreshes expired paid plan. | - | Subscription |
| Subscription | POST | /vault/api/subscriptions/upgrade?plan=PREMIUM | JWT | Manual plan upgrade endpoint; usually called by payment verification. | plan query param | Subscription |
| Subscription | POST | /vault/api/subscriptions/cancel | JWT | Cancel current paid plan; downgrade to Free. | - | Subscription |
| Payments | POST | /vault/payments/initialize | JWT | Create Paystack payment initialization for plan upgrade. | InitializePaymentRequest | InitializePaymentResponse |
| Payments | POST | /vault/payments/verify | JWT | Verify payment by reference and activate subscription on success. | VerifyPaymentRequest | VerifyPaymentResponse |
| Payments | GET | /vault/payments/callback?reference=... | Public | Browser callback page for Paystack payment result. | reference query param | HTML |
| Family sharing | GET | /vault/family | JWT | Return family plan overview, members, and shared owners. | - | FamilyOverviewResponse |
| Family sharing | GET | /vault/family/members/lookup?email=... | JWT | Lookup whether an email belongs to an existing user before adding. | email query param | Map/ResponseEntity |
| Family sharing | POST | /vault/family/members | JWT | Add family member with sharing permissions. Family plan admin only. | AddFamilyMemberRequest | FamilyMemberResponse |
| Family sharing | DELETE | /vault/family/members/{membershipId} | JWT | Remove family member. Family admin only. | - | void |
| Family sharing | GET | /vault/family/shared-items | JWT | List all shared item groups available to current user. | - | SharedFamilyItemsResponse |
| Family sharing | GET | /vault/family/member-password-risks | JWT | Return risk-only summaries for family admin security view. | - | List<FamilyMemberPasswordRiskResponse> |
| Family sharing | GET | /vault/family/shared-passwords | JWT | List shared password summaries. | - | List<SharedPasswordItemResponse> |
| Family sharing | GET | /vault/family/shared-passwords/{itemId} | JWT | Read shared password detail if permission allows. | - | SharedPasswordItemResponse |
| Family sharing | GET | /vault/family/shared-cards | JWT | List shared card summaries. | - | List<SharedCardItemResponse> |
| Family sharing | GET | /vault/family/shared-cards/{itemId} | JWT | Read shared card detail if permission allows. | - | SharedCardItemResponse |
| Family sharing | GET | /vault/family/shared-documents | JWT | List shared document summaries. | - | List<SharedDocumentItemResponse> |
| Family sharing | GET | /vault/family/shared-documents/{itemId} | JWT | Read shared document metadata/detail if permission allows. | - | SharedDocumentItemResponse |
| Family sharing | GET | /vault/family/shared-documents/{itemId}/download | JWT | Download decrypted shared document if permission allows. | - | binary response |
| Family sharing | GET | /vault/family/shared-notes | JWT | List shared note summaries. | - | List<SharedNoteItemResponse> |
| Family sharing | GET | /vault/family/shared-notes/{itemId} | JWT | Read shared note detail if permission allows. | - | SharedNoteItemResponse |
| Emergency access | GET | /vault/emergency/overview | JWT | Return contacts, received/sent requests, audit logs, plan limits. | - | EmergencyOverviewResponse |
| Emergency access | GET | /vault/emergency/contacts | JWT | List emergency contacts owned by user. | - | List<EmergencyContactResponse> |
| Emergency access | POST | /vault/emergency/contacts | JWT | Create emergency contact with item permissions and waiting period. | EmergencyContactRequest | EmergencyContactResponse |
| Emergency access | GET | /vault/emergency/contacts/{id} | JWT | Read owned emergency contact. | - | EmergencyContactResponse |
| Emergency access | PUT | /vault/emergency/contacts/{id} | JWT | Update owned emergency contact. | EmergencyContactRequest | EmergencyContactResponse |
| Emergency access | DELETE | /vault/emergency/contacts/{id} | JWT | Delete/deactivate emergency contact. | - | void |
| Emergency access | POST | /vault/emergency/requests | JWT | Request emergency access as trusted contact. | EmergencyAccessRequestDto | EmergencyAccessRequestResponse |
| Emergency access | GET | /vault/emergency/requests | JWT | List requests received by vault owner. | - | List<EmergencyAccessRequestResponse> |
| Emergency access | POST | /vault/emergency/requests/{id}/approve | JWT | Approve request immediately. | - | EmergencyAccessRequestResponse |
| Emergency access | POST | /vault/emergency/requests/{id}/deny | JWT | Deny request. | - | EmergencyAccessRequestResponse |
| Emergency access | GET | /vault/emergency/requests/{id}/vault | JWT | List vault items released under emergency access. | - | EmergencyVaultItemsResponse |
| Emergency access | GET | /vault/emergency/requests/{id}/vault/{itemType}/{itemId} | JWT | Read released emergency item detail. | - | EmergencyVaultItemResponse |
| Emergency access | GET | /vault/emergency/audit | JWT | List emergency access audit logs. | - | List<EmergencyAuditLogResponse> |
| Backup | GET | /vault/backup/status | JWT | Return backup eligibility and current counts. Premium/Family only. | - | BackupStatusResponse |
| Backup | POST | /vault/backup/create | JWT | Create encrypted backup payload. Premium/Family only. | - | BackupResponse |
| Backup | POST | /vault/backup/restore | JWT | Restore encrypted backup payload. Premium/Family only. | BackupRestoreRequest | BackupRestoreResponse |
| Recovery kit | GET | /vault/recovery-kit/status | JWT | Return whether recovery kit exists. | - | RecoveryKitStatusResponse |
| Recovery kit | POST | /vault/recovery-kit/generate | JWT | Generate recovery id/key after password confirmation. | RecoveryKitGenerateRequest | RecoveryKitResponse |
| Recovery kit | DELETE | /vault/recovery-kit | JWT | Revoke active recovery kit. | - | MessageResponse |
| Recovery kit | POST | /vault/recovery-kit/reset-password | Public | Reset password using recovery id/key. | RecoveryPasswordResetRequest | MessageResponse |
| Recovery kit | POST | /vault/recovery-kit/reset-account | Public | Reset account and erase vault using recovery id/key. | AccountResetEraseRequest | MessageResponse |
| Notifications | GET | /vault/notifications | JWT | List notifications for current user. | - | List<NotificationResponse> |
| Notifications | GET | /vault/notifications/unread-count | JWT | Return unread notification count. | - | UnreadCountResponse |
| Notifications | PUT | /vault/notifications/{id}/read | JWT | Mark one notification as read. | - | NotificationResponse |
| Notifications | PUT | /vault/notifications/read-all | JWT | Mark all notifications as read. | - | void |
| Notifications | DELETE | /vault/notifications/{id} | JWT | Delete notification. | - | void |
| Device sessions | GET | /vault/sessions | JWT | List active/revoked sessions and current device. | - | List<DeviceSessionResponse> |
| Device sessions | DELETE | /vault/sessions/{id} | JWT | Revoke one session. | - | void |
| Device sessions | POST | /vault/sessions/logout-others | JWT | Revoke all sessions except current. | - | void |
| Device sessions | POST | /vault/sessions/logout-all | JWT | Revoke all user sessions. | - | void |
| Security health | POST | /vault/security-alerts/scan | JWT | Save/send notification summary for security scan results. | SecurityAlertRequest | MessageResponse |
| Bug reports | POST | /vault/support/bug-reports | JWT | Create bug report and notify support email. | BugReportRequest | BugReportResponse |
| Bug reports | GET | /vault/support/bug-reports/my | JWT | List current user bug reports. | - | List<BugReportResponse> |
| User account | DELETE | /vault/users/me | JWT | Delete current account after password confirmation. | DeleteAccountRequest | DeleteAccountResponse |

## Common error response shape

`GlobalExceptionHandler` standardizes several errors into JSON:

```json
{
  "timestamp": "2026-07-16T01:29:45.000",
  "code": "PLAN_LIMIT_REACHED",
  "message": "Your Free plan can save up to 10 passwords. Upgrade to Premium or Family for unlimited password storage.",
  "path": "/api/vault",
  "feature": "passwords",
  "limit": 10
}
```

Important codes used by the frontend include:

```txt
PLAN_LIMIT_REACHED
VALIDATION_ERROR
ACCOUNT_NOT_FOUND
DEVICE_LIMIT_REACHED
FAMILY_PLAN_REQUIRED
```

## Important DTOs

### Authentication

```txt
RegisterRequest: fullName, email, password
LoginRequest: email, password, forceReplaceDevice
AuthResponse: token, userId, fullName, email, plan, emailVerified, twoFactorEnabled, requiresTwoFactor
```

### Vault items

```txt
VaultRequest: title, usernameValue, encryptedPassword, website, notes
VaultResponse: id, title, usernameValue, encryptedPassword, website, notes, createdAt, updatedAt
```

### Cards

```txt
CreditCardRequest: cardName, encryptedCardNumber, encryptedExpiryDate, encryptedCvv, encryptedCardholderName
CreditCardResponse: id, cardName, encryptedCardNumber, encryptedExpiryDate, encryptedCvv, encryptedCardHolderName
```

### Documents

```txt
DocumentRequest: documentName, documentType, encryptedFileUrl, encryptedNotes
DocumentResponse: id, documentName, documentType, encryptedFileUrl, encryptedNotes, sizeBytes, createdAt, updatedAt
```

### Secure notes

```txt
SecureNoteRequest: title, category, encryptedContent, pinned
SecureNoteResponse: id, title, category, encryptedContent, pinned, createdAt, updatedAt
```

### Family sharing

```txt
AddFamilyMemberRequest: email, sharePasswords, shareCards, shareDocuments, shareNotes
FamilyOverviewResponse: familyPlan, admin, groupId, memberLimit, memberCount, members, sharedVaultOwners
```

### Emergency access

```txt
EmergencyContactRequest: contactEmail, contactName, relationship, waitingPeriodHours, allowPasswords, allowCards, allowDocuments, allowNotes, encryptedEmergencyNote, active
EmergencyAccessRequestDto: contactEmail/request details depending implementation
EmergencyOverviewResponse: plan, premiumOrFamily, contactLimit, contactCount, contacts, receivedRequests, sentRequests, auditLogs
```

### Bug reports

```txt
BugReportRequest: title, category, severity, description, stepsToReproduce, includeDiagnostics, deviceInfo, appVersion
BugReportResponse: id, title, category, severity, description, stepsToReproduce, includeDiagnostics, deviceInfo, appVersion, status, createdAt, updatedAt
```