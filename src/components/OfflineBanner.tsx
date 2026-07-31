import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatOfflineSavedAt } from '../services/offlineVault';

type OfflineBannerProps = {
  colors: any;
  savedAt?: string | null;
  message?: string;
  onRetry?: () => void;
};

export default function OfflineBanner({
  colors: C,
  savedAt,
  message = 'You are viewing your saved offline vault. Add, edit, and delete are disabled until the server is reachable.',
  onRetry,
}: OfflineBannerProps) {
  const styles = makeStyles(C);

  return (
    <View style={styles.banner}>
      <View style={styles.iconCircle}>
        <Ionicons name="cloud-offline-outline" size={20} color={C.warning} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Offline mode</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.savedAt}>Last synced: {formatOfflineSavedAt(savedAt)}</Text>
      </View>

      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
          <Ionicons name="refresh" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginHorizontal: 20,
      marginBottom: 14,
      padding: 14,
      borderRadius: 20,
      backgroundColor: C.securityScoreBg || C.backgroundElement,
      borderWidth: 1,
      borderColor: C.warning,
    },
    iconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.backgroundElement,
      borderWidth: 1,
      borderColor: C.border,
    },
    title: {
      color: C.text,
      fontSize: 14,
      fontWeight: '900',
      marginBottom: 3,
    },
    message: {
      color: C.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    savedAt: {
      color: C.warning,
      fontSize: 11,
      fontWeight: '900',
      marginTop: 6,
    },
    retryButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.warning,
    },
  });
