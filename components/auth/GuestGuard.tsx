import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from "react-native";
import { useTheme } from "../../lib/theme";

interface GuestGuardProps {
  message?: string;
  returnTo?: string;
  onBack?: () => void;
}

export default function GuestGuard({
  message = "Please login first to access this feature.",
  returnTo,
  onBack,
}: GuestGuardProps) {
  const { isDark, colors } = useTheme();
  const router = useRouter();

  const handleLogin = () => {
    const loginPath = returnTo
      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
      : "/login";
    router.push(loginPath as any);
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? colors.card : "#fff" },
          ]}
        >
          <Ionicons
            name="lock-closed-outline"
            size={50}
            color={isDark ? colors.textMuted : "#9ca3af"}
          />
        </View>
        <Text
          style={[styles.title, { color: isDark ? colors.text : "#111" }]}
        >
          Login Required
        </Text>
        <Text
          style={[
            styles.message,
            { color: isDark ? colors.textSecondary : "#6b7280" },
          ]}
        >
          {message}
        </Text>
        <TouchableOpacity
          style={[
            styles.loginButton,
            { backgroundColor: isDark ? colors.text : "#111" },
          ]}
          onPress={handleLogin}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.loginButtonText,
              { color: isDark ? colors.background : "#fff" },
            ]}
          >
            Log In
          </Text>
        </TouchableOpacity>

        {onBack && (
          <TouchableOpacity
            style={[
              styles.backButton,
              { borderColor: isDark ? colors.border : "#d1d5db" },
            ]}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.backButtonText,
                { color: isDark ? colors.textSecondary : "#6b7280" },
              ]}
            >
              Go Back
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  loginButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  backButton: {
    width: "100%",
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
