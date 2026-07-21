import React, { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  BackHandler,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, saveLoginSession, isDeviceLimitError } from "../services/api";
import { useAppTheme } from "../context/ThemeContext";
import { saveBiometricCredentials, biometricLogin } from "../utils/secureAuth";

export default function UnlockScreen() {
  const { isDark, colors: C, reloadTheme } = useAppTheme();
  const styles = makeStyles(C);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [vaultLocked, setVaultLocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reloadTheme?.();
    }, [reloadTheme]),
  );

  useEffect(() => {
    const checkBiometricAndLockState = async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        const savedBiometric = await AsyncStorage.getItem("biometricUnlock");
        const locked = await AsyncStorage.getItem("vaultLocked");

        setBiometricEnabled(
          compatible && enrolled && savedBiometric === "true",
        );
        setVaultLocked(locked === "true");
      } catch {
        setBiometricEnabled(false);
      }
    };

    checkBiometricAndLockState();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (vaultLocked) {
          router.replace("/login");
          return true;
        }

        return false;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [vaultLocked]),
  );

  const unlockSuccess = async () => {
    await AsyncStorage.setItem("vaultLocked", "false");
    router.replace("/home");
  };

  const handleBiometricLogin = async () => {
    if (loading) return;

    try {
      setLoading(true);

      const data = await biometricLogin();

      if (data.requiresTwoFactor) {
        router.push({
          pathname: "/twofactor",
          params: { email: data.email || "" },
        });
        return;
      }

      await saveLoginSession(data);
      await AsyncStorage.setItem("vaultLocked", "false");
      await reloadTheme?.();

      router.replace("/home");
    } catch (error: any) {
      Alert.alert(
        "Biometric login failed",
        error.message || "Please sign in with your email and password first.",
      );
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (
    data: any,
    cleanEmail: string,
    cleanPassword: string,
  ) => {
    if (data.requiresTwoFactor) {
      router.push({ pathname: "/twofactor", params: { email: cleanEmail } });
      return;
    }

    await saveLoginSession(data);
    await saveBiometricCredentials(cleanEmail, cleanPassword);
    await reloadTheme?.();
    await unlockSuccess();
  };

  const performLogin = async (forceReplaceDevice = false) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    const data = await api.login({
      email: cleanEmail,
      password: cleanPassword,
      forceReplaceDevice,
    });

    await completeLogin(data, cleanEmail, cleanPassword);
  };

  const handleLogin = async () => {
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      Alert.alert(
        "Missing details",
        "Please enter both your email and master password.",
      );
      return;
    }

    try {
      setLoading(true);
      await performLogin(false);
    } catch (error: any) {
      const message =
        error.message ||
        "We could not sign you in. Please check your details and try again.";

      if (isDeviceLimitError(error)) {
        Alert.alert(
          "Device limit reached",
          "Your free plan allows one trusted device at a time. This looks like a different device from the one currently signed in.\n\nYou can remove the previous device and continue signing in on this device.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Remove previous device",
              style: "destructive",
              onPress: async () => {
                try {
                  setLoading(true);
                  await performLogin(true);
                } catch (retryError: any) {
                  Alert.alert(
                    "Login failed",
                    retryError.message ||
                      "We could not sign you in on this device. Please try again.",
                  );
                } finally {
                  setLoading(false);
                }
              },
            },
          ],
        );

        return;
      }

      Alert.alert("Login failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={C.background}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View style={styles.headerBlock}>
            <View style={styles.eyebrowRow}>
              {/* <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>PRIVATE VAULT ACCESS</Text> */}
            </View>

            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Enter your credentials to securely unlock your vault.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={C.tabInactive}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="next"
              editable={!loading}
            />

            <Text style={styles.label}>Master Password</Text>
            <View style={styles.passwordBox}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter master password"
                placeholderTextColor={C.tabInactive}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                importantForAutofill="yes"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!loading}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((current) => !current)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={C.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push("/forgotpassword")}
              disabled={loading}
              style={styles.forgotButton}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {biometricEnabled && (
            <TouchableOpacity
              style={styles.biometricBtn}
              onPress={handleBiometricLogin}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Ionicons
                name="finger-print-outline"
                size={24}
                color={C.primary}
              />
              <Text style={styles.biometricText}>Use Biometrics</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.continueButton, loading && styles.disabledButton]}
            activeOpacity={0.85}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.continueText}>Unlock Vault</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signupLink}
            activeOpacity={0.7}
            onPress={() => router.replace("/signup")}
            disabled={loading}
          >
            <Text style={styles.signupText}>
              New to The Guardian?{" "}
              <Text style={styles.signupTextBold}>Create account</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },

    keyboardView: {
      flex: 1,
    },

    scrollView: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 78,
      paddingBottom: 180,
    },

    headerBlock: {
      marginBottom: 0,
    },

    eyebrowRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },

    eyebrowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: C.primary,
    },

    eyebrow: {
      color: C.primary,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.1,
    },

    title: {
      fontSize: 30,
      fontWeight: "900",
      color: C.text,
      marginBottom: 10,
    },

    subtitle: {
      fontSize: 14,
      color: C.textSecondary,
      lineHeight: 21,
      marginBottom: 22,
    },

    formCard: {
      backgroundColor: C.backgroundElement,
      borderRadius: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 18,
    },

    label: {
      fontSize: 13,
      color: C.text,
      fontWeight: "800",
      marginBottom: 8,
      marginLeft: 4,
    },

    input: {
      backgroundColor: C.background,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 15,
      fontSize: 15,
      color: C.text,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
    },

    passwordBox: {
      backgroundColor: C.background,
      borderRadius: 18,
      paddingLeft: 16,
      paddingRight: 8,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
    },

    passwordInput: {
      flex: 1,
      fontSize: 15,
      color: C.text,
      paddingVertical: 15,
      paddingRight: 10,
    },

    eyeButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },

    forgotButton: {
      alignSelf: "flex-end",
      paddingVertical: 6,
      paddingHorizontal: 4,
    },

    forgotText: {
      fontSize: 14,
      fontWeight: "900",
      color: C.primary,
    },

    biometricBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginBottom: 16,
      padding: 14,
      backgroundColor: C.actionCard,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
    },

    biometricText: {
      fontSize: 15,
      fontWeight: "800",
      color: C.primary,
    },

    continueButton: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 56,
      marginTop: 2,
    },

    disabledButton: {
      opacity: 0.7,
    },

    continueText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "900",
    },

    signupLink: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 18,
    },

    signupText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },

    signupTextBold: {
      color: C.primary,
      fontWeight: "900",
    },
  });