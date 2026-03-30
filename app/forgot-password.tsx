import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const BREVO_API_KEY = process.env.EXPO_PUBLIC_BREVO_API_KEY || "";

// Generate random 6-digit code
const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "otp" | "newpassword" | "success">(
    "email",
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [useCustomOtp, setUseCustomOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [countdown]);

  // Step 1: Try Supabase OTP first, fall back to Brevo if rate limited
  const handleSendOtp = async () => {
    if (!email.trim()) {
      return Alert.alert("Required", "Please enter your email address.");
    }

    setLoading(true);
    try {
      // Try Supabase's built-in OTP first
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (!error) {
        // Supabase sent the email successfully
        setUseCustomOtp(false);
        Alert.alert(
          "Code Sent!",
          "Check your email for the 6-digit verification code.",
        );
        setCountdown(90);
        setStep("otp");
        setLoading(false);
        return;
      }

      // Check if it's a rate limit or sending error
      const msg = error.message.toLowerCase();
      if (
        msg.includes("rate limit") ||
        msg.includes("exceeded") ||
        msg.includes("error sending")
      ) {
        // Fall back to Brevo
        console.log("Supabase rate limited, falling back to Brevo...");
        const code = generateCode();

        // Store the code in Supabase database
        const { error: storeError } = await supabase.rpc("store_reset_code", {
          p_email: email.trim().toLowerCase(),
          p_code: code,
        });

        if (storeError) {
          Alert.alert(
            "Error",
            "Failed to generate reset code. Please try again.",
          );
          setLoading(false);
          return;
        }

        // Send via Brevo REST API
        if (!BREVO_API_KEY) {
          Alert.alert(
            "Error",
            "Email service is not configured. Please contact support.",
          );
          setLoading(false);
          return;
        }

        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: { name: "Abalay", email: "alfnzperez@gmail.com" },
            to: [{ email: email.trim() }],
            subject: "Password Reset Code - Abalay",
            htmlContent: `
              <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px;">
                <h2 style="color: #111; text-align: center;">Password Reset</h2>
                <p style="color: #666; text-align: center;">You requested a password reset for your Abalay account. Enter this code in the app:</p>
                <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                  <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
                </div>
                <p style="color: #999; font-size: 13px; text-align: center;">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
              </div>
            `,
          }),
        });

        if (response.ok || response.status === 201) {
          setUseCustomOtp(true);
          Alert.alert(
            "Code Sent!",
            "Check your email for the 6-digit verification code.",
          );
          setCountdown(90);
          setStep("otp");
        } else {
          const result = await response.json();
          Alert.alert(
            "Error",
            result.message || "Failed to send email. Please try again.",
          );
        }
      } else {
        // Other Supabase error
        Alert.alert("Error", error.message);
      }
    } catch (err: any) {
      Alert.alert(
        "Error",
        err.message || "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the OTP code only
  const handleVerifyCode = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      return Alert.alert(
        "Required",
        "Please enter the 6-digit verification code from your email.",
      );
    }
    // Move to password step (actual verification happens on submit)
    setStep("newpassword");
  };

  // Step 3: Set new password - uses different method based on OTP source
  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      return Alert.alert("Error", "Password must be at least 6 characters.");
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert("Error", "Passwords do not match.");
    }

    setLoading(true);
    try {
      if (useCustomOtp) {
        // Custom OTP (Brevo) - verify via RPC
        const { data, error } = await supabase.rpc(
          "verify_and_reset_password",
          {
            p_email: email.trim().toLowerCase(),
            p_code: otp.trim(),
            p_new_password: newPassword,
          },
        );

        if (error) {
          Alert.alert("Error", error.message);
          setLoading(false);
          return;
        }

        if (data?.success) {
          await supabase.auth.signOut();
          setStep("success");
        } else {
          Alert.alert("Error", data?.message || "Failed to reset password.");
        }
      } else {
        // Supabase OTP - verify via Supabase auth
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otp.trim(),
          type: "email",
        });

        if (verifyError) {
          Alert.alert("Invalid Code", verifyError.message);
          setLoading(false);
          return;
        }

        // Now update the password
        const { error: updateError } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (updateError) {
          Alert.alert("Error", updateError.message);
        } else {
          await supabase.auth.signOut();
          setStep("success");
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Success screen
  if (step === "success") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#10b981" />
          </View>
          <Text style={styles.title}>Password Reset!</Text>
          <Text style={styles.subtitle}>
            Your password has been updated successfully. You can now sign in
            with your new password.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.btnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="black" />
      </TouchableOpacity>

      <View style={styles.content}>
        {step === "email" ? (
          <>
            <Ionicons
              name="lock-closed-outline"
              size={48}
              color="#111"
              style={{ alignSelf: "center", marginBottom: 20 }}
            />
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a verification code to
              reset your password.
            </Text>

            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              placeholder="yourname@gmail.com"
              placeholderTextColor="#9ca3af"
              keyboardType="email-address"
            />

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.btnText}>Send Verification Code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : step === "otp" ? (
          <>
            <Ionicons
              name="mail-open-outline"
              size={48}
              color="#111"
              style={{ alignSelf: "center", marginBottom: 20 }}
            />
            <Text style={styles.title}>Enter Code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{" "}
              <Text style={{ fontWeight: "bold", color: "#111" }}>{email}</Text>
              . Enter it below to verify your identity.
            </Text>

            <Text style={styles.label}>Verification Code</Text>
            <TextInput
              style={[
                styles.input,
                {
                  textAlign: "center",
                  letterSpacing: 8,
                  fontSize: 24,
                  fontWeight: "bold",
                },
              ]}
              value={otp}
              onChangeText={setOtp}
              placeholder="000000"
              placeholderTextColor="#d1d5db"
              keyboardType="number-pad"
              maxLength={6}
            />

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleVerifyCode}
              disabled={loading}
            >
              <Text style={styles.btnText}>Verify Code</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendBtn}
              onPress={handleSendOtp}
              disabled={loading || countdown > 0}
            >
              <Text style={styles.resendText}>
                {countdown > 0 ? (
                  `Resend code in ${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, "0")}`
                ) : (
                  <>
                    Didn't receive the code?{" "}
                    <Text style={{ fontWeight: "bold", color: "#111" }}>
                      Resend
                    </Text>
                  </>
                )}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStep("email")}
              style={{ marginTop: 10 }}
            >
              <Text style={[styles.resendText, { color: "#6b7280" }]}>
                ← Change email address
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Ionicons
              name="lock-open-outline"
              size={48}
              color="#111"
              style={{ alignSelf: "center", marginBottom: 20 }}
            />
            <Text style={styles.title}>New Password</Text>
            <Text style={styles.subtitle}>
              Create a new password for your account.
            </Text>

            <Text style={styles.label}>New Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                placeholder="Min. 6 characters"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={{ padding: 10 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color="#6b7280"
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ padding: 10 }}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off" : "eye"}
                  size={20}
                  color="#6b7280"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.btnText}>Reset Password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStep("otp")}
              style={{ marginTop: 20 }}
            >
              <Text style={[styles.resendText, { color: "#6b7280" }]}>
                ← Back to verification
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  backBtn: { marginBottom: 20 },
  content: { flex: 1, justifyContent: "center" },
  successIcon: { alignSelf: "center", marginBottom: 20 },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#111",
    textAlign: "center",
  },
  subtitle: {
    color: "#6b7280",
    marginBottom: 30,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  label: { fontWeight: "600", marginBottom: 6, color: "#374151", fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: "#f9fafb",
    color: "#111",
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
  passwordInput: { flex: 1, padding: 14, fontSize: 16, color: "#111" },
  btn: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#111827",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  resendBtn: { marginTop: 20, alignItems: "center" },
  resendText: { color: "#6b7280", fontSize: 14 },
});
