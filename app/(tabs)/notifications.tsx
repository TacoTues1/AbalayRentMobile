import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export default function NotificationsPage() {
  const NOTIFICATION_LIMIT = 15;
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<any>(null);

  // 1. Check Session & Load Data
  useEffect(() => {
    let cleanupRealtime: (() => void) | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        loadNotifications(session.user.id);
        cleanupRealtime = setupRealtimeSubscription(session.user.id);
      } else {
        router.replace("/");
      }
    });

    return () => {
      if (cleanupRealtime) {
        cleanupRealtime();
      }
    };
  }, []);

  // 2. Fetch Notifications
  const loadNotifications = async (userId: string) => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient", userId)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_LIMIT);

    if (!error) setNotifications(data || []);
    setLoading(false);
    setRefreshing(false);
  };

  // 3. Realtime Subscription (Live Updates)
  const setupRealtimeSubscription = (userId: string) => {
    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient=eq.${userId}`,
        },
        (payload) =>
          setNotifications((prev) =>
            [payload.new, ...prev].slice(0, NOTIFICATION_LIMIT),
          ),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient=eq.${userId}`,
        },
        (payload) =>
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? payload.new : n)),
          ),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `recipient=eq.${userId}`,
        },
        (payload) =>
          setNotifications((prev) =>
            prev.filter((n) => n.id !== payload.old.id),
          ),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // 4. Handle Click & Navigation
  const handleNotificationClick = async (notif: any) => {
    // Mark as read immediately
    if (!notif.read) {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", notif.id);
      if (!error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
      }
    }

    // Navigation Logic based on Type
    if (notif.link) {
      // If a direct link exists (rare in mobile, but handled)
      // router.push(notif.link);
    }

    switch (notif.type) {
      case "payment":
      case "payment_request":
      case "payment_confirmed":
      case "payment_approved":
      case "payment_paid":
      case "payment_confirmation_needed":
      case "payment_rejected":
      case "auto_credit_applied":
      case "payment_cash_accepted":
        router.push("/(tabs)/payments");
        break;
      case "maintenance":
      case "maintenance_request":
      case "maintenance_in_progress":
      case "maintenance_resolved":
        router.push("/(tabs)/maintenance");
        break;
      case "application":
      case "application_status":
        router.push("/(tabs)/applications");
        break;
      case "message":
        router.push("/(tabs)/messages");
        break;
      case "booking_request":
      case "booking_approved":
      case "booking_rejected":
      case "booking_cancelled":
      case "viewing_success":
      case "new_booking":
        router.push("/(tabs)/bookings");
        break;
      case "end_occupancy_request":
      case "end_request_approved":
      case "contract_renewal_request":
      case "contract_renewal_approved":
      case "contract_renewal_rejected":
      case "occupancy_assigned":
      case "occupancy_ended":
        router.push("/(tabs)/" as any);
        break;
      default:
        // Default fallback
        router.push("/(tabs)/" as any);
    }
  };

  // 5. Delete Notification
  const confirmDelete = (id: string) => {
    Alert.alert(
      "Delete Notification",
      "Are you sure you want to remove this?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("notifications")
              .delete()
              .eq("id", id);
            if (!error) {
              setNotifications((prev) => prev.filter((n) => n.id !== id));
            } else {
              Alert.alert("Error", "Could not delete notification");
            }
          },
        },
      ],
    );
  };

  // 6. Mark All Read
  const markAllAsRead = async () => {
    if (!session) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("recipient", session.user.id)
      .eq("read", false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const markAllAsUnread = async () => {
    if (!session) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read: false })
      .eq("recipient", session.user.id)
      .eq("read", true);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: false })));
    }
  };

  const toggleNotificationRead = async (notif: any) => {
    if (!session) return;
    const nextReadState = !notif.read;
    const { error } = await supabase
      .from("notifications")
      .update({ read: nextReadState })
      .eq("id", notif.id)
      .eq("recipient", session.user.id);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id ? { ...n, read: nextReadState } : n,
        ),
      );
    } else {
      Alert.alert("Error", "Could not update notification status");
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (session) loadNotifications(session.user.id);
  };

  const getTypeStyle = (type: string) => {
    if (type?.includes("payment")) return { color: "green" };
    if (type?.includes("maintenance")) return { color: "orange" };
    if (type?.includes("message")) return { color: "purple" };
    if (type?.includes("end_occupancy") || type?.includes("end_request"))
      return { color: "#dc2626" };
    if (type?.includes("renewal") || type?.includes("occupancy"))
      return { color: "#2563eb" };
    if (type?.includes("booking")) return { color: "#b45309" };
    return { color: "#666" };
  };

  const hasUnread = notifications.some((n) => !n.read);
  const hasRead = notifications.some((n) => n.read);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9f9f9" },
      ]}
      edges={["top"]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.surface : "white",
            borderBottomColor: isDark ? colors.border : "#eee",
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(tabs)" as any)
            }
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={isDark ? colors.text : "black"}
            />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: isDark ? colors.text : "#000" }]}
          >
            Notifications
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={markAllAsRead}
            disabled={!hasUnread}
            style={[
              styles.bulkActionBtn,
              { backgroundColor: isDark ? colors.card : "#eef2ff" },
              !hasUnread && styles.bulkActionBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.bulkActionText,
                { color: isDark ? colors.text : "#1d4ed8" },
                !hasUnread && styles.bulkActionTextDisabled,
              ]}
            >
              Mark all read
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={markAllAsUnread}
            disabled={!hasRead}
            style={[
              styles.bulkActionBtn,
              { backgroundColor: isDark ? colors.card : "#fef2f2" },
              !hasRead && styles.bulkActionBtnDisabled,
            ]}
          >
            <Text
              style={[
                styles.bulkActionText,
                { color: isDark ? colors.text : "#b91c1c" },
                !hasRead && styles.bulkActionTextDisabled,
              ]}
            >
              Mark all unread
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={isDark ? colors.text : "black"}
          style={{ marginTop: 50 }}
        />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#eee",
                },
                !item.read &&
                  (isDark
                    ? { backgroundColor: "#1e2a4a", borderColor: "#2e4070" }
                    : styles.unreadCard),
              ]}
            >
              <TouchableOpacity
                style={styles.cardPressArea}
                onPress={() => handleNotificationClick(item)}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <View style={styles.headerRow}>
                    <Text style={[styles.typeLabel, getTypeStyle(item.type)]}>
                      {item.type?.replace(/_/g, " ") || "Notification"}
                    </Text>
                    {!item.read && <View style={styles.dot} />}
                  </View>
                  <Text
                    style={[
                      styles.message,
                      { color: isDark ? colors.text : "#333" },
                    ]}
                  >
                    {item.message}
                  </Text>
                  <Text
                    style={[
                      styles.date,
                      { color: isDark ? colors.textMuted : "#999" },
                    ]}
                  >
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={() => toggleNotificationRead(item)}
                  style={[
                    styles.readToggleBtn,
                    { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                  ]}
                >
                  <Text
                    style={[
                      styles.readToggleText,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    {item.read ? "Mark unread" : "Mark read"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDelete(item.id)}
                  style={styles.deleteBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={isDark ? colors.textMuted : "#999"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="notifications-off-outline"
                size={50}
                color={isDark ? colors.textMuted : "#ccc"}
              />
              <Text
                style={[
                  styles.emptyText,
                  { color: isDark ? colors.textMuted : "#999" },
                ]}
              >
                No notifications yet
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9f9f9" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  title: { fontSize: 24, fontWeight: "bold" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bulkActionBtn: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bulkActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  bulkActionBtnDisabled: {
    opacity: 0.45,
  },
  bulkActionTextDisabled: {
    color: "#9ca3af",
  },

  card: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eee",
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: "#eff6ff", // Light blue tint for unread
    borderColor: "#bfdbfe",
  },
  cardPressArea: { flex: 1 },
  cardContent: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  typeLabel: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginRight: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "blue" },
  message: { fontSize: 14, color: "#333", marginBottom: 8, lineHeight: 20 },
  date: { fontSize: 12, color: "#999" },

  cardActions: {
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginLeft: 10,
  },
  readToggleBtn: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  readToggleText: {
    fontSize: 11,
    fontWeight: "600",
  },

  deleteBtn: { justifyContent: "center", paddingLeft: 10 },

  emptyContainer: { alignItems: "center", marginTop: 100 },
  emptyText: { color: "#999", marginTop: 10, fontSize: 16 },
});
