import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import AuthInput from "./AuthInput";
// Import DateTimePicker AND the Android Helper
import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";

const BREVO_API_KEY = process.env.EXPO_PUBLIC_BREVO_API_KEY || "";
const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

async function sendOtpViaBrevo(toEmail: string, code: string) {
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

const STEPS = [
  { label: "Business Info", icon: "1" },
  { label: "Personal", icon: "2" },
  { label: "Account", icon: "3" },
  { label: "Payments", icon: "4" },
];

export default function RegisterLandlordForm({
  onSwitchToLogin,
  onSwitchToRegister,
  onRegisterSuccess,
  loading,
  setLoading,
}: any) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const stepProgress = useRef(new Animated.Value(0)).current;
  const stepContentOpacity = useRef(new Animated.Value(1)).current;
  const stepContentTranslate = useRef(new Animated.Value(0)).current;

  // Form State
  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // -- BIRTHDAY & GENDER --
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [gender, setGender] = useState("");

  // -- ACCOUNT --
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // -- PAYMENTS --
  const [gcashEnabled, setGcashEnabled] = useState(false);
  const [mayaEnabled, setMayaEnabled] = useState(false);
  const [gcashNumber, setGcashNumber] = useState("");
  const [mayaNumber, setMayaNumber] = useState("");
  const [mayaSameAsGcash, setMayaSameAsGcash] = useState(false);

  // UI State
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);

  useEffect(() => {
    Animated.timing(stepProgress, {
      toValue: step,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    stepContentOpacity.setValue(0);
    stepContentTranslate.setValue(10);
    Animated.parallel([
      Animated.timing(stepContentOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(stepContentTranslate, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [step]);

  // --- Date Picker Logic ---
  const openDatePicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: birthday || new Date(),
        onChange: (event, selectedDate) => {
          if (event.type === "set" && selectedDate) {
            setBirthday(selectedDate);
          }
        },
        mode: "date",
        maximumDate: new Date(),
      });
    } else {
      setShowIOSPicker(true);
    }
  };

  const onIOSDateChange = (event: any, selectedDate?: Date) => {
    if (selectedDate) setBirthday(selectedDate);
  };

  const confirmIOSDate = () => {
    setShowIOSPicker(false);
    if (!birthday) setBirthday(new Date());
  };

  // --- Step Navigation ---
  const nextStep = () => {
    if (step === 0) {
      if (!businessName.trim())
        return Alert.alert("Required", "Business Name is required");
      if (!firstName.trim())
        return Alert.alert("Required", "First Name is required");
      if (!lastName.trim())
        return Alert.alert("Required", "Last Name is required");
      if (!termsAccepted)
        return Alert.alert(
          "Required",
          "You must accept the Terms & Conditions",
        );
    }
    if (step === 1) {
      if (!birthday)
        return Alert.alert("Required", "Please select your birthday");
      if (!gender) return Alert.alert("Required", "Please select your gender");
    }
    if (step === 2) {
      if (!email.trim()) return Alert.alert("Required", "Email is required");
      const fullEmail = getFullEmail();
      if (password.length < 6)
        return Alert.alert("Error", "Password must be at least 6 characters");
      if (password !== confirmPassword)
        return Alert.alert("Error", "Passwords do not match");
    }
    setStep((s) => s + 1);
  };
  const prevStep = () => setStep((s) => s - 1);

  // Email handler: only the part before @gmail.com
  const handleEmailChange = (text: string) => {
    const cleaned = text.replace(/[@\s]/g, "").toLowerCase();
    setEmail(cleaned);
  };
  const getFullEmail = () => (email ? `${email}@gmail.com` : "");
  // --- Registration Logic ---
  const handleRegister = async () => {
    if (gcashEnabled && !gcashNumber.trim())
      return Alert.alert("Required", "Please enter GCash number");
    if (mayaEnabled && !mayaNumber.trim())
      return Alert.alert("Required", "Please enter Maya number");

    setLoading(true);

    try {
      const formattedBirthday = birthday?.toISOString().split("T")[0];

      // Build accepted_payments JSON
      const acceptedPayments: any = { cash: true };
      if (gcashEnabled)
        acceptedPayments.gcash = { number: gcashNumber, verified: false }; // Verify later logic
      if (mayaEnabled)
        acceptedPayments.maya = {
          number: mayaSameAsGcash ? gcashNumber : mayaNumber,
          verified: false,
        };

      // Check Duplicate Email
      const fullEmail = getFullEmail();
      const { data: existingEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", fullEmail)
        .maybeSingle();

      if (existingEmail) {
        setLoading(false);
        return Alert.alert(
          "Error",
          "This email is already registered. Please sign in instead.",
        );
      }

      // Sign Up
      const { data, error } = await supabase.auth.signUp({
        email: getFullEmail(),
        password,
        options: {
          data: {
            first_name: firstName,
            middle_name: middleName || "N/A",
            last_name: lastName,
            birthday: formattedBirthday,
            gender: gender,
            role: "landlord",
            business_name: businessName,
            accepted_payments: acceptedPayments,
          },
        }, // Web project expects verification email!
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes("rate limit") ||
          msg.includes("exceeded") ||
          msg.includes("error sending")
        ) {
          // Rate limited — try to send OTP via Brevo instead
          console.log(
            "Supabase email rate limited during landlord signUp, falling back to Brevo...",
          );
          const code = generateCode();
          const fullEmail = getFullEmail();

          const { error: storeError } = await supabase.rpc("store_reset_code", {
            p_email: fullEmail.toLowerCase(),
            p_code: code,
          });

          if (storeError) {
            console.error("Failed to store code:", storeError);
            setLoading(false);
            return Alert.alert(
              "Error",
              "Could not generate verification code. Please try again in a few minutes.",
            );
          }

          const sent = await sendOtpViaBrevo(fullEmail, code);
          if (sent) {
            setLoading(false);
            onRegisterSuccess(fullEmail, {
              firstName,
              middleName,
              lastName,
              birthday: formattedBirthday,
              gender,
              role: "landlord",
              business_name: businessName,
              accepted_payments: acceptedPayments,
              useCustomOtp: true,
            });
          } else {
            setLoading(false);
            Alert.alert(
              "Error",
              'Account created but could not send verification email. Please use "Resend" on the next screen.',
            );
            onRegisterSuccess(fullEmail, {
              firstName,
              middleName,
              lastName,
              birthday: formattedBirthday,
              gender,
              role: "landlord",
              business_name: businessName,
              accepted_payments: acceptedPayments,
              useCustomOtp: true,
            });
          }
          return;
        }
        throw error;
      }

      if (data.user) {
        setLoading(false);
        onRegisterSuccess(getFullEmail(), {
          firstName,
          middleName,
          lastName,
          birthday: formattedBirthday,
          gender,
          role: "landlord",
          business_name: businessName,
          accepted_payments: acceptedPayments,
        });
      }
    } catch (error: any) {
      setLoading(false);
      Alert.alert("Registration Failed", error.message);
    }
  };

  const genderOptions = ["Male", "Female", "Prefer not to say"];

  // --- Render Steps ---
  const renderStep0 = () => (
    <View style={styles.stepContainer}>
      <AuthInput
        label="Business Name *"
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="Your business name"
      />
      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 5 }}>
          <AuthInput
            label="First Name *"
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Juan"
          />
        </View>
        <View style={{ flex: 1, marginLeft: 5 }}>
          <AuthInput
            label="Middle Name"
            value={middleName}
            onChangeText={setMiddleName}
            placeholder="Santos"
          />
        </View>
      </View>
      <AuthInput
        label="Last Name *"
        value={lastName}
        onChangeText={setLastName}
        placeholder="Dela Cruz"
      />

      <View style={styles.termsContainer}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setTermsAccepted(!termsAccepted)}
        >
          <Ionicons
            name={termsAccepted ? "checkbox" : "square-outline"}
            size={24}
            color={termsAccepted ? "black" : "#ccc"}
          />
        </TouchableOpacity>
        <View style={styles.termsTextContainer}>
          <Text style={styles.termsText}>I agree to the </Text>
          <TouchableOpacity onPress={() => router.push("/terms")}>
            <Text style={styles.termsLink}>Terms & Conditions</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <View style={{ marginBottom: 15 }}>
        <Text style={styles.inputLabel}>Birthday *</Text>
        <TouchableOpacity style={styles.inputLike} onPress={openDatePicker}>
          <Text style={birthday ? styles.inputText : styles.placeholderText}>
            {birthday ? birthday.toISOString().split("T")[0] : "YYYY-MM-DD"}
          </Text>
          <Ionicons name="calendar-outline" size={18} color="#666" />
        </TouchableOpacity>

        {showIOSPicker && (
          <Modal transparent animationType="fade" visible={true}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Birthday</Text>
                  <TouchableOpacity onPress={confirmIOSDate}>
                    <Text
                      style={{
                        color: "#2563eb",
                        fontWeight: "bold",
                        fontSize: 16,
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={birthday || new Date()}
                  mode="date"
                  display="spinner"
                  onChange={onIOSDateChange}
                  maximumDate={new Date()}
                  textColor="black"
                />
              </View>
            </View>
          </Modal>
        )}
      </View>

      <View style={{ marginBottom: 15 }}>
        <Text style={styles.inputLabel}>Gender *</Text>
        <TouchableOpacity
          style={styles.inputLike}
          onPress={() => setShowGenderModal(true)}
        >
          <Text style={gender ? styles.inputText : styles.placeholderText}>
            {gender || "Select Gender"}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      {/* Email with @gmail.com suffix */}
      <View style={{ marginBottom: 15 }}>
        <Text style={styles.inputLabel}>Email Address *</Text>
        <View style={styles.prefixInputContainer}>
          <AuthInput
            label=""
            value={email}
            onChangeText={handleEmailChange}
            placeholder="yourname"
          />
          <View style={styles.suffixBox}>
            <Text style={styles.prefixText}>@gmail.com</Text>
          </View>
        </View>
      </View>

      <AuthInput
        label="Password *"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPassword}
        isPassword
        showPassword={showPassword}
        togglePassword={() => setShowPassword(!showPassword)}
      />
      <AuthInput
        label="Confirm Password *"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry={!showConfirmPassword}
        isPassword
        showPassword={showConfirmPassword}
        togglePassword={() => setShowConfirmPassword(!showConfirmPassword)}
      />
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text
        style={[
          styles.inputLabel,
          { color: "#666", marginBottom: 15, fontWeight: "500" },
        ]}
      >
        Select your accepted payment methods. Cash is always included.
      </Text>

      {/* Cash Option */}
      <View
        style={[
          styles.paymentCard,
          { borderColor: "#111", backgroundColor: "rgba(17,17,17,0.05)" },
        ]}
      >
        <View style={styles.paymentCardHeader}>
          <View style={[styles.radioDot, { borderColor: "#111" }]}>
            <View style={[styles.innerDot, { backgroundColor: "#111" }]} />
          </View>
          <View style={[styles.paymentIcon, { backgroundColor: "#111" }]}>
            <Text style={styles.paymentIconText}>₱</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>Cash</Text>
            <Text style={styles.paymentSubtitle}>Always accepted</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Default</Text>
          </View>
        </View>
      </View>

      {/* GCash */}
      <TouchableOpacity
        style={[
          styles.paymentCard,
          gcashEnabled
            ? {
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.05)",
              }
            : { borderColor: "#e5e7eb" },
        ]}
        activeOpacity={0.8}
        onPress={() => setGcashEnabled(!gcashEnabled)}
      >
        <View style={styles.paymentCardHeader}>
          <View
            style={[
              styles.radioDot,
              gcashEnabled
                ? { borderColor: "#3b82f6" }
                : { borderColor: "#d1d5db" },
            ]}
          >
            {gcashEnabled && (
              <View style={[styles.innerDot, { backgroundColor: "#3b82f6" }]} />
            )}
          </View>
          <View style={[styles.paymentIcon, { backgroundColor: "#3b82f6" }]}>
            <Text style={styles.paymentIconText}>G</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>GCash</Text>
            <Text style={styles.paymentSubtitle}>Mobile wallet</Text>
          </View>
        </View>
        {gcashEnabled && (
          <View style={styles.paymentDetails}>
            <AuthInput
              label="GCash Number *"
              value={gcashNumber}
              onChangeText={setGcashNumber}
              placeholder="+63 9XX XXX XXXX"
            />
          </View>
        )}
      </TouchableOpacity>

      {/* Maya */}
      <TouchableOpacity
        style={[
          styles.paymentCard,
          mayaEnabled
            ? {
                borderColor: "#16a34a",
                backgroundColor: "rgba(22, 163, 74, 0.05)",
              }
            : { borderColor: "#e5e7eb" },
        ]}
        activeOpacity={0.8}
        onPress={() => setMayaEnabled(!mayaEnabled)}
      >
        <View style={styles.paymentCardHeader}>
          <View
            style={[
              styles.radioDot,
              mayaEnabled
                ? { borderColor: "#16a34a" }
                : { borderColor: "#d1d5db" },
            ]}
          >
            {mayaEnabled && (
              <View style={[styles.innerDot, { backgroundColor: "#16a34a" }]} />
            )}
          </View>
          <View style={[styles.paymentIcon, { backgroundColor: "#16a34a" }]}>
            <Text style={styles.paymentIconText}>M</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentTitle}>Maya</Text>
            <Text style={styles.paymentSubtitle}>Digital payment</Text>
          </View>
        </View>
        {mayaEnabled && (
          <View style={styles.paymentDetails}>
            <View style={styles.mayaSameAsContainer}>
              <TouchableOpacity
                style={styles.checkboxSmall}
                onPress={() => setMayaSameAsGcash(!mayaSameAsGcash)}
              >
                <Ionicons
                  name={mayaSameAsGcash ? "checkbox" : "square-outline"}
                  size={20}
                  color={mayaSameAsGcash ? "black" : "#ccc"}
                />
              </TouchableOpacity>
              <Text
                style={{ fontSize: 13, color: "#333" }}
                onPress={() => setMayaSameAsGcash(!mayaSameAsGcash)}
              >
                Use same number as GCash
              </Text>
            </View>
            {!mayaSameAsGcash && (
              <AuthInput
                label="Maya Number *"
                value={mayaNumber}
                onChangeText={setMayaNumber}
                placeholder="+63 9XX XXX XXXX"
              />
            )}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View>
      {/* Stepper Header */}
      <View style={styles.stepperContainer}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.stepIndicatorWrapper}>
            <View style={styles.stepNode}>
              <Animated.View
                style={[
                  styles.stepCircle,
                  i < step
                    ? styles.stepCircleCompleted
                    : i === step
                      ? styles.stepCircleActive
                      : styles.stepCircleInactive,
                  {
                    transform: [
                      {
                        scale: stepProgress.interpolate({
                          inputRange: [i - 1, i, i + 1],
                          outputRange: [1, 1.08, 1],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
                  },
                ]}
              >
                {i < step ? (
                  <Ionicons name="checkmark" size={14} color="white" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      i === step ? { color: "white" } : {},
                    ]}
                  >
                    {s.icon}
                  </Text>
                )}
              </Animated.View>
              <Text
                style={[styles.stepLabel, i === step && styles.stepLabelActive]}
              >
                {s.label}
              </Text>
            </View>
            {i < STEPS.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  i < step ? styles.stepLineCompleted : {},
                ]}
              />
            )}
          </View>
        ))}
      </View>
      <Text style={styles.stepTitle}>{STEPS[step].label}</Text>

      {/* Render Current Step Component */}
      <Animated.View
        style={{
          opacity: stepContentOpacity,
          transform: [{ translateY: stepContentTranslate }],
        }}
      >
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </Animated.View>

      {/* Navigation Buttons */}
      <View style={styles.navigationRow}>
        {step > 0 && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={prevStep}
            disabled={loading}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < STEPS.length - 1 ? (
          <TouchableOpacity style={styles.nextButton} onPress={nextStep}>
            <Text style={styles.nextButtonText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.nextButtonText}>
              {loading ? "Creating..." : "Sign Up"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.switchContainer}>
        <Text>Already have an account? </Text>
        <TouchableOpacity onPress={onSwitchToLogin}>
          <Text style={styles.linkText}>Sign in</Text>
        </TouchableOpacity>
      </View>
      {/* <View style={[styles.switchContainer, { marginTop: 10, marginBottom: 20 }]}>
                <Text>Register as a tenant? </Text>
                <TouchableOpacity onPress={onSwitchToRegister}>
                    <Text style={styles.linkText}>Click here</Text>
                </TouchableOpacity>
            </View> */}

      {/* GENDER SELECTION MODAL */}
      <Modal visible={showGenderModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowGenderModal(false)}
        >
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, { marginBottom: 15 }]}>
              Select Gender
            </Text>
            {genderOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.modalOption}
                onPress={() => {
                  setGender(option);
                  setShowGenderModal(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    gender === option && { fontWeight: "bold", color: "black" },
                  ]}
                >
                  {option}
                </Text>
                {gender === option && (
                  <Ionicons name="checkmark" size={18} color="black" />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setShowGenderModal(false)}
            >
              <Text style={{ color: "red", fontWeight: "bold" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  stepContainer: { flex: 1, minHeight: 180 },

  // Phone prefix & email suffix styles
  prefixInputContainer: { flexDirection: "row", alignItems: "center" },
  suffixBox: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#ccc",
    borderLeftWidth: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  prefixText: { fontSize: 14, color: "#374151", fontWeight: "600" },

  // Custom Input Styles
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    marginLeft: 4,
  },
  inputLike: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputText: { color: "black", fontSize: 14 },
  placeholderText: { color: "#9ca3af", fontSize: 14 },

  // Terms Styles
  termsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginVertical: 15,
  },
  checkbox: { marginRight: 10, paddingTop: 2 },
  termsTextContainer: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
  termsText: { fontSize: 14, color: "#666" },
  termsLink: {
    fontSize: 14,
    fontWeight: "bold",
    color: "black",
    textDecorationLine: "underline",
  },

  // Stepper Styles
  stepperContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  stepIndicatorWrapper: { flexDirection: "row", alignItems: "center", flex: 1 },
  stepNode: { alignItems: "center", width: 72 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleCompleted: { backgroundColor: "#10b981" },
  stepCircleActive: {
    backgroundColor: "#111",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  stepCircleInactive: { backgroundColor: "#e5e7eb" },
  stepNumber: { fontSize: 12, fontWeight: "bold", color: "#6b7280" },
  stepLabel: {
    fontSize: 10,
    marginTop: 6,
    color: "#9ca3af",
    textAlign: "center",
  },
  stepLabelActive: { color: "#111", fontWeight: "700" },
  stepLine: {
    height: 2,
    backgroundColor: "#e5e7eb",
    flex: 1,
    marginHorizontal: 6,
    marginTop: 16,
  },
  stepLineCompleted: { backgroundColor: "#10b981" },
  stepTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 18,
    color: "#111",
  },

  // Navigation Buttons
  navigationRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  backButton: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    width: "30%",
  },
  backButtonText: { color: "#374151", fontWeight: "bold", fontSize: 15 },
  nextButton: {
    backgroundColor: "#111",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    flex: 1,
  },
  nextButtonText: { color: "white", fontWeight: "bold", fontSize: 15 },

  switchContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 25,
  },
  linkText: {
    fontWeight: "bold",
    textDecorationLine: "underline",
    color: "#111",
  },

  // Payments Styles
  paymentCard: {
    borderWidth: 2,
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  paymentCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  innerDot: { width: 10, height: 10, borderRadius: 5 },
  paymentIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentIconText: { color: "white", fontWeight: "bold", fontSize: 14 },
  paymentTitle: { fontSize: 14, fontWeight: "bold", color: "#111" },
  paymentSubtitle: { fontSize: 12, color: "#6b7280" },
  badge: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#374151",
    textTransform: "uppercase",
  },
  paymentDetails: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  mayaSameAsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fefce8",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fef08a",
    marginBottom: 10,
  },
  checkboxSmall: { marginRight: 8 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { backgroundColor: "white", borderRadius: 12, padding: 20 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold" },
  modalOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modalOptionText: { fontSize: 16, color: "#333" },
  modalCancel: { marginTop: 15, paddingVertical: 10, alignItems: "center" },
});
