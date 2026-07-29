# The Guardian Mobile Frontend

The Guardian is a secure digital vault mobile app built with **Expo React Native**. It helps users store and manage passwords, encrypted documents, cards, secure notes, family sharing, emergency access, recovery kits, backup/restore, security-health checks, device sessions, legal pages, and bug reporting.

This README covers the **frontend/mobile app** only. Backend documentation should live separately in `docs/backend-technical-documentation.md`.

------------------

## Tech stack

- Expo React Native
- Expo Router
- TypeScript
- AsyncStorage
- Expo SecureStore
- Expo Document Picker / File System / Sharing
- Expo Haptics
- Expo Updates and EAS Build
- React Native SVG
- Expo Vector Icons / Lucide Icons

--------------------------

## Project structure

```txt
mobile/
├── app/                         # Expo Router screens
├── components/                  # Shared UI components
├── context/ or contexts/         # Theme, alerts, blur target providers
├── hooks/                        # Auto-lock, security score, network hooks
├── services/                     # API and offline vault services
├── utils/                        # Haptics, clipboard, crypto helpers, card brand helpers
├── constants/                    # What's New content and constants
├── assets/                       # Icons, splash images, brand graphics
├── app.json
├── eas.json
├── package.json
└── tsconfig.json
```

--------------------------------------

## Core features

- Authentication: register, sign in, email verification, password reset, 2FA challenge.
- Autofill: autofill passwords and credit cards outside the app.
- Protected navigation: route guard, vault lock, logout/back-navigation protection.
- Vault: passwords, documents, cards, and secure notes.
- Plan gates: free-plan limits and upgrade prompts for paid features.
- Documents: encrypted document upload/download flow through backend API.
- Security center: security score, account security actions, recovery kit reminders.
- Family sharing: member lookup, permission-based sharing, shared vault item details, edit share access.
- Emergency access: trusted contacts, emergency requests, approval/denial, emergency vault viewing.
- Backup and recovery: backup status, create backup, restore backup, recovery kit.
- Offline vault metadata and secure data snapshots.
- Secure clipboard clearing helper.
- Light, Dark, and OLED themes. Also included system based themes for dynamic theming
- Haptic feedback toggle and centralized haptic helpers.
- Legal: Privacy Policy and Terms of Service screens.
- Support: authenticated bug report submission.

----------------------------------------

## Getting started

Install dependencies:

```bash
npm install
```

Start Expo:

```bash
npx expo start
```

Run Android locally if using a development build:

```bash
npx expo run:android
```

---

## API configuration

The frontend talks to the Guardian backend through `services/api.ts`.

For production, use an Expo public environment variable instead of a hardcoded LAN IP:

```bash
EXPO_PUBLIC_API_BASE_URL='your-api-base-url'
```

Recommended `api.ts` pattern:

```ts
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'your-api-base-url';
```

Do not put backend secrets in the frontend. The mobile app must never contain database credentials, JWT signing secrets, encryption keys, Gmail credentials, Backblaze keys, or payment secret keys.

--------------------------------

## EAS builds

Preview/internal Android APK:

```bash
eas build --profile preview --platform android
```

Production Android build:

```bash
eas build --profile production --platform android
```

Publish a JS-only update to preview:

```bash
eas update --channel preview --message "Frontend update"
```

Use a fresh EAS build when changing native modules, app icons, splash screen, native permissions, or runtime-version-related configuration.

--------------------------------------------

## Important files

| File | Purpose |
|---|---|
| `app/_layout.tsx` | Root navigation shell, route guard, tab bar, back button, providers. |
| `services/api.ts` | API wrapper, tokens, device headers, caching, errors, upload/download. |
| `services/offlineVault.ts` | Offline metadata snapshot support. |
| `context/ThemeContext.tsx` | Light/Dark/OLED theme provider. |
| `context/AppAlertContext.tsx` | Global themed alert modal system. |
| `hooks/useAutoLock.ts` | Auto-lock behavior. |
| `hooks/useSecurityScore.ts` | Security score calculation and sync. |
| `utils/secureClipboard.ts` | Secure clipboard copy and timed clearing. |
| `utils/haptics.ts` | Centralized haptic feedback helpers. |
| `utils/cardBrand.ts` | Card brand detection helper. |
| `app/vault.tsx` | Main vault list screen. |
| `app/home.tsx` | Main dashboard screen. |
| `app/settings.tsx` | Settings, legal, support, and account actions. |

---------------------------------------

## Documentation

Full frontend documentation should be stored here:

```txt
docs/frontend-technical-documentation.md
```

Suggested docs folder:

```txt
docs/
├── frontend-technical-documentation.md
├── backend-technical-documentation.md
├── api-documentation.md
├── deployment-guide.md
└── security-overview.md
```

-------------------------------

## Testing checklist

Before releasing a preview build, test:

- Register and sign in.
- Email verification and legal acceptance flow.
- Logout and Android back-button protection.
- Vault lock and auto-lock behavior.
- Free-plan password/card/note limits.
- Free-user document upgrade prompt.
- Premium/Family document upload and download.
- Secure clipboard clearing behavior.
- Security score refresh.
- Recovery kit generate/revoke.
- Family member lookup/add/remove.
- Emergency access request/approval/denial.
- Bug report submission.
- Light, Dark, and OLED themes.

----------------------------------------

## Security notes

- The frontend should never be trusted to enforce plan limits alone. Backend services must enforce all subscription and authorization rules.
- Do not log passwords, card numbers, CVVs, secure note contents, document contents, recovery codes, JWT tokens, or encryption secrets.
- Keep sensitive functionality behind authenticated routes and backend authorization checks.
- Expo Go is useful for development, but final security-sensitive behavior should be tested in an EAS preview build.

-------------------------------

## License

Maven Apache Licence 2.0
