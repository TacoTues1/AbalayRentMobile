import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

type PropertyPreview = {
  id: string;
  title: string;
  city?: string | null;
};

type LandlordCard = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  properties: PropertyPreview[];
  propertyCount: number;
  cityPreview: string;
  ratingAverage: number;
  ratingCount: number;
};

export default function LandlordsSearchScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [landlords, setLandlords] = useState<LandlordCard[]>([]);

  const loadLandlords = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data: landlordRows, error: landlordsError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, business_name, avatar_url, phone")
        .eq("role", "landlord")
        .order("first_name", { ascending: true });

      if (landlordsError) throw landlordsError;

      const landlordIds = (landlordRows || []).map((l: any) => l.id);
      let properties: any[] = [];
      let landlordRatings: any[] = [];

      if (landlordIds.length > 0) {
        const { data: propertyRows, error: propertiesError } = await supabase
          .from("properties")
          .select("id, title, city, landlord, status, is_deleted")
          .in("landlord", landlordIds)
          .eq("status", "available")
          .neq("is_deleted", true);

        if (propertiesError) throw propertiesError;
        properties = propertyRows || [];

        const { data: ratingRows, error: ratingsError } = await supabase
          .from("landlord_ratings")
          .select("landlord_id, rating")
          .in("landlord_id", landlordIds);

        if (ratingsError) {
          console.warn("landlord_ratings fetch warning:", ratingsError.message);
          landlordRatings = [];
        } else {
          landlordRatings = ratingRows || [];
        }
      }

      const propertyMap = new Map<string, PropertyPreview[]>();
      for (const property of properties) {
        const list = propertyMap.get(property.landlord) || [];
        list.push({
          id: property.id,
          title: property.title,
          city: property.city,
        });
        propertyMap.set(property.landlord, list);
      }

      const ratingsMap = new Map<string, { sum: number; count: number }>();
      for (const row of landlordRatings) {
        const current = ratingsMap.get(row.landlord_id) || { sum: 0, count: 0 };
        ratingsMap.set(row.landlord_id, {
          sum: current.sum + Number(row.rating || 0),
          count: current.count + 1,
        });
      }

      const normalized = (landlordRows || []).map((landlord: any) => {
        const landlordProperties = propertyMap.get(landlord.id) || [];
        const ratingAgg = ratingsMap.get(landlord.id);
        const ratingCount = ratingAgg?.count || 0;
        const ratingAverage =
          ratingCount > 0 ? ratingAgg!.sum / ratingCount : 0;
        const cityPreview = Array.from(
          new Set(
            landlordProperties
              .map((p) => p.city)
              .filter((city) => typeof city === "string" && city.length > 0),
          ),
        )
          .slice(0, 2)
          .join(", ");

        return {
          ...landlord,
          properties: landlordProperties,
          propertyCount: landlordProperties.length,
          cityPreview,
          ratingAverage,
          ratingCount,
        } as LandlordCard;
      });

      setLandlords(normalized);
    } catch (error) {
      console.error("loadLandlords error:", error);
      setLandlords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLandlords();
  }, []);

  const filteredLandlords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return landlords;

    return landlords.filter((landlord) => {
      const fullName =
        `${landlord.first_name || ""} ${landlord.last_name || ""}`.trim();
      const searchableProperties = landlord.properties
        .map((property) => `${property.title || ""} ${property.city || ""}`)
        .join(" ");

      const text = [
        fullName,
        landlord.business_name || "",
        landlord.cityPreview || "",
        searchableProperties,
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });
  }, [landlords, search]);

  if (loading) {
    return (
      <SafeAreaView
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? colors.text : "#111"} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons
            name="arrow-back"
            size={22}
            color={isDark ? colors.text : "#111"}
          />
        </TouchableOpacity>
        <Text
          style={[
            styles.title,
            { color: isDark ? colors.text : "#111", marginTop: 40 },
          ]}
        >
          Search Landlords
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: isDark ? colors.card : "#fff",
            borderColor: isDark ? colors.border : "#e5e7eb",
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={isDark ? colors.textMuted : "#6b7280"}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, business, city, or property"
          placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
          style={[styles.searchInput, { color: isDark ? colors.text : "#111" }]}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadLandlords(true)}
          />
        }
      >
        {filteredLandlords.length === 0 ? (
          <View
            style={[
              styles.emptyBox,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.border : "#e5e7eb",
              },
            ]}
          >
            <Text style={{ color: isDark ? colors.textMuted : "#6b7280" }}>
              No landlords found.
            </Text>
          </View>
        ) : (
          filteredLandlords.map((landlord) => {
            const fullName =
              `${landlord.first_name || ""} ${landlord.last_name || ""}`.trim() ||
              "Landlord";

            return (
              <TouchableOpacity
                key={landlord.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? colors.card : "#fff",
                    borderColor: isDark ? colors.border : "#e5e7eb",
                  },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/landlord/[id]",
                    params: { id: landlord.id },
                  } as any)
                }
              >
                <View style={styles.cardTopRow}>
                  {landlord.avatar_url ? (
                    <Image
                      source={{ uri: landlord.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.avatarFallback,
                        { backgroundColor: isDark ? colors.badge : "#f3f4f6" },
                      ]}
                    >
                      <Text
                        style={{
                          color: isDark ? colors.text : "#111",
                          fontWeight: "700",
                        }}
                      >
                        {fullName[0]?.toUpperCase() || "L"}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.cardName,
                        { color: isDark ? colors.text : "#111" },
                      ]}
                    >
                      {fullName}
                    </Text>
                    {!!landlord.business_name && (
                      <Text
                        style={[
                          styles.cardSub,
                          { color: isDark ? colors.textMuted : "#6b7280" },
                        ]}
                      >
                        {landlord.business_name}
                      </Text>
                    )}
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={isDark ? colors.textMuted : "#9ca3af"}
                  />
                </View>

                <View style={styles.metaRow}>
                  <Ionicons
                    name="home-outline"
                    size={14}
                    color={isDark ? colors.textMuted : "#6b7280"}
                  />
                  <Text
                    style={[
                      styles.metaText,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    {landlord.propertyCount} available propert
                    {landlord.propertyCount === 1 ? "y" : "ies"}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Ionicons name="star" size={14} color="#eab308" />
                  <Text
                    style={[
                      styles.metaText,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    {landlord.ratingCount > 0
                      ? `${landlord.ratingAverage.toFixed(1)} rating for ${landlord.ratingCount} response${landlord.ratingCount === 1 ? "" : "s"}`
                      : "No Review"}
                  </Text>
                </View>

                {!!landlord.cityPreview && (
                  <View style={styles.metaRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={isDark ? colors.textMuted : "#6b7280"}
                    />
                    <Text
                      style={[
                        styles.metaText,
                        { color: isDark ? colors.textMuted : "#6b7280" },
                      ]}
                    >
                      {landlord.cityPreview}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
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
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
});
