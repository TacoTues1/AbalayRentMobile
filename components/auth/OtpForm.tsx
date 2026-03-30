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
import { supabase } from "../../lib/supabase";

const BREVO_API_KEY = process.env.EXPO_PUBLIC_BREVO_API_KEY || "";
const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP email via Brevo API
async function sendOtpViaBravo(toEmail: string, code: string) {
  if (!BREVO_API_KEY) {
    console.error("Missing EXPO_PUBLIC_BREVO_API_KEY in environment.");
    return false;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: "Abalay", email: "alfnzperez@gmail.com" },
      to: [{ email: toEmail }],
      subject: "Email Verification Code - Abalay",
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 30px;">
          <h2 style="color: #111; text-align: center;">Verify Your Email</h2>
          <p style="color: #666; text-align: center;">Enter this code in the Abalay app to verify your email address:</p>
          <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111;">${code}</span>
          </div>
          <p style="color: #999; font-size: 13px; text-align: center;">This code expires in 10 minutes.</p>
        </div>
      `,
    }),
  });
  return response.ok || response.status === 201;
}

export default function OtpForm({
  email,
  metaData,
  onCancel,
  loading,
  setLoading,
}: any) {
  const [otp, setOtp] = useState("");
  const [resending, setResending] = useState(false);
  const [useCustomOtp, setUseCustomOtp] = useState(
    metaData?.useCustomOtp || false,
  );
  const [countdown, setCountdown] = useState(90);

  useEffect(() => {
    if (countdown > 0) {
      const interval = setInterval(() => setCountdown((c) => c - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [countdown]);

  // Verify OTP
  const handleVerify = async () => {
    if (otp.length !== 6)
      return Alert.alert("Error", "Please enter a 6-digit code");
    setLoading(true);

    try {
      let userId: string | null = null;

      if (useCustomOtp) {
        // Custom verification via RPC (bypasses RLS)
        const { data, error } = await supabase.rpc("verify_otp_code", {
          p_email: email.toLowerCase(),
          p_code: otp.trim(),
        });

        if (error) throw error;
        if (!data?.success) {
          Alert.alert("Error", data?.message || "Invalid verification code.");
          setLoading(false);
          return;
        }
        userId = data.user_id;
      } else {
        // Standard Supabase OTP verification
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token: otp,
          type: "signup",
        });
        if (error) throw error;
        userId = data.user?.id || null;
      }

      if (userId) {
        // Create profile if it doesn't exist
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", userId)
          .maybeSingle();

        if (!existingProfile) {
          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: userId,
              first_name: metaData.firstName,
              middle_name: metaData.middleName || "N/A",
              last_name: metaData.lastName,
              role: metaData.role || "tenant",
              email: email,
              phone: metaData.phone,
              birthday: metaData.birthday,
              gender: metaData.gender,
              ...(metaData.business_name
                ? { business_name: metaData.business_name }
                : {}),
              ...(metaData.accepted_payments
                ? { accepted_payments: metaData.accepted_payments }
                : {}),
            });

          if (profileError && profileError.code !== "23505") {
            // Profile creation failed (likely RLS), but email is confirmed
            // Profile will be created on first sign-in instead
            console.log(
              "Profile insert skipped (will create on first login):",
              profileError.message,
            );
          }
        }

        Alert.alert("Success", "Email verified successfully! Please sign in.");
        if (onCancel) onCancel();
      } else {
        // userId not found but code was valid — still let them proceed
        Alert.alert(
          "Success",
          "Email verified! Please sign in with your credentials.",
        );
        if (onCancel) onCancel();
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP - always sends via Brevo to ensure old codes are invalidated
  const handleResendOtp = async () => {
    setResending(true);
    setOtp(""); // Clear old OTP input
    try {
      // Always use Brevo for resend — this ensures the store_reset_code RPC
      // replaces any previous code, making old codes invalid
      const code = generateCode();

      // Store the custom code (replaces any previous code for this email)
      const { error: storeError } = await supabase.rpc("store_reset_code", {
        p_email: email.toLowerCase(),
        p_code: code,
      });

      if (storeError) {
        Alert.alert("Error", "Failed to generate code. Please try again.");
        setResending(false);
        return;
      }

      // Send via Brevo
      const sent = await sendOtpViaBravo(email, code);
      if (sent) {
        setUseCustomOtp(true); // Switch to custom verification — old Supabase codes won't work
        setCountdown(90);
        Alert.alert(
          "Code Sent!",
          "A new verification code has been sent to your email. Please use the latest code.",
        );
      } else {
        Alert.alert("Error", "Failed to send email. Please try again later.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to resend code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to</Text>
      <Text style={styles.emailText}>{email}</Text>
      <Text style={styles.hint}>Check your inbox and spam folder</Text>

      <TextInput
        style={styles.otpInput}
        value={otp}
        onChangeText={setOtp}
        placeholder="000000"
        placeholderTextColor="#d1d5db"
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
      />

      <TouchableOpacity
        style={styles.button}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Verify Code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleResendOtp}
        disabled={resending || countdown > 0}
        style={styles.resendBtn}
      >
        {resending ? (
          <ActivityIndicator size="small" color="#111" />
        ) : (
          <Text style={styles.resendText}>
            {countdown > 0 ? (
              `Resend code in ${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, "0")}`
            ) : (
              <>
                Didn't receive the code?{" "}
                <Text style={styles.resendBold}>Resend</Text>
              </>
            )}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={onCancel} style={styles.cancelLink}>
        <Text style={styles.cancelText}>← Back to Registration</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center" },
  subtitle: { fontSize: 16, color: "#6b7280", marginBottom: 4 },
  emailText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111",
    marginBottom: 4,
  },
  hint: { fontSize: 13, color: "#9ca3af", marginBottom: 30 },
  otpInput: {
    fontSize: 28,
    letterSpacing: 10,
    fontWeight: "bold",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    color: "#111",
    width: "100%",
    textAlign: "center",
    padding: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#111827",
    padding: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    shadowColor: "#111827",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
  resendBtn: { marginTop: 24, alignItems: "center" },
  resendText: { color: "#6b7280", fontSize: 14 },
  resendBold: { fontWeight: "bold", color: "#111" },
  cancelLink: { marginTop: 16 },
  cancelText: { color: "#6b7280", fontSize: 14 },
});
