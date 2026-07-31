import React from 'react';
import {
  Image,
  ImageBackground,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../context/ThemeContext';
import {
  WHATS_NEW_FOOTER_MESSAGE,
  WHATS_NEW_ITEMS,
  WHATS_NEW_MESSAGE,
  WHATS_NEW_TITLE,
  WHATS_NEW_VERSION,
} from '../constants/whatsNew';

type WhatsNewModalProps = {
  visible: boolean;
  onClose: () => void;
};

export default function WhatsNewModal({ visible, onClose }: WhatsNewModalProps) {
  const { colors: C, isDark } = useAppTheme();
  const styles = makeStyles(C, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView
          intensity={isDark ? 28 : 18}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.modalCard}>
          <ImageBackground
            source={require('../assets/BackgroundImage.png')}
            resizeMode="cover"
            imageStyle={styles.heroImage}
            style={styles.hero}
          >
            <View style={styles.heroShade}>
              <View style={styles.heroTopRow}>
                <View style={styles.logoTile}>
                  <Image
                    source={require('../assets/ForegroundIconGuardianTrans.png')}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </View>

                <TouchableOpacity
                  style={styles.closeIconButton}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.versionPill}>
                <Ionicons name="sparkles" size={13} color="#BBF7D0" />
                <Text style={styles.versionText}>{WHATS_NEW_VERSION}</Text>
              </View>

              <Text style={styles.title}>{WHATS_NEW_TITLE}</Text>
              <Text style={styles.message}>{WHATS_NEW_MESSAGE}</Text>
            </View>
          </ImageBackground>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {WHATS_NEW_ITEMS.map((item, index) => (
              <View key={`${item.title}-${index}`} style={styles.featureRow}>
                <View style={styles.featureIconCircle}>
                  <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                </View>

                <View style={styles.featureTextBox}>
                  <Text style={styles.featureTitle}>{item.title}</Text>
                  <Text style={styles.featureDescription}>{item.description}</Text>
                </View>
              </View>
            ))}

            <View style={styles.footerNote}>
              <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
              <Text style={styles.footerNoteText}>{WHATS_NEW_FOOTER_MESSAGE}</Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={onClose}
            activeOpacity={0.86}
          >
            <Text style={styles.doneButtonText}>Continue to my vault</Text>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 28,
    },

    modalCard: {
      width: '100%',
      maxWidth: 430,
      maxHeight: '88%',
      backgroundColor: C.backgroundElement,
      borderRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(6,95,70,0.12)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.28,
      shadowRadius: 30,
      elevation: 18,
    },

    hero: {
      minHeight: 230,
    },

    heroImage: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },

    heroShade: {
      flex: 1,
      padding: 18,
      backgroundColor: 'rgba(3, 24, 16, 0.66)',
    },

    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },

    logoTile: {
      width: 54,
      height: 54,
      borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.13)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    logo: {
      width: 46,
      height: 46,
    },

    closeIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    versionPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(6, 95, 70, 0.72)',
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: 'rgba(187, 247, 208, 0.18)',
      marginBottom: 12,
    },

    versionText: {
      color: '#DCFCE7',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
    },

    title: {
      color: '#FFFFFF',
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: -0.4,
      marginBottom: 8,
    },

    message: {
      color: 'rgba(255,255,255,0.84)',
      fontSize: 14,
      lineHeight: 20,
      maxWidth: 340,
    },

    scrollArea: {
      maxHeight: 310,
    },

    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 8,
    },

    featureRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },

    featureIconCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },

    featureTextBox: {
      flex: 1,
    },

    featureTitle: {
      color: C.text,
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 3,
    },

    featureDescription: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },

    footerNote: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: isDark ? 'rgba(16,185,129,0.09)' : '#E8F2EC',
      borderRadius: 16,
      padding: 13,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(6,95,70,0.10)',
      marginTop: 2,
    },

    footerNoteText: {
      flex: 1,
      color: C.textSecondary,
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: '600',
    },

    doneButton: {
      marginHorizontal: 18,
      marginTop: 12,
      marginBottom: Platform.OS === 'ios' ? 20 : 18,
      backgroundColor: C.backgroundbutton || C.primary,
      borderRadius: 18,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },

    doneButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },
  });