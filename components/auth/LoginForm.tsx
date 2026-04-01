import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { getUserRouteById } from "../../lib/authRedirect";
import { supabase } from "../../lib/supabase";

WebBrowser.maybeCompleteAuthSession();
const GOOGLE_OAUTH_ENABLED = false;

export default function LoginForm({
  loading,
  setLoading,
  onSwitchToRegister,
}: any) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    loadRememberedEmail();
  }, []);

  const loadRememberedEmail = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem("remembered_email");
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch (e) {
      console.log("Failed to load email", e);
    }
  };

  const handleLogin = async () => {
    setLoading(true);

    if (rememberMe) {
      await AsyncStorage.setItem("remembered_email", email);
    } else {
      await AsyncStorage.removeItem("remembered_email");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert("Login Failed", error.message);
      return;
    }

    if (data?.session) {
      try {
        const userId = data.session.user.id;
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (!existingProfile) {
          const meta = data.session.user.user_metadata || {};
          await supabase.from("profiles").insert({
            id: userId,
            first_name: meta.first_name || meta.firstName || "User",
            middle_name: meta.middle_name || meta.middleName || "N/A",
            last_name: meta.last_name || meta.lastName || "",
            role: meta.role || "tenant",
            email: data.session.user.email,
            phone: meta.phone || "",
            birthday: meta.birthday || null,
            gender: meta.gender || "",
            ...(meta.business_name
              ? { business_name: meta.business_name }
              : {}),
            ...(meta.accepted_payments
              ? { accepted_payments: meta.accepted_payments }
              : {}),
          });
        }
      } catch (profileErr) {
        console.log("Auto profile creation:", profileErr);
      }

      const destination = await getUserRouteById(data.session.user.id);
      router.replace(destination as any);
    }
  };

  const performOAuth = async (provider: "google" | "facebook") => {
    const waitForSession = async () => {
      for (let i = 0; i < 20; i += 1) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) return session;
        await new Promise((resolve) => setTimeout(resolve, 750));
      }

      return null;
    };

    const applyOAuthResult = async (callbackUrl: string) => {
      const [beforeHash, hash = ""] = callbackUrl.split("#");
      const query = beforeHash.includes("?") ? beforeHash.split("?")[1] : "";
      const queryParams = new URLSearchParams(query);
      const hashParams = new URLSearchParams(hash);

      hashParams.forEach((value, key) => {
        queryParams.set(key, value);
      });

      const oauthError =
        queryParams.get("error_description") || queryParams.get("error");
      if (oauthError) {
        throw new Error(decodeURIComponent(oauthError));
      }

      const accessToken = queryParams.get("access_token");
      const refreshToken = queryParams.get("refresh_token");
      const oauthCode = queryParams.get("code");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) throw sessionError;
      } else if (oauthCode) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(oauthCode);

        if (exchangeError) throw exchangeError;
      }
    };

    try {
      setLoading(true);

      const isExpoGo = Constants.executionEnvironment === "storeClient";
      const hostUri = (Constants as any)?.expoConfig?.hostUri as
        | string
        | undefined;
      const normalizedHostUri = hostUri
        ? hostUri.replace(/^exps?:\/\//, "").replace(/\/+$/, "")
        : undefined;

      const redirectUrl = isExpoGo
        ? normalizedHostUri
          ? `exp://${normalizedHostUri}/--/`
          : Linking.createURL("")
        : "abalay://auth/callback";

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("Unable to start OAuth login.");

      const callbackUrlPromise = new Promise<string | null>((resolve) => {
        const sub = Linking.addEventListener("url", ({ url }) => {
          sub.remove();
          resolve(url);
        });

        setTimeout(() => {
          sub.remove();
          resolve(null);
        }, 12000);
      });

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
      );

      let callbackUrl: string | null =
        result.type === "success" && result.url ? result.url : null;

      if (!callbackUrl) {
        callbackUrl = await callbackUrlPromise;
      }

      if (!callbackUrl) {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          callbackUrl = initialUrl;
        }
      }

      if (callbackUrl) {
        await applyOAuthResult(callbackUrl);
      }

      const session = await waitForSession();
      if (!session) {
        throw new Error(
          `No session returned using redirect URL: ${redirectUrl}. Result type: ${result.type}`,
        );
      }

      const destination = await getUserRouteById(session.user.id);
      router.replace(destination as any);
    } catch (err: any) {
      Alert.alert("Login Error", err.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />

      <Text style={styles.label}>Password</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity
          onPress={() => setShowPassword(!showPassword)}
          style={{ padding: 10 }}
        >
          <Ionicons
            name={showPassword ? "eye-outline" : "eye-off-outline"}
            size={20}
            color="#6b7280"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.optionsRow}>
        <TouchableOpacity
          style={styles.rememberContainer}
          onPress={() => setRememberMe(!rememberMe)}
        >
          <Ionicons
            name={rememberMe ? "checkbox" : "square-outline"}
            size={20}
            color={rememberMe ? "#1f2937" : "#d1d5db"}
          />
          <Text style={styles.rememberText}>Remember me</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/forgot-password")}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.loginBtn, loading && styles.disabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.btnText}>Sign in</Text>
        )}
      </TouchableOpacity>

      <View style={styles.dividerContainer}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>Or continue with</Text>
        <View style={styles.line} />
      </View>

      <View style={styles.socialRow}>
        <TouchableOpacity
          style={[
            styles.socialBtn,
            (loading || !GOOGLE_OAUTH_ENABLED) && styles.disabled,
          ]}
          onPress={() => performOAuth("google")}
          disabled={loading || !GOOGLE_OAUTH_ENABLED}
        >
          <Image
            source={{ uri: "https://img.icons8.com/color/48/google-logo.png" }}
            style={{ width: 24, height: 24 }}
          />
          <Text style={styles.socialText}>Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.socialBtn, { opacity: 0.5 }]}
          onPress={() => performOAuth("facebook")}
          disabled={true}
        >
          <Ionicons name="logo-facebook" size={24} color="#1877F2" />
          <Text style={styles.socialText}>Facebook</Text>
        </TouchableOpacity>
      </View>

      {!GOOGLE_OAUTH_ENABLED && (
        <Text style={styles.tempDisabledNote}>
          Google & Facebook sign-in is temporarily unavailable.
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={onSwitchToRegister}>
          <Text style={styles.link}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { width: "100%" },
  label: {
    fontWeight: "700",
    marginBottom: 8,
    color: "#1f2937",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    fontSize: 15,
    backgroundColor: "#f9fafb",
    color: "#1f2937",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    marginBottom: 20,
    paddingRight: 5,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: "#1f2937",
  },
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  rememberContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rememberText: {
    color: "#4b5563",
    fontSize: 14,
  },
  forgotText: {
    color: "#1f2937",
    fontWeight: "600",
    fontSize: 14,
  },
  loginBtn: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 30,
    shadowColor: "#111827",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  disabled: { opacity: 0.7 },
  btnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },
  line: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  dividerText: { marginHorizontal: 16, color: "#6b7280", fontSize: 14 },
  socialRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 40,
  },
  socialBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    backgroundColor: "white",
  },
  socialText: { fontWeight: "600", color: "#374151", fontSize: 15 },
  tempDisabledNote: {
    marginTop: -26,
    marginBottom: 24,
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    fontWeight: "500",
  },
  footer: { flexDirection: "row", justifyContent: "center" },
  footerText: { color: "#6b7280", fontSize: 14 },
  link: { color: "#111827", fontWeight: "bold", fontSize: 14 },
});
