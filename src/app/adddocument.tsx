import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useAppTheme } from '../context/ThemeContext';
import AddScreenEntrance from '../components/AddScreenEntrance';
import { hapticLight, hapticMedium, hapticWarning, hapticSuccess } from '../utils/haptics';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api } from '../services/api';

type SelectedFile = {
  name: string;
  uri: string;
  type: string;
  size?: number;
  pickedFile?: any;
};

type Plan = 'FREE' | 'PREMIUM' | 'FAMILY';

const UploadDocumentScreen = () => {
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const activeUploadCancelRef = useRef<null | (() => Promise<void> | void)>(null);
  const uploadCancelledRef = useRef(false);
  const mountedRef = useRef(true);

  const [checkingPlan, setCheckingPlan] = useState(true);
  const [plan, setPlan] = useState<Plan>('FREE');

  const canUploadDocuments = plan === 'PREMIUM' || plan === 'FAMILY';

  useEffect(() => {
    const checkPlan = async () => {
      try {
        setCheckingPlan(true);

        const subscription = await api.getSubscription();
        const currentPlan = (subscription.plan || 'FREE') as Plan;

        setPlan(currentPlan);
      } catch {
        setPlan('FREE');
      } finally {
        setCheckingPlan(false);
      }
    };

    checkPlan();
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      uploadCancelledRef.current = true;
      void activeUploadCancelRef.current?.();
      activeUploadCancelRef.current = null;
    };
  }, []);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const showUpgradeAlert = () => {
    Alert.alert(
      'Premium feature',
      'Document upload is only available on the Premium and Family plans.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/subscription?from=adddocument') },
      ]
    );
  };

  const handleCamera = async () => {
    if (!canUploadDocuments) {
      showUpgradeAlert();
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Camera access is needed to scan documents.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const title = `Scanned document ${new Date().toLocaleDateString()}`;

      setSelectedFile({
        name: `scan_${Date.now()}.jpg`,
        uri: asset.uri,
        type: 'image/jpeg',
        size: asset.fileSize,
      });

      setDocumentTitle(title);
    }
  };

  const handleGallery = async () => {
    if (!canUploadDocuments) {
      showUpgradeAlert();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission required', 'Gallery access is needed to choose photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = `Photo document ${Date.now()}.jpg`;

      setSelectedFile({
        name: fileName,
        uri: asset.uri,
        type: 'image/jpeg',
        size: asset.fileSize,
      });

      setDocumentTitle('Photo document');
    }
  };

  const getMimeFromFileName = (name: string) => {
    const lower = name.toLowerCase();

    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (lower.endsWith('.xlsx')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (lower.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (lower.endsWith('.pptx')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (lower.endsWith('.txt')) return 'text/plain';

    return 'application/octet-stream';
  };

  const getFriendlyFileType = (name: string, mimeType?: string) => {
    const lowerName = String(name || '').trim().toLowerCase();
    const cleanMime = String(mimeType || '').trim().toLowerCase();
    const extension = lowerName.includes('.')
      ? String(lowerName.split('.').pop() || '').replace(/[^a-z0-9]/g, '')
      : '';

    const supportedExtensions = new Set([
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'txt', 'csv', 'zip', 'jpg', 'jpeg', 'png', 'heic', 'webp',
    ]);

    if (supportedExtensions.has(extension)) {
      return extension === 'jpeg' ? 'JPG' : extension.toUpperCase();
    }

    if (cleanMime === 'application/pdf') return 'PDF';
    if (cleanMime.includes('wordprocessingml')) return 'DOCX';
    if (cleanMime === 'application/msword') return 'DOC';
    if (cleanMime.includes('spreadsheetml')) return 'XLSX';
    if (cleanMime === 'application/vnd.ms-excel') return 'XLS';
    if (cleanMime.includes('presentationml')) return 'PPTX';
    if (cleanMime === 'application/vnd.ms-powerpoint') return 'PPT';
    if (cleanMime === 'text/plain') return 'TXT';
    if (cleanMime === 'text/csv') return 'CSV';
    if (cleanMime.includes('zip')) return 'ZIP';
    if (cleanMime.startsWith('image/')) {
      const subtype = cleanMime.split('/')[1] || 'IMAGE';
      return subtype === 'jpeg' ? 'JPG' : subtype.toUpperCase();
    }

    return 'FILE';
  };

  const sanitizeFileName = (name: string) => {
    const safeName = String(name || `document_${Date.now()}`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);

    return safeName || `document_${Date.now()}`;
  };

  const preparePickedFileUri = async (uri: string, name: string) => {
    /*
     * Some Android file-provider/cache URIs are accepted by the picker but
     * fail during upload. Copying the picked file into our own Expo cache
     * gives XMLHttpRequest a stable file:// path for PDFs, DOCX, XLSX, etc.
     * If copying fails, we fall back to the picker URI and the friendly error
     * message will guide the user.
     */
    try {
      const uploadDir = `${FileSystem.cacheDirectory || ''}guardian_uploads/`;
      await FileSystem.makeDirectoryAsync(uploadDir, { intermediates: true });

      const destination = `${uploadDir}${Date.now()}_${sanitizeFileName(name)}`;
      await FileSystem.copyAsync({ from: uri, to: destination });
      return destination;
    } catch {
      return uri;
    }
  };

  const handleFiles = async () => {
    if (!canUploadDocuments) {
      showUpgradeAlert();
      return;
    }

    try {
      /*
       * Use expo-document-picker for the Files option.
       * File.pickFileAsync can return provider-backed file objects that upload
       * inconsistently on Android. copyToCacheDirectory gives us a stable local
       * file:// URI that FileSystem upload tasks can reliably send.
       */
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName = asset.name || asset.uri?.split('/').pop() || `document_${Date.now()}`;
      const fileType = asset.mimeType || getMimeFromFileName(fileName);
      const fileSize = asset.size || 0;

      if (!asset.uri) {
        Alert.alert('File error', 'Could not read this file. Please choose another file.');
        return;
      }

      const uploadUri = await preparePickedFileUri(asset.uri, fileName);

      setSelectedFile({
        name: fileName,
        uri: uploadUri,
        type: fileType,
        size: fileSize,
      });

      setDocumentTitle(fileName.replace(/\.[^/.]+$/, ''));
    } catch (error: any) {
      Alert.alert('File error', error?.message || 'Could not pick this file.');
    }
  };



  const cancelActiveUpload = async () => {
    if (!saving || uploadCancelledRef.current) return;

    uploadCancelledRef.current = true;
    hapticWarning();

    /*
     * The upload task can take a moment to be created while its auth token and
     * device headers are prepared. Keep the screen in its busy state until
     * handleSave reaches its own finally block; otherwise a second upload can
     * begin before the first cancellation request has finished.
     */
    const cancel = activeUploadCancelRef.current;
    if (!cancel) return;

    try {
      await cancel();
    } finally {
      activeUploadCancelRef.current = null;
    }
  };

  const getUploadErrorMessage = (error: any) => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || error || '').trim();
    const lower = message.toLowerCase();

    if (code === 'UPLOAD_CANCELLED' || lower.includes('cancel')) {
      return 'The upload was cancelled.';
    }

    if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('read timed out')) {
      return 'The upload took too long and timed out. Try again on a stronger connection or choose a smaller file.';
    }

    if (lower.includes("isn't readable") || lower.includes('is not readable') || lower.includes('not readable')) {
      return 'The selected file could not be read from your device. Please choose it again from Files, or move it to Downloads and try again.';
    }

    if (lower.includes('unsupported formdatapart') || lower.includes('formdatapart')) {
      return 'This file could not be prepared for upload on this device. Please choose it again from Files or move it to Downloads and try again.';
    }

    if (lower.includes('network') || lower.includes('connection') || lower.includes('failed')) {
      return 'The upload was interrupted. Please check your connection and try again.';
    }

    return message || 'Could not save document.';
  };

  const handleSave = async () => {
    if (!canUploadDocuments) {
      showUpgradeAlert();
      return;
    }

    if (!selectedFile || saving) return;

    if (!documentTitle.trim()) {
      hapticWarning();
      Alert.alert('Missing title', 'Please enter a document title.');
      return;
    }

    try {
      uploadCancelledRef.current = false;
      setSaving(true);

      const uploadTask = await api.createDocumentUploadTask({
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
        documentTitle: documentTitle.trim() || selectedFile.name,
      });

      if (uploadCancelledRef.current) {
        await uploadTask.cancel();
        return;
      }

      activeUploadCancelRef.current = uploadTask.cancel;
      await uploadTask.start();
      activeUploadCancelRef.current = null;

      if (!mountedRef.current || uploadCancelledRef.current) return;

      api.clearCache();
      await AsyncStorage.setItem('homeNeedsInitialSync', 'true');
      hapticSuccess();

      Alert.alert('Saved', 'Document saved to your vault.', [
        { text: 'OK', onPress: () => router.replace('/vault?tab=Documents') },
      ]);
    } catch (error: any) {
      if (!mountedRef.current || uploadCancelledRef.current || String(error?.code || '').toUpperCase() === 'UPLOAD_CANCELLED') {
        return;
      }

      hapticWarning();
      Alert.alert('Upload failed', getUploadErrorMessage(error));
    } finally {
      activeUploadCancelRef.current = null;
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  const isImage = selectedFile?.type.startsWith('image/');

  const renderPlanSkeleton = () => (
    <AddScreenEntrance
        style={styles.container}
        backgroundColor={C.background}
      >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.skeletonScroll}>
        <PulsingSkeleton styles={styles} style={styles.skeletonTitle} />
        <PulsingSkeleton styles={styles} style={styles.skeletonPlanText} />

        <View style={styles.options}>
          {[1, 2, 3].map((item) => (
            <View key={`document-option-skeleton-${item}`} style={styles.optionCard}>
              <PulsingSkeleton styles={styles} style={styles.skeletonOptionIcon} />
              <View style={{ flex: 1 }}>
                <PulsingSkeleton styles={styles} style={styles.skeletonOptionTitle} />
                <PulsingSkeleton styles={styles} style={styles.skeletonOptionSub} />
              </View>
              <PulsingSkeleton styles={styles} style={styles.skeletonChevron} />
            </View>
          ))}

          <View style={styles.noticeBox}>
            <PulsingSkeleton styles={styles} style={styles.skeletonNoticeIcon} />
            <View style={{ flex: 1 }}>
              <PulsingSkeleton styles={styles} style={styles.skeletonNoticeLine} />
              <PulsingSkeleton styles={styles} style={styles.skeletonNoticeShort} />
            </View>
          </View>
        </View>
      </ScrollView>
    </AddScreenEntrance>
  );

  if (checkingPlan) {
    return renderPlanSkeleton();
  }

  if (!canUploadDocuments) {
    return (
      <AddScreenEntrance
        style={styles.container}
        backgroundColor={C.background}
      >
        <View style={styles.lockedContent}>
          <View style={styles.premiumIcon}>
            <Ionicons name="document-lock-outline" size={42} color="#fff" />
          </View>

          <Text style={styles.lockedTitle}>Document upload is Premium</Text>

          <Text style={styles.lockedSubtitle}>
            Upgrade to Premium or Family to upload encrypted Documents,Images, IDs,
            PDFs, certificates, and other important files.
          </Text>

          <View style={styles.featureBox}>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={C.primary} />
              <Text style={styles.featureText}>Upload scanned documents an images</Text>
            </View>

            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={C.primary} />
              <Text style={styles.featureText}>Save PDFs and files securely</Text>
            </View>

            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={C.primary} />
              <Text style={styles.featureText}>Share documents with family members</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.upgradeBtn}
            activeOpacity={0.85}
            onPress={() => { hapticWarning(); router.push('/subscription?from=adddocument'); }}
          >
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <Text style={styles.upgradeBtnText}>Upgrade plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.notNowBtn}
            activeOpacity={0.75}
            onPress={() => { hapticLight(); router.back(); }}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </AddScreenEntrance>
    );
  }

  return (
    <AddScreenEntrance
        style={styles.container}
        backgroundColor={C.background}
      >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Add document</Text>
          </View>
        </View>

        <View style={styles.options}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => { hapticLight(); handleCamera(); }}
            disabled={saving}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="camera-outline" size={26} color={C.primary} />
            </View>

            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Camera</Text>
              <Text style={styles.optionSub}>Scan a document</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => { hapticLight(); handleGallery(); }}
            disabled={saving}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="image-outline" size={26} color={C.primary} />
            </View>

            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Gallery</Text>
              <Text style={styles.optionSub}>Choose a photo</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => { hapticLight(); handleFiles(); }}
            disabled={saving}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="folder-open-outline" size={26} color={C.primary} />
            </View>

            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Files</Text>
              <Text style={styles.optionSub}>Browse your files</Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
          </TouchableOpacity>

          {selectedFile && (
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Ionicons
                  name={isImage ? 'image-outline' : 'document-outline'}
                  size={22}
                  color={C.primary}
                />

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Document Title</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Enter document title"
                    placeholderTextColor={C.tabInactive}
                    value={documentTitle}
                    onChangeText={setDocumentTitle}
                  />

                  <Text style={styles.previewName} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>

                  <View style={styles.previewMetaRow}>
                    {!!formatSize(selectedFile.size) && (
                      <Text style={styles.previewSize}>
                        {formatSize(selectedFile.size)}
                      </Text>
                    )}
                    <View style={styles.fileTypePill}>
                      <Text style={styles.fileTypeText}>
                        {getFriendlyFileType(selectedFile.name, selectedFile.type)}
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setSelectedFile(null)}
                  disabled={saving}
                >
                  <Ionicons name="close-circle" size={22} color={C.tabInactive} />
                </TouchableOpacity>
              </View>

              {isImage && (
                <Image
                  source={{ uri: selectedFile.uri }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
              )}

              <View>
                {/* <Ionicons name="lock-closed-outline" size={16} color={C.primary} /> */}
                {/* <Text style={styles.statusText}>
                  Will be encrypted before sending to our servers.
                </Text> */}
              </View>

              {saving && (
                <TouchableOpacity
                  style={styles.inlineCancelUploadBtn}
                  onPress={cancelActiveUpload}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel document upload"
                >
                  <Ionicons name="close-circle-outline" size={18} color={C.danger} />
                  <Text style={styles.cancelUploadText}>Cancel upload</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {selectedFile && (
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => { hapticMedium(); handleSave(); }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          )}

          <Text style={styles.saveBtnText}>
            {saving ? 'Uploading...' : 'Save Document'}
          </Text>
        </TouchableOpacity>
      )}
      </KeyboardAvoidingView>
    </AddScreenEntrance>
  );
};

export default UploadDocumentScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    skeletonBlock: { backgroundColor: C.backgroundSelected, borderRadius: 999 ,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    skeletonScroll: { paddingBottom: 150 },
    skeletonTitle: { width: 190, height: 28, marginHorizontal: 20, marginTop: 96, marginBottom: 8 },
    skeletonPlanText: { width: 118, height: 12, marginHorizontal: 20, marginBottom: 20 },
    skeletonOptionIcon: { width: 54, height: 54, borderRadius: 20 },
    skeletonOptionTitle: { width: '58%', height: 15, marginBottom: 8 },
    skeletonOptionSub: { width: '42%', height: 11 },
    skeletonChevron: { width: 22, height: 22, borderRadius: 8 },
    skeletonNoticeIcon: { width: 22, height: 22, borderRadius: 8 },
    skeletonNoticeLine: { width: '92%', height: 12, marginBottom: 8 },
    skeletonNoticeShort: { width: '55%', height: 12 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    loadingText: { marginTop: 10, color: C.textSecondary, fontSize: 14 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 92, paddingBottom: 20, gap: 12 },
    lockedHeader: { paddingHorizontal: 20, paddingTop: 94 },
    backBtn: { width: 38, height: 38, backgroundColor: C.backgroundSelected, borderRadius: 16, justifyContent: 'center', alignItems: 'center' ,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    title: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.4 },
    planText: { marginTop: 4, fontSize: 12, color: C.primary, fontWeight: '900' },
    options: { paddingHorizontal: 20, gap: 14 },
    optionCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 22,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: '#000',
      shadowOpacity: 0.025,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    iconCircle: { width: 54, height: 54, borderRadius: 20, backgroundColor: C.actionCard || C.backgroundSelected, justifyContent: 'center', alignItems: 'center' },
    optionText: { flex: 1 },
    optionTitle: { fontSize: 16, fontWeight: '900', color: C.text, marginBottom: 4 },
    optionSub: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
    previewCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: C.primary,
      gap: 12,
      shadowColor: C.primary,
      shadowOpacity: 0.05,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    previewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    previewName: { fontSize: 14, fontWeight: '900', color: C.text },
    previewMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    previewSize: { fontSize: 12, color: C.textSecondary, fontWeight: '700' },
    fileTypePill: {
      borderRadius: 999,
      backgroundColor: C.actionCard || C.backgroundSelected,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    fileTypeText: {
      color: C.primary,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    imagePreview: { width: '100%', height: 190, borderRadius: 16, marginTop: 8 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
    statusText: { color: C.primary, fontSize: 12, fontWeight: '800', flex: 1, lineHeight: 18 },
    noticeBox: { backgroundColor: C.actionCard || C.backgroundSelected, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, borderWidth: 1, borderColor: C.border ,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    noticeText: { flex: 1, fontSize: 13, color: C.primary, lineHeight: 20, fontWeight: '700' },
    saveBtn: { position: 'absolute', left: 20, right: 20, bottom: 20, backgroundColor: C.backgroundbutton, paddingVertical: 18, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, shadowColor: C.primary, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
    saveBtnDisabled: { backgroundColor: C.tabInactive ,
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    inlineCancelUploadBtn: {
      width: '100%',
      backgroundColor: C.alertDangerBg || C.backgroundSelected,
      paddingVertical: 13,
      borderRadius: 18,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: C.danger,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    cancelUploadText: { color: C.danger, fontSize: 14, fontWeight: '900' },
    label: { fontSize: 13, color: C.text, fontWeight: '900', marginBottom: 7 },
    input: { backgroundColor: C.background, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 8, fontWeight: '700' },
    lockedContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 86, paddingBottom: 40 },
    premiumIcon: { width: 88, height: 88, borderRadius: 30, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
    lockedTitle: { fontSize: 31, fontWeight: '900', color: C.text, marginBottom: 10, letterSpacing: -0.5 },
    lockedSubtitle: { fontSize: 15, color: C.textSecondary, lineHeight: 23, marginBottom: 20, fontWeight: '600' },
    featureBox: { backgroundColor: C.backgroundElement, borderRadius: 24, padding: 17, borderWidth: 1, borderColor: C.border, marginBottom: 24, gap: 13 
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureText: { flex: 1, color: C.text, fontSize: 14, fontWeight: '800' },
    upgradeBtn: { backgroundColor: C.backgroundbutton, borderRadius: 50, paddingVertical: 17, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 
      ,shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},
    upgradeBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    notNowBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
    notNowText: { color: C.textSecondary, fontSize: 15, fontWeight: '800' },
  });