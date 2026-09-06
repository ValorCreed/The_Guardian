import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  Copy,
  Download,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  Globe,
  KeyRound,
  NotebookText,
  ShieldCheck,
  StickyNote,
  UserRound,
} from 'lucide-react-native';

import { api } from '../services/api';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { decryptJson } from '../utils/vaultcrypto';
import { getSecureClipboardMessage, setSecureClipboard } from '../utils/secureClipboard';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';
import { useScreenAlert } from '../hooks/useScreenAlert';
import { getFriendlyVaultSubtitle, getFriendlyVaultTitle } from '../utils/vaultPresentation';

type SharedItemType = 'PASSWORD' | 'CARD' | 'DOCUMENT' | 'NOTE';

type DisplayItem = {
  id: number | string;
  itemType: SharedItemType;
  title?: string;
  usernameValue?: string;
  encryptedPassword?: string;
  encryptedData?: string;
  website?: string;
  notes?: string;

  cardName?: string;
  encryptedCardNumber?: string;
  encryptedExpiryDate?: string;
  encryptedCvv?: string;
  encryptedCardholderName?: string;
  encryptedCardHolderName?: string;

  documentName?: string;
  documentType?: string;
  encryptedFileUrl?: string;
  encryptedNotes?: string;

  category?: string | null;
  encryptedContent?: string;
  pinned?: boolean;

  ownerId?: number;
  ownerName?: string;
  ownerEmail?: string;
};

const normalizeItemType = (type?: string | string[]): SharedItemType => {
  const value = Array.isArray(type) ? type[0] : type;

  if (value === 'CARD') return 'CARD';
  if (value === 'DOCUMENT') return 'DOCUMENT';
  if (value === 'NOTE') return 'NOTE';

  return 'PASSWORD';
};

const cleanSharedValue = (value?: string | null) => {
  if (!value) return '';

  let cleaned = String(value);

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep original value if it cannot be decoded.
  }

  cleaned = cleaned.trim();

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
};

const getFileExtension = (fileName?: string | null) => {
  const cleanName = String(fileName || '').split('?')[0].split('#')[0];
  const parts = cleanName.split('.');

  if (parts.length < 2) return '';

  return String(parts.pop() || '').trim().toLowerCase();
};

const getFriendlyDocumentType = (mimeType?: string | null, fileName?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  const extension = getFileExtension(fileName);

  if (mime.startsWith('image/')) return 'Image';
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


const decryptSharedValue = (value?: string | null) => {
  const cleaned = cleanSharedValue(value);

  if (!cleaned) return '';

  const decrypted = decryptJson<any>(cleaned, null);
  if (decrypted !== null && decrypted !== undefined) {
    return String(decrypted);
  }

  // Microservices return plaintext after the Vault Service has decrypted it.
  // Keeping the cleaned value supports both that response and older JSON-wrapped values.
  return cleaned;
};

export default function SharedVaultDetailsScreen() {
  const screenAlert = useScreenAlert();

  const { id, type } = useLocalSearchParams<{
    id: string;
    type?: string;
  }>();

  const { isDark, colors: C } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [item, setItem] = useState<DisplayItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [downloadingDocument, setDownloadingDocument] = useState(false);

  const loadItem = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const itemType = normalizeItemType(type);

      if (itemType === 'CARD') {
        const data: any = await api.getSharedCardItem(id);

        setItem({
          id: data.id,
          itemType: 'CARD',
          title: cleanSharedValue(data.cardName) || 'Shared card',
          cardName: cleanSharedValue(data.cardName),
          encryptedCardholderName: decryptSharedValue(
            data.encryptedCardholderName || data.encryptedCardHolderName
          ),
          encryptedCardHolderName: decryptSharedValue(
            data.encryptedCardHolderName || data.encryptedCardholderName
          ),
          encryptedCardNumber: decryptSharedValue(data.encryptedCardNumber),
          encryptedExpiryDate: decryptSharedValue(data.encryptedExpiryDate),
          encryptedCvv: decryptSharedValue(data.encryptedCvv),
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        });

        return;
      }

      if (itemType === 'DOCUMENT') {
        const data: any = await api.getSharedDocumentItem(id);

        setItem({
          id: data.id,
          itemType: 'DOCUMENT',
          title: cleanSharedValue(data.documentName) || 'Shared document',
          documentName: cleanSharedValue(data.documentName),
          documentType: cleanSharedValue(data.documentType),
          encryptedFileUrl: cleanSharedValue(data.encryptedFileUrl),
          encryptedNotes: decryptSharedValue(data.encryptedNotes),
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        });

        return;
      }

      if (itemType === 'NOTE') {
        const data: any = await api.getSharedNoteItem(id);

        setItem({
          id: data.id,
          itemType: 'NOTE',
          title: cleanSharedValue(data.title) || 'Shared SecureNote',
          category: cleanSharedValue(data.category),
          encryptedContent: decryptSharedValue(data.encryptedContent),
          pinned: Boolean(data.pinned),
          ownerId: data.ownerId,
          ownerName: data.ownerName,
          ownerEmail: data.ownerEmail,
        });

        return;
      }

      const data: any = await api.getSharedPasswordItem(id);

      setItem({
        id: data.id,
        itemType: 'PASSWORD',
        title: cleanSharedValue(data.title) || 'Shared password',
        usernameValue: cleanSharedValue(data.usernameValue),
        encryptedPassword: decryptSharedValue(data.encryptedPassword),
        encryptedData: decryptSharedValue(data.encryptedData),
        website: cleanSharedValue(data.website),
        notes: decryptSharedValue(data.notes),
        ownerId: data.ownerId,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
      });
    } catch (error: any) {
      screenAlert(
        'Could not open item',
        error.message || 'This shared item could not be loaded.'
      );
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, type, screenAlert]);

  useFocusEffect(
    useCallback(() => {
      loadItem();
    }, [loadItem])
  );

  const copyValue = async (label: string, value?: string) => {
    const cleaned = cleanSharedValue(value);

    if (!cleaned) {
      screenAlert('Nothing to copy', `${label} is empty.`);
      return;
    }

    await setSecureClipboard(cleaned);
    screenAlert('Copied', getSecureClipboardMessage(label));
  };

  const hideValue = (value?: string) => {
    const cleaned = cleanSharedValue(value);

    if (!cleaned) return 'Nothing saved';

    return '•'.repeat(Math.min(cleaned.length, 18));
  };

  const downloadSharedDocument = async () => {
    if (!item || item.itemType !== 'DOCUMENT' || downloadingDocument) return;

    try {
      setDownloadingDocument(true);

      const safeName = cleanSharedValue(item.documentName || item.title) || 'shared-document';
      const mimeType = cleanSharedValue(item.documentType) || 'application/octet-stream';

      const downloaded = await api.downloadSharedDocumentToCache(
        item.id,
        safeName,
        mimeType
      );

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

        screenAlert('Document saved', 'The shared document was saved to your selected folder.');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: downloaded.mimeType || mimeType,
          dialogTitle: downloaded.fileName || safeName,
        });
        return;
      }

      screenAlert('Saved temporarily', downloaded.uri);
    } catch (error: any) {
      screenAlert(
        'Download failed',
        error?.message || 'This shared document could not be downloaded.'
      );
    } finally {
      setDownloadingDocument(false);
    }
  };

  const renderSharedSkeleton = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <PulsingSkeleton styles={styles} style={styles.skeletonHeaderIcon} />
      <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
      <PulsingSkeleton styles={styles} style={styles.skeletonSubtitle} />

      <View style={styles.card}>
        {[1, 2, 3, 4].map((row, index) => (
          <View key={`shared-detail-skeleton-${row}`}>
            <View style={styles.infoRow}>
              <PulsingSkeleton styles={styles} style={styles.skeletonInfoIcon} />
              <View style={{ flex: 1 }}>
                <PulsingSkeleton styles={styles} style={styles.skeletonInfoLabel} />
                <PulsingSkeleton styles={styles} style={styles.skeletonInfoValue} />
              </View>
              <PulsingSkeleton styles={styles} style={styles.skeletonCopyButton} />
            </View>
            {index !== 3 && <View style={styles.divider} />}
          </View>
        ))}
      </View>

      <View style={styles.readOnlyBox}>
        <PulsingSkeleton styles={styles} style={styles.skeletonReadOnlyTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonReadOnlyText} />
        <PulsingSkeleton styles={styles} style={styles.skeletonReadOnlyShort} />
      </View>
    </ScrollView>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {renderSharedSkeleton()}
      </SafeAreaView>
    );
  }

  if (!item) return null;

  const itemType: SharedItemType = item.itemType;

  const title =
    itemType === 'CARD'
      ? cleanSharedValue(item.cardName || item.title) || 'Shared card'
      : itemType === 'DOCUMENT'
        ? cleanSharedValue(item.documentName || item.title) || 'Shared document'
        : itemType === 'NOTE'
          ? cleanSharedValue(item.title) || 'Shared SecureNote'
          : getFriendlyVaultTitle(
              cleanSharedValue(item.title),
              cleanSharedValue(item.website),
              'Shared password'
            );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerIcon}>
          {itemType === 'CARD' ? (
            <CreditCard size={30} color="#fff" />
          ) : itemType === 'DOCUMENT' ? (
            <FileText size={30} color="#fff" />
          ) : itemType === 'NOTE' ? (
            <NotebookText size={30} color="#fff" />
          ) : (
            <KeyRound size={30} color="#fff" />
          )}
        </View>

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.subtitle}>
          Shared by {item.ownerName || item.ownerEmail || 'Family admin'}
        </Text>

        {itemType === 'CARD' && (
          <SharedCardDetails
            item={item}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            copyValue={copyValue}
            hideValue={hideValue}
            styles={styles}
            C={C}
          />
        )}

        {itemType === 'DOCUMENT' && (
          <SharedDocumentDetails
            item={item}
            copyValue={copyValue}
            downloadSharedDocument={downloadSharedDocument}
            downloadingDocument={downloadingDocument}
            styles={styles}
            C={C}
          />
        )}

        {itemType === 'NOTE' && (
          <SharedNoteDetails
            item={item}
            copyValue={copyValue}
            styles={styles}
            C={C}
          />
        )}

        {itemType === 'PASSWORD' && (
          <SharedPasswordDetails
            item={item}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            copyValue={copyValue}
            hideValue={hideValue}
            styles={styles}
            C={C}
          />
        )}

        <View style={styles.readOnlyBox}>
          <Text style={styles.readOnlyTitle}>Read-only shared item</Text>
          <Text style={styles.readOnlyText}>
            Only the owner can edit or delete this item.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SharedPasswordDetails({
  item,
  showSecret,
  setShowSecret,
  copyValue,
  hideValue,
  styles,
  C,
}: {
  item: DisplayItem;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  copyValue: (label: string, value?: string) => Promise<void>;
  hideValue: (value?: string) => string;
  styles: any;
  C: any;
}) {
  const passwordValue = cleanSharedValue(
    item.encryptedPassword || item.encryptedData || ''
  );

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<UserRound size={19} color={C.primary} />}
        label="Username / Email"
        value={cleanSharedValue(item.usernameValue) || 'No username saved'}
        onCopy={() => copyValue('Username', item.usernameValue)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <SecretRow
        icon={<KeyRound size={19} color={C.primary} />}
        label="Password"
        value={passwordValue}
        hiddenValue={hideValue(passwordValue)}
        showSecret={showSecret}
        setShowSecret={setShowSecret}
        onCopy={() => copyValue('Password', passwordValue)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<Globe size={19} color={C.primary} />}
        label="Website"
        value={getFriendlyVaultSubtitle(
          undefined,
          cleanSharedValue(item.website),
          'No website saved'
        )}
        onCopy={() => copyValue('Website', item.website)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<StickyNote size={19} color={C.primary} />}
        label="Notes"
        value={cleanSharedValue(item.notes) || 'No notes saved'}
        onCopy={() => copyValue('Notes', item.notes)}
        styles={styles}
        C={C}
        multiline
      />
    </View>
  );
}

function SharedCardDetails({
  item,
  showSecret,
  setShowSecret,
  copyValue,
  hideValue,
  styles,
  C,
}: {
  item: DisplayItem;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  copyValue: (label: string, value?: string) => Promise<void>;
  hideValue: (value?: string) => string;
  styles: any;
  C: any;
}) {
  const cardholder =
    cleanSharedValue(item.encryptedCardholderName || item.encryptedCardHolderName) ||
    'No cardholder name';

  const cardNumber = cleanSharedValue(item.encryptedCardNumber);
  const expiryDate = cleanSharedValue(item.encryptedExpiryDate);
  const cvv = cleanSharedValue(item.encryptedCvv);

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<UserRound size={19} color={C.primary} />}
        label="Cardholder name"
        value={cardholder}
        onCopy={() => copyValue('Cardholder name', cardholder)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <SecretRow
        icon={<CreditCard size={19} color={C.primary} />}
        label="Card number"
        value={cardNumber || 'No card number saved'}
        hiddenValue={hideValue(cardNumber)}
        showSecret={showSecret}
        setShowSecret={setShowSecret}
        onCopy={() => copyValue('Card number', cardNumber)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<Calendar size={19} color={C.primary} />}
        label="Expiry date"
        value={expiryDate || 'No expiry date saved'}
        onCopy={() => copyValue('Expiry date', expiryDate)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <SecretRow
        icon={<ShieldCheck size={19} color={C.primary} />}
        label="CVV"
        value={cvv || 'No CVV saved'}
        hiddenValue={hideValue(cvv)}
        showSecret={showSecret}
        setShowSecret={setShowSecret}
        onCopy={() => copyValue('CVV', cvv)}
        styles={styles}
        C={C}
      />
    </View>
  );
}

function SharedDocumentDetails({
  item,
  copyValue,
  downloadSharedDocument,
  downloadingDocument,
  styles,
  C,
}: {
  item: DisplayItem;
  copyValue: (label: string, value?: string) => Promise<void>;
  downloadSharedDocument: () => Promise<void>;
  downloadingDocument: boolean;
  styles: any;
  C: any;
}) {
  const rawDocumentType = cleanSharedValue(item.documentType);
  const documentName = cleanSharedValue(item.documentName || item.title);
  const documentType = getFriendlyDocumentType(rawDocumentType, documentName);

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<FileText size={19} color={C.primary} />}
        label="Document type"
        value={documentType || 'No document type saved'}
        onCopy={() => copyValue('Document type', documentType)}
        styles={styles}
        C={C}
      />

      <View style={styles.fullDivider} />

      <View style={styles.documentActionArea}>
        <TouchableOpacity
          style={[styles.documentDownloadButton, downloadingDocument && styles.disabledButton]}
          onPress={downloadSharedDocument}
          disabled={downloadingDocument}
          activeOpacity={0.85}
        >
          {downloadingDocument ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Download size={19} color="#fff" />
          )}
          <Text style={styles.documentDownloadText}>
            {downloadingDocument ? 'Preparing document...' : 'Download / Share Document'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SharedNoteDetails({
  item,
  copyValue,
  styles,
  C,
}: {
  item: DisplayItem;
  copyValue: (label: string, value?: string) => Promise<void>;
  styles: any;
  C: any;
}) {
  const category = cleanSharedValue(item.category) || 'General';
  const content = decryptSharedValue(item.encryptedContent);

  return (
    <View style={styles.card}>
      <InfoRow
        icon={<NotebookText size={19} color={C.primary} />}
        label="Category"
        value={category}
        onCopy={() => copyValue('Category', category)}
        styles={styles}
        C={C}
      />

      <View style={styles.divider} />

      <InfoRow
        icon={<StickyNote size={19} color={C.primary} />}
        label="SecureNote"
        value={content || 'No note content saved'}
        onCopy={() => copyValue('SecureNote', content)}
        styles={styles}
        C={C}
        multiline
      />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  onCopy,
  styles,
  C,
  multiline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onCopy: () => void;
  styles: any;
  C: any;
  multiline?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, multiline && styles.multilineValue]}>
          {value}
        </Text>
      </View>

      <TouchableOpacity style={styles.iconButton} onPress={onCopy}>
        <Copy size={18} color={C.text} />
      </TouchableOpacity>
    </View>
  );
}

function SecretRow({
  icon,
  label,
  value,
  hiddenValue,
  showSecret,
  setShowSecret,
  onCopy,
  styles,
  C,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hiddenValue: string;
  showSecret: boolean;
  setShowSecret: React.Dispatch<React.SetStateAction<boolean>>;
  onCopy: () => void;
  styles: any;
  C: any;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>

      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>
          {showSecret ? value || 'Nothing saved' : hiddenValue}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.iconButton}
        onPress={() => setShowSecret((current) => !current)}
      >
        {showSecret ? (
          <EyeOff size={18} color={C.text} />
        ) : (
          <Eye size={18} color={C.text} />
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={onCopy}>
        <Copy size={18} color={C.text} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 
     , shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonHeaderIcon: { width: 76, height: 76, borderRadius: 24, alignSelf: 'center', marginBottom: 18 },
    skeletonTitle: { width: '62%', height: 26, alignSelf: 'center', marginBottom: 10 },
    skeletonSubtitle: { width: '72%', height: 13, alignSelf: 'center', marginBottom: 22 },
    skeletonInfoIcon: { width: 40, height: 40, borderRadius: 14 },
    skeletonInfoLabel: { width: '38%', height: 11, marginBottom: 8 },
    skeletonInfoValue: { width: '78%', height: 15 },
    skeletonCopyButton: { width: 38, height: 38, borderRadius: 14 },
    skeletonReadOnlyTitle: { width: '48%', height: 16, marginBottom: 10 },
    skeletonReadOnlyText: { width: '96%', height: 12, marginBottom: 8 },
    skeletonReadOnlyShort: { width: '66%', height: 12 },
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 100,
      paddingBottom: 140,
    },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    loadingText: {
      marginTop: 10,
      color: C.textSecondary,
      fontSize: 14,
    },

    headerIcon: {
      width: 74,
      height: 74,
      borderRadius: 24,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    title: {
      fontSize: 30,
      fontWeight: '800',
      color: C.text,
      marginBottom: 6,
    },

    subtitle: {
      fontSize: 15,
      color: C.textSecondary,
      marginBottom: 24,
    },

    card: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 16,
    },

    infoIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginRight: 12,
    },

    infoLabel: {
      color: C.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 3,
    },

    infoValue: {
      color: C.text,
      fontSize: 16,
      fontWeight: '600',
    },

    multilineValue: {
      lineHeight: 22,
    },

    divider: {
      height: 1,
      backgroundColor: C.border,
      marginLeft: 64,
    },

    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundSelected,
      marginLeft: 8,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    fullDivider: {
      height: 1,
      backgroundColor: C.border,
    },

    documentActionArea: {
      padding: 14,
    },

    documentDownloadButton: {
      width: '100%',
      minHeight: 52,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: C.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    documentDownloadText: {
      flexShrink: 1,
      color: '#fff',
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
    },

    disabledButton: {
      opacity: 0.72,
    },

    readOnlyBox: {
      marginTop: 18,
      backgroundColor: C.backgroundSelected,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    readOnlyTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 4,
    },

    readOnlyText: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
  });