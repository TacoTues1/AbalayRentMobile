import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = 220;
const LABEL_WIDTH = 110;

export default function Compare() {
  const router = useRouter();
  const { ids } = useLocalSearchParams();
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids) {
      const idArray = typeof ids === "string" ? ids.split(",") : ids;
      fetchProperties(idArray);
    } else {
      setLoading(false);
      setProperties([]);
    }
  }, [ids]);

  async function fetchProperties(idArray: string[]) {
    setLoading(true);
    const { data } = await supabase
      .from("properties")
      .select("*")
      .in("id", idArray);
    if (data) setProperties(data);
    setLoading(false);
  }

  const removeProperty = (id: string) => {
    const updated = properties.filter((p) => p.id !== id);
    setProperties(updated);

    // Update URL params to reflect removal
    const newIds = updated.map((p) => p.id).join(",");
    router.setParams({ ids: newIds });
  };

  const clearComparison = () => {
    setProperties([]);
    router.setParams({ ids: "" });
    router.back();
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="black" />
        <Text style={{ marginTop: 10, color: "gray" }}>
          Loading comparison...
        </Text>
      </View>
    );

  if (properties.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={20} color="black" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Compare</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <View style={styles.iconCircle}>
            <Ionicons name="git-compare-outline" size={32} color="#ccc" />
          </View>
          <Text style={styles.emptyTitle}>No properties selected</Text>
          <Text style={styles.emptySub}>
            Go back and select properties to compare.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.browseBtn}
          >
            <Text style={styles.browseText}>Browse Properties</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderLabelCell = (
    text: string,
    icon: any,
    height?: number,
    isHeader = false,
  ) => (
    <View
      style={[
        styles.cell,
        styles.labelCell,
        height ? { height } : {},
        isHeader ? styles.headerLabelCell : {},
      ]}
    >
      <View style={styles.labelIconWrapper}>
        <Ionicons name={icon} size={16} color="#9ca3af" />
      </View>
      <Text style={styles.labelText}>{text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color="black" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View>
          <Text style={styles.headerTitle}>Compare</Text>
          <Text style={styles.headerSub}>{properties.length} Selected</Text>
        </View>

        <TouchableOpacity onPress={clearComparison}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.verticalScroll}
        contentContainerStyle={{ paddingBottom: 50 }}
      >
        <View style={styles.tableContainer}>
          {/* --- LEFT COLUMN (LABELS) --- */}
          <View style={styles.leftColumn}>
            {/* Header Spacer (matches Image height) */}
            <View
              style={[
                styles.cell,
                styles.labelCell,
                { height: 240, justifyContent: "flex-end", paddingBottom: 15 },
              ]}
            >
              <Text style={styles.specsTitle}>PROPERTY SPECS</Text>
            </View>

            {renderLabelCell("Location", "location-outline")}
            {renderLabelCell("Type", "business-outline")}
            {renderLabelCell("Bedrooms", "bed-outline")}
            {renderLabelCell("Bathrooms", "water-outline")}
            {renderLabelCell("Floor Area", "resize-outline")}
            {renderLabelCell("Amenities", "list-outline", 150)}
            {/* Action Spacer */}
            <View style={[styles.cell, styles.labelCell, { height: 80 }]} />
          </View>

          {/* --- RIGHT COLUMNS (DATA) --- */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {properties.map((p, index) => (
              <View key={p.id} style={styles.dataColumn}>
                {/* 1. Header (Image + Price) */}
                <View
                  style={[
                    styles.cell,
                    {
                      height: 240,
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                    },
                  ]}
                >
                  <View style={styles.imageContainer}>
                    <Image
                      source={{
                        uri: p.images?.[0] || "https://via.placeholder.com/400",
                      }}
                      style={styles.image}
                    />
                    {/* Remove Button */}
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeProperty(p.id)}
                    >
                      <Ionicons name="close" size={16} color="#ef4444" />
                    </TouchableOpacity>
                    {/* Status Badge */}
                    <View
                      style={[
                        styles.badge,
                        p.status === "available"
                          ? styles.bgBlack
                          : styles.bgWhite,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          p.status === "available"
                            ? styles.textWhite
                            : styles.textBlack,
                        ]}
                      >
                        {p.status || "Available"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push(`/properties/${p.id}` as any)}
                  >
                    <Text style={styles.propTitle} numberOfLines={2}>
                      {p.title}
                    </Text>
                  </TouchableOpacity>
                  <View
                    style={{ flexDirection: "row", alignItems: "baseline" }}
                  >
                    <Text style={styles.price}>
                      ₱{p.price?.toLocaleString()}
                    </Text>
                    <Text style={styles.priceSub}>/mo</Text>
                  </View>
                </View>

                {/* 2. Location */}
                <View style={styles.cell}>
                  <Text style={styles.dataText} numberOfLines={3}>
                    {[
                      p.address,
                      [p.city, p.state_province].filter(Boolean).join(", "),
                    ]
                      .filter(Boolean)
                      .join(", ") || "Location not set"}
                  </Text>
                </View>

                {/* 3. Type */}
                <View style={styles.cell}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{p.type || "Apartment"}</Text>
                  </View>
                </View>

                {/* 4. Bedrooms */}
                <View style={styles.cell}>
                  <Text style={styles.dataTextBold}>
                    {p.bedrooms} <Text style={styles.unit}>Beds</Text>
                  </Text>
                </View>

                {/* 5. Bathrooms */}
                <View style={styles.cell}>
                  <Text style={styles.dataTextBold}>
                    {p.bathrooms} <Text style={styles.unit}>Baths</Text>
                  </Text>
                </View>

                {/* 6. Floor Area */}
                <View style={styles.cell}>
                  <Text style={styles.dataTextBold}>
                    {p.area_sqft || "N/A"} <Text style={styles.unit}>sqft</Text>
                  </Text>
                </View>

                {/* 7. Amenities */}
                <View
                  style={[
                    styles.cell,
                    { height: 150, justifyContent: "flex-start" },
                  ]}
                >
                  {p.amenities && p.amenities.length > 0 ? (
                    <View style={styles.amenityContainer}>
                      {p.amenities.slice(0, 5).map((a: string, i: number) => (
                        <View key={i} style={styles.amenityTag}>
                          <Text style={styles.amenityText}>{a}</Text>
                        </View>
                      ))}
                      {p.amenities.length > 5 && (
                        <Text style={styles.moreText}>
                          +{p.amenities.length - 5} more
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.noData}>No amenities</Text>
                  )}
                </View>

                {/* 8. Action */}
                <View style={[styles.cell, { height: 80 }]}>
                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() => router.push(`/properties/${p.id}` as any)}
                  >
                    <Text style={styles.viewBtnText}>View Details</Text>
                    <Ionicons name="arrow-forward" size={14} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  backText: { fontSize: 14, fontWeight: "600" },
  headerTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  headerSub: {
    fontSize: 10,
    color: "#666",
    textAlign: "center",
    fontWeight: "600",
  },
  clearText: { color: "#ef4444", fontWeight: "bold", fontSize: 14 },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 30,
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#111",
  },
  emptySub: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 20,
  },
  browseBtn: {
    backgroundColor: "black",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  browseText: { color: "white", fontWeight: "bold", fontSize: 16 },

  // Table Layout
  verticalScroll: { flex: 1 },
  tableContainer: { flexDirection: "row", paddingTop: 10 },

  // Left Column
  leftColumn: {
    width: LABEL_WIDTH,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6",
    zIndex: 10,
  },

  // Cells
  cell: {
    height: 70,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  labelCell: {
    backgroundColor: "rgba(249, 250, 251, 0.9)",
    borderRightWidth: 1,
    borderRightColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerLabelCell: { backgroundColor: "#fff", borderRightWidth: 0 }, // Transparent for image area

  labelIconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  labelText: { fontSize: 11, fontWeight: "700", color: "#4b5563" },
  specsTitle: {
    fontSize: 10,
    fontWeight: "900",
    color: "#9ca3af",
    letterSpacing: 1,
  },

  // Data Columns
  dataColumn: {
    width: COLUMN_WIDTH,
    borderRightWidth: 1,
    borderRightColor: "#f9fafb",
  },

  // Image & Header
  imageContainer: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    position: "relative",
    backgroundColor: "#f3f4f6",
  },
  image: { width: "100%", height: "100%" },
  removeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bgBlack: { backgroundColor: "rgba(0,0,0,0.8)" },
  bgWhite: { backgroundColor: "rgba(255,255,255,0.9)" },
  badgeText: { fontSize: 8, fontWeight: "bold", textTransform: "uppercase" },
  textWhite: { color: "white" },
  textBlack: { color: "black" },

  propTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#111",
    marginBottom: 4,
    lineHeight: 20,
  },
  price: { fontSize: 18, fontWeight: "900", color: "#111" },
  priceSub: { fontSize: 12, fontWeight: "500", color: "#666", marginLeft: 2 },

  // Data Texts
  dataText: { fontSize: 13, color: "#374151", lineHeight: 18 },
  dataTextBold: { fontSize: 14, fontWeight: "700", color: "#111" },
  unit: { fontSize: 12, fontWeight: "400", color: "#666" },
  pill: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  pillText: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "capitalize",
  },
  noData: { fontSize: 12, color: "#ccc", fontStyle: "italic" },

  // Amenities
  amenityContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 10,
  },
  amenityTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  amenityText: { fontSize: 10, color: "#4b5563", fontWeight: "600" },
  moreText: { fontSize: 10, color: "#9ca3af", marginTop: 4 },

  // Action
  viewBtn: {
    width: "100%",
    backgroundColor: "black",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  viewBtnText: { color: "white", fontWeight: "bold", fontSize: 12 },
});
