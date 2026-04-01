import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

// Import Dashboards
import LandlordDashboard from "../../components/auth/dashboard/LandlordDashboard";
import TenantDashboard from "../../components/auth/dashboard/TenantDashboard";

export default function Dashboard() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);

  // Security State
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  // Poll for notifications every 60s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  // Refresh notification count when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
      fetchFavoriteCount();
    }, []),
  );

  const fetchFavoriteCount = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { count } = await supabase
        .from("favorites")
        .select("*", { count: "exact", head: true })
        .eq("user_id", session.user.id);

      setFavoriteCount(count || 0);
    } catch (e) {
      console.log("Error fetching favorites", e);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient", session.user.id)
        .eq("read", false);

      setUnreadCount(count || 0);
    } catch (e) {
      console.log("Error fetching notifications", e);
    }
  };

  const checkUser = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/");
        return;
      }

      setSession(session);
      fetchFavoriteCount();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (profileData) {
        if ((profileData.role || "").toLowerCase() === "admin") {
          router.replace("/admin");
          return;
        }

        setProfile(profileData);

        if (profileData.phone) {
          const { data: duplicates } = await supabase
            .from("profiles")
            .select("id")
            .eq("phone", profileData.phone)
            .neq("id", session.user.id);

          if (duplicates && duplicates.length > 0) {
            setIsDuplicate(true);
          }
        }
      }
    } catch (e) {
      console.log("Error checking user:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ LOGOUT - Use dedicated route for clean unmount/remount
  const handleSignOut = () => {
    setMenuVisible(false);
    // Directly navigate to the logout handler screen
    // This forces unmounting of the Dashboard and its state
    router.replace("/logout");
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure? This will permanently delete this duplicate account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await supabase
                .from("profiles")
                .delete()
                .eq("id", session.user.id);
              handleSignOut(); // Reuse logout logic
            } catch (error: any) {
              Alert.alert("Error", error.message);
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const MenuOption = ({
    icon,
    label,
    route,
    isLogout,
  }: {
    icon: any;
    label: string;
    route?: string;
    isLogout?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        if (isLogout) {
          handleSignOut();
        } else if (route) {
          setMenuVisible(false);
          router.push(route as any);
        }
      }}
    >
      <View style={styles.menuIconBox}>
        <Ionicons name={icon} size={20} color={isLogout ? "black" : "#333"} />
      </View>
      <Text
        style={[
          styles.menuText,
          isLogout && { color: "black", fontWeight: "bold" },
        ]}
      >
        {label}
      </Text>
      {!isLogout && <Ionicons name="chevron-forward" size={16} color="#ccc" />}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="black" />
      </View>
    );
  }

  // If no session (logged out), show loading - logout function handles navigation
  if (!session) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="black" />
      </View>
    );
  }

  const firstname =
    `${profile?.first_name || ""}`.trim() ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split("@")[0] ||
    "User";
  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "User";

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#fff" },
      ]}
      edges={["top"]}
    >
      {/* --- HEADER (Always Visible) --- */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.headerBg : "#fff",
            borderBottomColor: isDark ? colors.border : "#eee",
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>
                {(profile?.first_name || session?.user?.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <View>
            <Text
              style={[
                styles.headerGreeting,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Hello, {firstname}
            </Text>
            <Text
              style={[
                styles.headerRole,
                { color: isDark ? colors.textSecondary : "#6b7280" },
              ]}
            >
              {roleLabel}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.favoriteBtn}
          onPress={() => router.push("/favorites")}
          activeOpacity={0.8}
        >
          <Ionicons
            name="heart-outline"
            size={22}
            color={isDark ? colors.text : "#111"}
          />
          {favoriteCount > 0 && (
            <View style={styles.favoriteBadge}>
              <Text style={styles.favoriteBadgeText}>
                {favoriteCount > 99 ? "99+" : favoriteCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* --- BODY CONTENT --- */}
      {isDuplicate ? (
        // --- LOCKED VIEW (Black & White) ---
        <View style={styles.lockedContainer}>
          <View style={styles.lockIconCircle}>
            <Ionicons name="close-circle-outline" size={60} color="black" />
          </View>
          <Text style={styles.lockedTitle}>Restricted Access</Text>
          <Text style={styles.lockedDesc}>Duplicate Account Detected</Text>
          <Text style={styles.lockedSubDesc}>
            This phone number is already associated with another account. Please
            delete this account to proceed.
          </Text>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.deleteBtnText}>Delete Account</Text>
            )}
          </TouchableOpacity>

          {/* Added explicit Logout for Duplicate Screen */}
          <TouchableOpacity onPress={handleSignOut} style={{ marginTop: 20 }}>
            <Text style={{ color: "#666", textDecorationLine: "underline" }}>
              Log Out
            </Text>
          </TouchableOpacity>
        </View>
      ) : // --- NORMAL DASHBOARD ---
      profile?.role === "landlord" ? (
        <>
          <LandlordDashboard session={session} profile={profile} />
        </>
      ) : (
        <TenantDashboard session={session} profile={profile} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header Styles
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  favoriteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "white", fontSize: 16, fontWeight: "bold" },
  headerGreeting: { fontSize: 25, fontWeight: "700" },
  headerRole: { fontSize: 12, fontWeight: "500", marginTop: 1 },
  favoriteBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  favoriteBadgeText: {
    color: "white",
    fontSize: 9,
    fontWeight: "800",
  },

  // Locked View Styles (Black & White)
  lockedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    backgroundColor: "#fff",
  },
  lockIconCircle: {
    marginBottom: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "black",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  lockedDesc: {
    fontSize: 18,
    textAlign: "center",
    color: "#000",
    marginBottom: 10,
    fontWeight: "bold",
  },
  lockedSubDesc: {
    fontSize: 14,
    textAlign: "center",
    color: "#666",
    marginBottom: 40,
    lineHeight: 22,
  },
  deleteBtn: {
    backgroundColor: "black", // Black button
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  deleteBtnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Dropdown Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)" },
  dropdownMenu: {
    position: "absolute",
    top: 85, // Adjusted to sit right below the header (approx 80 height)
    right: 20,
    width: 220,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 12,
  },
  menuIconBox: { width: 30, alignItems: "center", marginRight: 10 },
  menuText: { flex: 1, fontSize: 15, color: "#333" },
  divider: { height: 1, backgroundColor: "#f0f0f0", marginVertical: 5 },

  // Floating Action Button
  floatingAddBtn: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    zIndex: 100,
  },
});
