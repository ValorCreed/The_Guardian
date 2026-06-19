import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const UploadDocumentScreen = () => {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Upload Document</Text>
      </View>

      <View style={styles.options}>

        {/* Camera */}
        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="camera-outline" size={26} color="#1a5c35" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Camera</Text>
            <Text style={styles.optionSub}>Scan a document</Text>
          </View>
        </TouchableOpacity>

        {/* Gallery */}
        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="image-outline" size={26} color="#1a5c35" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Gallery</Text>
            <Text style={styles.optionSub}>Choose a photo</Text>
          </View>
        </TouchableOpacity>

        {/* Files */}
        <TouchableOpacity style={styles.optionCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="folder-open-outline" size={26} color="#1a5c35" />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Files</Text>
            <Text style={styles.optionSub}>Browse your files</Text>
          </View>
        </TouchableOpacity>

        {/* Encryption notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#1a5c35" />
          <Text style={styles.noticeText}>
            Files are encrypted on your device before upload.
          </Text>
        </View>

      </View>

    </SafeAreaView>
  );
};

export default UploadDocumentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
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
    backgroundColor: '#e8ede8',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0f2d1f',
  },

  options: {
    paddingHorizontal: 20,
    gap: 12,
  },

  optionCard: {
    backgroundColor: '#ffffff',
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
    backgroundColor: '#e8f0e8',
    justifyContent: 'center',
    alignItems: 'center',
  },

  optionText: {
    flex: 1,
  },

  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f2d1f',
    marginBottom: 3,
  },

  optionSub: {
    fontSize: 13,
    color: '#888',
  },

  noticeBox: {
    backgroundColor: '#e8f5e8',
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
    color: '#1a5c35',
    lineHeight: 20,
  },
});