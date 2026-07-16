import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api, EmergencyVaultItemResponse } from '../services/api';
import { decryptJson, decryptPassword, maskCardNumber, maskPassword } from '../utils/vaultcrypto';
import { getSecureClipboardMessage, setSecureClipboard } from '../utils/secureClipboard';
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

const formatSize = (size?: number | null) => {
  if (!size || size <= 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const decryptStoredText = (value?: string | null) => {
  if (!value) return '';

  const jsonValue = decryptJson<any>(value, null);
  if (jsonValue !== null && jsonValue !== undefined) {
    return String(jsonValue);
  }

  return decryptPassword(value);
};

const formatCard = (value?: string) => {
  const digits = (value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/(.{4})/g, '$1 ').trim();
};

export default function EmergencyVaultDetailsScreen() {
  const { requestId, itemId, itemType, ownerName, ownerEmail } = useLocalSearchParams<{
    requestId: string;
    itemId: string;
    itemType: 'PASSWORD' | 'CARD' | 'DOCUMENT' | 'NOTE';
    ownerName?: string;
    ownerEmail?: string;
  }>();

  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C);

  useSensitiveScreenProtection(true);

  const [item, setItem] = useState<EmergencyVaultItemResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecret, setShowSecret] = useState(false);

  const loadItem = useCallback(async () => {
    if (!requestId || !itemId || !itemType) return;

    try {
      setLoading(true);
      const data = await api.getEmergencyVaultItem(requestId, itemType, itemId);
      setItem(data);
    } catch (error: any) {
      Alert.alert('Could not open emergency item', error.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [requestId, itemId, itemType]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  const copyValue = async (label: string, value?: string) => {
    if (!value) return;
    await setSecureClipboard(value);
    Alert.alert('Copied', getSecureClipboardMessage(label));
  };

  const card = useMemo<CardPayload>(() => {
    if (!item || item.itemType !== 'CARD') return defaultCard;
    const cardholder = item.encryptedCardholderName || item.encryptedCardHolderName || item.usernameValue || '';
    return {
      cardholderName: decryptStoredText(cardholder),
      cardNumber: decryptStoredText(item.encryptedCardNumber),
      expiry: decryptStoredText(item.encryptedExpiryDate),
      cvv: decryptStoredText(item.encryptedCvv),
      bankName: item.title || 'Saved Card',
    };
  }, [item]);

  const getBase64Document = () => {
    const value = item?.encryptedFileUrl || item?.encryptedData || '';
    if (!value) return '';

    const maybeJson = decryptJson<DocumentPayload | null>(value, null);
    if (maybeJson?.base64Content) return maybeJson.base64Content;
    return value;
  };

  const downloadDocument = async () => {
    if (!item) return;

    try {
      const base64Content = getBase64Document();
      if (!base64Content) {
        Alert.alert('Download failed', 'Document data is missing.');
        return;
      }

      const safeName = (item.fileName || item.documentName || item.title || 'emergency_document').replace(/[^a-zA-Z0-9._-]/g, '_');
      const mimeType = item.mimeType || item.documentType || 'application/octet-stream';

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

        Alert.alert('Downloaded', 'The document was saved successfully.');
        return;
      }

      const fallbackUri = `${FileSystem.cacheDirectory}${safeName}`;
      await FileSystem.writeAsStringAsync(fallbackUri, base64Content, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fallbackUri, { mimeType, dialogTitle: safeName });
      } else {
        Alert.alert('Saved temporarily', fallbackUri);
      }
    } catch (error: any) {
      Alert.alert('Download failed', error.message || 'Could not download document.');
    }
  };

  const title = item?.title || item?.documentName || item?.fileName || 'Emergency item';
  const password = item?.encryptedPassword ? decryptPassword(item.encryptedPassword) : '';
  const noteContent = item?.encryptedContent ? decryptPassword(item.encryptedContent) : '';
  const documentBase64 = item?.itemType === 'DOCUMENT' ? getBase64Document() : '';
  const isImage = String(item?.mimeType || item?.documentType || '').startsWith('image/');

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
        <View style={styles.content}>
          <PulsingSkeleton styles={styles} style={styles.skeletonEyebrow} />
          <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
          <View style={styles.card}>
            {[1, 2, 3, 4].map((row, index) => (
              <View key={`detail-skeleton-${row}`} style={[styles.infoRow, index !== 3 && styles.divider]}>
                <View style={{ flex: 1 }}>
                  <PulsingSkeleton styles={styles} style={styles.skeletonLabel} />
                  <PulsingSkeleton styles={styles} style={styles.skeletonValue} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyBox}>
          <Ionicons name="alert-circle-outline" size={30} color={C.danger} />
          <Text style={styles.emptyTitle}>Item unavailable</Text>
          <Text style={styles.emptySub}>This emergency vault item could not be loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.background} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Emergency vault item</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Read-only item from {ownerName || item.ownerName || ownerEmail || item.ownerEmail || 'the vault owner'}.</Text>

        <View style={styles.warningCard}>
          <Ionicons name="eye-outline" size={20} color={C.warning} />
          <Text style={styles.warningText}>This access is audited. Do not copy or download anything unless it is truly needed.</Text>
        </View>

        {item.itemType === 'PASSWORD' && (
          <View style={styles.card}>
            <InfoRow label="Website" value={item.website || item.title || ''} onCopy={() => copyValue('Website', item.website || item.title || '')} styles={styles} C={C} />
            <InfoRow label="Username" value={item.usernameValue || ''} onCopy={() => copyValue('Username', item.usernameValue || '')} styles={styles} C={C} />
            <InfoRow
              label="Password"
              value={showSecret ? password : maskPassword(password)}
              onCopy={() => copyValue('Password', password)}
              styles={styles}
              C={C}
              secretToggle={() => setShowSecret((current) => !current)}
              showSecret={showSecret}
            />
            {!!item.notes && <InfoRow label="Notes" value={item.notes} onCopy={() => copyValue('Notes', item.notes || '')} styles={styles} C={C} last />}
          </View>
        )}

        {item.itemType === 'CARD' && (
          <View style={styles.card}>
            <InfoRow label="Card name" value={card.bankName} onCopy={() => copyValue('Card name', card.bankName)} styles={styles} C={C} />
            <InfoRow label="Cardholder" value={card.cardholderName} onCopy={() => copyValue('Cardholder name', card.cardholderName)} styles={styles} C={C} />
            <InfoRow label="Card number" value={showSecret ? formatCard(card.cardNumber) : maskCardNumber(card.cardNumber)} onCopy={() => copyValue('Card number', card.cardNumber)} styles={styles} C={C} />
            <InfoRow label="Expiry" value={card.expiry} onCopy={() => copyValue('Expiry', card.expiry)} styles={styles} C={C} />
            <InfoRow label="CVV" value={showSecret ? card.cvv : '•••'} onCopy={() => copyValue('CVV', card.cvv)} styles={styles} C={C} secretToggle={() => setShowSecret((current) => !current)} showSecret={showSecret} last />
          </View>
        )}

        {item.itemType === 'DOCUMENT' && (
          <View style={styles.card}>
            {isImage && documentBase64 ? (
              <Image source={{ uri: `data:${item.mimeType || item.documentType || 'image/png'};base64,${documentBase64}` }} style={styles.imagePreview} resizeMode="contain" />
            ) : null}
            <InfoRow label="File name" value={item.fileName || item.documentName || title} onCopy={() => copyValue('File name', item.fileName || item.documentName || title)} styles={styles} C={C} />
            <InfoRow label="Type" value={item.mimeType || item.documentType || 'Unknown'} onCopy={() => copyValue('File type', item.mimeType || item.documentType || '')} styles={styles} C={C} />
            <InfoRow label="Size" value={formatSize(item.sizeBytes)} onCopy={() => copyValue('Size', formatSize(item.sizeBytes))} styles={styles} C={C} last />
          </View>
        )}

        {item.itemType === 'DOCUMENT' && (
          <TouchableOpacity style={styles.mainButton} activeOpacity={0.85} onPress={downloadDocument}>
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={styles.mainButtonText}>Download document</Text>
          </TouchableOpacity>
        )}

        {item.itemType === 'NOTE' && (
          <View style={styles.card}>
            <InfoRow label="Category" value={item.category || 'General'} onCopy={() => copyValue('Category', item.category || 'General')} styles={styles} C={C} />
            <View style={styles.noteContentBox}>
              <Text style={styles.infoLabel}>Note</Text>
              <Text style={styles.noteContent}>{noteContent || 'No note content.'}</Text>
              {!!noteContent && (
                <TouchableOpacity style={styles.copyNoteButton} onPress={() => copyValue('Note', noteContent)}>
                  <Ionicons name="copy-outline" size={17} color={C.primary} />
                  <Text style={styles.copyNoteText}>Copy note</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, onCopy, styles, C, secretToggle, showSecret, last }: any) {
  return (
    <View style={[styles.infoRow, !last && styles.divider]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} selectable>{value || 'Not saved'}</Text>
      </View>
      {secretToggle && (
        <TouchableOpacity style={styles.iconButton} onPress={secretToggle}>
          <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={19} color={C.primary} />
        </TouchableOpacity>
      )}
      {!!value && (
        <TouchableOpacity style={styles.iconButton} onPress={onCopy}>
          <Ionicons name="copy-outline" size={19} color={C.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (C: any) => StyleSheet.create({
  skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 },
  skeletonEyebrow: { width: 118, height: 12, marginBottom: 8 },
  skeletonTitle: { width: 230, height: 30, marginBottom: 18 },
  skeletonLabel: { width: 82, height: 11, marginBottom: 8 },
  skeletonValue: { width: '70%', height: 14 },
  safeArea: { flex: 1, backgroundColor: C.background },
  content: { paddingHorizontal: 18, paddingTop: 96, paddingBottom: 130 },
  eyebrow: { color: C.textSecondary, fontSize: 13, fontWeight: '800' },
  title: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: 2 },
  subtitle: { color: C.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  warningCard: { backgroundColor: C.securityScoreBg, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.warning, marginBottom: 14 },
  warningText: { color: C.text, flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '800' },
  card: { backgroundColor: C.backgroundElement, borderRadius: 22, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.border },
  infoLabel: { color: C.textSecondary, fontSize: 11, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { color: C.text, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  iconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.actionCard, alignItems: 'center', justifyContent: 'center' },
  imagePreview: { width: '100%', height: 260, backgroundColor: C.backgroundSelected },
  mainButton: { backgroundColor: C.backgroundbutton || C.primary, borderRadius: 999, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 14 },
  mainButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  noteContentBox: { padding: 15 },
  noteContent: { color: C.text, fontSize: 15, lineHeight: 23, fontWeight: '600' },
  copyNoteButton: { marginTop: 14, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: C.actionCard },
  copyNoteText: { color: C.primary, fontSize: 12, fontWeight: '900' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: C.background },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '900', marginTop: 10 },
  emptySub: { color: C.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5 },
});
