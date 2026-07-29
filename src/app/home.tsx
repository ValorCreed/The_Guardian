import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";

import { useAppTheme } from "../context/ThemeContext";
import PulsingSkeleton from "../components/PulsingSkeleton";
import { useSecurityScore } from "../hooks/useSecurityScore";
import { scheduleIdleTask, type IdleTaskHandle } from "../services/securityScoreSync";
import { api, VaultItem } from "../services/api";
import GuardianLogoTile from "../components/GuardianLogoTitle";
import * as Updates from "expo-updates";
import WhatsNewModal from "../components/WhatsNewModal";
import OfflineBanner from "../components/OfflineBanner";
import {
  isOfflineReadableError,
  loadOfflineVaultSnapshot,
  saveOfflineVaultSnapshot,
} from "../services/offlineVault";
import { WHATS_NEW_VERSION } from "../constants/whatsNew";
import { hapticLight, hapticMedium, hapticScoreSettled, hapticSelection, hapticWarning } from '../utils/haptics';
import { syncGuardianAutofillCache, syncPendingGuardianAutofillSaves } from '../services/autofillSync';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RECOVERY_ALERT_THROTTLE_MS = 10 * 60 * 1000;
const HOME_NEEDS_SYNC_KEY = "homeNeedsInitialSync";
const SECURITY_SCORE_NEEDS_SYNC_KEY = "securityScoreNeedsInitialSync";
const HOME_FOCUS_REFRESH_DEDUP_MS = 5000;
const HOME_FAST_REACHABILITY_TIMEOUT_MS = 1800;

type VaultTab = "Passwords" | "Documents" | "Cards" | "Notes";

const getAvatarColor = (text: string) => {
  const colors = [
    "#065F46",
    "#1D4ED8",
    "#BE123C",
    "#C2410C",
    "#7C3AED",
    "#111827",
  ];
  return colors[Math.max(0, text.length) % colors.length];
};

const safelyDecodeText = (value?: string | null) => {
  if (value === null || value === undefined) return "";

  let cleaned = String(value).trim();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!cleaned.includes("%")) break;

    try {
      const decoded = decodeURIComponent(cleaned);
      if (decoded === cleaned) break;
      cleaned = decoded.trim();
    } catch {
      break;
    }
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "string") {
      cleaned = parsed.trim();
    }
  } catch {
    // Value is not JSON. Keep the cleaned text.
  }

  return cleaned.replace(/^"+|"+$/g, "").trim();
};

const getFileExtension = (fileName?: string | null) => {
  const cleanName = safelyDecodeText(fileName || "").split("?")[0].split("#")[0];
  const parts = cleanName.split(".");

  if (parts.length < 2) return "";

  return String(parts.pop() || "").trim().toLowerCase();
};

const getFriendlyDocumentType = (
  mimeType?: string | null,
  fileName?: string | null,
) => {
  const mime = safelyDecodeText(mimeType || "").toLowerCase();
  const extension = getFileExtension(fileName);

  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";

  if (mime === "application/pdf" || extension === "pdf") return "PDF";

  if (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    extension === "docx" ||
    extension === "doc"
  ) {
    return extension === "doc" ? "DOC" : "DOCX";
  }

  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    extension === "xlsx" ||
    extension === "xls"
  ) {
    return extension === "xls" ? "XLS" : "XLSX";
  }

  if (
    mime.includes("presentationml") ||
    mime === "application/vnd.ms-powerpoint" ||
    extension === "pptx" ||
    extension === "ppt"
  ) {
    return extension === "ppt" ? "PPT" : "PPTX";
  }

  if (mime.includes("zip") || extension === "zip") return "ZIP";
  if (mime.includes("csv") || extension === "csv") return "CSV";
  if (mime.startsWith("text/") || extension === "txt") return "TXT";

  if (extension) return extension.toUpperCase();

  return "Document";
};

const getDocumentSizeFromResponse = (doc: any) => {
  const directSize = Number(doc.sizeBytes || doc.fileSize || doc.size || 0);

  if (directSize > 0) return directSize;

  try {
    const metadata =
      typeof doc.encryptedNotes === "string" ? JSON.parse(doc.encryptedNotes) : doc.encryptedNotes;

    return Number(metadata?.sizeBytes || metadata?.fileSize || 0);
  } catch {
    return 0;
  }
};


const getBestTimestamp = (item: any) =>
  item.updatedAt ||
  item.updated_at ||
  item.modifiedAt ||
  item.lastModifiedAt ||
  item.createdAt ||
  item.created_at ||
  item.uploadedAt ||
  item.uploadDate ||
  item.createdDate ||
  item.dateCreated ||
  null;

const getItemTitle = (item: VaultItem) =>
  safelyDecodeText(item.title || item.website || item.fileName) || "Vault item";

const getItemSubtitle = (item: VaultItem) => {
  if (item.itemType === "PASSWORD") {
    return (
      safelyDecodeText(item.usernameValue || item.website) || "Password login"
    );
  }

  if (item.itemType === "DOCUMENT") {
    return getFriendlyDocumentType(item.mimeType, item.fileName || item.title);
  }

  if (item.itemType === "NOTE") {
    return safelyDecodeText(item.mimeType) || "SecureNote";
  }

  return safelyDecodeText(item.usernameValue) || "Encrypted card";
};

const getItemIcon = (item: VaultItem) => {
  if (item.itemType === "PASSWORD") return "key-outline";
  if (item.itemType === "DOCUMENT") return "document-text-outline";
  if (item.itemType === "NOTE") return "reader-outline";
  return "card-outline";
};

const normalizePlan = (value?: string) => {
  if (value === "PREMIUM" || value === "FAMILY") return value;
  return "FREE";
};

type ScoreRingProps = {
  score: number;
  loading: boolean;
  focusAnimationKey: number;
  styles: any;
};

const ScoreRing = React.memo(
  ({ score, loading, focusAnimationKey, styles }: ScoreRingProps) => {
    const size = 92;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const initialScore = Math.max(0, Math.min(Number(score) || 0, 100));
    const animatedScore = useRef(new Animated.Value(initialScore)).current;
    const pulseAnim = useRef(new Animated.Value(0)).current;
    const lastFocusAnimationKey = useRef(focusAnimationKey);
    const lastDisplayedScore = useRef(initialScore);
    const lastDisplayUpdateAt = useRef(0);
    const loadingRef = useRef(loading);
    const animationRunRef = useRef(0);
    const activeScoreAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
    const [displayScore, setDisplayScore] = useState(initialScore);

    useEffect(() => {
      loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
      const listenerId = animatedScore.addListener(({ value }) => {
        const roundedValue = Math.round(value);
        const now = Date.now();

        if (roundedValue === lastDisplayedScore.current) {
          return;
        }

        /*
         * Keep the numeric count smooth without making React rerender the score
         * text on every SVG animation frame.
         */
        if (now - lastDisplayUpdateAt.current < 72) {
          return;
        }

        lastDisplayUpdateAt.current = now;
        lastDisplayedScore.current = roundedValue;
        setDisplayScore((current) =>
          current === roundedValue ? current : roundedValue
        );
      });

      return () => {
        animatedScore.removeListener(listenerId);
      };
    }, [animatedScore]);

    useEffect(() => {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 1400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
      );

      pulse.start();
      return () => pulse.stop();
    }, [pulseAnim]);

    useEffect(() => {
      if (focusAnimationKey < 0) return;

      const safeScore = Math.max(0, Math.min(Number(score) || 0, 100));
      const focusChanged =
        lastFocusAnimationKey.current !== focusAnimationKey;
      const animationRun = animationRunRef.current + 1;

      animationRunRef.current = animationRun;
      lastFocusAnimationKey.current = focusAnimationKey;

      /*
       * Continue from the ring's current visual position when the server
       * updates the score during the entrance animation. The previous version
       * stopped and recreated the timing effect from React cleanup, which
       * produced a visible hitch when Home was also hydrating cached data.
       */
      activeScoreAnimationRef.current?.stop();

      let animationStart = lastDisplayedScore.current;

      if (focusChanged) {
        animationStart = 0;
        animatedScore.setValue(0);
        lastDisplayedScore.current = 0;
        lastDisplayUpdateAt.current = Date.now();
        setDisplayScore((current) => (current === 0 ? current : 0));
      }

      const distance = Math.abs(safeScore - animationStart);
      const duration = focusChanged
        ? 920
        : Math.max(360, Math.min(720, 360 + distance * 5));

      const animation = Animated.timing(animatedScore, {
        toValue: safeScore,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
        isInteraction: false,
      });

      activeScoreAnimationRef.current = animation;

      animation.start(({ finished }) => {
        if (
          !finished ||
          animationRunRef.current !== animationRun ||
          activeScoreAnimationRef.current !== animation
        ) {
          return;
        }

        activeScoreAnimationRef.current = null;
        lastDisplayedScore.current = safeScore;
        lastDisplayUpdateAt.current = Date.now();
        setDisplayScore((current) =>
          current === safeScore ? current : safeScore
        );

        if (!loadingRef.current) {
          hapticScoreSettled(safeScore);
        }
      });
    }, [animatedScore, focusAnimationKey, score]);

    useEffect(() => {
      return () => {
        animationRunRef.current += 1;
        activeScoreAnimationRef.current?.stop();
        activeScoreAnimationRef.current = null;
      };
    }, []);

    const animatedDashOffset = animatedScore.interpolate({
      inputRange: [0, 100],
      outputRange: [circumference, 0],
      extrapolate: "clamp",
    });

    const scoreColor =
      score >= 80 ? "#FFFFFF" : score >= 50 ? "#FDE68A" : "#FCA5A5";

    const pulseScale = pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.18],
    });

    const pulseOpacity = pulseAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.12, 0.34],
    });

    return (
      <View style={styles.scoreRingWrapper}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scoreRingPulse,
            {
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />

        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth={strokeWidth}
            fill="none"
          />

          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={animatedDashOffset as any}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>

        <View style={styles.scoreTextOverlay}>
          <Text style={styles.scoreNumber}>{displayScore}</Text>
          <Text style={styles.scoreLabel}>
            {loading ? "Updating" : "Score"}
          </Text>
        </View>
      </View>
    );
  },
);

const HomeScreen = () => {
  const router = useRouter();

  const [userName, setUserName] = useState("");
  const [search, setSearch] = useState("");
  const [passwords, setPasswords] = useState<VaultItem[]>([]);
  const [documents, setDocuments] = useState<VaultItem[]>([]);
  const [cards, setCards] = useState<VaultItem[]>([]);
  const [notes, setNotes] = useState<VaultItem[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<
    "FREE" | "PREMIUM" | "FAMILY"
  >("FREE");
  const [loadingVault, setLoadingVault] = useState(false);
  const [vaultCountsReady, setVaultCountsReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);

  const homeRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastSuccessfulHomeRefreshAtRef = useRef(0);
  const deferredSecurityRefreshRef = useRef<IdleTaskHandle | null>(null);
  const deferredAutofillSyncRef = useRef<IdleTaskHandle | null>(null);
  const reloadSecurityScoreSilentlyRef = useRef<() => Promise<any>>(
    async () => undefined
  );
  const [scoreFocusAnimationKey, setScoreFocusAnimationKey] = useState(-1);

  const { colors: C } = useAppTheme();
  const {
    report,
    loading: securityScoreLoading,
    syncing: securityScoreSyncing,
    reload: reloadSecurityScore,
    reloadSilently: reloadSecurityScoreSilently,
  } = useSecurityScore();
  const styles = useMemo(() => makeStyles(C), [C]);
  const securityScoreUpdating = securityScoreLoading || securityScoreSyncing;

  /*
   * useSecurityScore exposes convenience wrappers. Keep the latest silent
   * reload in a ref so Home's focus callback does not become a new function
   * merely because that wrapper received a new identity on a render.
   */
  useEffect(() => {
    reloadSecurityScoreSilentlyRef.current = reloadSecurityScoreSilently;
  }, [reloadSecurityScoreSilently]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadName = async () => {
        const name = await AsyncStorage.getItem("userName");
        if (active) setUserName(name || "User");
      };

      void loadName();

      return () => {
        active = false;
      };
    }, []),
  );

  const getHomeCacheKey = async () => {
    const email = await AsyncStorage.getItem("userEmail");
    return `theguardian.home.snapshot.v4:${(email || "anonymous").trim().toLowerCase()}`;
  };

  const applyHomeSnapshot = useCallback((snapshot: any) => {
    setPasswords(snapshot.passwords || []);
    setDocuments(snapshot.documents || []);
    setCards(snapshot.cards || []);
    setNotes(snapshot.notes || []);
    setSubscriptionPlan(normalizePlan(snapshot.subscriptionPlan));
    setUnreadNotifications(Number(snapshot.unreadNotifications || 0));
    setOfflineSavedAt(snapshot.savedAt || null);
    setVaultCountsReady(true);
  }, []);

  const mapHomeData = (
    passwordData: any[],
    documentData: any[],
    cardData: any[],
    noteData: any[],
    subscription: any,
    notificationCount: any,
  ) => {
    const fixedPasswords = passwordData.map((item: any) => ({
      id: item.id,
      itemType: "PASSWORD" as const,
      title: safelyDecodeText(item.title),
      website: safelyDecodeText(item.website),
      usernameValue: safelyDecodeText(item.usernameValue),
      createdAt: item.createdAt || item.created_at,
      updatedAt: getBestTimestamp(item),
    }));

    const fixedDocuments = documentData.map((doc: any) => {
      const documentName =
        safelyDecodeText(
          doc.documentName ||
            doc.fileName ||
            doc.originalFileName ||
            doc.title,
        ) || "Encrypted document";

      const documentType =
        doc.documentType ||
        doc.mimeType ||
        doc.fileType ||
        doc.type ||
        "application/octet-stream";

      const timestamp =
        doc.updatedAt ||
        doc.updated_at ||
        doc.modifiedAt ||
        doc.lastModifiedAt ||
        doc.createdAt ||
        doc.created_at ||
        doc.uploadedAt ||
        doc.uploadDate ||
        doc.createdDate ||
        doc.dateCreated ||
        new Date().toISOString();

      return {
        id: doc.id,
        itemType: "DOCUMENT" as const,
        title: documentName,
        fileName: documentName,
        mimeType: documentType,
        sizeBytes: getDocumentSizeFromResponse(doc),
        createdAt: doc.createdAt || doc.created_at || timestamp,
        updatedAt: timestamp,
      };
    });

    const fixedCards = cardData.map((card: any) => {
      const cardholderName =
        safelyDecodeText(
          card.cardholderName ||
            card.cardHolderName ||
            card.encryptedCardholderName ||
            card.encryptedCardHolderName,
        ) || "Cardholder";

      return {
        id: card.id,
        itemType: "CARD" as const,
        title: safelyDecodeText(card.cardName) || "Saved Card",
        usernameValue: cardholderName,
        website: safelyDecodeText(card.last4) || "••••",
        createdAt: card.createdAt || card.created_at,
        updatedAt: getBestTimestamp(card),
      };
    });

    const fixedNotes = noteData.map((note: any) => ({
      id: note.id,
      itemType: "NOTE" as const,
      title: note.title || "SecureNote",
      mimeType: note.category || "General",
      createdAt: note.createdAt || note.created_at,
      updatedAt: getBestTimestamp(note),
    }));

    return {
      passwords: fixedPasswords,
      documents: fixedDocuments,
      cards: fixedCards,
      notes: fixedNotes,
      subscriptionPlan: normalizePlan(subscription?.plan),
      unreadNotifications: Number(notificationCount?.unreadCount || 0),
      savedAt: new Date().toISOString(),
    };
  };

  const hydrateHomeData = useCallback(async () => {
    try {
      const cacheKey = await getHomeCacheKey();
      const raw = await AsyncStorage.getItem(cacheKey);

      if (!raw) return false;

      const snapshot = JSON.parse(raw);
      applyHomeSnapshot(snapshot);
      return true;
    } catch {
      return false;
    }
  }, [applyHomeSnapshot]);

  const hydrateHomeFromOfflineVault = useCallback(async () => {
    try {
      const snapshot = await loadOfflineVaultSnapshot();
      if (!snapshot) return false;

      const cachedPlan = normalizePlan(
        (await AsyncStorage.getItem("subscriptionPlan")) || undefined
      );

      applyHomeSnapshot({
        passwords: (snapshot.passwords || []).map((item: any) => ({
          id: item.id,
          itemType: "PASSWORD" as const,
          title: safelyDecodeText(item.title),
          website: safelyDecodeText(item.website),
          usernameValue: safelyDecodeText(item.usernameValue),
          createdAt: item.createdAt,
          updatedAt: getBestTimestamp(item),
        })),
        documents: (snapshot.documents || []).map((doc: any) => ({
          id: doc.id,
          itemType: "DOCUMENT" as const,
          title:
            safelyDecodeText(doc.documentName || doc.fileName || doc.title) ||
            "Encrypted document",
          fileName:
            safelyDecodeText(doc.fileName || doc.documentName || doc.title) ||
            "Encrypted document",
          mimeType:
            doc.mimeType ||
            doc.documentType ||
            "application/octet-stream",
          sizeBytes: Number(doc.sizeBytes || 0),
          createdAt: doc.createdAt,
          updatedAt: getBestTimestamp(doc),
        })),
        cards: (snapshot.cards || []).map((card: any) => ({
          id: card.id,
          itemType: "CARD" as const,
          title: safelyDecodeText(card.cardName) || "Saved Card",
          usernameValue: "Cardholder",
          website: safelyDecodeText(card.last4) || "••••",
          createdAt: card.createdAt,
          updatedAt: getBestTimestamp(card),
        })),
        notes: (snapshot.notes || []).map((note: any) => ({
          id: note.id,
          itemType: "NOTE" as const,
          title: note.title || "SecureNote",
          mimeType: note.category || "General",
          createdAt: note.createdAt,
          updatedAt: getBestTimestamp(note),
        })),
        subscriptionPlan: cachedPlan,
        unreadNotifications: 0,
        savedAt: snapshot.savedAt,
      });

      setOfflineSavedAt(snapshot.savedAt || null);
      return true;
    } catch {
      return false;
    }
  }, [applyHomeSnapshot]);

  const fetchHomeDataFromServer = useCallback(
    (
      options: {
        force?: boolean;
        silent?: boolean;
      } = {},
    ) => {
      if (homeRefreshInFlightRef.current) {
        return homeRefreshInFlightRef.current;
      }

      const force = Boolean(options.force);
      const silent = Boolean(options.silent);

      const refreshTask = (async () => {
        try {
          const serverReachable = await api
            .checkServerReachability(HOME_FAST_REACHABILITY_TIMEOUT_MS)
            .catch(() => false);

          if (!serverReachable) {
            const hydrated =
              (await hydrateHomeData()) ||
              (await hydrateHomeFromOfflineVault());

            setOfflineMode(true);

            if (!hydrated) {
              setOfflineSavedAt(null);
            }

            return;
          }

          if (force) {
            /*
             * Every Home server refresh must bypass the API's short-lived GET
             * cache. Otherwise the Home snapshot can be rebuilt from the same
             * stale API values after a vault or notification mutation.
             */
            api.clearCache?.();
          }

          if (!silent) {
            setLoadingVault(true);
          }

          const [
            passwordData,
            documentData,
            cardData,
            noteData,
            subscription,
            notificationCount,
          ] = await Promise.all([
            api.getVaultItems(),
            api.getDocuments(),
            api.getCards(),
            api.getSecureNotes(),
            api.getSubscription().catch(() => ({ plan: "FREE" as const })),
            api
              .getUnreadNotificationCount()
              .catch(() => ({ unreadCount: 0 })),
          ]);

          const snapshot = mapHomeData(
            passwordData || [],
            documentData || [],
            cardData || [],
            noteData || [],
            subscription,
            notificationCount,
          );

          applyHomeSnapshot(snapshot);
          void syncGuardianAutofillCache({
            passwords: passwordData || [],
            cards: cardData || [],
          }).catch(() => undefined);
          setOfflineMode(false);
          setOfflineSavedAt(null);
          lastSuccessfulHomeRefreshAtRef.current = Date.now();

          await saveOfflineVaultSnapshot({
            passwords: passwordData || [],
            cards: cardData || [],
            documents: documentData || [],
            notes: noteData || [],
          });

          const cacheKey = await getHomeCacheKey();
          await AsyncStorage.setItem(cacheKey, JSON.stringify(snapshot));
          await AsyncStorage.removeItem(HOME_NEEDS_SYNC_KEY);
        } catch (error: any) {
          console.log("HOME DATA ERROR:", error);

          if (isOfflineReadableError(error)) {
            const hydrated =
              (await hydrateHomeData()) ||
              (await hydrateHomeFromOfflineVault());

            if (hydrated) {
              setOfflineMode(true);
              return;
            }
          }
        } finally {
          setVaultCountsReady(true);
          if (!silent) {
            setLoadingVault(false);
          }
        }
      })();

      homeRefreshInFlightRef.current = refreshTask;

      void refreshTask.finally(() => {
        if (homeRefreshInFlightRef.current === refreshTask) {
          homeRefreshInFlightRef.current = null;
        }
      });

      return refreshTask;
    },
    [applyHomeSnapshot, hydrateHomeData, hydrateHomeFromOfflineVault],
  );

  const loadHomeData = useCallback(async () => {
    /*
     * Show the saved dashboard immediately, then refresh it from the server
     * without replacing the visible cards with skeletons. Mutation flows set
     * HOME_NEEDS_SYNC_KEY, while the normal focus refresh also catches changes
     * created elsewhere, including new notification counts.
     */
    const hydrated = await hydrateHomeData();

    const [needsHomeSync, needsSecuritySync] = await Promise.all([
      AsyncStorage.getItem(HOME_NEEDS_SYNC_KEY),
      AsyncStorage.getItem(SECURITY_SCORE_NEEDS_SYNC_KEY),
    ]);

    if (!hydrated) {
      await fetchHomeDataFromServer({ force: true, silent: false });
    } else {
      const recentlyRefreshed =
        Date.now() - lastSuccessfulHomeRefreshAtRef.current <
        HOME_FOCUS_REFRESH_DEDUP_MS;

      if (needsHomeSync === "true" || !recentlyRefreshed) {
        void fetchHomeDataFromServer({ force: true, silent: true });
      }
    }

    if (needsSecuritySync === "true") {
      /*
       * Preserve the focus-time safety refresh, but keep it behind the Home
       * entrance and ring animation so password analysis cannot steal frames.
       */
      deferredSecurityRefreshRef.current?.cancel();
      deferredSecurityRefreshRef.current = scheduleIdleTask(
        () => {
          deferredSecurityRefreshRef.current = null;
          void reloadSecurityScoreSilentlyRef.current();
        },
        {
          delayMs: 1020,
          timeoutMs: 1500,
        }
      );
    }
  }, [fetchHomeDataFromServer, hydrateHomeData]);

  useFocusEffect(
    useCallback(() => {
      /*
       * Replay the score-ring entrance every time Home becomes active while
       * keeping cached dashboard data visible immediately.
       */
      setScoreFocusAnimationKey((current) => current + 1);

      const homeLoadPromise = loadHomeData();
      void homeLoadPromise.catch(() => undefined);

      /*
       * Autofill reconciliation can decrypt and serialize several records.
       * Keep the same synchronization behavior, but move it behind the ring's
       * entrance so that work cannot interrupt the score animation.
       */
      deferredAutofillSyncRef.current?.cancel();
      deferredAutofillSyncRef.current = scheduleIdleTask(
        () => {
          deferredAutofillSyncRef.current = null;

          void homeLoadPromise
            .then(async () => {
              try {
                const pendingResult = await syncPendingGuardianAutofillSaves();

                if (pendingResult.saved > 0 || pendingResult.updated > 0) {
                  await fetchHomeDataFromServer({
                    force: true,
                    silent: true,
                  });
                }
              } catch {
                // Pending saves remain encrypted for the next app focus.
              }
            })
            .catch(() => undefined);
        },
        {
          delayMs: 980,
          timeoutMs: 1800,
        }
      );

      return () => {
        deferredSecurityRefreshRef.current?.cancel();
        deferredSecurityRefreshRef.current = null;
        deferredAutofillSyncRef.current?.cancel();
        deferredAutofillSyncRef.current = null;
      };
    }, [fetchHomeDataFromServer, loadHomeData]),
  );

  /*
   * Android back gesture / hardware back protection:
   * Home is the authenticated root screen. If Android pops the stack from here,
   * it can expose the previous login/sign-in screen and make it look like the
   * user was logged out. We consume the back gesture while Home is focused.
   */
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => true,
      );

      return () => subscription.remove();
    }, []),
  );

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([
        fetchHomeDataFromServer({ force: true, silent: true }),
        reloadSecurityScore(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const score = report.score;
  const recoveryKitMissing = report.issues.some((issue) => issue.type === 'RECOVERY_KIT_MISSING');
  const allVaultItems = useMemo(
    () => [...passwords, ...documents, ...cards, ...notes],
    [passwords, documents, cards, notes]
  );
  const totalItems = allVaultItems.length;
  const showUpgradeBanner = subscriptionPlan === "FREE";

  const getRecentTime = (item: VaultItem) => {
    const parsed = new Date(item.updatedAt || item.createdAt || "").getTime();

    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }

    /*
     * Some older card/document responses do not include createdAt/updatedAt.
     * Falling back to the id keeps them visible in Recently updated instead
     * of making the list look like it only supports passwords and notes.
     */
    return Number(item.id || 0);
  };

  const recentItems = useMemo(() => {
    return [...allVaultItems]
      .sort((a, b) => getRecentTime(b) - getRecentTime(a))
      .slice(0, 6);
  }, [allVaultItems]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    return allVaultItems
      .filter((item) =>
        `${item.title || ""} ${item.website || ""} ${item.usernameValue || ""} ${item.fileName || ""} ${item.mimeType || ""} ${
          item.itemType === "DOCUMENT"
            ? getFriendlyDocumentType(item.mimeType, item.fileName || item.title)
            : ""
        }`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 8);
  }, [search, allVaultItems]);

  const openItem = (item: VaultItem) => {
    if (item.itemType === "NOTE") {
      router.push({
        pathname: "/notedetails",
        params: { id: String(item.id) },
      });
      return;
    }

    router.push({
      pathname: "/vaultdetails",
      params: {
        id: String(item.id),
        type: item.itemType,
      },
    });
  };

  const openVaultTab = (tab?: VaultTab) => {
    if (!tab || tab === "Passwords") {
      router.push("/vault");
    } else {
      router.push({ pathname: "/vault", params: { tab } });
    }
  };

  const scoreTitle =
    score >= 80
      ? "Strong protection"
      : score >= 50
        ? "Protection needs a few fixes"
        : "Security needs attention";

  const statCards = [
    {
      label: "Passwords",
      count: passwords.length,
      icon: "key-outline",
      tab: "Passwords" as VaultTab,
    },
    {
      label: "Documents",
      count: documents.length,
      icon: "document-text-outline",
      tab: "Documents" as VaultTab,
    },
    {
      label: "Cards",
      count: cards.length,
      icon: "card-outline",
      tab: "Cards" as VaultTab,
    },
    {
      label: "Notes",
      count: notes.length,
      icon: "reader-outline",
      tab: "Notes" as VaultTab,
    },
  ];

  const quickActions = [
    { label: "Password", icon: "key-outline", route: "/addpassword" },
    { label: "Document", icon: "document-outline", route: "/adddocument" },
    { label: "Card", icon: "card-outline", route: "/addcard" },
    { label: "Note", icon: "reader-outline", route: "/addnote" },
  ];

  const openQuickAction = async (route: string) => {
    hapticMedium();
    /*
     * When users add a vault item and return Home, Home should do one fresh
     * sync so the new/updated item appears in Recent items.
     * This keeps normal Home visits cache-first, but makes create flows feel
     * immediate after save.
     */
    await AsyncStorage.setItem("homeNeedsInitialSync", "true");
    router.push(route as any);
  };

  const renderStatsSkeleton = () => (
    <View style={styles.statsGrid}>
      {[1, 2, 3, 4].map((item) => (
        <View key={`stat-skeleton-${item}`} style={styles.statCard}>
          <View style={styles.statCardTop}>
            <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
            <PulsingSkeleton styles={styles} style={styles.skeletonChevron} />
          </View>
          <PulsingSkeleton styles={styles} style={styles.skeletonNumber} />
          <PulsingSkeleton styles={styles} style={styles.skeletonSmallText} />
        </View>
      ))}
    </View>
  );

  const renderRecentSkeleton = () => (
    <View style={styles.recentList}>
      {[1, 2, 3, 4].map((item, index) => (
        <View
          key={`recent-skeleton-${item}`}
          style={[styles.recentCard, index !== 3 && styles.recentDivider]}
        >
          <PulsingSkeleton styles={styles} style={styles.recentAvatar} />
          <View style={styles.recentText}>
            <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
            <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />
          </View>
          <PulsingSkeleton styles={styles} style={styles.skeletonPill} />
        </View>
      ))}
    </View>
  );

  //Whats new modal addition in the homescreen after updates
  useEffect(() => {
    const checkWhatsNewModal = async () => {
      try {
        /*
         * This key uses your editable WHATS_NEW_VERSION.
         * So whenever you change WHATS_NEW_VERSION in constants/whatsNew.ts,
         * the modal will show again after OTA.
         */
        const currentModalVersion = WHATS_NEW_VERSION;

        const lastSeenVersion = await AsyncStorage.getItem(
          "guardian:lastSeenWhatsNewVersion",
        );

        // console.log("WHAT IS NEW CURRENT VERSION:", currentModalVersion);
        // console.log("WHAT IS NEW LAST SEEN VERSION:", lastSeenVersion);
        // console.log("EXPO UPDATE ID:", Updates.updateId);
        // console.log("EXPO IS EMBEDDED LAUNCH:", Updates.isEmbeddedLaunch);

        if (lastSeenVersion !== currentModalVersion) {
          setShowWhatsNew(true);
        }
      } catch (error) {
        console.log("Could not check what is new modal:", error);
      }
    };

    checkWhatsNewModal();
  }, []);

  useEffect(() => {
    const showRecoveryWarning = async () => {
      if (!recoveryKitMissing) return;

      try {
        const raw = await AsyncStorage.getItem('guardian:lastRecoveryKitWarningAt');
        const previousTime = raw ? Number(raw) : 0;

        if (Date.now() - previousTime < RECOVERY_ALERT_THROTTLE_MS) {
          return;
        }

        await AsyncStorage.setItem('guardian:lastRecoveryKitWarningAt', String(Date.now()));

        setTimeout(() => {
          Alert.alert(
            'Recovery kit missing',
            'This is a serious safety risk. If you forget your password or lose access, you may permanently lose your vault. Generate your recovery kit now.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Generate now', onPress: () => router.push('/recoverykit') },
            ]
          );
        }, 450);
      } catch {
        // Warning failures should never block Home.
      }
    };

    showRecoveryWarning();
  }, [recoveryKitMissing, router]);
  /**Closing the Whats New modal */
  const closeWhatsNewModal = async () => {
    try {
      await AsyncStorage.setItem(
        "guardian:lastSeenWhatsNewVersion",
        WHATS_NEW_VERSION,
      );
    } catch (error) {
      console.log("Could not save what is new version:", error);
    } finally {
      setShowWhatsNew(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <GuardianLogoTile
              size={44}
              logoSize={32}
              radius={14}
              style={styles.headerIcon}
            />

            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName} numberOfLines={1}>
                {userName || "User"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            activeOpacity={0.75}
            onPress={() => { hapticLight(); router.push("/notifications"); }}
          >
            <Ionicons
              name={
                unreadNotifications > 0
                  ? "notifications"
                  : "notifications-outline"
              }
              size={19}
              color={C.text}
            />

            {unreadNotifications > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {offlineMode && (
          <OfflineBanner
            colors={C}
            savedAt={offlineSavedAt}
            message="The dashboard is showing your latest saved vault snapshot. Protected offline values remain available inside the Vault while editing and syncing wait for reconnection."
            onRetry={() =>
              fetchHomeDataFromServer({ force: true, silent: true })
            }
          />
        )}

        <View style={styles.heroCardShell}>
          <View style={styles.heroCard}>
            <View style={styles.heroGlowLarge} />
            <View style={styles.heroGlowSmall} />

            <View style={styles.heroTop}>
              <View style={styles.heroCopy}>
                <View style={styles.planPill}>
                  <Ionicons
                    name={
                      subscriptionPlan === "FREE"
                        ? "leaf-outline"
                        : "sparkles-outline"
                    }
                    size={13}
                    color="#fff"
                  />
                  <Text style={styles.planPillText}>{subscriptionPlan} PLAN</Text>
                </View>

                <Text style={styles.heroKicker}>{scoreTitle}</Text>
                <Text style={styles.heroTitle}>Vault overview</Text>
                <Text style={styles.heroSubtitle}>
                  {totalItems} encrypted item{totalItems === 1 ? "" : "s"}
                  {securityScoreUpdating ? " · Updating score" : ""}
                </Text>
              </View>

              <ScoreRing
                score={score}
                loading={securityScoreUpdating}
                focusAnimationKey={scoreFocusAnimationKey}
                styles={styles}
              />
            </View>

            <View style={styles.heroFooter}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>{report.issues.length}</Text>
                <Text style={styles.heroMetricLabel}>Issues</Text>
              </View>

              <View style={styles.heroDivider} />

              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricValue}>
                  {report.isPremiumOrFamily
                    ? report.breachedCount || 0
                    : report.weakCount}
                </Text>
                <Text style={styles.heroMetricLabel}>
                  {report.isPremiumOrFamily ? "Breached" : "Weak"}
                </Text>
              </View>

              <View style={styles.heroDivider} />

              <TouchableOpacity
                style={styles.heroAction}
                activeOpacity={0.8}
                onPress={() => { hapticLight(); router.push("/security"); }}
              >
                <Text style={styles.heroActionText}>Review</Text>
                <Ionicons name="arrow-forward" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {recoveryKitMissing && (
          <TouchableOpacity
            style={styles.recoveryWarningCard}
            activeOpacity={0.9}
            onPress={() => { hapticWarning(); router.push('/recoverykit'); }}
          >
            <View style={styles.recoveryWarningIcon}>
              <Ionicons name="warning-outline" size={22} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.recoveryWarningTitle}>Recovery kit missing</Text>
              <Text style={styles.recoveryWarningText}>
                Create one now so you can recover your account.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={C.tabInactive} />

          <TextInput
            style={styles.searchInput}
            placeholder="Search vault"
            placeholderTextColor={C.tabInactive}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />

          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={C.tabInactive} />
            </TouchableOpacity>
          )}
        </View>

        {search.trim().length > 0 && (
          <View style={styles.searchResultsCard}>
            <View style={styles.sectionHeaderCompact}>
              <Text style={styles.sectionTitleNoPadding}>Search results</Text>
              <Text style={styles.resultCount}>{searchResults.length}</Text>
            </View>

            {searchResults.length === 0 ? (
              <Text style={styles.emptyText}>No vault item found</Text>
            ) : (
              searchResults.map((item) => (
                <TouchableOpacity
                  key={`${item.itemType}-${item.id}`}
                  style={styles.compactItem}
                  onPress={() => openItem(item)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.compactIcon,
                      { backgroundColor: getAvatarColor(getItemTitle(item)) },
                    ]}
                  >
                    <Ionicons
                      name={getItemIcon(item) as any}
                      size={18}
                      color="#fff"
                    />
                  </View>

                  <View style={styles.compactText}>
                    <Text style={styles.compactTitle} numberOfLines={1}>
                      {getItemTitle(item)}
                    </Text>
                    <Text style={styles.compactSub} numberOfLines={1}>
                      {getItemSubtitle(item)}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={19}
                    color={C.tabInactive}
                  />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitleNoPadding}>Vault at a glance</Text>
            <Text style={styles.sectionCaption}>
              {totalItems} protected item{totalItems === 1 ? "" : "s"}
            </Text>
          </View>

          <TouchableOpacity onPress={() => router.push("/vault")}>
            {/* <Text style={styles.viewAll}>Open vault</Text> */}
          </TouchableOpacity>
        </View>

        {loadingVault || !vaultCountsReady ? (
          renderStatsSkeleton()
        ) : (
          <View style={styles.statsGrid}>
            {statCards.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.statCard}
                activeOpacity={0.82}
                onPress={() => openVaultTab(item.tab)}
              >
                <View style={styles.statCardTop}>
                  <View style={styles.statIconCircle}>
                    <Ionicons
                      name={item.icon as any}
                      size={21}
                      color={C.primary}
                    />
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={C.tabInactive}
                  />
                </View>

                <Text style={styles.statNumber}>{item.count}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoPadding}>Quick actions</Text>
          <TouchableOpacity onPress={() => router.push("/vault")}>
            {/* <Text style={styles.viewAll}>Open vault</Text> */}
          </TouchableOpacity>
        </View>

        <View style={styles.quickActions}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.actionItem}
              activeOpacity={0.85}
              onPress={() => openQuickAction(action.route)}
            >
              <View style={styles.actionBtn}>
                <Ionicons name={action.icon as any} size={27} color="#fff" />
              </View>

              <Text style={styles.actionLabel} numberOfLines={1}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleNoPadding}>Recent items</Text>
          <TouchableOpacity onPress={() => router.push("/vault")}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {loadingVault ? (
          renderRecentSkeleton()
        ) : recentItems.length === 0 ? (
          <View style={styles.loadingBox}>
            <Ionicons name="lock-closed-outline" size={28} color={C.primary} />
            <Text style={styles.emptyText}>No vault items saved yet</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recentItems.map((item, index) => {
              const title = getItemTitle(item);

              return (
                <TouchableOpacity
                  key={`recent-${item.itemType}-${item.id}`}
                  style={[
                    styles.recentCard,
                    index !== recentItems.length - 1 && styles.recentDivider,
                  ]}
                  onPress={() => openItem(item)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.recentAvatar,
                      { backgroundColor: getAvatarColor(title) },
                    ]}
                  >
                    <Ionicons
                      name={getItemIcon(item) as any}
                      size={18}
                      color="#fff"
                    />
                  </View>

                  <View style={styles.recentText}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.recentSub} numberOfLines={1}>
                      {getItemSubtitle(item)}
                    </Text>
                  </View>

                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>{item.itemType}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {showUpgradeBanner && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            activeOpacity={0.86}
            onPress={() => { hapticMedium(); router.push("/subscription?from=home"); }}
          >
            <View style={styles.upgradeIcon}>
              <Ionicons name="sparkles-outline" size={22} color="#fff" />
            </View>

            <View style={styles.upgradeText}>
              <Text style={styles.upgradeTitle}>Upgrade your protection</Text>
              <Text style={styles.upgradeSub}>
                Unlock documents, unlimited notes, backup and family sharing.
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color={C.tabInactive} />
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <WhatsNewModal visible={showWhatsNew} onClose={closeWhatsNewModal} />
    </SafeAreaView>
  );
};

export default HomeScreen;

const makeStyles = (C: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      paddingBottom: 140,
    },

    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
    },

    headerLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingRight: 12,
    },

    headerIcon: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 4,
      elevation: 2,
    },

    greeting: {
      fontSize: 12,
      color: C.textSecondary,
      fontWeight: "700",
    },

    userName: {
      fontSize: 18,
      fontWeight: "900",
      color: C.text,
      maxWidth: 210,
    },

    headerBtn: {
      position: "relative",
      width: 42,
      height: 42,
      backgroundColor: C.backgroundElement,
      borderRadius: 21,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    notificationBadge: {
      position: "absolute",
      top: -3,
      right: -3,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: C.danger,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: C.backgroundElement,
    },

    notificationBadgeText: {
      color: "#fff",
      fontSize: 9,
      fontWeight: "900",
    },

    heroCardShell: {
      marginHorizontal: 20,
      marginBottom: 18,
      borderRadius: 30,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 7,
    },

    heroCard: {
      position: "relative",
      backgroundColor: C.primary,
      borderRadius: 30,
      padding: 20,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
    },

    heroGlowLarge: {
      position: "absolute",
      width: 190,
      height: 190,
      borderRadius: 95,
      right: -82,
      top: -108,
      backgroundColor: "rgba(255,255,255,0.09)",
    },

    heroGlowSmall: {
      position: "absolute",
      width: 118,
      height: 118,
      borderRadius: 59,
      left: -54,
      bottom: -78,
      backgroundColor: "rgba(0,0,0,0.10)",
    },

    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },

    heroCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 2,
    },

    planPill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 12,
    },

    planPillText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
    },

    heroKicker: {
      color: "rgba(255,255,255,0.72)",
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "900",
      letterSpacing: 0.45,
      textTransform: "uppercase",
      marginBottom: 5,
    },

    heroTitle: {
      color: "#fff",
      fontSize: 25,
      fontWeight: "900",
      lineHeight: 30,
      letterSpacing: -0.4,
    },

    heroSubtitle: {
      color: "rgba(255,255,255,0.78)",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
    },

    scoreRingWrapper: {
      width: 92,
      height: 92,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 46,
      backgroundColor: "rgba(0,0,0,0.16)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.20)",
    },

    scoreRingPulse: {
      position: "absolute",
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: "#FFFFFF",
    },

    scoreTextOverlay: {
      position: "absolute",
      justifyContent: "center",
      alignItems: "center",
    },

    scoreNumber: {
      color: "#fff",
      fontSize: 24,
      fontWeight: "900",
    },

    scoreLabel: {
      fontSize: 9,
      color: "rgba(255,255,255,0.72)",
      textAlign: "center",
      lineHeight: 11,
      fontWeight: "800",
    },

    heroFooter: {
      marginTop: 18,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: 20,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
    },

    heroMetric: {
      flex: 1,
    },

    heroMetricValue: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "900",
    },

    heroMetricLabel: {
      color: "rgba(255,255,255,0.72)",
      fontSize: 11,
      marginTop: 2,
      fontWeight: "700",
    },

    heroDivider: {
      width: 1,
      height: 28,
      backgroundColor: "rgba(255,255,255,0.18)",
      marginHorizontal: 10,
    },

    heroAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.16)",
    },

    heroActionText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "900",
    },

    recoveryWarningCard: {
      backgroundColor: C.danger,
      borderRadius: 24,
      padding: 16,
      marginHorizontal: 20,
      marginTop: 14,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    recoveryWarningIcon: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    recoveryWarningTitle: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 15,
    },
    recoveryWarningText: {
      color: 'rgba(255,255,255,0.88)',
      fontWeight: '700',
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },

    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      marginHorizontal: 20,
      marginBottom: 16,
      paddingHorizontal: 16,
      paddingVertical: 13,
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    searchInput: {
      flex: 1,
      fontSize: 14,
      color: C.text,
      fontWeight: "600",
    },

    searchResultsCard: {
      backgroundColor: C.backgroundElement,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    sectionHeaderCompact: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },

    resultCount: {
      color: C.primary,
      fontSize: 13,
      fontWeight: "900",
    },

    compactItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
    },

    compactIcon: {
      width: 40,
      height: 40,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },

    compactText: {
      flex: 1,
    },

    compactTitle: {
      fontSize: 14,
      fontWeight: "800",
      color: C.text,
    },

    compactSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },

    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginBottom: 24,
      rowGap: 12,
    },

    statCard: {
      width: "48%",
      minHeight: 118,
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 15,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: "#000",
      shadowOpacity: 0.07,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 4,
    },

    statCardTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 13,
    },

    statIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 17,
      backgroundColor: C.actionCard,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: C.border,
    },

    statNumber: {
      fontSize: 25,
      lineHeight: 29,
      fontWeight: "900",
      color: C.text,
      letterSpacing: -0.5,
    },

    statLabel: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
      fontWeight: "800",
    },

    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      marginBottom: 12,
    },

    sectionHeadingCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 12,
    },

    sectionCaption: {
      color: C.textSecondary,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "700",
      marginTop: 2,
    },

    sectionTitleNoPadding: {
      fontSize: 23,
      fontWeight: "900",
      color: C.text,
    },

    viewAll: {
      fontSize: 13,
      color: C.primary,
      fontWeight: "900",
    },

    quickActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      marginBottom: 26,
      rowGap: 12,
    },

    actionItem: {
      width: "48%",
      minHeight: 110,
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 13,
      alignItems: "center",
      justifyContent: "center",
      gap: 11,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: "#000",
      shadowOpacity: 0.065,
      shadowRadius: 17,
      shadowOffset: { width: 0, height: 9 },
      elevation: 3,
    },

    actionBtn: {
      width: 48,
      height: 48,
      flexShrink: 0,
      backgroundColor: C.actionIconBg || C.primary,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },

    actionLabel: {
      width: "100%",
      fontSize: 14,
      lineHeight: 18,
      color: C.text,
      fontWeight: "900",
      textAlign: "center",
    },

    recentList: {
      marginHorizontal: 20,
      marginBottom: 16,
      gap: 10,
    },

    recentCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 21,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },

    recentDivider: {},

    recentAvatar: {
      width: 44,
      height: 44,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
    },

    recentText: {
      flex: 1,
    },

    recentName: {
      fontSize: 15,
      fontWeight: "900",
      color: C.text,
    },

    recentSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },

    typePill: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },

    typePillText: {
      color: C.textSecondary,
      fontSize: 9,
      fontWeight: "900",
    },

    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 2,
    },

    skeletonIcon: {
      width: 44,
      height: 44,
      borderRadius: 17,
    },

    skeletonChevron: {
      width: 18,
      height: 18,
      borderRadius: 9,
    },

    skeletonNumber: {
      width: 52,
      height: 23,
      marginBottom: 7,
    },

    skeletonSmallText: {
      width: 74,
      height: 11,
    },

    skeletonTitle: {
      width: "72%",
      height: 14,
      marginBottom: 8,
    },

    skeletonSubtitle: {
      width: "48%",
      height: 11,
    },

    skeletonPill: {
      width: 54,
      height: 24,
      borderRadius: 999,
    },

    loadingBox: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      marginHorizontal: 20,
      marginBottom: 14,
      padding: 22,
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    emptyText: {
      color: C.textSecondary,
      fontSize: 13,
      fontWeight: "700",
    },

    upgradeBanner: {
      backgroundColor: C.securityScoreBg,
      borderRadius: 22,
      marginHorizontal: 20,
      marginTop: 2,
      marginBottom: 14,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: C.securityScore,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },

    upgradeIcon: {
      width: 46,
      height: 46,
      backgroundColor: C.securityScore || C.warning,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
    },

    upgradeText: {
      flex: 1,
    },

    upgradeTitle: {
      fontSize: 15,
      fontWeight: "900",
      color: C.text,
    },

    upgradeSub: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },

    securityHint: {
      marginHorizontal: 20,
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
  });