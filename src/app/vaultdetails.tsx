import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAppTheme } from '../context/ThemeContext';
import { api, VaultItem } from '../services/api';
import {
  decryptJson,
  decryptPassword,
  encryptPassword,
  maskCardNumber,
  maskPassword,
} from '../utils/vaultcrypto';

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

const VaultDetailsScreen = () => {
  const router = useRouter();
  const { id, type } = useLocalSearchParams<{
  id: string;
  type?: 'PASSWORD' | 'CARD' | 'DOCUMENT';
}>();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [item, setItem] = useState<VaultItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [saving, setSaving] = useState(false);

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
const loadItem = async () => {
  if (!id) return;

  try {
    setLoading(true);

    let data: VaultItem;

    if (type === 'CARD') {
      const card = await api.getCard(id);
      const cardholder = card.encryptedCardholderName || card.encryptedCardHolderName;

      data = {
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
    } else if (type === 'DOCUMENT') {
      const doc = await api.getDocument(id);

      data = {
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
      };
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
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied.`);
  };

  const savePasswordChanges = async () => {
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
      setItem(updated);
      setEditingPassword(false);
      setShowSecret(false);
      Alert.alert('Updated', 'Password updated successfully.');
    } catch (error: any) {
      Alert.alert('Update failed', error.message || 'Could not update password.');
    } finally {
      setSaving(false);
    }
  };

  //Delete the current item from the vault
  const deleteCurrentItem = async () => {
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
            if (item.itemType === 'CARD') {
              await api.deleteCard(item.id);
            } else if (item.itemType === 'DOCUMENT') {
              await api.deleteDocument(item.id);
            } else {
              await api.deleteVaultItem(item.id);
            }

            Alert.alert('Deleted', 'Item deleted successfully.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          } catch (error: any) {
            Alert.alert('Delete failed', error.message || 'Could not delete item.');
          }
        },
      },
    ]
  );
};

  const getBase64Document = () => {
    if (!item?.encryptedData) return '';

    // New backend multipart upload stores raw Base64 directly in encryptedFileUrl.
    // Older JSON-based documents stored { fileName, mimeType, base64Content }.
    const maybeJson = decryptJson<DocumentPayload | null>(item.encryptedData, null);
    if (maybeJson?.base64Content) {
      return maybeJson.base64Content;
    }

    return item.encryptedData;
  };

  const downloadDocument = async () => {
    if (!item?.encryptedData) return;

    try {
      const base64Content = getBase64Document();

      if (!base64Content) {
        Alert.alert('Download failed', 'Document data is missing.');
        return;
      }

      const safeName = (item.fileName || item.title || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
      const mimeType = item.mimeType || 'application/octet-stream';

      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (permissions.granted) {
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          safeName,
          mimeType
        );

        await FileSystem.writeAsStringAsync(uri, base64Content, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert('Downloaded', 'Document saved to the folder you selected.');
        return;
      }

      const path = `${FileSystem.documentDirectory}${safeName}`;

      await FileSystem.writeAsStringAsync(path, base64Content, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType,
          dialogTitle: 'Share document',
        });
      } else {
        Alert.alert('Saved', `Document saved here: ${path}`);
      }
    } catch (error: any) {
      Alert.alert('Download failed', error.message || 'Could not download document.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading item...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <Text style={styles.loadingText}>Item not found.</Text>
          <TouchableOpacity style={styles.mainBtn} onPress={() => router.back()}>
            <Text style={styles.mainBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const plainPassword = item.encryptedPassword ? decryptPassword(item.encryptedPassword) : '';
  const card = item.itemType === 'CARD' ? decryptJson<CardPayload>(item.encryptedData || '', defaultCard) : defaultCard;
  
  const legacyDoc =
    item.itemType === 'DOCUMENT'
      ? decryptJson<DocumentPayload | null>(item.encryptedData || '', null)
      : null;

  const documentBase64 =
    item.itemType === 'DOCUMENT'
      ? legacyDoc?.base64Content || item.encryptedData || ''
      : '';

  const isImageDoc =
    item.itemType === 'DOCUMENT' &&
    (item.mimeType || legacyDoc?.mimeType || '').startsWith('image/') &&
    !!documentBase64;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Vault Details</Text>
          <View style={{ width: 36 }} />
        </View>

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

                <TouchableOpacity style={styles.mainBtn} onPress={() => setEditingPassword(true)}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.mainBtnText}>Edit Password / Notes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: '#e53935' }]}
                    onPress={deleteCurrentItem}
>
                    <Ionicons name="trash-outline" size={18} color="#e53935" />
                    <Text style={[styles.secondaryBtnText, { color: '#e53935' }]}>
                      Delete Password
                    </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {item.itemType === 'CARD' && (
  <View style={styles.content}>
    <View style={styles.cardPreview}>
      <View style={styles.previewTop}>
        <View style={styles.chip} />
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

    <TouchableOpacity style={styles.mainBtn} onPress={() => setShowSecret((v) => !v)}>
      <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={18} color="#fff" />
      <Text style={styles.mainBtnText}>{showSecret ? 'Hide Card Info' : 'Reveal Card Info'}</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.secondaryBtn, { borderColor: '#e53935' }]}
      onPress={deleteCurrentItem}
    >
      <Ionicons name="trash-outline" size={18} color="#e53935" />
      <Text style={[styles.secondaryBtnText, { color: '#e53935' }]}>Delete Card</Text>
    </TouchableOpacity>
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
    <Text style={styles.subtitle}>{item.mimeType || 'Document'}</Text>

    {isImageDoc && (
      <Image
        source={{ uri: `data:${item.mimeType || legacyDoc?.mimeType || 'image/jpeg'};base64,${documentBase64}` }}
        style={styles.imagePreview}
        resizeMode="cover"
      />
    )}

    <View style={styles.infoCard}>
      <InfoRow label="File name" value={item.fileName || item.title} onCopy={() => copyValue('File name', item.fileName || item.title)} styles={styles} C={C} />
      <View style={styles.divider} />
      <InfoRow label="Type" value={item.mimeType || 'Unknown'} onCopy={() => copyValue('File type', item.mimeType)} styles={styles} C={C} />
      <View style={styles.divider} />
      <InfoRow label="Size" value={formatSize(item.sizeBytes)} onCopy={() => copyValue('Size', formatSize(item.sizeBytes))} styles={styles} C={C} />
    </View>

    <TouchableOpacity style={styles.mainBtn} onPress={downloadDocument}>
      <Ionicons name="download-outline" size={18} color="#fff" />
      <Text style={styles.mainBtnText}>Download / Share Document</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.secondaryBtn, { borderColor: '#e53935' }]}
      onPress={deleteCurrentItem}
    >
      
      <Ionicons name="trash-outline" size={18} color="#e53935" />
      <Text style={[styles.secondaryBtnText, { color: '#e53935' }]}>Delete Document</Text>
      
    </TouchableOpacity>
  </View>
)}

        <View style={{ height: 50 }} />
      </ScrollView>
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
    <TouchableOpacity style={styles.iconBtn} onPress={onCopy}>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
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
    mainBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    secondaryBtn: { width: '100%', backgroundColor: C.backgroundElement, paddingVertical: 16, borderRadius: 50, alignItems: 'center', borderWidth: 1, borderColor: C.border, marginTop: 10 },
    secondaryBtnText: { color: C.text, fontWeight: '800', fontSize: 15 },
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
    imagePreview: { width: '100%', height: 230, borderRadius: 18, marginBottom: 20, backgroundColor: C.backgroundElement },
  });
  return styles;
};
