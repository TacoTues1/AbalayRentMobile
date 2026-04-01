import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export default function ActivePropertiesPage() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [occupancies, setOccupancies] = useState<any[]>([]);

  const loadActiveProperties = async (userId: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tenant_occupancies")
        .select(
          "id, property_id, tenant_id, status, start_date, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name), property:properties(id, title, address, images, price)",
        )
        .eq("landlord_id", userId)
        .eq("status", "active")
        .order("start_date", { ascending: false });

      if (error) throw error;
      setOccupancies(data || []);
    } catch (err) {
      console.error("Failed to load active properties:", err);
      setOccupancies([]);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const init = async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();

    if (!s) {
      router.replace("/");
      return;
    }

    setSession(s);
    await loadActiveProperties(s.user.id);
  };

  useEffect(() => {
    init();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id && !loading) {
        loadActiveProperties(session.user.id, true);
      }
    }, [session, loading]),
  );

  const onRefresh = () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    loadActiveProperties(session.user.id, true);
  };

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? colors.text : "#111"} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
      edges={["top"]}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[
            styles.backBtn,
            { backgroundColor: isDark ? colors.surface : "#f3f4f6" },
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={20}
            color={isDark ? colors.text : "#111"}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? colors.text : "#111" }]}>
          Active Properties
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {occupancies.length === 0 ? (
          <View
            style={[
              styles.emptyBox,
              {
                backgroundColor: isDark ? colors.card : "white",
                borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              },
            ]}
          >
            <Ionicons
              name="home-outline"
              size={28}
              color={isDark ? colors.textMuted : "#9ca3af"}
            />
            <Text
              style={{
                marginTop: 8,
                color: isDark ? colors.textMuted : "#6b7280",
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              No active properties found.
            </Text>
          </View>
        ) : (
          occupancies.map((occ) => {
            const imageUrl =
              occ.property?.images?.[0] || "https://via.placeholder.com/400";
            return (
              <View
                key={occ.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  },
                ]}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.cardImage}
                  resizeMode="cover"
                />

                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                  numberOfLines={1}
                >
                  {occ.property?.title || "Untitled Property"}
                </Text>

                <View style={styles.metaRow}>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={isDark ? colors.textMuted : "#6b7280"}
                  />
                  <Text
                    style={[
                      styles.metaText,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                    numberOfLines={1}
                  >
                    {occ.property?.address || "No address"}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Ionicons
                    name="person-outline"
                    size={12}
                    color={isDark ? colors.textMuted : "#6b7280"}
                  />
                  <Text
                    style={[
                      styles.metaText,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    {occ.tenant?.first_name} {occ.tenant?.last_name}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.detailsBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/rented-tenant/[id]",
                      params: { id: String(occ.id) },
                    } as any)
                  }
                >
                  <Text style={styles.detailsBtnText}>Show Details</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800" },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  cardImage: {
    width: "100%",
    height: 140,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#e5e7eb",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  metaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
  },
  detailsBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  detailsBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
  },
});
