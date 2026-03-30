import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

import LoginForm from "@/components/auth/LoginForm";
import OtpForm from "@/components/auth/OtpForm";
import RegisterForm from "@/components/auth/RegisterForm";
import RegisterLandlordForm from "@/components/auth/RegisterLandlordForm";

export default function AuthScreen() {
  const router = useRouter();
  const { initialView } = useLocalSearchParams<{ initialView: string }>();
  const [view, setView] = useState<
    "login" | "register" | "register-landlord" | "otp"
  >(
    initialView === "register" ||
      initialView === "otp" ||
      initialView === "register-landlord"
      ? (initialView as any)
      : "login",
  );
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingMetaData, setPendingMetaData] = useState({});

  // Listen for auth state changes - redirect to dashboard when logged in
  useEffect(() => {
    let isMounted = true;

    // Safety Clear on load
    const clearIfLoggedOut = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && isMounted) {
        // Validate it's a real, active session (not stale cache)
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (user && !error && isMounted) {
          router.replace("/(tabs)");
        }
      }
    };
    clearIfLoggedOut();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && isMounted) {
        router.replace("/(tabs)");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleRegisterSuccess = (email: string, metaData: any) => {
    setPendingEmail(email);
    setPendingMetaData(metaData);
    setView("otp");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo + Branding Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image
                source={require("../assets/images/home.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.brandName}>Abalay</Text>
            <Text style={styles.headerSubtitle}>
              {view === "login"
                ? "Sign in to your account"
                : view === "register"
                  ? "Create your account"
                  : view === "register-landlord"
                    ? "Register as Landlord"
                    : "Verify your email"}
            </Text>

            {view === "register" && (
              <TouchableOpacity
                style={styles.headerSwitchButton}
                activeOpacity={0.85}
                onPress={() => setView("register-landlord")}
              >
                <Text style={styles.headerSwitchButtonTitle}>
                  Register as Landlord
                </Text>
                <Text style={styles.headerSwitchButtonSubtitle}>
                  For property owners
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {view === "login" && (
            <LoginForm
              loading={loading}
              setLoading={setLoading}
              onSwitchToRegister={() => setView("register")}
            />
          )}

          {view === "register" && (
            <RegisterForm
              loading={loading}
              setLoading={setLoading}
              onSwitchToLogin={() => setView("login")}
              onRegisterSuccess={handleRegisterSuccess}
            />
          )}

          {view === "register-landlord" && (
            <RegisterLandlordForm
              loading={loading}
              setLoading={setLoading}
              onSwitchToLogin={() => setView("login")}
              onSwitchToRegister={() => setView("register")}
              onRegisterSuccess={handleRegisterSuccess}
            />
          )}

          {view === "otp" && (
            <OtpForm
              email={pendingEmail}
              metaData={pendingMetaData}
              loading={loading}
              setLoading={setLoading}
              onCancel={() => setView("login")}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 50,
    justifyContent: "center",
    minHeight: "100%",
  },

  // Header with logo
  header: { marginBottom: 30, alignItems: "center" },
  logoContainer: {
    width: 85,
    height: 85,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: { width: 85, height: 85 },
  brandName: {
    fontSize: 37,
    color: "#111",
    letterSpacing: -0.5,
    marginBottom: 6,
    fontFamily: "Pacifico_400Regular",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "500",
  },
  headerSwitchButton: {
    marginTop: 14,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  headerSwitchButtonTitle: {
    fontSize: 14,
    color: "#111",
    fontWeight: "800",
    marginBottom: 2,
  },
  headerSwitchButtonSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
});
