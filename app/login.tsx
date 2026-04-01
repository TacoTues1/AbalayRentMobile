import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getUserRouteById } from "../lib/authRedirect";
import { supabase } from "../lib/supabase";

import LoginForm from "@/components/auth/LoginForm";
import OtpForm from "@/components/auth/OtpForm";
import RegisterForm from "@/components/auth/RegisterForm";
import RegisterLandlordForm from "@/components/auth/RegisterLandlordForm";

const BREVO_API_KEY = process.env.EXPO_PUBLIC_BREVO_API_KEY || "";
const BUG_REPORT_RECIPIENT = "alfonzperez92@gmail.com";

async function sendBugReportViaBrevo({
  reporterName,
  reporterEmail,
  description,
  source,
  attachments,
}: {
  reporterName: string;
  reporterEmail: string | null;
  description: string;
  source: "login" | "profile";
  attachments?: { name: string; content: string }[];
}) {
  if (!BREVO_API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_BREVO_API_KEY.");
  }

  const safe = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const htmlContent = `
    <h2>New Bug Report</h2>
    <p><strong>Source:</strong> ${safe(source)}</p>
    <p><strong>Reported by:</strong> ${safe(reporterName)}</p>
    <p><strong>User Email:</strong> ${safe(reporterEmail || "N/A")}</p>
    <p><strong>Issue Description:</strong></p>
    <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${safe(description)}</pre>
  `;

  const body: Record<string, any> = {
    sender: { name: "Abalay", email: "alfnzperez@gmail.com" },
    to: [{ email: BUG_REPORT_RECIPIENT }],
    subject: `Abalay Bug Report - ${reporterName}`,
    htmlContent,
  };

  if (attachments && attachments.length > 0) {
    body.attachment = attachments;
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok && response.status !== 201) {
    const errText = await response.text();
    throw new Error(errText || "Brevo send failed.");
  }
}

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
  const [showLoginNotice, setShowLoginNotice] = useState(false);
  const [bugReportModalVisible, setBugReportModalVisible] = useState(false);
  const [bugReportName, setBugReportName] = useState("");
  const [bugReportDescription, setBugReportDescription] = useState("");
  const [bugReportAttachment, setBugReportAttachment] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingBugReport, setSendingBugReport] = useState(false);

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
          const destination = await getUserRouteById(user.id);
          router.replace(destination as any);
        }
      }
    };
    clearIfLoggedOut();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && isMounted) {
        getUserRouteById(session.user.id)
          .then((destination) => {
            if (isMounted) router.replace(destination as any);
          })
          .catch(() => {
            if (isMounted) router.replace("/(tabs)");
          });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (view !== "login") {
      setShowLoginNotice(false);
      return;
    }

    setShowLoginNotice(true);
    const timer = setTimeout(() => {
      setShowLoginNotice(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [view]);

  const handleRegisterSuccess = (email: string, metaData: any) => {
    setPendingEmail(email);
    setPendingMetaData(metaData);
    setView("otp");
  };

  const handleOpenBugReportModal = () => {
    setBugReportName("");
    setBugReportDescription("");
    setBugReportAttachment(null);
    setBugReportModalVisible(true);
  };

  const pickBugAttachment = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setBugReportAttachment(result.assets[0]);
      }
    } catch {
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const removeBugAttachment = () => {
    setBugReportAttachment(null);
  };

  const submitBugReport = async () => {
    if (!bugReportDescription.trim()) {
      Alert.alert("Error", "Please describe the issue.");
      return;
    }

    setSendingBugReport(true);
    try {
      const reporterName = bugReportName.trim() || "Anonymous";
      let attachments:
        | {
            name: string;
            content: string;
          }[]
        | undefined;
      let attachmentNote: string | undefined;

      if (bugReportAttachment?.uri) {
        const maxAttachmentSize = 8 * 1024 * 1024;
        if ((bugReportAttachment.fileSize || 0) > maxAttachmentSize) {
          Alert.alert(
            "Error",
            "Attachment is too large. Maximum size is 8 MB.",
          );
          setSendingBugReport(false);
          return;
        }

        const fileBase64 = await FileSystem.readAsStringAsync(
          bugReportAttachment.uri,
          {
            encoding: FileSystem.EncodingType.Base64,
          },
        );
        const fallbackExt =
          bugReportAttachment.type === "video" ? "mp4" : "jpg";
        const fileName =
          bugReportAttachment.fileName || `bug-attachment.${fallbackExt}`;

        attachments = [
          {
            name: fileName,
            content: fileBase64,
          },
        ];
        attachmentNote = `Attached file: ${fileName}`;
      }

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "bug_report",
          source: "login",
          reporterName,
          reporterEmail: null,
          description: bugReportDescription.trim(),
          attachmentNote,
          attachments,
        },
      });

      if (error) {
        await sendBugReportViaBrevo({
          reporterName,
          reporterEmail: null,
          description: bugReportDescription.trim(),
          source: "login",
          attachments,
        });
      }

      Alert.alert("Success", "Bug report sent! Thank you for your feedback.");
      setBugReportModalVisible(false);
      setBugReportName("");
      setBugReportDescription("");
      setBugReportAttachment(null);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to send bug report.");
    } finally {
      setSendingBugReport(false);
    }
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

        {view === "login" && showLoginNotice && (
          <View style={styles.floatingLoginNoticeBox}>
            <Text style={styles.loginNoticeText}>
              This is an open testing build. If you find any bugs or errors, 
              please report them through Settings {'>'} Report a Bug after signing in. 
              If you do not have an account, use the Report a Bug button at the bottom of the login page.
            </Text>
          </View>
        )}

        {view === "login" && (
          <TouchableOpacity
            style={styles.bottomReportBugButton}
            activeOpacity={0.85}
            onPress={handleOpenBugReportModal}
          >
            <Text style={styles.bottomReportBugButtonText}>Report a Bug</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={bugReportModalVisible}
        animationType="slide"
        onRequestClose={() => setBugReportModalVisible(false)}
      >
        <SafeAreaView style={styles.bugModalContainer}>
          <View style={styles.bugModalHeader}>
            <Text style={styles.bugModalHeaderTitle}>Report a Bug</Text>
            <TouchableOpacity
              style={styles.bugModalCloseButton}
              onPress={() => setBugReportModalVisible(false)}
            >
              <Ionicons name="close" size={22} color="#111" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.bugModalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.bugReportHeaderCard}>
              <View style={styles.bugReportHeaderIconWrap}>
                <Ionicons name="bug" size={24} color="#f97316" />
              </View>
              <Text style={styles.bugReportHeaderTitle}>Found a bug?</Text>
              <Text style={styles.bugReportHeaderDesc}>
                Help us improve by describing the issue you encountered. Your
                report will be sent to our development team.
              </Text>
            </View>

            <Text style={styles.bugLabel}>
              Your Name <Text style={styles.bugOptionalText}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.bugInput}
              value={bugReportName}
              onChangeText={setBugReportName}
              placeholder="Enter your name"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.bugLabel}>
              Issue Description <Text style={styles.bugRequiredStar}>*</Text>
            </Text>
            <TextInput
              style={[styles.bugInput, styles.bugDescriptionInput]}
              value={bugReportDescription}
              onChangeText={setBugReportDescription}
              placeholder="Describe what happened, what you expected, and how to reproduce the issue..."
              placeholderTextColor="#9ca3af"
              multiline
              textAlignVertical="top"
              numberOfLines={6}
            />
            <Text style={styles.bugCharacterCount}>
              {bugReportDescription.length} characters
            </Text>

            <Text style={styles.bugLabel}>
              Attachment{" "}
              <Text style={styles.bugOptionalText}>
                (optional - image or video)
              </Text>
            </Text>

            {bugReportAttachment ? (
              <View style={styles.bugAttachmentPreview}>
                {bugReportAttachment.type === "video" ? (
                  <View style={styles.bugVideoPreview}>
                    <Ionicons name="videocam" size={32} color="#6b7280" />
                    <Text style={styles.bugVideoLabel}>Video attached</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: bugReportAttachment.uri }}
                    style={styles.bugImagePreview}
                  />
                )}
                <TouchableOpacity
                  onPress={removeBugAttachment}
                  style={styles.bugRemoveAttachmentButton}
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </TouchableOpacity>
                <Text style={styles.bugAttachmentName} numberOfLines={1}>
                  {bugReportAttachment.fileName || "Attachment"}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickBugAttachment}
                style={styles.bugUploadButton}
              >
                <View style={styles.bugUploadIconWrap}>
                  <Ionicons
                    name="cloud-upload-outline"
                    size={28}
                    color="#9ca3af"
                  />
                </View>
                <Text style={styles.bugUploadTitle}>
                  Tap to attach a screenshot or video
                </Text>
                <Text style={styles.bugUploadSubtitle}>
                  Supports images and videos
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.bugInfoBox}>
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#3b82f6"
              />
              <Text style={styles.bugInfoText}>
                Your report will be sent directly to our development team.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.bugSubmitButton,
                {
                  backgroundColor: bugReportDescription.trim()
                    ? "#000"
                    : "#d1d5db",
                  opacity: sendingBugReport ? 0.6 : 1,
                },
              ]}
              onPress={submitBugReport}
              disabled={sendingBugReport || !bugReportDescription.trim()}
            >
              {sendingBugReport ? (
                <ActivityIndicator color="white" />
              ) : (
                <View style={styles.bugSubmitContent}>
                  <Ionicons name="send" size={18} color="white" />
                  <Text style={styles.bugSubmitButtonText}>
                    Submit Bug Report
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  floatingLoginNoticeBox: {
    position: "absolute",
    top: 4,
    right: 8,
    width: "80%",
    zIndex: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  loginNoticeText: {
    fontSize: 12,
    color: "#92400e",
    lineHeight: 18,
    textAlign: "left",
    fontWeight: "500",
  },
  bottomReportBugButton: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  bottomReportBugButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#92400e",
  },

  bugModalContainer: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  bugModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  bugModalHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  bugModalCloseButton: {
    padding: 4,
  },
  bugModalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  bugReportHeaderCard: {
    backgroundColor: "#fff7ed",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginBottom: 18,
  },
  bugReportHeaderIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  bugReportHeaderTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  bugReportHeaderDesc: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 19,
  },
  bugLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  bugOptionalText: {
    fontWeight: "400",
    fontSize: 10,
    color: "#6b7280",
  },
  bugRequiredStar: {
    color: "#ef4444",
    fontWeight: "400",
  },
  bugInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#000",
    fontSize: 14,
  },
  bugDescriptionInput: {
    minHeight: 120,
  },
  bugCharacterCount: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "right",
  },
  bugAttachmentPreview: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 2,
  },
  bugVideoPreview: {
    width: "100%",
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  bugVideoLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  bugImagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 10,
  },
  bugRemoveAttachmentButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
  },
  bugAttachmentName: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
    width: "100%",
  },
  bugUploadButton: {
    backgroundColor: "#f9fafb",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  bugUploadIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  bugUploadTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginTop: 8,
    textAlign: "center",
  },
  bugUploadSubtitle: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
  },
  bugInfoBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 12,
    padding: 10,
  },
  bugInfoText: {
    fontSize: 12,
    color: "#1e40af",
    marginLeft: 8,
    flex: 1,
  },
  bugSubmitButton: {
    marginTop: 18,
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  bugSubmitContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  bugSubmitButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
    marginLeft: 8,
  },
});
