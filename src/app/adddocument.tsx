import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Colors } from '../constants/theme';
import { useColorScheme } from 'react-native';

const UploadDocumentScreen = () => {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const C = Colors[scheme];
  const styles = makeStyles(C);

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    uri: string;
    type: string;
    size?: number;
  } | null>(null);
  const [encrypting, setEncrypting] = useState(false);
  const [encrypted, setEncrypted] = useState(false);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Generate a random hex key without expo-crypto
  const generateKey = (fileName: string): string => {
    const seed = `${fileName}_${Date.now()}_${Math.random()}_guardian_vault`;
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
    }
    // build a 64-char hex string from multiple hash passes
    let key = '';
    let h = hash;
    while (key.length < 64) {
      h = ((h << 5) + h + (key.length * 31)) | 0;
      key += (h >>> 0).toString(16).padStart(8, '0');
    }
    return key.slice(0, 64);
  };

  const encryptFile = async (uri: string, fileName: string): Promise<string> => {
    const fileContent = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const encryptionKey = generateKey(fileName);

    // XOR encrypt the base64 content
    let encryptedContent = '';
    for (let i = 0; i < fileContent.length; i++) {
      const charCode =
        fileContent.charCodeAt(i) ^ encryptionKey.charCodeAt(i % encryptionKey.length);
      encryptedContent += String.fromCharCode(charCode);
    }

    const encryptedBase64 = btoa(encryptedContent);
    const encryptedFileName = `encrypted_${Date.now()}_${fileName}`;
    const baseDir =
      (FileSystem as any).documentDirectory ??
      (FileSystem as any).cacheDirectory ??
      '';
    const encryptedPath = `${baseDir}${encryptedFileName}`;

    await FileSystem.writeAsStringAsync(encryptedPath, encryptedBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // save key alongside encrypted file
    const keyPath = `${baseDir}${encryptedFileName}.key`;
    await FileSystem.writeAsStringAsync(keyPath, encryptionKey);

    return encryptedPath;
  };

  const handleCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Camera access is needed to scan documents.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setEncrypted(false);
      setSelectedFile({
        name: `scan_${Date.now()}.jpg`,
        uri: asset.uri,
        type: 'image/jpeg',
        size: asset.fileSize,
      });
    }
  };

  const handleGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Gallery access is needed to choose photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = asset.uri.split('/').pop() || `image_${Date.now()}.jpg`;
      setEncrypted(false);
      setSelectedFile({
        name: fileName,
        uri: asset.uri,
        type: 'image/jpeg',
        size: asset.fileSize,
      });
    }
  };

  const handleFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      setEncrypted(false);
      setSelectedFile({
        name: asset.name,
        uri: asset.uri,
        type: asset.mimeType || 'application/octet-stream',
        size: asset.size,
      });
    }
  };

  const handleSave = async () => {
    if (!selectedFile) {
      Alert.alert('No File', 'Please select a file first.');
      return;
    }
    try {
      setEncrypting(true);
      await encryptFile(selectedFile.uri, selectedFile.name);
      setEncrypted(true);
      setEncrypting(false);
      Alert.alert(
        'Document Encrypted & Saved',
        `"${selectedFile.name}" has been encrypted and saved securely to your vault.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      setEncrypting(false);
      Alert.alert('Error', 'Failed to encrypt and save the document. Please try again.');
    }
  };

  const isImage = selectedFile?.type.startsWith('image/');

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Upload Document</Text>
      </View>

      <View style={styles.options}>

        {/* Camera */}
        <TouchableOpacity style={styles.optionCard} onPress={handleCamera}>
          <View style={styles.iconCircle}>
            <Ionicons name="camera-outline" size={26} color={C.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Camera</Text>
            <Text style={styles.optionSub}>Scan a document</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
        </TouchableOpacity>

        {/* Gallery */}
        <TouchableOpacity style={styles.optionCard} onPress={handleGallery}>
          <View style={styles.iconCircle}>
            <Ionicons name="image-outline" size={26} color={C.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Gallery</Text>
            <Text style={styles.optionSub}>Choose a photo</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
        </TouchableOpacity>

        {/* Files */}
        <TouchableOpacity style={styles.optionCard} onPress={handleFiles}>
          <View style={styles.iconCircle}>
            <Ionicons name="folder-open-outline" size={26} color={C.primary} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Files</Text>
            <Text style={styles.optionSub}>Browse your files</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
        </TouchableOpacity>

        {/* Selected file preview */}
        {selectedFile && (
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Ionicons
                name={isImage ? 'image-outline' : 'document-outline'}
                size={20}
                color={C.primary}
              />
              <Text style={styles.previewName} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <TouchableOpacity onPress={() => { setSelectedFile(null); setEncrypted(false); }}>
                <Ionicons name="close-circle" size={20} color={C.tabInactive} />
              </TouchableOpacity>
            </View>

            {selectedFile.size && (
              <Text style={styles.previewSize}>{formatSize(selectedFile.size)}</Text>
            )}

            {isImage && (
              <Image
                source={{ uri: selectedFile.uri }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
            )}

            <View style={styles.encryptionStatus}>
              {encrypting ? (
                <>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={styles.encryptingText}>Encrypting file...</Text>
                </>
              ) : encrypted ? (
                <>
                  <Ionicons name="lock-closed" size={16} color={C.primary} />
                  <Text style={styles.encryptedText}>File encrypted</Text>
                </>
              ) : (
                <>
                  <Ionicons name="lock-open-outline" size={16} color={C.tabInactive} />
                  <Text style={styles.unencryptedText}>Will be encrypted on save</Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Encryption notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
          <Text style={styles.noticeText}>
            Files are encrypted on your device before upload.
          </Text>
        </View>

      </View>

      {/* Save button */}
      {selectedFile && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, encrypting && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={encrypting}
          >
            {encrypting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            )}
            <Text style={styles.saveBtnText}>
              {encrypting ? 'Encrypting...' : 'Encrypt & Save to Vault'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
};

export default UploadDocumentScreen;

type ThemeColors = typeof Colors.light | typeof Colors.dark;

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
      gap: 12,
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
      gap: 8,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    previewName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: C.text,
    },
    previewSize: {
      fontSize: 12,
      color: C.textSecondary,
      marginLeft: 30,
    },
    imagePreview: {
      width: '100%',
      height: 180,
      borderRadius: 10,
      marginTop: 8,
    },
    encryptionStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    encryptingText: {
      fontSize: 12,
      color: C.primary,
    },
    encryptedText: {
      fontSize: 12,
      color: C.primary,
      fontWeight: '600',
    },
    unencryptedText: {
      fontSize: 12,
      color: C.textSecondary,
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
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      backgroundColor: C.background,
    },
    saveBtn: {
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
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });