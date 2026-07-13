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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../context/ThemeContext';
import PulsingSkeleton from '../components/PulsingSkeleton';
import { api } from '../services/api';
import { File } from 'expo-file-system';

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
        { text: 'Upgrade', onPress: () => router.push('/subscription') },
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

  const handleFiles = async () => {
    if (!canUploadDocuments) {
      showUpgradeAlert();
      return;
    }

    try {
      const result: any = await File.pickFileAsync({
        mimeTypes: ['*/*'],
      });

      if (result?.canceled) return;

      const pickedFile = result?.result || result;

      const fileName =
        pickedFile?.name ||
        pickedFile?.uri?.split('/').pop() ||
        `document_${Date.now()}`;

      const fileType =
        pickedFile?.mimeType ||
        pickedFile?.type ||
        getMimeFromFileName(fileName);

      const fileSize = pickedFile?.size || pickedFile?.info?.size || 0;

      setSelectedFile({
        name: fileName,
        uri: pickedFile.uri,
        type: fileType,
        size: fileSize,
        pickedFile,
      });

      setDocumentTitle(fileName.replace(/\.[^/.]+$/, ''));
    } catch (error: any) {
      Alert.alert('File error', error.message || 'Could not pick this file.');
    }
  };

  const handleSave = async () => {
    if (!canUploadDocuments) {
      showUpgradeAlert();
      return;
    }

    if (!selectedFile || saving) return;

    if (!documentTitle.trim()) {
      Alert.alert('Missing title', 'Please enter a document title.');
      return;
    }

    try {
      setSaving(true);

      if (selectedFile.pickedFile) {
        await api.createDocumentFromPickedFile(selectedFile.pickedFile, {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          documentTitle: documentTitle.trim() || selectedFile.name,
        });
      } else {
        await api.createDocumentMultipart({
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          documentTitle: documentTitle.trim() || selectedFile.name,
        });
      }

      Alert.alert('Saved', 'Document saved to your vault.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Save failed', error.message || 'Could not save document.');
    } finally {
      setSaving(false);
    }
  };

  const isImage = selectedFile?.type.startsWith('image/');

  const renderPlanSkeleton = () => (
    <SafeAreaView style={styles.container}>
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
    </SafeAreaView>
  );

  if (checkingPlan) {
    return renderPlanSkeleton();
  }

  if (!canUploadDocuments) {
    return (
      <SafeAreaView style={styles.container}>
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
            onPress={() => router.push('/subscription')}
          >
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <Text style={styles.upgradeBtnText}>Upgrade plan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.notNowBtn}
            activeOpacity={0.75}
            onPress={() => router.back()}
          >
            <Text style={styles.notNowText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Upload Document</Text>
            <Text style={styles.planText}>{plan} plan feature</Text>
          </View>
        </View>

        <View style={styles.options}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={handleCamera}
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
            onPress={handleGallery}
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
            onPress={handleFiles}
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

                  <Text style={styles.previewSize}>
                    {formatSize(selectedFile.size)}
                    {selectedFile.type ? ` · ${selectedFile.type}` : ''}
                  </Text>
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

              <View style={styles.statusRow}>
                <Ionicons name="lock-closed-outline" size={16} color={C.primary} />
                <Text style={styles.statusText}>
                  Will be encrypted before sending to our servers.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.noticeBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
            <Text style={styles.noticeText}>
              Documents are uploaded securely to your backend and stored for later download.
            </Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {selectedFile && (
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          )}

          <Text style={styles.saveBtnText}>
            {saving ? 'Saving...' : 'Save Document'}
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

export default UploadDocumentScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },


    skeletonBlock: {
      backgroundColor: C.backgroundSelected,
      borderRadius: 999,
    },

    skeletonScroll: {
      paddingBottom: 140,
    },

    skeletonTitle: {
      width: 190,
      height: 28,
      marginHorizontal: 20,
      marginTop: 96,
      marginBottom: 8,
    },

    skeletonPlanText: {
      width: 118,
      height: 12,
      marginHorizontal: 20,
      marginBottom: 20,
    },

    skeletonOptionIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
    },

    skeletonOptionTitle: {
      width: '58%',
      height: 15,
      marginBottom: 8,
    },

    skeletonOptionSub: {
      width: '42%',
      height: 11,
    },

    skeletonChevron: {
      width: 22,
      height: 22,
      borderRadius: 8,
    },

    skeletonNoticeIcon: {
      width: 22,
      height: 22,
      borderRadius: 8,
    },

    skeletonNoticeLine: {
      width: '92%',
      height: 12,
      marginBottom: 8,
    },

    skeletonNoticeShort: {
      width: '55%',
      height: 12,
    },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },

    loadingText: {
      marginTop: 10,
      color: C.textSecondary,
      fontSize: 14,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 94,
      paddingBottom: 20,
      gap: 12,
    },

    lockedHeader: {
      paddingHorizontal: 20,
      paddingTop: 94,
    },

    backBtn: {
      width: 36,
      height: 36,
      backgroundColor: C.backgroundSelected,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },

    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: C.text,
    },

    planText: {
      marginTop: 3,
      fontSize: 12,
      color: C.primary,
      fontWeight: '700',
    },

    options: {
      paddingHorizontal: 20,
      gap: 12,
    },

    optionCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },

    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: C.actionCard,
      justifyContent: 'center',
      alignItems: 'center',
    },

    optionText: {
      flex: 1,
    },

    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: C.text,
      marginBottom: 3,
    },

    optionSub: {
      fontSize: 13,
      color: C.textSecondary,
    },

    previewCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: C.primary,
      gap: 10,
    },

    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    previewName: {
      fontSize: 14,
      fontWeight: '700',
      color: C.text,
    },

    previewSize: {
      fontSize: 12,
      color: C.textSecondary,
      marginTop: 2,
    },

    imagePreview: {
      width: '100%',
      height: 190,
      borderRadius: 12,
      marginTop: 8,
    },

    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingTop: 10,
    },

    statusText: {
      color: C.primary,
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },

    noticeBox: {
      backgroundColor: C.actionCard,
      borderRadius: 14,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 8,
    },

    noticeText: {
      flex: 1,
      fontSize: 13,
      color: C.primary,
      lineHeight: 20,
    },

    saveBtn: {
      position: 'absolute',
      left: 20,
      right: 20,
      bottom: 20,
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
    },

    saveBtnDisabled: {
      backgroundColor: C.tabInactive,
    },

    saveBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },

    label: {
      fontSize: 13,
      color: C.text,
      fontWeight: '700',
      marginBottom: 6,
    },

    input: {
      backgroundColor: C.background,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.text,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 8,
    },

    lockedContent: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingTop: 86,
      paddingBottom: 40,
    },

    premiumIcon: {
      width: 86,
      height: 86,
      borderRadius: 28,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
    },

    lockedTitle: {
      fontSize: 30,
      fontWeight: '900',
      color: C.text,
      marginBottom: 10,
    },

    lockedSubtitle: {
      fontSize: 15,
      color: C.textSecondary,
      lineHeight: 23,
      marginBottom: 20,
    },

    featureBox: {
      backgroundColor: C.backgroundElement,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 24,
      gap: 12,
    },

    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    featureText: {
      flex: 1,
      color: C.text,
      fontSize: 14,
      fontWeight: '600',
    },

    upgradeBtn: {
      backgroundColor: C.backgroundbutton,
      borderRadius: 50,
      paddingVertical: 17,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
    },

    upgradeBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '800',
    },

    notNowBtn: {
      marginTop: 14,
      alignItems: 'center',
      paddingVertical: 12,
    },

    notNowText: {
      color: C.textSecondary,
      fontSize: 15,
      fontWeight: '700',
    },
  });