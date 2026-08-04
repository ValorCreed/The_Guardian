import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../services/api";
import { isScreenRequestCancelled, useCancelableApi } from '../hooks/useCancelableApi';
import { useAppTheme } from "../context/ThemeContext";
import { useScreenAlert } from '../hooks/useScreenAlert';

const RegisterScreen = () => {
  const screenAlert = useScreenAlert();

  const requestApi = useCancelableApi(api);
  const router = useRouter();

  const { colors: C } = useAppTheme();
  const styles = makeStyles(C);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (loading) return;

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      screenAlert(
        "Missing details",
        "Enter your full name, email and master password.",
      );
      return;
    }

    if (!confirmPassword.trim()) {
      screenAlert("Missing details", "Please confirm your master password.");
      return;
    }

    if (password !== confirmPassword) {
      screenAlert("Password mismatch", "Your passwords do not match.");
      return;
    }

    if (password.length < 8) {
      screenAlert("Weak password", "Password must be at least 8 characters.");
      return;
    }

    try {
      setLoading(true);

      const cleanEmail = email.trim().toLowerCase();

      const pending = await requestApi.register({
        fullname: fullName.trim(),
        email: cleanEmail,
        password,
      });

      screenAlert(
        "Check your email",
        pending.message ||
          "We sent a 6-digit verification code. Your account will only be created after you confirm the code.",
        [
          {
            text: "Enter code",
            onPress: () =>
              router.replace({
                pathname: "/verifyemail",
                params: {
                  email: pending.email || cleanEmail,
                  mode: "registration",
                  next: "verification",
                },
              }),
          },
        ],
      );
    } catch (error: any) {
      if (isScreenRequestCancelled(error)) return;
      screenAlert(
        "Could not start registration",
        error.message ||
          "We could not send your verification code. No account has been created. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerBlock}>
            <View style={styles.eyebrowRow}>
              {/* <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>SECURE ACCOUNT SETUP</Text> */}
            </View>

            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Create a private vault with one master password.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Alex Morgan"
              placeholderTextColor={C.tabInactive}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="alex.morgan@gmail.com"
              placeholderTextColor={C.tabInactive}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              importantForAutofill="yes"
              returnKeyType="next"
            />

            <Text style={styles.label}>Master Password</Text>
            <View style={styles.passwordBox}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter master password"
                placeholderTextColor={C.tabInactive}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                returnKeyType="next"
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

            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.passwordBox}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Re-enter master password"
                placeholderTextColor={C.tabInactive}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword((current) => !current)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={C.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.continueButton, loading && styles.disabledButton]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.continueText}>Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signinLink}
            activeOpacity={0.7}
            onPress={() => router.replace("/signin")}
          >
            <Text style={styles.signinText}>
              Already have an account?{" "}
              <Text style={styles.signinTextBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterScreen;

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
      paddingTop: 75,
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
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

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
      marginBottom: 16,
      borderWidth: 1,
      borderColor: C.border,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

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

    continueButton: {
      backgroundColor: C.backgroundbutton,
      paddingVertical: 18,
      borderRadius: 50,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 56,
      marginTop: 2,
    
      shadowColor: '#000',
      shadowOpacity: 0.035,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 7 },
      elevation: 2,},

    disabledButton: {
      opacity: 0.7,
    },

    continueText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "900",
    },

    signinLink: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 18,
    },

    signinText: {
      color: C.textSecondary,
      fontSize: 14,
      fontWeight: "600",
    },

    signinTextBold: {
      color: C.primary,
      fontWeight: "900",
    },
  });