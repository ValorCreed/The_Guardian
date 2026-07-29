import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../context/ThemeContext';
import { useBlurTarget } from '../context/BlurTargetContext';
import { hapticLight, hapticMedium, hapticWarning, hapticDelete, hapticSuccess } from '../utils/haptics';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, VaultItem } from '../services/api';
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import OfflineBanner from '../components/OfflineBanner';
import {
  findOfflineCard,
  findOfflineDocument,
  findOfflinePassword,
  isOfflineReadableError,
  loadOfflineVaultSnapshot,
} from '../services/offlineVault';
import {
  decryptJson,
  decryptPassword,
  encryptJson,
  encryptPassword,
  maskCardNumber,
  maskPassword,
} from '../utils/vaultcrypto';
import { getSecureClipboardMessage, setSecureClipboard } from '../utils/secureClipboard';
import CardBrandLogo from '../components/CardBrandLogo';
import { detectCardBrand, formatCardNumber } from '../utils/cardBrand';
import { formatExpiryInput, validateCardForm } from '../utils/cardValidation';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import { syncGuardianAutofillCache } from '../services/autofillSync';

type CardPayload = {
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  bankName: string;
  notes: string;
  offlineMetadataOnly?: boolean;
};

type DocumentPayload = {
  fileName: string;
  mimeType: string;
  base64Content: string;
};

type PreviewImageFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
};

const defaultCard: CardPayload = {
  cardholderName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  bankName: '',
  notes: '',
};

const getFileExtension = (fileName?: string | null) => {
  const cleanName = String(fileName || '').split('?')[0].split('#')[0];
  const parts = cleanName.split('.');

  if (parts.length < 2) return '';

  return String(parts.pop() || '').trim().toLowerCase();
};

const MAX_IMAGE_PREVIEW_BYTES = 20 * 1024 * 1024;

const IMAGE_FORMAT_LABELS: Record<string, string> = {
  jpeg: 'JPG',
  jpg: 'JPG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WEBP',
  heic: 'HEIC',
  heif: 'HEIF',
  avif: 'AVIF',
  bmp: 'BMP',
  svg: 'SVG',
  tif: 'TIFF',
  tiff: 'TIFF',
};

const isImageDocumentFile = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  return mime.startsWith('image/') || Boolean(IMAGE_FORMAT_LABELS[extension]);
};

const getImageDocumentFormat = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (IMAGE_FORMAT_LABELS[extension]) return IMAGE_FORMAT_LABELS[extension];

  if (mime.startsWith('image/')) {
    const subtype = mime.slice('image/'.length).split(';')[0].split('+')[0].trim();
    return IMAGE_FORMAT_LABELS[subtype] || subtype.toUpperCase() || 'IMAGE';
  }

  return 'IMAGE';
};

const getFriendlyDocumentType = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (isImageDocumentFile(mimeType, fileName)) {
    return getImageDocumentFormat(mimeType, fileName);
  }
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('audio/')) return 'Audio';

  if (mime === 'application/pdf' || extension === 'pdf') return 'PDF';

  if (
    mime.includes('wordprocessingml') ||
    mime === 'application/msword' ||
    extension === 'docx' ||
    extension === 'doc'
  ) {
    return extension === 'doc' ? 'DOC' : 'DOCX';
  }

  if (
    mime.includes('spreadsheetml') ||
    mime === 'application/vnd.ms-excel' ||
    extension === 'xlsx' ||
    extension === 'xls'
  ) {
    return extension === 'xls' ? 'XLS' : 'XLSX';
  }

  if (
    mime.includes('presentationml') ||
    mime === 'application/vnd.ms-powerpoint' ||
    extension === 'pptx' ||
    extension === 'ppt'
  ) {
    return extension === 'ppt' ? 'PPT' : 'PPTX';
  }

  if (mime.includes('zip') || extension === 'zip') return 'ZIP';
  if (mime.includes('csv') || extension === 'csv') return 'CSV';
  if (mime.startsWith('text/') || extension === 'txt') return 'TXT';

  if (extension) return extension.toUpperCase();

  return 'Document';
};


const VaultDetailsScreen = () => {
  const requestApi = useCancelableApi(api);
  const router = useRouter();
  const { id, type, returnTab, mode } = useLocalSearchParams<{
    id: string;
    type?: 'PASSWORD' | 'CARD' | 'DOCUMENT' | 'NOTE';
    returnTab?: 'Passwords' | 'Documents' | 'Cards' | 'Notes';
    mode?: 'view' | 'edit';
  }>();
  const { colors: C, isDark } = useAppTheme();
  const blurTarget = useBlurTarget();
  const styles = makeStyles(C, isDark);

  const getReturnTab = () => {
    if (returnTab === 'Documents' || returnTab === 'Cards' || returnTab === 'Notes' || returnTab === 'Passwords') {
      return returnTab;
    }

    if (type === 'DOCUMENT') return 'Documents';
    if (type === 'CARD') return 'Cards';
    if (type === 'NOTE') return 'Notes';
    return 'Passwords';
  };

  const goBackToVaultSection = () => {
    router.replace({
      pathname: '/vault',
      params: { tab: getReturnTab() },
    });
  };

  useSensitiveScreenProtection(true);

  const [item, setItem] = useState<VaultItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewingImage, setPreviewingImage] = useState(false);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const [previewImageFile, setPreviewImageFile] = useState<PreviewImageFile | null>(null);
  const previewImageUriRef = useRef<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);
  const [offlineSecretsAvailable, setOfflineSecretsAvailable] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const detailsScrollRef = useRef<ScrollView>(null);

  const keepFocusedInputVisible = (target: number) => {
    setTimeout(() => {
      const scrollResponder = detailsScrollRef.current as any;

      scrollResponder?.scrollResponderScrollNativeHandleToKeyboard?.(
        target,
        Platform.OS === 'ios' ? 118 : 150,
        true
      );
    }, Platform.OS === 'android' ? 110 : 50);
  };

  const [editWebsite, setEditWebsite] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [editCardName, setEditCardName] = useState('');
  const [editCardholderName, setEditCardholderName] = useState('');
  const [editCardNumber, setEditCardNumber] = useState('');
  const [editCardExpiry, setEditCardExpiry] = useState('');
  const [editCardCvv, setEditCardCvv] = useState('');
  const [editCardNotes, setEditCardNotes] = useState('');
  const [showEditCvv, setShowEditCvv] = useState(false);

  useEffect(() => {
    return () => {
      const cachedPreviewUri = previewImageUriRef.current;
      previewImageUriRef.current = null;

      if (cachedPreviewUri) {
        void FileSystem.deleteAsync(cachedPreviewUri, { idempotent: true }).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const cachedPreviewUri = previewImageUriRef.current;
    previewImageUriRef.current = null;
    setPreviewImageFile(null);
    setImagePreviewVisible(false);
    setPreviewingImage(false);

    if (cachedPreviewUri) {
      void FileSystem.deleteAsync(cachedPreviewUri, { idempotent: true }).catch(() => undefined);
    }
  }, [id, type]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);



  const decryptStoredText = (value?: string) => {
  if (!value) return '';

  const jsonValue = decryptJson<any>(value, null);

  if (jsonValue !== null && jsonValue !== undefined) {
    return String(jsonValue);
  }

  return decryptPassword(value);
};

  ///Loaing items from the vault such as the cards or passwords or docs
const buildCardVaultItem = (card: any): VaultItem => {
  const cardholder = card.encryptedCardholderName || card.encryptedCardHolderName;

  return {
    id: card.id,
    itemType: 'CARD',
    title: card.cardName || 'Saved Card',
    usernameValue: decryptStoredText(cardholder),
    encryptedData: encodeURIComponent(
      JSON.stringify({
        cardholderName: decryptStoredText(cardholder),
        cardNumber: decryptStoredText(card.encryptedCardNumber),
        expiry: decryptStoredText(card.encryptedExpiryDate),
        cvv: decryptStoredText(card.encryptedCvv),
        bankName: card.cardName || 'Saved Card',
        notes: decryptStoredText(card.encryptedNotes),
        offlineMetadataOnly: Boolean(card.offlineMetadataOnly),
      })
    ),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
};

const buildDocumentVaultItem = (doc: any): VaultItem => ({
  id: doc.id,
  itemType: 'DOCUMENT',
  title: doc.documentName,
  fileName: doc.documentName,
  mimeType: doc.documentType,
  encryptedData: doc.encryptedFileUrl,
  notes: doc.encryptedNotes,
  sizeBytes: (() => {
    try {
      return JSON.parse(doc.encryptedNotes || '{}').sizeBytes || 0;
    } catch (error) {
    if (isScreenRequestCancelled(error)) return;
      return 0;
    }
  })(),
});

const loadItem = async () => {
  if (!id) return;

  try {
    setLoading(true);
    setOfflineMode(false);
    setOfflineSavedAt(null);
    setOfflineSecretsAvailable(false);

    let data: VaultItem;

    if (type === 'CARD') {
      const card = await requestApi.getCard(id);
      data = buildCardVaultItem(card);
    } else if (type === 'DOCUMENT') {
      const doc = await requestApi.getDocument(id);
      data = buildDocumentVaultItem(doc);
    } else {
      data = await requestApi.getVaultItem(id);
    }

    setItem(data);

    if (data.itemType === 'PASSWORD') {
      setEditWebsite(data.website || data.title || '');
      setEditUsername(data.usernameValue || '');
      setEditPassword(data.encryptedPassword ? decryptPassword(data.encryptedPassword) : '');
      setEditNotes(data.notes || '');
      setEditingPassword(mode === 'edit');
      setEditingCard(false);
    } else if (data.itemType === 'CARD') {
      const cardData = decryptJson<CardPayload>(
        data.encryptedData || '',
        defaultCard
      );

      setEditCardName(cardData.bankName || data.title || '');
      setEditCardholderName(cardData.cardholderName || data.usernameValue || '');
      setEditCardNumber(cardData.cardNumber || '');
      setEditCardExpiry(cardData.expiry || '');
      setEditCardCvv(cardData.cvv || '');
      setEditCardNotes(cardData.notes || '');
      setEditingCard(mode === 'edit');
      setEditingPassword(false);
    } else if (data.itemType === 'DOCUMENT') {
      setEditingPassword(false);
      setEditingCard(false);
    }
  } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
    if (isOfflineReadableError(error)) {
      const snapshot = await loadOfflineVaultSnapshot();
      let offlineData: VaultItem | null = null;

      if (type === 'CARD') {
        const card = await findOfflineCard(id);
        offlineData = card ? buildCardVaultItem(card) : null;
      } else if (type === 'DOCUMENT') {
        const doc = await findOfflineDocument(id);
        offlineData = doc ? buildDocumentVaultItem(doc) : null;
      } else {
        offlineData = await findOfflinePassword(id) as VaultItem | null;
      }

      if (offlineData) {
        setItem(offlineData);
        setOfflineMode(true);
        setOfflineSavedAt(snapshot?.savedAt || null);
        setOfflineSecretsAvailable(Boolean(snapshot?.secureSecretsAvailable));

        if (offlineData.itemType === 'PASSWORD') {
          setEditWebsite(offlineData.website || offlineData.title || '');
          setEditUsername(offlineData.usernameValue || '');
          setEditPassword(offlineData.encryptedPassword ? decryptPassword(offlineData.encryptedPassword) : '');
          setEditNotes(offlineData.notes || '');
        } else if (offlineData.itemType === 'CARD') {
          const cardData = decryptJson<CardPayload>(
            offlineData.encryptedData || '',
            defaultCard
          );
          setEditCardName(cardData.bankName || offlineData.title || '');
          setEditCardholderName(cardData.cardholderName || offlineData.usernameValue || '');
          setEditCardNumber(cardData.cardNumber || '');
          setEditCardExpiry(cardData.expiry || '');
          setEditCardCvv(cardData.cvv || '');
          setEditCardNotes(cardData.notes || '');
        }

        setEditingPassword(false);
        setEditingCard(false);
        return;
      }
    }

    Alert.alert('Error', error.message || 'Could not load item.');
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    loadItem();
  }, [id, type, mode]);

  const copyValue = async (label: string, value?: string) => {
    if (!value) return;
    await setSecureClipboard(value);
    Alert.alert('Copied', getSecureClipboardMessage(label));
  };

  const showOfflineWriteWarning = () => {
    Alert.alert(
      'Offline mode',
      offlineSecretsAvailable
        ? 'This item is available from the encrypted offline vault. Connect to The Guardian to edit or delete it.'
        : 'Only this item’s metadata is available offline. Reconnect and refresh the vault to restore protected offline access to its secret values.'
    );
  };

  const savePasswordChanges = async () => {
    if (offlineMode) {
      showOfflineWriteWarning();
      return;
    }

    if (!item || saving) return;

    if (!editWebsite.trim() || !editUsername.trim() || !editPassword.trim()) {
      Alert.alert('Missing info', 'Website, username and password are required.');
      return;
    }

    try {
      setSaving(true);
      const updated = await requestApi.updateVaultItem(item.id, {
        title: editWebsite.trim(),
        website: editWebsite.trim(),
        usernameValue: editUsername.trim(),
        encryptedPassword: encryptPassword(editPassword.trim()),
        notes: editNotes.trim(),
      });

      const safeUpdatedItem: VaultItem = {
        ...item,
        ...(updated || {}),
        itemType: 'PASSWORD',
        title: editWebsite.trim(),
        website: editWebsite.trim(),
        usernameValue: editUsername.trim(),
        encryptedPassword: encryptPassword(editPassword.trim()),
        notes: editNotes.trim(),
      };

      setItem(safeUpdatedItem);
      setEditingPassword(false);
      setShowSecret(false);
      hapticSuccess();
      void syncGuardianAutofillCache().catch(() => undefined);
      Alert.alert('Updated', 'Password updated successfully.');
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Update failed', error.message || 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };


  const saveCardChanges = async () => {
    if (offlineMode) {
      showOfflineWriteWarning();
      return;
    }

    if (!item || item.itemType !== 'CARD' || saving) return;

    const validation = validateCardForm({
      cardholderName: editCardholderName,
      cardNumber: editCardNumber,
      expiry: editCardExpiry,
      cvv: editCardCvv,
    });

    if (!validation.valid) {
      Alert.alert(
        validation.errorTitle || 'Invalid card details',
        validation.errorMessage || 'Check the card details and try again.'
      );
      return;
    }

    const cleanCardNumber = validation.cardNumber;
    const cleanCvv = validation.cvv;

    try {
      setSaving(true);

      const updated = await requestApi.updateCard(item.id, {
        cardName:
          editCardName.trim() ||
          `Card ending ${cleanCardNumber.slice(-4)}`,
        encryptedCardNumber: encryptJson(cleanCardNumber),
        encryptedExpiryDate: encryptJson(validation.expiry),
        encryptedCvv: encryptJson(cleanCvv),
        encryptedCardholderName: encryptJson(editCardholderName.trim()),
        encryptedNotes: encryptJson(editCardNotes.trim()),
      });

      const safeUpdatedItem = buildCardVaultItem(updated);
      setItem(safeUpdatedItem);
      setEditingCard(false);
      setShowSecret(false);
      setShowEditCvv(false);
      hapticSuccess();
      void syncGuardianAutofillCache().catch(() => undefined);
      Alert.alert('Updated', 'Card updated successfully.');
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      Alert.alert('Update failed', error.message || 'Could not update card.');
    } finally {
      setSaving(false);
    }
  };


  //Delete the current item from the vault
  const deleteCurrentItem = async () => {
  if (deleting) return;

  if (offlineMode) {
    showOfflineWriteWarning();
    return;
  }

  if (!item) return;

  Alert.alert(
    'Delete item',
    'Are you sure you want to delete this item? This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            setDeleting(true);

            if (item.itemType === 'CARD') {
              await requestApi.deleteCard(item.id);
            } else if (item.itemType === 'DOCUMENT') {
              await requestApi.deleteDocument(item.id);
            } else {
              await requestApi.deleteVaultItem(item.id);
            }

            hapticSuccess();
            void syncGuardianAutofillCache().catch(() => undefined);
            Alert.alert('Deleted', 'Item deleted successfully.', [
              { text: 'OK', onPress: goBackToVaultSection },
            ]);
          } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
            hapticWarning();
            Alert.alert('Delete failed', error.message || 'Could not delete item.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]
  );
};

  const previewImageDocument = async () => {
    if (
      !item ||
      item.itemType !== 'DOCUMENT' ||
      !isImageDocumentFile(item.mimeType, item.fileName || item.title) ||
      previewingImage
    ) {
      return;
    }

    if (offlineMode) {
      showOfflineWriteWarning();
      return;
    }

    if ((item.sizeBytes || 0) > MAX_IMAGE_PREVIEW_BYTES) {
      hapticWarning();
      Alert.alert(
        'Preview too large',
        'For stability, images larger than 20 MB must be downloaded or shared instead of previewed in the app.'
      );
      return;
    }

    if (previewImageFile?.uri) {
      hapticLight();
      setImagePreviewVisible(true);
      return;
    }

    const previewItemId = String(item.id);

    try {
      hapticMedium();
      setPreviewingImage(true);

      const safeName = (item.fileName || item.title || 'image').replace(/[^a-zA-Z0-9._-]/g, '_');
      const mimeType = item.mimeType || 'application/octet-stream';
      const downloaded = await requestApi.downloadDocumentToCache(item.id, safeName, mimeType);

      if (String(id) !== previewItemId) {
        void FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
        return;
      }

      if (!isImageDocumentFile(downloaded.mimeType || mimeType, downloaded.fileName || safeName)) {
        void FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
        throw new Error('This document is not a supported image file.');
      }

      if ((downloaded.sizeBytes || 0) > MAX_IMAGE_PREVIEW_BYTES) {
        void FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
        throw new Error('This image is larger than the 20 MB in-app preview limit. Please download or share it instead.');
      }

      const previousUri = previewImageUriRef.current;
      if (previousUri && previousUri !== downloaded.uri) {
        void FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(() => undefined);
      }

      const previewFile: PreviewImageFile = {
        uri: downloaded.uri,
        fileName: downloaded.fileName || safeName,
        mimeType: downloaded.mimeType || mimeType,
        sizeBytes: downloaded.sizeBytes,
      };

      previewImageUriRef.current = previewFile.uri;
      setPreviewImageFile(previewFile);
      setImagePreviewVisible(true);
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;

      const message = String(error?.message || '').toLowerCase();
      hapticWarning();
      Alert.alert(
        'Preview unavailable',
        message.includes('timed out') || message.includes('timeout')
          ? 'The image preview took too long to load. Please try again on a stronger connection.'
          : error?.message || 'The Guardian could not prepare this image preview.'
      );
    } finally {
      setPreviewingImage(false);
    }
  };

  const handlePreviewImageError = () => {
    const failedUri = previewImageUriRef.current;
    previewImageUriRef.current = null;
    setPreviewImageFile(null);
    setImagePreviewVisible(false);

    if (failedUri) {
      void FileSystem.deleteAsync(failedUri, { idempotent: true }).catch(() => undefined);
    }

    hapticWarning();
    Alert.alert(
      'Preview unavailable',
      'This image format could not be displayed on your device. You can still download or share the file.'
    );
  };

  const downloadDocument = async () => {
    if (!item || item.itemType !== 'DOCUMENT' || downloading) return;

    if (offlineMode) {
      showOfflineWriteWarning();
      return;
    }

    try {
      setDownloading(true);

      const safeName = (item.fileName || item.title || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
      const mimeType = item.mimeType || 'application/octet-stream';

      const downloaded = await requestApi.downloadDocumentToCache(item.id, safeName, mimeType);

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (permissions.granted) {
        const base64Content = await FileSystem.readAsStringAsync(downloaded.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          downloaded.fileName || safeName,
          downloaded.mimeType || mimeType
        );

        await FileSystem.writeAsStringAsync(uri, base64Content, {
          encoding: FileSystem.EncodingType.Base64,
        });

        hapticSuccess();
        Alert.alert('Downloaded', 'Document saved to the folder you selected.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: downloaded.mimeType || mimeType,
          dialogTitle: 'Share document',
        });
        hapticSuccess();
      } else {
        Alert.alert('Saved temporarily', downloaded.uri);
      }
    } catch (error: any) {
    if (isScreenRequestCancelled(error)) return;
      const message = String(error?.message || '').toLowerCase();
      hapticWarning();
      Alert.alert(
        'Download failed',
        message.includes('timed out') || message.includes('timeout')
          ? 'The download took too long. Please try again on a stronger connection.'
          : error.message || 'Could not download document.'
      );
    } finally {
      setDownloading(false);
    }
  };


  const renderDeleteButton = (label: string) => (
    <TouchableOpacity
      style={[
        styles.secondaryBtn,
        styles.deleteBtn,
        { borderColor: C.danger },
        deleting && styles.mainBtnDisabled,
      ]}
      onPress={offlineMode ? () => { hapticWarning(); showOfflineWriteWarning(); } : () => { hapticDelete(); deleteCurrentItem(); }}
      disabled={deleting}
      activeOpacity={0.85}
    >
      {deleting ? (
        <ActivityIndicator size="small" color={C.danger} />
      ) : (
        <Ionicons name="trash-outline" size={18} color={C.danger} />
      )}
      <Text style={[styles.secondaryBtnText, { color: C.danger }]}>
        {deleting ? 'Deleting...' : label}
      </Text>
    </TouchableOpacity>
  );

  const renderDetailsSkeleton = () => (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.skeletonScrollContent}
      >
        <PulsingSkeleton styles={styles} style={styles.skeletonHeaderTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonIcon} />
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />

        <View style={styles.infoCard}>
          {[1, 2, 3, 4].map((row, index) => (
            <View key={`vault-details-skeleton-${row}`}>
              <View style={styles.skeletonInfoRow}>
                <View style={{ flex: 1 }}>
                  <PulsingSkeleton styles={styles} style={styles.skeletonInfoLabel} />
                  <PulsingSkeleton styles={styles} style={styles.skeletonInfoValue} />
                </View>
                <PulsingSkeleton styles={styles} style={styles.skeletonRoundButton} />
              </View>
              {index !== 3 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <PulsingSkeleton styles={styles} style={styles.skeletonMainButton} />
        <PulsingSkeleton styles={styles} style={styles.skeletonSecondaryButton} />
      </ScrollView>
    </SafeAreaView>
  );

  if (loading) {
    return renderDetailsSkeleton();
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>Item not found.</Text>
          <TouchableOpacity style={styles.mainBtn} onPress={goBackToVaultSection}>
            <Text style={styles.mainBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const plainPassword = item.encryptedPassword ? decryptPassword(item.encryptedPassword) : '';
  const card = item.itemType === 'CARD' ? decryptJson<CardPayload>(item.encryptedData || '', defaultCard) : defaultCard;
  const cardBrand = detectCardBrand(card.bankName || item.title || '', card.cardNumber);

  const isImageDocument =
    item.itemType === 'DOCUMENT' &&
    isImageDocumentFile(item.mimeType, item.fileName || item.title);

  const editing = editingPassword || editingCard;
  const keyboardScrollPadding = editing
    ? Math.max(190, keyboardHeight + 130)
    : 80;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        ref={detailsScrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: keyboardScrollPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        nestedScrollEnabled
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vault Details</Text>
          <View style={{ width: 36 }} />
        </View>

        {offlineMode && (
          <OfflineBanner
            colors={C}
            savedAt={offlineSavedAt}
            message={offlineSecretsAvailable
              ? "Loaded from the encrypted offline vault. Secret values can be viewed and copied; editing and deletion require reconnection."
              : "Only item metadata is available offline. Reconnect and refresh the vault to restore protected access to secret values."}
            onRetry={loadItem}
          />
        )}

        {item.itemType === 'PASSWORD' && (
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Ionicons name="key-outline" size={28} color={C.primary} />
            </View>

            {editingPassword ? (
              <>
                <Text style={styles.label}>Website / App</Text>
                <TextInput
                  style={styles.input}
                  value={editWebsite}
                  onChangeText={setEditWebsite}
                  placeholderTextColor={C.tabInactive}
                  autoFocus={mode === 'edit'}
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  value={editUsername}
                  onChangeText={setEditUsername}
                  placeholderTextColor={C.tabInactive}
                  autoCapitalize="none"
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={editPassword}
                  onChangeText={setEditPassword}
                  placeholderTextColor={C.tabInactive}
                  autoCapitalize="none"
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholderTextColor={C.tabInactive}
                  multiline
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <TouchableOpacity style={styles.mainBtn} onPress={savePasswordChanges} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
                  <Text style={styles.mainBtnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setEditingPassword(false)}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>{item.title || item.website}</Text>
                <Text style={styles.subtitle}>{item.website}</Text>

                <View style={styles.infoCard}>
                  <InfoRow label="Username" value={item.usernameValue || ''} onCopy={() => copyValue('Username', item.usernameValue)} styles={styles} C={C} />
                  <View style={styles.divider} />
                  <InfoRow
                    label="Password"
                    value={showSecret ? plainPassword : maskPassword(plainPassword)}
                    onCopy={() => copyValue('Password', plainPassword)}
                    rightIcon={showSecret ? 'eye-off-outline' : 'eye-outline'}
                    onRightPress={() => setShowSecret((v) => !v)}
                    styles={styles}
                    C={C}
                  />
                  {!!item.notes && <View style={styles.divider} />}
                  {!!item.notes && <InfoRow label="Notes" value={item.notes} onCopy={() => copyValue('Notes', item.notes)} styles={styles} C={C} />}
                </View>

                <TouchableOpacity style={styles.mainBtn} onPress={offlineMode ? showOfflineWriteWarning : () => setEditingPassword(true)}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.mainBtnText}>{offlineMode ? 'Read-only offline mode' : 'Edit Password / Notes'}</Text>
                </TouchableOpacity>

                {renderDeleteButton('Delete Password')}
              </>
            )}
          </View>
        )}

        {item.itemType === 'CARD' && (
          <View style={styles.content}>
            {editingCard ? (
              <>
                <View style={styles.iconCircle}>
                  <Ionicons name="card-outline" size={28} color={C.primary} />
                </View>

                <Text style={styles.label}>Card name / Bank</Text>
                <TextInput
                  style={styles.input}
                  value={editCardName}
                  onChangeText={setEditCardName}
                  placeholder="Card name"
                  placeholderTextColor={C.tabInactive}
                  autoFocus={mode === 'edit'}
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>Cardholder name</Text>
                <TextInput
                  style={styles.input}
                  value={editCardholderName}
                  onChangeText={setEditCardholderName}
                  placeholder="Cardholder name"
                  placeholderTextColor={C.tabInactive}
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>Card number</Text>
                <TextInput
                  style={styles.input}
                  value={editCardNumber}
                  onChangeText={(value) => setEditCardNumber(formatCardNumber(value))}
                  placeholder="Card number"
                  placeholderTextColor={C.tabInactive}
                  keyboardType="number-pad"
                  maxLength={19}
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>Expiry</Text>
                <TextInput
                  style={styles.input}
                  value={editCardExpiry}
                  onChangeText={(value) => setEditCardExpiry(formatExpiryInput(value))}
                  placeholder="MM/YY"
                  placeholderTextColor={C.tabInactive}
                  maxLength={7}
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <Text style={styles.label}>CVV</Text>
                <View style={styles.secureInputWrap}>
                  <TextInput
                    style={styles.secureInput}
                    value={editCardCvv}
                    onChangeText={(value) =>
                      setEditCardCvv(value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="CVV"
                    placeholderTextColor={C.tabInactive}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry={!showEditCvv}
                    autoCorrect={false}
                    onFocus={(event) =>
                      keepFocusedInputVisible(event.nativeEvent.target)
                    }
                  />

                  <TouchableOpacity
                    style={styles.secureInputToggle}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel={showEditCvv ? 'Hide CVV' : 'Show CVV'}
                    onPress={() => {
                      hapticLight();
                      setShowEditCvv((current) => !current);
                    }}
                  >
                    <Ionicons
                      name={showEditCvv ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={C.primary}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={editCardNotes}
                  onChangeText={setEditCardNotes}
                  placeholder="Add optional notes"
                  placeholderTextColor={C.tabInactive}
                  multiline
                  textAlignVertical="top"
                  onFocus={(event) =>
                    keepFocusedInputVisible(event.nativeEvent.target)
                  }
                />

                <TouchableOpacity
                  style={[styles.mainBtn, saving && styles.mainBtnDisabled]}
                  onPress={saveCardChanges}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="save-outline" size={18} color="#fff" />
                  )}
                  <Text style={styles.mainBtnText}>
                    {saving ? 'Saving...' : 'Save Card Changes'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setShowEditCvv(false);
                    setEditingCard(false);
                  }}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.cardPreview}>
                  <View style={styles.previewTop}>
                    <CardBrandLogo brand={cardBrand} />
                    <Text style={styles.bankPreview}>{card.bankName || item.title || 'Saved Card'}</Text>
                  </View>

                  <Text style={styles.cardNumberPreview}>
                    {showSecret ? formatCard(card.cardNumber) : maskCardNumber(card.cardNumber)}
                  </Text>

                  <View style={styles.previewBottom}>
                    <View>
                      <Text style={styles.previewLabel}>CARD HOLDER</Text>
                      <Text style={styles.cardNamePreview}>{card.cardholderName || item.usernameValue}</Text>
                    </View>

                    <View>
                      <Text style={styles.previewLabel}>EXPIRES</Text>
                      <Text style={styles.cardNamePreview}>{card.expiry || 'MM/YY'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.infoCard}>
                  <InfoRow label="Cardholder" value={card.cardholderName} onCopy={() => copyValue('Cardholder name', card.cardholderName)} styles={styles} C={C} />
                  <View style={styles.divider} />
                  <InfoRow label="Card number" value={showSecret ? formatCard(card.cardNumber) : maskCardNumber(card.cardNumber)} onCopy={() => copyValue('Card number', card.cardNumber)} styles={styles} C={C} />
                  <View style={styles.divider} />
                  <InfoRow label="Expiry" value={card.expiry} onCopy={() => copyValue('Expiry', card.expiry)} styles={styles} C={C} />
                  <View style={styles.divider} />
                  <InfoRow label="CVV" value={showSecret ? card.cvv : '•••'} onCopy={() => copyValue('CVV', card.cvv)} styles={styles} C={C} />
                  {!!card.notes && <View style={styles.divider} />}
                  {!!card.notes && (
                    <InfoRow
                      label="Notes"
                      value={card.notes}
                      onCopy={() => copyValue('Notes', card.notes)}
                      styles={styles}
                      C={C}
                    />
                  )}
                </View>

                <TouchableOpacity
                  style={styles.mainBtn}
                  onPress={
                    offlineMode
                      ? showOfflineWriteWarning
                      : () => {
                          setShowEditCvv(false);
                          setEditingCard(true);
                        }
                  }
                >
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.mainBtnText}>{offlineMode ? 'Read-only offline mode' : 'Edit Card'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryBtn} onPress={() => { hapticMedium(); setShowSecret((v) => !v); }}>
                  <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.primary} />
                  <Text style={[styles.secondaryBtnText, { color: C.primary }]}>{showSecret ? 'Hide Card Info' : 'Reveal Card Info'}</Text>
                </TouchableOpacity>

                {renderDeleteButton('Delete Card')}
              </>
            )}
          </View>
        )}

{item.itemType === 'DOCUMENT' && (
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Ionicons
                name={isImageDocument ? 'image-outline' : 'document-text-outline'}
                size={28}
                color={C.primary}
              />
            </View>

            <Text style={styles.title}>{item.fileName || item.title}</Text>
            <Text style={styles.subtitle}>
              {getFriendlyDocumentType(item.mimeType, item.fileName || item.title)}
            </Text>

            {isImageDocument && (
              <TouchableOpacity
                style={[
                  styles.documentPreviewPlaceholder,
                  (previewingImage || offlineMode) && styles.documentPreviewDisabled,
                ]}
                activeOpacity={0.82}
                onPress={previewImageDocument}
                disabled={previewingImage}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${getImageDocumentFormat(item.mimeType, item.fileName || item.title)} image`}
                accessibilityState={{ busy: previewingImage, disabled: previewingImage }}
              >
                <View style={styles.documentPreviewIconWrap}>
                  {previewingImage ? (
                    <ActivityIndicator size="small" color={C.primary} />
                  ) : (
                    <Ionicons name="image-outline" size={25} color={C.primary} />
                  )}
                </View>
                <View style={styles.documentPreviewCopy}>
                  <Text style={styles.documentPreviewTitle}>
                    {previewingImage
                      ? 'Preparing secure preview...'
                      : `Preview ${getImageDocumentFormat(item.mimeType, item.fileName || item.title)} image`}
                  </Text>
                </View>
                {!previewingImage && (
                  <Ionicons name="expand-outline" size={20} color={C.primary} />
                )}
              </TouchableOpacity>
            )}

            <View style={styles.infoCard}>
              <InfoRow
                label="File name"
                value={item.fileName || item.title}
                onCopy={() => copyValue('File name', item.fileName || item.title)}
                styles={styles}
                C={C}
              />
              <View style={styles.divider} />
              <InfoRow
                label="Type"
                value={getFriendlyDocumentType(item.mimeType, item.fileName || item.title)}
                onCopy={() =>
                  copyValue(
                    'File type',
                    getFriendlyDocumentType(item.mimeType, item.fileName || item.title)
                  )
                }
                styles={styles}
                C={C}
              />
              <View style={styles.divider} />
              <InfoRow
                label="Size"
                value={formatSize(item.sizeBytes)}
                onCopy={() => copyValue('Size', formatSize(item.sizeBytes))}
                styles={styles}
                C={C}
              />
            </View>

            <TouchableOpacity
              style={[styles.secondaryBtn, downloading && styles.mainBtnDisabled]}
              onPress={() => {
                hapticMedium();
                downloadDocument();
              }}
              disabled={downloading}
            >
              {downloading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <Ionicons name="download-outline" size={18} color={C.primary} />
              )}
              <Text style={[styles.secondaryBtnText, { color: C.primary }]}>
                {downloading ? 'Preparing document...' : 'Download / Share Document'}
              </Text>
            </TouchableOpacity>

            {renderDeleteButton('Delete Document')}
          </View>
        )}

        <View style={{ height: 50 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={imagePreviewVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImagePreviewVisible(false)}
      >
        <View style={styles.imagePreviewModal}>
          {blurTarget?.targetRef ? (
            <BlurView
              blurTarget={blurTarget.targetRef}
              blurMethod={
                Platform.OS === 'android'
                  ? ('dimezisBlurViewSdk31Plus' as any)
                  : undefined
              }
              blurReductionFactor={Platform.OS === 'android' ? 2 : undefined}
              intensity={Platform.OS === 'android' ? 22 : 34}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View style={styles.imagePreviewFallbackBlur} />
          )}

          <View style={styles.imagePreviewBackdrop} />

          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              hapticLight();
              setImagePreviewVisible(false);
            }}
            accessibilityRole="button"
            accessibilityLabel="Close image preview"
          />

          <View style={styles.imagePreviewModalCard}>
            <View style={styles.imagePreviewHeader}>
              <View style={styles.imagePreviewHeaderText}>
                <Text style={styles.imagePreviewModalTitle} numberOfLines={1}>
                  {item?.fileName || item?.title || 'Image preview'}
                </Text>
                <Text style={styles.imagePreviewModalType}>
                  {getImageDocumentFormat(
                    previewImageFile?.mimeType || item?.mimeType,
                    previewImageFile?.fileName || item?.fileName || item?.title
                  )}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.imagePreviewCloseButton}
                onPress={() => {
                  hapticLight();
                  setImagePreviewVisible(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close image preview"
              >
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>

            {!!previewImageFile?.uri && (
              <Image
                source={{ uri: previewImageFile.uri }}
                style={styles.imagePreview}
                resizeMode="contain"
                onError={handlePreviewImageError}
                accessibilityLabel={item?.fileName || item?.title || 'Vault image'}
              />
            )}
          </View>
        </View>
      </Modal>

      {deleting && (
        <View style={styles.deleteOverlay} pointerEvents="auto">
          <View style={styles.deleteOverlayCard}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.deleteOverlayTitle}>Deleting item...</Text>
            <Text style={styles.deleteOverlayText}>Please wait while The Guardian securely removes this vault item.</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const InfoRow = ({
  label,
  value,
  onCopy,
  rightIcon,
  onRightPress,
  styles,
  C,
}: any) => (
  <View style={styles.infoRow}>
    <View style={{ flex: 1 }}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '-'}</Text>
    </View>
    {rightIcon && (
      <TouchableOpacity style={styles.iconBtn} onPress={onRightPress}>
        <Ionicons name={rightIcon} size={19} color={C.primary} />
      </TouchableOpacity>
    )}
    <TouchableOpacity style={styles.iconBtn} onPress={() => { hapticLight(); onCopy(); }}>
      <Ionicons name="copy-outline" size={19} color={C.primary} />
    </TouchableOpacity>
  </View>
);

const formatCard = (cardNumber?: string) => {
  const cleaned = (cardNumber || '').replace(/\D/g, '').slice(0, 16);
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join('  ') : cleaned;
};

//Display the size of the document in a human-readable format

const formatSize = (bytes?: number) => {
  if (bytes === undefined || bytes === null || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};



export default VaultDetailsScreen;

// change 1
type ThemeColors = any;

const makeStyles = (C: ThemeColors, isDark: boolean) => {
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    keyboardAvoider: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
    },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    loadingText: { color: C.textSecondary, marginTop: 12, fontSize: 15 },
    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonScrollContent: {
      paddingHorizontal: 20,
      paddingTop: 96,
      paddingBottom: 120,
      alignItems: 'center',
    },
    skeletonHeaderTitle: {
      width: 140,
      height: 18,
      marginBottom: 28,
    },
    skeletonIcon: {
      width: 72,
      height: 72,
      borderRadius: 24,
      marginBottom: 18,
    },
    skeletonTitle: {
      width: '64%',
      height: 24,
      marginBottom: 10,
    },
    skeletonSubtitle: {
      width: '44%',
      height: 13,
      marginBottom: 22,
    },
    skeletonInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    skeletonInfoLabel: {
      width: 76,
      height: 11,
      marginBottom: 8,
    },
    skeletonInfoValue: {
      width: '72%',
      height: 15,
    },
    skeletonRoundButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    skeletonMainButton: {
      width: '100%',
      height: 54,
      borderRadius: 999,
      marginTop: 8,
    },
    skeletonSecondaryButton: {
      width: '100%',
      height: 54,
      borderRadius: 999,
      marginTop: 10,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 96, paddingBottom: 16 },
    backBtn: { width: 36, height: 36, backgroundColor: C.backgroundSelected, borderRadius: 18, justifyContent: 'center', alignItems: 'center'
     , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
    content: { paddingHorizontal: 20, alignItems: 'center' },
    iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.actionCard, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    title: { fontSize: 24, fontWeight: '800', color: C.text, textAlign: 'center' },
    subtitle: { fontSize: 14, color: C.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 22 },
    infoCard: { width: '100%', backgroundColor: C.backgroundElement, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 18
    ,  shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    infoLabel: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
    infoValue: { fontSize: 15, color: C.text, fontWeight: '600' },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
    iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.actionCard, justifyContent: 'center', alignItems: 'center'
    ,  shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    mainBtn: { width: '100%', backgroundColor: C.backgroundbutton, paddingVertical: 16, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8
     , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    mainBtnDisabled: { opacity: 0.65 },
    mainBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn: { width: '100%', backgroundColor: C.backgroundElement, paddingVertical: 16, borderRadius: 50, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginTop: 10
    ,  shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    secondaryBtnText: { color: C.text, fontWeight: '800', fontSize: 15 },
    deleteBtn: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    deleteOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.38)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 28,
      zIndex: 99,
    },
    deleteOverlayCard: {
      width: '100%',
      backgroundColor: C.backgroundElement,
      borderRadius: 26,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,

      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    deleteOverlayTitle: {
      color: C.text,
      fontSize: 18,
      fontWeight: '900',
      marginTop: 14,
      textAlign: 'center',
    },
    deleteOverlayText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 6,
      textAlign: 'center',
    },
    label: { width: '100%', fontSize: 14, color: C.text, fontWeight: '700', marginBottom: 8 },
    input: { width: '100%', backgroundColor: C.backgroundElement, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 15, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    multilineInput: {
      minHeight: 96,
      paddingTop: 14,
    },

    secureInputWrap: {
      width: '100%',
      position: 'relative',
      marginBottom: 16,
    },
    secureInput: {
      width: '100%',
      backgroundColor: C.backgroundElement,
      borderRadius: 50,
      paddingLeft: 18,
      paddingRight: 58,
      paddingVertical: 15,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
    },
    secureInputToggle: {
      position: 'absolute',
      right: 7,
      top: 6,
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notesInput: { width: '100%', backgroundColor: C.backgroundElement, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 15, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 16, minHeight: 90, textAlignVertical: 'top' },
    cardPreview: { width: '100%', backgroundColor: C.primary, borderRadius: 22, padding: 24, height: 200, justifyContent: 'space-between', marginBottom: 20
     , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    previewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chip: { width: 44, height: 32, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 6 },
    bankPreview: { color: '#fff', fontWeight: '800', fontSize: 14 },
    cardNumberPreview: { color: '#fff', fontSize: 19, fontWeight: '700', letterSpacing: 2 },
    previewBottom: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 9, marginBottom: 4, letterSpacing: 1 },
    cardNamePreview: { color: '#fff', fontWeight: '800', fontSize: 14 },
    documentPreviewPlaceholder: {
      width: '100%',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.backgroundElement,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 18,
      shadowColor: '#000',
      shadowOpacity: 0.045,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    documentPreviewDisabled: { opacity: 0.68 },
    documentPreviewIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 18,
      backgroundColor: C.actionCard,
      alignItems: 'center',
      justifyContent: 'center',
    },
    documentPreviewCopy: {
      flex: 1,
      minWidth: 0,
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    documentPreviewTitle: {
      color: C.text,
      fontWeight: '900',
      fontSize: 14,
      lineHeight: 20,
    },
    imagePreviewModal: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 44,
      backgroundColor: 'transparent',
    },
    imagePreviewFallbackBlur: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark
        ? 'rgba(2,6,23,0.86)'
        : 'rgba(241,245,249,0.90)',
    },
    imagePreviewBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark
        ? 'rgba(0,0,0,0.42)'
        : 'rgba(15,23,42,0.28)',
    },
    imagePreviewModalCard: {
      width: '100%',
      maxHeight: '88%',
      borderRadius: 28,
      padding: 14,
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.42,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
      elevation: 24,
    },
    imagePreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 4,
      paddingBottom: 12,
    },
    imagePreviewHeaderText: { flex: 1, minWidth: 0 },
    imagePreviewModalTitle: {
      color: C.text,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '900',
    },
    imagePreviewModalType: {
      color: C.primary,
      fontSize: 11,
      fontWeight: '900',
      marginTop: 2,
      letterSpacing: 0.5,
    },
    imagePreviewCloseButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.actionCard,
    },
    imagePreview: {
      width: '100%',
      height: 430,
      maxHeight: '72%',
      borderRadius: 20,
      backgroundColor: C.background,
    },
  });
  return styles;
};
