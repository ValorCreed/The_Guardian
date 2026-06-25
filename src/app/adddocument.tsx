import React, { useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { File } from 'expo-file-system';

type SelectedFile = {
  name: string;
  uri: string;
  type: string;
  size?: number;
  pickedFile?: any;
};

const UploadDocumentScreen = () => {
  const router = useRouter();
  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCamera = async () => {
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
      ////////Cureent file name is set to the document title so that it can be used when saving the document
    setDocumentTitle('Photo document');
      
      
    }
    
  };

  ////Handles file selection from the device's storage using the DocumentPicker library. It allows the user to select any type of file, copies it to the cache directory, and retrieves its base64 representation. The selected file's details are then stored in the component's state for further processing.

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

/////handles files for mostly pdfs and docx///////
const handleFiles = async () => {
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

    const fileSize =
      pickedFile?.size ||
      pickedFile?.info?.size ||
      0;

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
};/////END//////

const handleSave = async () => {
  if (!selectedFile || saving) return;

  if (!documentTitle.trim()) {
    Alert.alert('Missing title', 'Please enter a document title.');
    return;
  }

  try {
    setSaving(true);
///////Checking if selected file is pdf and saves it, i think
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Upload Document</Text>
        </View>

        <View style={styles.options}>
          <TouchableOpacity style={styles.optionCard} onPress={handleCamera} disabled={saving}>
            <View style={styles.iconCircle}>
              <Ionicons name="camera-outline" size={26} color={C.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Camera</Text>
              <Text style={styles.optionSub}>Scan a document</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionCard} onPress={handleGallery} disabled={saving}>
            <View style={styles.iconCircle}>
              <Ionicons name="image-outline" size={26} color={C.primary} />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>Gallery</Text>
              <Text style={styles.optionSub}>Choose a photo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.tabInactive} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.optionCard} onPress={handleFiles} disabled={saving}>
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
                <Ionicons name={isImage ? 'image-outline' : 'document-outline'} size={22} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Document Title</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter document title"
                        placeholderTextColor={C.tabInactive}
                        value={documentTitle}
                        onChangeText={setDocumentTitle}
                      />
                  
                  <Text style={styles.previewName} numberOfLines={1}>{selectedFile.name}</Text>
                  <Text style={styles.previewSize}>{formatSize(selectedFile.size)} {selectedFile.type ? `· ${selectedFile.type}` : ''}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedFile(null)} disabled={saving}>
                  <Ionicons name="close-circle" size={22} color={C.tabInactive} />
                </TouchableOpacity>
              </View>

              {isImage && (
                <Image source={{ uri: selectedFile.uri }} style={styles.imagePreview} resizeMode="cover" />
              )}

              <View style={styles.statusRow}>
                <Ionicons name="lock-closed-outline" size={16} color={C.primary} />
                <Text style={styles.statusText}>Will be encrypted before sending to backend</Text>
              </View>
            </View>
          )}

          <View style={styles.noticeBox}>
            <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
            <Text style={styles.noticeText}>Documents are uploaded securely to your backend and stored for later download.</Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {selectedFile && (
        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Document'}</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

export default UploadDocumentScreen;

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

const makeStyles = (C: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 12 },
    backBtn: { width: 36, height: 36, backgroundColor: C.backgroundSelected, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 22, fontWeight: 'bold', color: C.text },
    options: { paddingHorizontal: 20, gap: 12 },
    optionCard: { backgroundColor: C.backgroundElement, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.actionCard, justifyContent: 'center', alignItems: 'center' },
    optionText: { flex: 1 },
    optionTitle: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 3 },
    optionSub: { fontSize: 13, color: C.textSecondary },
    previewCard: { backgroundColor: C.backgroundElement, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.primary, gap: 10 },
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    previewName: { fontSize: 14, fontWeight: '700', color: C.text },
    previewSize: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
    imagePreview: { width: '100%', height: 190, borderRadius: 12, marginTop: 8 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
    statusText: { color: C.primary, fontSize: 12, fontWeight: '600', flex: 1 },
    noticeBox: { backgroundColor: C.actionCard, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    noticeText: { flex: 1, fontSize: 13, color: C.primary, lineHeight: 20 },
    saveBtn: { position: 'absolute', left: 20, right: 20, bottom: 20, backgroundColor: C.backgroundbutton, paddingVertical: 18, borderRadius: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
    saveBtnDisabled: { backgroundColor: C.tabInactive },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
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
  });
