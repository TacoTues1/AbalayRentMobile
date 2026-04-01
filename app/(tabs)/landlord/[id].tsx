import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

type LandlordProfile = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  email?: string | null;
};

type PropertyRow = {
  id: string;
  title: string;
  city?: string | null;
  address?: string | null;
  price?: number | null;
  images?: any;
};

function extractFirstImage(images: any): string | null {
  if (!images) return null;
  if (Array.isArray(images) && images.length > 0) {
    return typeof images[0] === "string" ? images[0] : null;
  }
  return null;
}

export default function LandlordDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const landlordId = Array.isArray(id) ? id[0] : id;

  const { isDark, colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [landlord, setLandlord] = useState<LandlordProfile | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [landlordRatingAverage, setLandlordRatingAverage] = useState(0);
  const [landlordRatingCount, setLandlordRatingCount] = useState(0);

  const loadData = async () => {
    if (!landlordId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, first_name, last_name, business_name, avatar_url, phone, email",
        )
        .eq("id", landlordId)
        .single();

      if (profileError) throw profileError;

      const { data: propertyRows, error: propertyError } = await supabase
        .from("properties")
        .select("id, title, city, address, price, images, status, is_deleted")
        .eq("landlord", landlordId)
        .eq("status", "available")
        .neq("is_deleted", true)
        .order("created_at", { ascending: false });

      if (propertyError) throw propertyError;

      const { data: ratingRows, error: ratingsError } = await supabase
        .from("landlord_ratings")
        .select("rating")
        .eq("landlord_id", landlordId);

      if (ratingsError) {
        console.warn("landlord_ratings fetch warning:", ratingsError.message);
        setLandlordRatingCount(0);
        setLandlordRatingAverage(0);
      } else {
        const count = (ratingRows || []).length;
        const sum = (ratingRows || []).reduce(
          (acc: number, row: any) => acc + Number(row.rating || 0),
          0,
        );

        setLandlordRatingCount(count);
        setLandlordRatingAverage(count > 0 ? sum / count : 0);
      }

      setLandlord(profileData || null);
      setProperties(propertyRows || []);
    } catch (error) {
      console.error("load landlord details error:", error);
      setLandlord(null);
      setProperties([]);
      setLandlordRatingCount(0);
      setLandlordRatingAverage(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [landlordId]);

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

  if (!landlord) {
    return (
      <SafeAreaView
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <Text style={{ color: isDark ? colors.text : "#111" }}>
          Landlord details not found.
        </Text>
      </SafeAreaView>
    );
  }

  const fullName =
    `${landlord.first_name || ""} ${landlord.last_name || ""}`.trim() ||
    "Landlord";

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
          Landlord Details
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: isDark ? colors.card : "#fff",
              borderColor: isDark ? colors.border : "#e5e7eb",
            },
          ]}
        >
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

          <Text
            style={[styles.fullName, { color: isDark ? colors.text : "#111" }]}
          >
            {fullName}
          </Text>

          {!!landlord.business_name && (
            <Text
              style={[
                styles.business,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              {landlord.business_name}
            </Text>
          )}

          <View style={styles.metaRow}>
            <Ionicons name="star" size={14} color="#eab308" />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              {landlordRatingCount > 0
                ? `${landlordRatingAverage.toFixed(1)} rating for ${landlordRatingCount} response${landlordRatingCount === 1 ? "" : "s"}`
                : "No Review"}
            </Text>
          </View>

          {!!landlord.phone && (
            <View style={styles.metaRow}>
              <Ionicons
                name="call-outline"
                size={14}
                color={isDark ? colors.textMuted : "#6b7280"}
              />
              <Text
                style={[
                  styles.metaText,
                  { color: isDark ? colors.textMuted : "#6b7280" },
                ]}
              >
                {landlord.phone}
              </Text>
            </View>
          )}

          {!!landlord.email && (
            <View style={styles.metaRow}>
              <Ionicons
                name="mail-outline"
                size={14}
                color={isDark ? colors.textMuted : "#6b7280"}
              />
              <Text
                style={[
                  styles.metaText,
                  { color: isDark ? colors.textMuted : "#6b7280" },
                ]}
              >
                {landlord.email}
              </Text>
            </View>
          )}

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
              {properties.length} available propert
              {properties.length === 1 ? "y" : "ies"}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.sectionTitle,
            { color: isDark ? colors.text : "#111" },
          ]}
        >
          Available Properties
        </Text>

        {properties.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: isDark ? colors.card : "#fff",
                borderColor: isDark ? colors.border : "#e5e7eb",
              },
            ]}
          >
            <Text style={{ color: isDark ? colors.textMuted : "#6b7280" }}>
              No available properties right now.
            </Text>
          </View>
        ) : (
          properties.map((property) => {
            const imageUri = extractFirstImage(property.images);

            return (
              <View
                key={property.id}
                style={[
                  styles.propertyCard,
                  {
                    backgroundColor: isDark ? colors.card : "#fff",
                    borderColor: isDark ? colors.border : "#e5e7eb",
                  },
                ]}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.propertyImage}
                  />
                ) : (
                  <View
                    style={[
                      styles.placeholderImage,
                      { backgroundColor: isDark ? colors.badge : "#f3f4f6" },
                    ]}
                  >
                    <Ionicons
                      name="image-outline"
                      size={24}
                      color={isDark ? colors.textMuted : "#9ca3af"}
                    />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.propertyTitle,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    {property.title}
                  </Text>

                  <View style={styles.metaRow}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={isDark ? colors.textMuted : "#6b7280"}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.metaText,
                        { color: isDark ? colors.textMuted : "#6b7280" },
                      ]}
                    >
                      {[property.address, property.city]
                        .filter(Boolean)
                        .join(", ") || "Address unavailable"}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.price,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    {typeof property.price === "number"
                      ? `P${property.price.toLocaleString()}/mo`
                      : "Price unavailable"}
                  </Text>

                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() =>
                      router.push(`/properties/${property.id}` as any)
                    }
                  >
                    <Text style={styles.viewBtnText}>View Property</Text>
                  </TouchableOpacity>
                </View>
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
  profileCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  fullName: {
    fontSize: 18,
    fontWeight: "700",
  },
  business: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  propertyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    gap: 10,
  },
  propertyImage: {
    width: 86,
    height: 86,
    borderRadius: 10,
  },
  placeholderImage: {
    width: 86,
    height: 86,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  price: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
  },
  viewBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#111",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  viewBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  metaRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    flexShrink: 1,
  },
});
