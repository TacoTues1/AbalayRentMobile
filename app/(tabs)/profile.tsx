import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PrivacyView from "../../components/profile/PrivacyView";
import TermsView from "../../components/profile/TermsView";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
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

export default function Profile() {
  const router = useRouter();
  const { isDark, colors, themeMode, setThemeMode } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // --- VIEW STATE ---
  const [currentView, setCurrentView] = useState<
    | "menu"
    | "personal"
    | "Password"
    | "notifications"
    | "terms"
    | "privacy"
    | "report_bug"
  >("menu");

  // --- PROFILE STATE ---
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileRole, setProfileRole] = useState("");

  // --- BUG REPORT STATE ---
  const [bugReportName, setBugReportName] = useState("");
  const [bugReportDescription, setBugReportDescription] = useState("");
  const [bugReportAttachment, setBugReportAttachment] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [sendingBugReport, setSendingBugReport] = useState(false);

  // --- LANDLORD RATING STATE ---
  const [landlordRating, setLandlordRating] = useState({
    average: 0,
    count: 0,
  });

  const [saving, setSaving] = useState(false);

  // Verification State
  const [verifying, setVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [dbVerifiedPhone, setDbVerifiedPhone] = useState("");

  // --- Password STATE ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // --- NOTIFICATIONS STATE ---
  const [notifPrefs, setNotifPrefs] = useState({
    email: true,
    sms: true,
    push: true,
  });

  // --- UI STATE ---
  const [showGenderModal, setShowGenderModal] = useState(false);

  useEffect(() => {
    getProfile();
  }, []);

  // Load landlord rating when profile is loaded and user is landlord
  useEffect(() => {
    if (session?.user?.id && profileRole === "landlord") {
      loadLandlordRating(session.user.id);
    }
  }, [session?.user?.id, profileRole]);

  const loadLandlordRating = async (landlordId: string) => {
    try {
      const { data, error } = await supabase
        .from("landlord_ratings")
        .select("rating")
        .eq("landlord_id", landlordId);

      if (error) {
        console.warn("landlord_ratings fetch warning:", error.message);
        return;
      }

      if (data && data.length > 0) {
        const sum = data.reduce(
          (acc: number, r: any) => acc + Number(r.rating || 0),
          0,
        );
        setLandlordRating({
          average: sum / data.length,
          count: data.length,
        });
      } else {
        setLandlordRating({ average: 0, count: 0 });
      }
    } catch (e) {
      console.warn("loadLandlordRating error:", e);
    }
  };

  const getProfile = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);

      if (session) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (data) {
          setFirstName(data.first_name || "");
          setMiddleName(data.middle_name || "");
          setLastName(data.last_name || "");
          setPhone(data.phone || "");
          setBirthday(data.birthday || "");
          setGender(data.gender || "");
          setAvatarUrl(data.avatar_url || "");
          setProfileRole(data.role || "tenant");

          if (data.phone_verified && data.phone) {
            setVerifiedPhone(data.phone);
            setDbVerifiedPhone(data.phone);
          }

          if (data.notification_preferences) {
            setNotifPrefs({
              email: data.notification_preferences.email ?? true,
              sms: data.notification_preferences.sms ?? true,
              push: data.notification_preferences.push ?? true,
            });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // --- AVATAR LOGIC ---
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadAvatar(result.assets[0]);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadAvatar = async (imageAsset: ImagePicker.ImagePickerAsset) => {
    if (!session?.user?.id) return;
    setUploadingAvatar(true);

    try {
      const base64 = imageAsset.base64;
      const fileExt = imageAsset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${session.user.id}/avatar-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, decode(base64!), {
          contentType: `image/${fileExt}`,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", session.user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      Alert.alert("Success", "Profile picture updated!");
    } catch (error: any) {
      console.error(error);
      Alert.alert("Upload Failed", error.message || "Could not upload image");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // --- PHONE HELPER ---
  const isPhoneVerified = () => {
    const normalize = (p: string) => p?.replace(/\D/g, "") || "";
    return (
      normalize(verifiedPhone).length > 0 &&
      normalize(phone) === normalize(verifiedPhone)
    );
  };

  const handleSendVerification = async () => {
    // (Simplified for brevity - kept logic same as original file)
    if (!phone) return Alert.alert("Error", "Please enter a phone number.");
    setOtpLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/verify-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", phone }),
      });
      if (!response.ok) throw new Error(await response.text());
      setOtpSent(true);
      Alert.alert("Success", "Verification code sent!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    // (Simplified logic same as original)
    if (otp.length < 6) return Alert.alert("Error", "Enter 6-digit code");
    setOtpLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/verify-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          phone,
          code: otp,
          userId: session.user.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVerifying(false);
      setOtpSent(false);
      setOtp("");
      setVerifiedPhone(data.phone);
      setPhone(data.phone);
      await supabase
        .from("profiles")
        .update({ phone_verified: true })
        .eq("id", session.user.id);
      Alert.alert("Success", "Verified!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setOtpLoading(false);
    }
  };

  // --- ACTION HANDLERS ---
  const handleUpdateProfile = async () => {
    setSaving(true);
    const updates = {
      first_name: firstName,
      middle_name: middleName || "N/A",
      last_name: lastName,
      phone: phone,
      birthday: birthday || null,
      gender: gender || null,
      updated_at: new Date(),
    };
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", session.user.id);
    setSaving(false);
    if (error) Alert.alert("Error", error.message);
    else {
      Alert.alert("Success", "Profile updated");
      setCurrentView("menu");
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword)
      return Alert.alert("Error", "Mismatch");
    setSaving(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });
    if (signInError) {
      setSaving(false);
      return Alert.alert("Error", "Incorrect current password");
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) Alert.alert("Error", error.message);
    else {
      Alert.alert("Success", "Password updated");
      setCurrentView("menu");
      setNewPassword("");
      setCurrentPassword("");
      setConfirmPassword("");
    }
  };

  const handleNotificationToggle = async (key: "email" | "sms" | "push") => {
    const newPrefs = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(newPrefs);
    const { error } = await supabase
      .from("profiles")
      .update({ notification_preferences: newPrefs })
      .eq("id", session.user.id);
    if (error) setNotifPrefs({ ...notifPrefs, [key]: notifPrefs[key] });
  };

  const handleSignOut = () => {
    router.replace("/logout");
  };

  const handleReportBug = () => {
    setBugReportName("");
    setBugReportDescription("");
    setBugReportAttachment(null);
    setCurrentView("report_bug");
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
    } catch (error) {
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
          source: "profile",
          reporterName,
          reporterEmail: session?.user?.email || null,
          description: bugReportDescription.trim(),
          attachmentNote,
          attachments,
        },
      });

      if (error) {
        await sendBugReportViaBrevo({
          reporterName,
          reporterEmail: session?.user?.email || null,
          description: bugReportDescription.trim(),
          source: "profile",
          attachments,
        });
      }

      Alert.alert("Success", "Bug report sent! Thank you for your feedback.");
      setCurrentView("menu");
      setBugReportName("");
      setBugReportDescription("");
      setBugReportAttachment(null);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send bug report.");
    } finally {
      setSendingBugReport(false);
    }
  };

  // --- RENDER HELPERS ---
  const MenuRow = ({
    icon,
    label,
    onPress,
    color = "#333",
    danger = false,
  }: any) => (
    <TouchableOpacity
      style={[
        styles.menuRow,
        { borderBottomColor: isDark ? colors.border : "#f3f4f6" },
      ]}
      onPress={onPress}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={[
            styles.menuIconBox,
            danger && { backgroundColor: "#fee2e2" },
            !danger && isDark && { backgroundColor: colors.badge },
          ]}
        >
          <Ionicons
            name={icon}
            size={20}
            color={danger ? "#ef4444" : isDark ? colors.text : color}
          />
        </View>
        <Text
          style={[
            styles.menuLabel,
            danger && { color: "#ef4444" },
            !danger && { color: isDark ? colors.text : "#333" },
          ]}
        >
          {label}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={isDark ? colors.textMuted : "#ccc"}
      />
    </TouchableOpacity>
  );

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="black" />
      </View>
    );

  // --- MAIN RENDER: MENU ---
  if (currentView === "menu") {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
          {/* Header */}
          <View
            style={[
              styles.menuHeader,
              { backgroundColor: isDark ? colors.surface : undefined },
            ]}
          >
            <Text
              style={[
                styles.menuTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Profile
            </Text>
            <View style={styles.profileCard}>
              <View
                style={[
                  styles.avatarWrapperBig,
                  { backgroundColor: isDark ? colors.card : "#eee" },
                ]}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text
                    style={[
                      styles.avatarInitialsBig,
                      { color: isDark ? colors.textMuted : "#ccc" },
                    ]}
                  >
                    {(firstName?.[0] || "U").toUpperCase()}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.profileName,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                {firstName} {lastName}
              </Text>
              {/* Landlord Rating Stars */}
              {profileRole === "landlord" && (
                <View style={styles.ratingContainer}>
                  <View style={{ flexDirection: "row", gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const filled = landlordRating.average >= star;
                      const halfFilled =
                        !filled && landlordRating.average >= star - 0.5;
                      return (
                        <Ionicons
                          key={star}
                          name={
                            filled
                              ? "star"
                              : halfFilled
                                ? "star-half"
                                : "star-outline"
                          }
                          size={18}
                          color={
                            filled || halfFilled
                              ? "#eab308"
                              : isDark
                                ? "#555"
                                : "#d1d5db"
                          }
                        />
                      );
                    })}
                  </View>
                  <Text
                    style={[
                      styles.ratingText,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    {landlordRating.count > 0
                      ? `${landlordRating.average.toFixed(1)} (${landlordRating.count} review${landlordRating.count === 1 ? "" : "s"})`
                      : "No reviews yet"}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => setCurrentView("personal")}
              >
                <Text style={styles.editProfileText}>Edit Profile</Text>
                <Ionicons name="chevron-forward" size={12} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Management Section */}
          <Text
            style={[
              styles.sectionHeader,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            Management
          </Text>
          <View
            style={[
              styles.menuSection,
              { backgroundColor: isDark ? colors.card : "white" },
            ]}
          >
            <MenuRow
              icon="business-outline"
              label="All Properties"
              onPress={() => router.push("/(tabs)/allproperties")}
            />
            <MenuRow
              icon="search-outline"
              label="Search Landlords"
              onPress={() => router.push("/(tabs)/landlords")}
            />
            {profileRole === "landlord" && (
              <>
                <MenuRow
                  icon="home-outline"
                  label="My Properties"
                  onPress={() => router.push("/(tabs)/landlordproperties")}
                />
                <MenuRow
                  icon="calendar-outline"
                  label="Schedule"
                  onPress={() => router.push("/(tabs)/schedule")}
                />
              </>
            )}
            <MenuRow
              icon="people-outline"
              label="Bookings"
              onPress={() => router.push("/(tabs)/bookings")}
            />
            <MenuRow
              icon="hammer-outline"
              label="Maintenance"
              onPress={() => router.push("/(tabs)/maintenance")}
            />
            <MenuRow
              icon="card-outline"
              label="Payments"
              onPress={() => router.push("/(tabs)/payments")}
            />
          </View>

          {/* General Section */}
          <Text
            style={[
              styles.sectionHeader,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            Account
          </Text>
          <View
            style={[
              styles.menuSection,
              { backgroundColor: isDark ? colors.card : "white" },
            ]}
          >
            <MenuRow
              icon="person-outline"
              label="Personal Details"
              onPress={() => setCurrentView("personal")}
            />
            <MenuRow
              icon="lock-closed-outline"
              label="Password"
              onPress={() => setCurrentView("Password")}
            />
            <MenuRow
              icon="notifications-outline"
              label="Notifications"
              onPress={() => setCurrentView("notifications")}
            />
            {/* Dark Mode Toggle */}
            <View
              style={[
                styles.menuRow,
                {
                  borderBottomColor: isDark ? colors.border : "#f3f4f6",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 10,
                },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View
                  style={[
                    styles.menuIconBox,
                    { backgroundColor: isDark ? "#2b2b2b" : "#f3f4f6" },
                  ]}
                >
                  <Ionicons
                    name="moon-outline"
                    size={20}
                    color={isDark ? "#a78bfa" : "#333"}
                  />
                </View>
                <Text
                  style={[
                    styles.menuLabel,
                    { color: isDark ? colors.text : "#333" },
                  ]}
                >
                  Dark Mode
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: isDark ? "#2b2b2b" : "#f3f4f6",
                  borderRadius: 10,
                  padding: 3,
                }}
              >
                {(["light", "auto", "dark"] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setThemeMode(mode)}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor:
                        themeMode === mode
                          ? isDark
                            ? "#555"
                            : "white"
                          : "transparent",
                      ...(themeMode === mode
                        ? {
                            shadowColor: "#000",
                            shadowOpacity: 0.1,
                            shadowRadius: 2,
                            elevation: 2,
                          }
                        : {}),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: themeMode === mode ? "700" : "500",
                        color:
                          themeMode === mode
                            ? isDark
                              ? "#fff"
                              : "#111"
                            : isDark
                              ? "#888"
                              : "#666",
                      }}
                    >
                      {mode === "light"
                        ? "Off"
                        : mode === "dark"
                          ? "On"
                          : "Auto"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Legal Section */}
          <Text
            style={[
              styles.sectionHeader,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            Legal
          </Text>
          <View
            style={[
              styles.menuSection,
              { backgroundColor: isDark ? colors.card : "white" },
            ]}
          >
            <MenuRow
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => setCurrentView("terms")}
            />
            <MenuRow
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              onPress={() => setCurrentView("privacy")}
            />
          </View>

          {/* Logout Section */}
          <View
            style={[
              styles.menuSection,
              {
                marginTop: 20,
                backgroundColor: isDark ? colors.card : "white",
              },
            ]}
          >
            <MenuRow
              icon="bug-outline"
              label="Report a Bug"
              onPress={handleReportBug}
            />
            <MenuRow
              icon="log-out-outline"
              label="Sign Out"
              onPress={handleSignOut}
              danger
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- SUB-VIEWS wrapper ---
  const SubHeader = ({ title }: any) => (
    <View
      style={[
        styles.subHeader,
        {
          backgroundColor: isDark ? colors.surface : "white",
          borderColor: isDark ? colors.border : "#eee",
        },
      ]}
    >
      <TouchableOpacity
        onPress={() => setCurrentView("menu")}
        style={styles.backBtn}
      >
        <Ionicons
          name="arrow-back"
          size={24}
          color={isDark ? colors.text : "black"}
        />
      </TouchableOpacity>
      <Text
        style={[
          styles.subHeaderTitle,
          { color: isDark ? colors.text : "#000" },
        ]}
      >
        {title}
      </Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // --- PERSONAL DETAILS ---
  if (currentView === "personal") {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <SubHeader title="Personal Details" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {/* Avatar Upload */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <TouchableOpacity onPress={pickImage} disabled={uploadingAvatar}>
              <View style={styles.avatarContainer}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      { backgroundColor: isDark ? colors.card : "#eee" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarInitials,
                        { color: isDark ? colors.textMuted : "#ccc" },
                      ]}
                    >
                      {(firstName?.[0] || "U").toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.avatarOverlay}>
                  {uploadingAvatar ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Ionicons name="camera" size={20} color="white" />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            First Name
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={firstName}
            onChangeText={setFirstName}
          />

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Middle Name
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={middleName}
            onChangeText={setMiddleName}
            placeholder="Enter middle name"
            placeholderTextColor={isDark ? colors.textMuted : "#999"}
          />

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Last Name
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={lastName}
            onChangeText={setLastName}
          />

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Email
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.disabled,
              {
                backgroundColor: isDark ? colors.surface : "#f3f4f6",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.textMuted : "#999",
              },
            ]}
            value={session?.user?.email || ""}
            editable={false}
          />

          <View style={{ flexDirection: "row", gap: 15 }}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.label,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Birthday
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? colors.card : "#fff",
                    borderColor: isDark ? colors.cardBorder : "#ddd",
                    color: isDark ? colors.text : "#000",
                  },
                ]}
                value={birthday}
                onChangeText={setBirthday}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={isDark ? colors.textMuted : "#999"}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.label,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Gender
              </Text>
              <TouchableOpacity
                onPress={() => setShowGenderModal(true)}
                style={[
                  styles.selectInput,
                  {
                    backgroundColor: isDark ? colors.card : "#fff",
                    borderColor: isDark ? colors.cardBorder : "#ddd",
                  },
                ]}
              >
                <Text style={{ color: isDark ? colors.text : "#000" }}>
                  {gender || "Select"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={isDark ? colors.textMuted : "#000"}
                />
              </TouchableOpacity>
            </View>
          </View>

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Phone Number
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 15,
            }}
          >
            <TextInput
              style={[
                styles.input,
                {
                  flex: 1,
                  marginBottom: 0,
                  backgroundColor: isDark ? colors.card : "#fff",
                  borderColor: isDark ? colors.cardBorder : "#ddd",
                  color: isDark ? colors.text : "#000",
                },
                isPhoneVerified() && styles.disabled,
              ]}
              value={phone}
              onChangeText={setPhone}
              editable={!isPhoneVerified()}
              keyboardType="phone-pad"
            />
            {!isPhoneVerified() && (
              <TouchableOpacity
                onPress={() => {
                  setVerifying(true);
                  handleSendVerification();
                }}
                style={styles.btnSmall}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  Verify
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* OTP section same as before... */}
          {verifying && !isPhoneVerified() && (
            <View
              style={[
                styles.otpBox,
                {
                  backgroundColor: isDark ? colors.surface : "#f8fafc",
                  borderColor: isDark ? colors.cardBorder : "#cbd5e1",
                },
              ]}
            >
              <TextInput
                style={[
                  styles.otpInput,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#cbd5e1",
                    color: isDark ? colors.text : "#000",
                  },
                ]}
                value={otp}
                onChangeText={setOtp}
                placeholder="Code"
                placeholderTextColor={isDark ? colors.textMuted : "#999"}
                keyboardType="number-pad"
              />
              <TouchableOpacity
                onPress={handleVerifyOtp}
                style={styles.btnSmall}
              >
                <Text style={{ color: "white" }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleUpdateProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.saveBtnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Gender Modal */}
        <Modal visible={showGenderModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: isDark ? colors.surface : "white" },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  { color: isDark ? colors.text : "#000" },
                ]}
              >
                Select Gender
              </Text>
              {["Male", "Female", "Prefer not to say"].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.modalOption,
                    { borderBottomColor: isDark ? colors.border : "#eee" },
                  ]}
                  onPress={() => {
                    setGender(opt);
                    setShowGenderModal(false);
                  }}
                >
                  <Text
                    style={{
                      fontWeight: gender === opt ? "bold" : "normal",
                      color: isDark ? colors.text : "#000",
                    }}
                  >
                    {opt}
                  </Text>
                  {gender === opt && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={isDark ? colors.text : "#000"}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // --- Password ---
  if (currentView === "Password") {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <SubHeader title="Password" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text
            style={[
              styles.sectionTitle,
              { color: isDark ? colors.text : "#000" },
            ]}
          >
            Change Password
          </Text>

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Current Password
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={isDark ? colors.textMuted : "#999"}
          />

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            New Password
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={isDark ? colors.textMuted : "#999"}
          />

          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Confirm Password
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={isDark ? colors.textMuted : "#999"}
          />

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handlePasswordChange}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.saveBtnText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- NOTIFICATIONS ---
  if (currentView === "notifications") {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <SubHeader title="Notifications" />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View
            style={[
              styles.section,
              { backgroundColor: isDark ? colors.card : "white" },
            ]}
          >
            {[
              {
                id: "email",
                label: "Email Notifications",
                desc: "Receive updates & bills via email.",
              },
              {
                id: "sms",
                label: "SMS Notifications",
                desc: "Get urgent alerts via text.",
              },
              {
                id: "push",
                label: "Push Notifications",
                desc: "Real-time alerts on your device.",
              },
            ].map((item) => (
              <View
                key={item.id}
                style={[
                  styles.prefRow,
                  { borderColor: isDark ? colors.border : "#f3f4f6" },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontWeight: "bold",
                      fontSize: 16,
                      color: isDark ? colors.text : "#000",
                    }}
                  >
                    {item.label}
                  </Text>
                  <Text
                    style={{
                      color: isDark ? colors.textMuted : "#666",
                      fontSize: 12,
                    }}
                  >
                    {item.desc}
                  </Text>
                </View>
                <Switch
                  value={notifPrefs[item.id as keyof typeof notifPrefs]}
                  onValueChange={() => handleNotificationToggle(item.id as any)}
                  trackColor={{
                    false: isDark ? "#555" : "#767577",
                    true: isDark ? colors.accent : "black",
                  }}
                  thumbColor={"white"}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- LEGAL SUB-VIEWS ---
  if (currentView === "terms") {
    return <TermsView onBack={() => setCurrentView("menu")} />;
  }

  if (currentView === "privacy") {
    return <PrivacyView onBack={() => setCurrentView("menu")} />;
  }

  // --- REPORT A BUG ---
  if (currentView === "report_bug") {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <SubHeader title="Report a Bug" />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {/* Header Description */}
          <View
            style={[
              styles.bugReportHeader,
              { backgroundColor: isDark ? colors.card : "#fff7ed" },
            ]}
          >
            <View style={styles.bugReportHeaderIcon}>
              <Ionicons name="bug" size={24} color="#f97316" />
            </View>
            <Text
              style={[
                styles.bugReportHeaderTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Found a bug?
            </Text>
            <Text
              style={[
                styles.bugReportHeaderDesc,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              Help us improve by describing the issue you encountered. Your
              report will be sent to our development team.
            </Text>
          </View>

          {/* Name Field (Optional) */}
          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Your Name{" "}
            <Text style={{ fontWeight: "normal", fontSize: 10 }}>
              (optional)
            </Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={bugReportName}
            onChangeText={setBugReportName}
            placeholder="Enter your name"
            placeholderTextColor={isDark ? colors.textMuted : "#999"}
          />

          {/* Issue Description */}
          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Issue Description{" "}
            <Text style={{ color: "#ef4444", fontWeight: "normal" }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.bugReportTextArea,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.cardBorder : "#ddd",
                color: isDark ? colors.text : "#000",
              },
            ]}
            value={bugReportDescription}
            onChangeText={setBugReportDescription}
            placeholder="Describe what happened, what you expected, and how to reproduce the issue..."
            placeholderTextColor={isDark ? colors.textMuted : "#999"}
            multiline
            textAlignVertical="top"
            numberOfLines={6}
          />
          <Text
            style={{
              fontSize: 11,
              color: isDark ? colors.textMuted : "#9ca3af",
              marginTop: 4,
              textAlign: "right",
            }}
          >
            {bugReportDescription.length} characters
          </Text>

          {/* Attachment */}
          <Text
            style={[
              styles.label,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Attachment{" "}
            <Text style={{ fontWeight: "normal", fontSize: 10 }}>
              (optional - image or video)
            </Text>
          </Text>

          {bugReportAttachment ? (
            <View
              style={[
                styles.bugReportAttachmentPreview,
                {
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                },
              ]}
            >
              {bugReportAttachment.type === "video" ? (
                <View style={styles.bugReportVideoPreview}>
                  <Ionicons
                    name="videocam"
                    size={32}
                    color={isDark ? colors.textMuted : "#6b7280"}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: isDark ? colors.textMuted : "#6b7280",
                      marginTop: 4,
                    }}
                  >
                    Video attached
                  </Text>
                </View>
              ) : (
                <Image
                  source={{ uri: bugReportAttachment.uri }}
                  style={styles.bugReportImagePreview}
                />
              )}
              <TouchableOpacity
                onPress={removeBugAttachment}
                style={styles.bugReportRemoveBtn}
              >
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
              <Text
                style={{
                  fontSize: 11,
                  color: isDark ? colors.textMuted : "#6b7280",
                  marginTop: 8,
                  textAlign: "center",
                }}
                numberOfLines={1}
              >
                {bugReportAttachment.fileName || "Attachment"}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={pickBugAttachment}
              style={[
                styles.bugReportUploadBtn,
                {
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderColor: isDark ? colors.cardBorder : "#d1d5db",
                },
              ]}
            >
              <View
                style={[
                  styles.bugReportUploadIcon,
                  {
                    backgroundColor: isDark ? colors.surface : "#f3f4f6",
                  },
                ]}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={28}
                  color={isDark ? colors.textMuted : "#9ca3af"}
                />
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: isDark ? colors.text : "#374151",
                  marginTop: 8,
                }}
              >
                Tap to attach a screenshot or video
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: isDark ? colors.textMuted : "#9ca3af",
                  marginTop: 4,
                }}
              >
                Supports images and videos
              </Text>
            </TouchableOpacity>
          )}

          {/* Info Note */}
          <View
            style={[
              styles.bugReportInfoBox,
              {
                backgroundColor: isDark ? colors.surface : "#eff6ff",
                borderColor: isDark ? colors.cardBorder : "#bfdbfe",
              },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={isDark ? "#60a5fa" : "#3b82f6"}
            />
            <Text
              style={{
                fontSize: 12,
                color: isDark ? colors.textMuted : "#1e40af",
                flex: 1,
              }}
            >
              Your report will be sent directly to our development team.
            </Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              {
                backgroundColor: bugReportDescription.trim()
                  ? "#000"
                  : "#d1d5db",
                opacity: sendingBugReport ? 0.6 : 1,
                marginBottom: 18,
              },
            ]}
            onPress={submitBugReport}
            disabled={sendingBugReport || !bugReportDescription.trim()}
          >
            {sendingBugReport ? (
              <ActivityIndicator color="white" />
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="send" size={18} color="white" />
                <Text style={styles.saveBtnText}>Submit Bug Report</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Helper styles
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  backBtn: { padding: 5 },
  subHeaderTitle: { fontSize: 18, fontWeight: "bold" },

  // Menu Styles
  menuHeader: { alignItems: "center", paddingTop: 20, paddingBottom: 30 },
  menuTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 20 },
  profileCard: { alignItems: "center" },
  avatarWrapperBig: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#eee",
    marginBottom: 15,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsBig: { fontSize: 36, fontWeight: "bold", color: "#ccc" },
  profileName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111",
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: "600",
  },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000ff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  editProfileText: { color: "white", fontWeight: "bold", fontSize: 14 },

  sectionHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111",
    marginLeft: 20,
    marginBottom: 10,
    marginTop: 10,
  },
  menuSection: {
    backgroundColor: "white",
    borderRadius: 16,
    marginHorizontal: 20,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  menuLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  menuIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },

  // Form Styles (Reused)
  section: { backgroundColor: "white", borderRadius: 16, padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 20 },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 5,
    marginTop: 15,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  selectInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  disabled: { backgroundColor: "#f3f4f6", color: "#999" },

  // Avatars
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#f3f4f6",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 32, fontWeight: "bold", color: "#ccc" },
  avatarOverlay: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 30,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Buttons
  saveBtn: {
    backgroundColor: "black",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: { color: "white", fontWeight: "bold", fontSize: 16 },
  btnSmall: {
    backgroundColor: "black",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // Prefs
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: "#f3f4f6",
  },

  // Verification
  otpBox: {
    padding: 15,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginTop: 10,
  },
  otpInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 5,
    textAlign: "center",
    marginBottom: 10,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { backgroundColor: "white", borderRadius: 20, padding: 20 },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  modalOption: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
  },

  // Bug Report Styles
  bugReportHeader: {
    alignItems: "center",
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
  },
  bugReportHeaderIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff7ed",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#fed7aa",
  },
  bugReportHeaderTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  bugReportHeaderDesc: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  bugReportTextArea: {
    minHeight: 130,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  bugReportAttachmentPreview: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    position: "relative",
  },
  bugReportImagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    resizeMode: "cover",
  },
  bugReportVideoPreview: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  bugReportRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: "white",
    borderRadius: 12,
  },
  bugReportUploadBtn: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  bugReportUploadIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  bugReportInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 20,
    marginBottom: 4,
  },
});
