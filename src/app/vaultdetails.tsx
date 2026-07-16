import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAppTheme } from '../context/ThemeContext';
import { hapticLight, hapticMedium, hapticWarning, hapticDelete, hapticSuccess } from '../utils/haptics';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, VaultItem } from '../services/api';
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
  encryptPassword,
  maskCardNumber,
  maskPassword,
} from '../utils/vaultcrypto';
import { getSecureClipboardMessage, setSecureClipboard } from '../utils/secureClipboard';
import CardBrandLogo from '../components/CardBrandLogo';
import { detectCardBrand } from '../utils/cardBrand';
import { useSensitiveScreenProtection } from '../hooks/useSensitiveScreenProtection';

type CardPayload = {
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  bankName: string;
};

type DocumentPayload = {
  fileName: string;
  mimeType: string;
  base64Content: string;
};

const defaultCard: CardPayload = {
  cardholderName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  bankName: '',
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


const VaultDetailsScreen = () => {
  const router = useRouter();
  const { id, type, returnTab } = useLocalSearchParams<{
  id: string;
  type?: 'PASSWORD' | 'CARD' | 'DOCUMENT' | 'NOTE';
  returnTab?: 'Passwords' | 'Documents' | 'Cards' | 'Notes';
}>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineSavedAt, setOfflineSavedAt] = useState<string | null>(null);

  const [editWebsite, setEditWebsite] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editNotes, setEditNotes] = useState('');


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
      })
    ),
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
    } catch {
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

    let data: VaultItem;

    if (type === 'CARD') {
      const card = await api.getCard(id);
      data = buildCardVaultItem(card);
    } else if (type === 'DOCUMENT') {
      const doc = await api.getDocument(id);
      data = buildDocumentVaultItem(doc);
    } else {
      data = await api.getVaultItem(id);
    }

    setItem(data);

    if (data.itemType === 'PASSWORD') {
      setEditWebsite(data.website || data.title || '');
      setEditUsername(data.usernameValue || '');
      setEditPassword(data.encryptedPassword ? decryptPassword(data.encryptedPassword) : '');
      setEditNotes(data.notes || '');
    }
  } catch (error: any) {
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

        if (offlineData.itemType === 'PASSWORD') {
          setEditWebsite(offlineData.website || offlineData.title || '');
          setEditUsername(offlineData.usernameValue || '');
          setEditPassword(offlineData.encryptedPassword ? decryptPassword(offlineData.encryptedPassword) : '');
          setEditNotes(offlineData.notes || '');
        }
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
  }, [id]);

  const copyValue = async (label: string, value?: string) => {
    if (!value) return;
    await setSecureClipboard(value);
    Alert.alert('Copied', getSecureClipboardMessage(label));
  };

  const showOfflineWriteWarning = () => {
    Alert.alert(
      'Offline mode',
      'This item is being shown from your saved offline vault. Editing and deleting will work again when the server is reachable.'
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
      const updated = await api.updateVaultItem(item.id, {
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
      Alert.alert('Updated', 'Password updated successfully.');
    } catch (error: any) {
      Alert.alert('Update failed', error.message || 'Could not update password.');
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
              await api.deleteCard(item.id);
            } else if (item.itemType === 'DOCUMENT') {
              await api.deleteDocument(item.id);
            } else {
              await api.deleteVaultItem(item.id);
            }

            hapticSuccess();
            Alert.alert('Deleted', 'Item deleted successfully.', [
              { text: 'OK', onPress: goBackToVaultSection },
            ]);
          } catch (error: any) {
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

      const downloaded = await api.downloadDocumentToCache(item.id, safeName, mimeType);

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
        { borderColor: '#e53935' },
        deleting && styles.mainBtnDisabled,
      ]}
      onPress={offlineMode ? () => { hapticWarning(); showOfflineWriteWarning(); } : () => { hapticDelete(); deleteCurrentItem(); }}
      disabled={deleting}
      activeOpacity={0.85}
    >
      {deleting ? (
        <ActivityIndicator size="small" color="#e53935" />
      ) : (
        <Ionicons name="trash-outline" size={18} color="#e53935" />
      )}
      <Text style={[styles.secondaryBtnText, { color: '#e53935' }]}>
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
    String(item.mimeType || '').startsWith('image/');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vault Details</Text>
          <View style={{ width: 36 }} />
        </View>

        {offlineMode && (
          <OfflineBanner
            colors={C}
            savedAt={offlineSavedAt}
            message="This item is available from your offline vault. Editing and deleting are disabled until the server is reachable."
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
                <TextInput style={styles.input} value={editWebsite} onChangeText={setEditWebsite} placeholderTextColor={C.tabInactive} />

                <Text style={styles.label}>Username</Text>
                <TextInput style={styles.input} value={editUsername} onChangeText={setEditUsername} placeholderTextColor={C.tabInactive} autoCapitalize="none" />

                <Text style={styles.label}>Password</Text>
                <TextInput style={styles.input} value={editPassword} onChangeText={setEditPassword} placeholderTextColor={C.tabInactive} autoCapitalize="none" />

                <Text style={styles.label}>Notes</Text>
                <TextInput style={styles.notesInput} value={editNotes} onChangeText={setEditNotes} placeholderTextColor={C.tabInactive} multiline />

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
    </View>

    <TouchableOpacity style={styles.mainBtn} onPress={() => { hapticMedium(); setShowSecret((v) => !v); }}>
      <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={18} color="#fff" />
      <Text style={styles.mainBtnText}>{showSecret ? 'Hide Card Info' : 'Reveal Card Info'}</Text>
    </TouchableOpacity>

    {renderDeleteButton('Delete Card')}
  </View>
)}

{item.itemType === 'DOCUMENT' && (
  <View style={styles.content}>
    <View style={styles.iconCircle}>
      <Ionicons
        name={(item.mimeType || '').startsWith('image/') ? 'image-outline' : 'document-text-outline'}
        size={28}
        color={C.primary}
      />
    </View>

    <Text style={styles.title}>{item.fileName || item.title}</Text>
    <Text style={styles.subtitle}>{getFriendlyDocumentType(item.mimeType, item.fileName || item.title)}</Text>

    {isImageDocument && (
      <View style={styles.documentPreviewPlaceholder}>
        <Ionicons name="image-outline" size={24} color={C.primary} />
        <Text style={styles.documentPreviewTitle}>Encrypted image document</Text>
        <Text style={styles.documentPreviewText}>Use Download / Share to decrypt and open this file securely.</Text>
      </View>
    )}

    <View style={styles.infoCard}>
      <InfoRow label="File name" value={item.fileName || item.title} onCopy={() => copyValue('File name', item.fileName || item.title)} styles={styles} C={C} />
      <View style={styles.divider} />
      <InfoRow label="Type" value={getFriendlyDocumentType(item.mimeType, item.fileName || item.title)} onCopy={() => copyValue('File type', getFriendlyDocumentType(item.mimeType, item.fileName || item.title))} styles={styles} C={C} />
      <View style={styles.divider} />
      <InfoRow label="Size" value={formatSize(item.sizeBytes)} onCopy={() => copyValue('Size', formatSize(item.sizeBytes))} styles={styles} C={C} />
    </View>

    <TouchableOpacity
      style={[styles.mainBtn, downloading && styles.mainBtnDisabled]}
      onPress={() => { hapticMedium(); downloadDocument(); }}
      disabled={downloading}
    >
      {downloading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name="download-outline" size={18} color="#fff" />
      )}
      <Text style={styles.mainBtnText}>{downloading ? 'Preparing document...' : 'Download / Share Document'}</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.secondaryBtn, { borderColor: '#e53935' }]}
      onPress={offlineMode ? () => { hapticWarning(); showOfflineWriteWarning(); } : () => { hapticDelete(); deleteCurrentItem(); }}
    >
      
      <Ionicons name="trash-outline" size={18} color="#e53935" />
      <Text style={[styles.secondaryBtnText, { color: '#e53935' }]}>Delete Document</Text>
      
    </TouchableOpacity>
  </View>
)}

        <View style={{ height: 50 }} />
      </ScrollView>

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

const makeStyles = (C: ThemeColors) => {
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    loadingText: { color: C.textSecondary, marginTop: 12, fontSize: 15 },
    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    },
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
    backBtn: { width: 36, height: 36, backgroundColor: C.backgroundSelected, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: C.text },
    content: { paddingHorizontal: 20, alignItems: 'center' },
    iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.actionCard, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    title: { fontSize: 24, fontWeight: '800', color: C.text, textAlign: 'center' },
    subtitle: { fontSize: 14, color: C.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 22 },
    infoCard: { width: '100%', backgroundColor: C.backgroundElement, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 18 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    infoLabel: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
    infoValue: { fontSize: 15, color: C.text, fontWeight: '600' },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
    iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.actionCard, justifyContent: 'center', alignItems: 'center' },
    mainBtn: { width: '100%', backgroundColor: C.backgroundbutton, paddingVertical: 16, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
    mainBtnDisabled: { opacity: 0.65 },
    mainBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn: { width: '100%', backgroundColor: C.backgroundElement, paddingVertical: 16, borderRadius: 50, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginTop: 10 },
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
    },
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
    input: { width: '100%', backgroundColor: C.backgroundElement, borderRadius: 50, paddingHorizontal: 18, paddingVertical: 15, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
    notesInput: { width: '100%', backgroundColor: C.backgroundElement, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 15, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 16, minHeight: 90, textAlignVertical: 'top' },
    cardPreview: { width: '100%', backgroundColor: C.primary, borderRadius: 22, padding: 24, height: 200, justifyContent: 'space-between', marginBottom: 20 },
    previewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chip: { width: 44, height: 32, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 6 },
    bankPreview: { color: '#fff', fontWeight: '800', fontSize: 14 },
    cardNumberPreview: { color: '#fff', fontSize: 19, fontWeight: '700', letterSpacing: 2 },
    previewBottom: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 9, marginBottom: 4, letterSpacing: 1 },
    cardNamePreview: { color: '#fff', fontWeight: '800', fontSize: 14 },
    documentPreviewPlaceholder: { width: '100%', borderRadius: 18, borderWidth: 1, borderColor: C.border, backgroundColor: C.backgroundElement, padding: 16, alignItems: 'center', marginBottom: 18 },
    documentPreviewTitle: { color: C.text, fontWeight: '900', fontSize: 14, marginTop: 8 },
    documentPreviewText: { color: C.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  });
  return styles;
};
