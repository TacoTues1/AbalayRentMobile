import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const { width } = Dimensions.get("window");

export default function LandlordProperties() {
  const router = useRouter();

  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [occupancyEndDates, setOccupancyEndDates] = useState<
    Record<string, string | null>
  >({});
  const { isDark, colors } = useTheme();

  // Property Slot System
  const [slotPlan, setSlotPlan] = useState<any>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchasingSlot, setPurchasingSlot] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const parseDateOnly = (value?: string | null) => {
    if (!value) return null;
    const datePart = String(value).slice(0, 10);
    const parsed = new Date(`${datePart}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getAvailabilityLabel = (endDateValue?: string | null) => {
    const parsed = parseDateOnly(endDateValue);
    if (!parsed) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);

    const diffMs = parsed.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return null;

    const dayLabel = diffDays === 1 ? "day" : "days";
    return `Will be available in ${diffDays} ${dayLabel}`;
  };

  const checkAuthAndLoad = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return router.replace("/");
    setSession(session);
    loadProperties(session.user.id);
    loadSlotPlan(session.user.id);
  };

  const loadProperties = async (userId: string) => {
    setLoading(true);
    try {
      const { data: props, error } = await supabase
        .from("properties")
        .select("*")
        .eq("landlord", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const propertyIds = (props || [])
        .map((prop: any) => prop.id)
        .filter(Boolean);
      if (propertyIds.length > 0) {
        const { data: occupancies, error: occError } = await supabase
          .from("tenant_occupancies")
          .select(
            "property_id, status, end_request_date, end_date, end_request_status",
          )
          .in("property_id", propertyIds)
          .in("status", ["active", "pending_end"]);

        if (occError) {
          console.warn("Error loading occupancy end dates:", occError.message);
          setOccupancyEndDates({});
        } else {
          const endDateMap: Record<string, string | null> = {};
          (occupancies || []).forEach((occ: any) => {
            const endStatus = String(
              occ?.end_request_status || "",
            ).toLowerCase();
            if (endStatus && !["pending", "approved"].includes(endStatus)) {
              return;
            }

            const endDateValue = occ?.end_request_date || occ?.end_date || null;
            if (!endDateValue) return;

            const key = String(occ.property_id || "");
            if (!key) return;

            const existing = endDateMap[key];
            if (!existing) {
              endDateMap[key] = endDateValue;
              return;
            }

            const existingDate = parseDateOnly(existing);
            const nextDate = parseDateOnly(endDateValue);
            if (existingDate && nextDate && nextDate < existingDate) {
              endDateMap[key] = endDateValue;
            }
          });
          setOccupancyEndDates(endDateMap);
        }
      } else {
        setOccupancyEndDates({});
      }

      setProperties(props || []);
    } catch (err: any) {
      console.error("Error loading properties:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSlotPlan = async (userId: string) => {
    try {
      const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
      if (!API_URL) {
        // Fallback: query Supabase directly
        const { data: subscription } = await supabase
          .from("landlord_subscriptions")
          .select("*")
          .eq("landlord_id", userId)
          .maybeSingle();

        const { count: propertyCount } = await supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("landlord", userId)
          .eq("is_deleted", false);

        const totalSlots = subscription?.total_slots || 3;
        const usedSlots = propertyCount || 0;

        setSlotPlan({
          type: subscription?.plan_type || "free",
          total_slots: totalSlots,
          paid_slots: subscription?.paid_slots || 0,
          used_slots: usedSlots,
          available_slots: totalSlots - usedSlots,
          slot_price: 50,
          max_slots: 10,
        });
        return;
      }

      const cleanUrl = API_URL.replace(/\/+$/, "");
      const res = await fetch(
        `${cleanUrl}/api/payments/landlord-subscriptions?landlord_id=${userId}`,
      );
      const data = await res.json();
      if (data.plan) setSlotPlan(data.plan);
    } catch (err) {
      console.error("Error loading slot plan:", err);
    }
  };

  const handlePurchaseSlot = async () => {
    if (!session?.user?.id) return;
    setPurchasingSlot(true);
    try {
      const landlordName = session.user.user_metadata?.full_name || "Landlord";
      const paymongoReturnUrl = Linking.createURL("landlordproperties");
      const successRedirectUrl = Linking.createURL("landlordproperties", {
        queryParams: { paymongo_status: "success" },
      });
      const cancelRedirectUrl = Linking.createURL("landlordproperties", {
        queryParams: { paymongo_status: "cancel" },
      });

      // Call the edge function which wraps your Expo deep links properly
      const { data, error } = await supabase.functions.invoke(
        "paymongo-landlord-slot-create",
        {
          body: {
            landlord_id: session.user.id,
            ownerName: landlordName,
            successUrl: successRedirectUrl,
            cancelUrl: cancelRedirectUrl,
          },
        },
      );

      if (error || !data?.checkoutUrl) {
        throw new Error(
          error?.message || data?.error || "Failed to start checkout.",
        );
      }

      setShowPurchaseModal(false);

      // Use openAuthSessionAsync so it automatically closes when PayMongo redirects to the deep link
      await WebBrowser.openAuthSessionAsync(
        data.checkoutUrl,
        paymongoReturnUrl,
      );

      // Browser automatically closed — now synchronously verify payment
      setPurchasingSlot(false);
      setIsVerifyingPayment(true);

      const { data: verifyData, error: verifyError } =
        await supabase.functions.invoke("paymongo-landlord-slot-verify", {
          body: {
            checkoutSessionId: data.checkoutSessionId,
            landlord_id: session.user.id,
          },
        });

      if (verifyError) {
        throw new Error(verifyError.message || "Verification failed");
      }

      if (verifyData?.paid) {
        loadSlotPlan(session.user.id);
        loadProperties(session.user.id);
        Alert.alert("Success", "Property slot purchased successfully!");
      } else {
        Alert.alert(
          "Verification Pending",
          "We haven't received confirmation from PayMongo yet. If you completed the payment, your slots will update shortly. Pull down to refresh.",
        );
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Something went wrong.");
    } finally {
      setPurchasingSlot(false);
      setIsVerifyingPayment(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (session?.user?.id) {
      loadProperties(session.user.id);
      loadSlotPlan(session.user.id);
    }
  };

  const getFilteredProperties = () => {
    let filtered = properties;

    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.address || "").toLowerCase().includes(q) ||
          (p.city || "").toLowerCase().includes(q) ||
          (p.state_province || "").toLowerCase().includes(q),
      );
    }

    return filtered;
  };

  const filteredData = getFilteredProperties();

  const totalCount = properties.length;
  const availableCount = properties.filter(
    (p) => p.status === "available",
  ).length;
  const occupiedCount = properties.filter(
    (p) => p.status === "occupied",
  ).length;

  const STATUS_FILTERS = ["all", "available", "occupied"];

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "available":
        return { bg: "#ecfdf5", color: "#059669", label: "Available" };
      case "occupied":
        return { bg: "#fef2f2", color: "#ef4444", label: "Occupied" };
      default:
        return {
          bg: "#f3f4f6",
          color: "#6b7280",
          label: status?.toUpperCase() || "Unknown",
        };
    }
  };

  const renderCard = (item: any) => {
    const statusInfo = getStatusStyle(item.status);
    const availabilityLabel =
      item.status === "occupied"
        ? getAvailabilityLabel(occupancyEndDates[String(item.id)])
        : null;
    const statusLabel = availabilityLabel || statusInfo.label;

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderColor: isDark ? colors.cardBorder : "#f3f4f6",
          },
        ]}
        onPress={() => router.push(`/properties/${item.id}` as any)}
        activeOpacity={0.9}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{
              uri: item.images?.[0] || "https://via.placeholder.com/400",
            }}
            style={styles.cardImage}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.gradient}
          />

          {/* Status Badge */}
          <View style={styles.badgeContainer}>
            <View style={[styles.badge, { backgroundColor: statusInfo.bg }]}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: statusInfo.color,
                  marginRight: 4,
                }}
              />
              <Text style={[styles.badgeText, { color: statusInfo.color }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          {/* Price Overlay */}
          <View style={styles.priceOverlay}>
            <Text style={styles.priceText}>
              ₱{(item.price || 0).toLocaleString()}
            </Text>
            <Text style={styles.periodText}>/mo</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <Text
            style={[styles.cardTitle, { color: isDark ? colors.text : "#111" }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <Ionicons
              name="location-outline"
              size={12}
              color={isDark ? colors.textMuted : "#9ca3af"}
            />
            <Text
              style={[
                styles.cardAddress,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
              numberOfLines={1}
            >
              {[
                item.address,
                [item.city, item.state_province].filter(Boolean).join(", "),
              ]
                .filter(Boolean)
                .join(", ") || "Location not set"}
            </Text>
          </View>

          <View
            style={[
              styles.metaBox,
              { borderTopColor: isDark ? colors.border : "#f3f4f6" },
            ]}
          >
            <Ionicons
              name="bed-outline"
              size={14}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textSecondary : "#666" },
              ]}
            >
              {item.bedrooms} Beds
            </Text>
            <Text style={{ color: isDark ? colors.border : "#ddd" }}>|</Text>
            <Ionicons
              name="water-outline"
              size={14}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textSecondary : "#666" },
              ]}
            >
              {item.bathrooms} Bath
            </Text>
            <Text style={{ color: isDark ? colors.border : "#ddd" }}>|</Text>
            <Ionicons
              name="resize-outline"
              size={14}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textSecondary : "#666" },
              ]}
            >
              {item.area_sqft} sqm
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderColor: isDark ? colors.border : "#e5e7eb",
                },
              ]}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/properties/${item.id}` as any);
              }}
            >
              <Ionicons
                name="eye-outline"
                size={14}
                color={isDark ? colors.text : "#111"}
              />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                View
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderColor: isDark ? colors.border : "#e5e7eb",
                },
              ]}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/(tabs)/properties/edit/${item.id}` as any);
              }}
            >
              <Ionicons
                name="create-outline"
                size={14}
                color={isDark ? colors.text : "#111"}
              />
              <Text
                style={[
                  styles.actionBtnText,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Edit
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
        edges={["top"]}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={isDark ? "white" : "#111"}
            style={{ marginTop: 50 }}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {/* Header */}
            <View
              style={[
                styles.header,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderBottomColor: isDark ? colors.border : "#f3f4f6",
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => router.back()}
                style={[
                  styles.backBtn,
                  { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                ]}
              >
                <Ionicons
                  name="arrow-back"
                  size={22}
                  color={isDark ? colors.text : "#111"}
                />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.headerTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  My Properties
                </Text>
                <Text
                  style={[
                    styles.headerSub,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  {totalCount} total properties
                </Text>
              </View>
            </View>

            {/* Stats Row */}
            <View
              style={[
                styles.statsRow,
                { backgroundColor: isDark ? colors.surface : "white" },
              ]}
            >
              <View
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? colors.card : "#fafafa",
                    borderColor: isDark ? colors.cardBorder : "#ecfdf5",
                  },
                ]}
              >
                <Text style={[styles.statNum, { color: "#059669" }]}>
                  {availableCount}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  Available
                </Text>
              </View>
              <View
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? colors.card : "#fafafa",
                    borderColor: isDark ? colors.cardBorder : "#fef2f2",
                  },
                ]}
              >
                <Text style={[styles.statNum, { color: "#ef4444" }]}>
                  {occupiedCount}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  Occupied
                </Text>
              </View>
              <View
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? colors.card : "#fafafa",
                    borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statNum,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {totalCount}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  Total
                </Text>
              </View>
            </View>

            {/* Slot Usage Badge */}
            {slotPlan && (
              <View
                style={[
                  styles.statsRow,
                  {
                    backgroundColor: isDark ? colors.surface : "white",
                    paddingTop: 0,
                  },
                ]}
              >
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: isDark ? colors.card : "#eff6ff",
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1.5,
                    borderColor: isDark ? colors.cardBorder : "#dbeafe",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: isDark ? colors.text : "#1e40af",
                      }}
                    >
                      {slotPlan.used_slots}/{slotPlan.total_slots} Property
                      Slots Used
                    </Text>
                    {slotPlan.paid_slots > 0 && (
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "600",
                          color: isDark ? colors.textMuted : "#60a5fa",
                          marginTop: 2,
                        }}
                      >
                        {slotPlan.paid_slots} purchased · Max{" "}
                        {slotPlan.max_slots}
                      </Text>
                    )}
                  </View>
                  {slotPlan.used_slots >= slotPlan.total_slots &&
                    slotPlan.total_slots < slotPlan.max_slots && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: "#2563eb",
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 10,
                        }}
                        onPress={() => setShowPurchaseModal(true)}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "800",
                            color: "white",
                          }}
                        >
                          Buy Slot ₱{slotPlan.slot_price}
                        </Text>
                      </TouchableOpacity>
                    )}
                  {slotPlan.total_slots >= slotPlan.max_slots &&
                    slotPlan.used_slots >= slotPlan.max_slots && (
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: isDark ? colors.textMuted : "#9ca3af",
                        }}
                      >
                        Max reached
                      </Text>
                    )}
                </View>
              </View>
            )}

            {/* Search */}
            <View style={styles.searchContainer}>
              <View
                style={[
                  styles.searchBar,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  },
                ]}
              >
                <Ionicons
                  name="search"
                  size={18}
                  color={isDark ? colors.textMuted : "#9ca3af"}
                />
                <TextInput
                  placeholder="Search your properties..."
                  placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
                  style={[
                    styles.searchInput,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={isDark ? colors.textMuted : "#ccc"}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  alignItems: "center",
                  paddingVertical: 10,
                }}
              >
                {STATUS_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setStatusFilter(f)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isDark ? colors.card : "white",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                      statusFilter === f && [
                        styles.filterChipActive,
                        {
                          backgroundColor: isDark ? "white" : "#111",
                          borderColor: isDark ? "white" : "#111",
                        },
                      ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: isDark ? colors.textMuted : "#666" },
                        statusFilter === f && [
                          styles.filterChipTextActive,
                          { color: isDark ? "#111" : "white" },
                        ],
                      ]}
                    >
                      {f === "all"
                        ? "All"
                        : f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Property Cards */}
            {filteredData.length === 0 ? (
              <View style={styles.emptyState}>
                <View
                  style={[
                    styles.emptyIcon,
                    { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                  ]}
                >
                  <Ionicons
                    name="home-outline"
                    size={40}
                    color={isDark ? colors.textMuted : "#d1d5db"}
                  />
                </View>
                <Text
                  style={[
                    styles.emptyTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  No properties yet
                </Text>
                <Text
                  style={[
                    styles.emptySubtitle,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  Add your first property from the dashboard.
                </Text>
              </View>
            ) : (
              filteredData.map(renderCard)
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      {/* Verification Modal */}
      <Modal visible={isVerifyingPayment} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: isDark ? colors.card : "white",
              padding: 30,
              borderRadius: 20,
              alignItems: "center",
              width: "100%",
            }}
          >
            <ActivityIndicator size="large" color={colors.accent || "#000"} />
            <Text
              style={{
                marginTop: 20,
                fontSize: 16,
                fontWeight: "bold",
                color: isDark ? colors.text : "black",
                textAlign: "center",
              }}
            >
              Please wait. We are verifying your payment, please do not close
              this app.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Purchase Modal */}
      <Modal
        visible={showPurchaseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPurchaseModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: isDark ? colors.surface : "white",
              borderRadius: 20,
              width: "100%",
              maxWidth: 380,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <View
              style={{
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: isDark ? colors.border : "#f3f4f6",
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: isDark ? colors.card : "#eff6ff",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="business-outline"
                  size={20}
                  color={isDark ? colors.text : "#2563eb"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "900",
                    color: isDark ? colors.text : "#111",
                  }}
                >
                  Buy Property Slot
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textMuted : "#9ca3af",
                    fontWeight: "500",
                  }}
                >
                  Add another property listing slot
                </Text>
              </View>
            </View>

            {/* Body */}
            <View style={{ padding: 20 }}>
              <View
                style={{
                  backgroundColor: isDark ? colors.card : "#eff6ff",
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: isDark ? colors.cardBorder : "#dbeafe",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: isDark ? colors.text : "#1e3a5f",
                    }}
                  >
                    Current Plan
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: isDark ? colors.text : "#2563eb",
                      textTransform: "uppercase",
                      backgroundColor: isDark ? colors.surface : "#dbeafe",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      overflow: "hidden",
                    }}
                  >
                    {slotPlan?.type || "free"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                  }}
                >
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "900",
                        color: isDark ? colors.text : "#1e3a5f",
                      }}
                    >
                      {slotPlan?.used_slots || 0}
                    </Text>
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "700",
                        color: isDark ? colors.textMuted : "#60a5fa",
                        textTransform: "uppercase",
                      }}
                    >
                      Used
                    </Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "900",
                        color: isDark ? colors.text : "#1e3a5f",
                      }}
                    >
                      {slotPlan?.total_slots || 3}
                    </Text>
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "700",
                        color: isDark ? colors.textMuted : "#60a5fa",
                        textTransform: "uppercase",
                      }}
                    >
                      Total
                    </Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: "900",
                        color: isDark ? colors.text : "#1e3a5f",
                      }}
                    >
                      {slotPlan?.max_slots || 10}
                    </Text>
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "700",
                        color: isDark ? colors.textMuted : "#60a5fa",
                        textTransform: "uppercase",
                      }}
                    >
                      Max
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={{
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderRadius: 14,
                  padding: 16,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    +1 Property Slot
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: isDark ? colors.textMuted : "#9ca3af",
                      marginTop: 2,
                    }}
                  >
                    Permanent addition
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "900",
                    color: isDark ? colors.text : "#111",
                  }}
                >
                  ₱50
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 10,
                  color: isDark ? colors.textMuted : "#9ca3af",
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                After purchase, your total slots will be{" "}
                {(slotPlan?.total_slots || 3) + 1}. Payment via GCash, Maya, or
                Card.
              </Text>
            </View>

            {/* Footer */}
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                padding: 20,
                borderTopWidth: 1,
                borderTopColor: isDark ? colors.border : "#f3f4f6",
                backgroundColor: isDark ? colors.card : "#f9fafb",
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: isDark ? colors.border : "#e5e7eb",
                  alignItems: "center",
                }}
                onPress={() => setShowPurchaseModal(false)}
                disabled={purchasingSlot}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: isDark ? colors.text : "#374151",
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1.5,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#2563eb",
                  alignItems: "center",
                  opacity: purchasingSlot ? 0.6 : 1,
                }}
                onPress={handlePurchaseSlot}
                disabled={purchasingSlot}
              >
                {purchasingSlot ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text
                    style={{ fontWeight: "800", color: "white", fontSize: 14 }}
                  >
                    Proceed to Payment
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111" },
  headerSub: { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: "white",
  },
  statBox: {
    flex: 1,
    backgroundColor: "#fafafa",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
  },
  statNum: { fontSize: 22, fontWeight: "900" },
  statLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },

  searchContainer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111" },

  filterRow: {},
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
  },
  filterChipActive: { backgroundColor: "#111", borderColor: "#111" },
  filterChipText: { fontSize: 12, fontWeight: "700", color: "#666" },
  filterChipTextActive: { color: "white" },

  scrollContent: { paddingBottom: 130 },

  card: {
    backgroundColor: "white",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  imageContainer: { width: "100%", height: 180, position: "relative" },
  cardImage: { width: "100%", height: "100%" },
  gradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },

  badgeContainer: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  badgeText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },

  priceOverlay: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceText: { fontSize: 22, fontWeight: "900", color: "white" },
  periodText: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginLeft: 2 },

  cardContent: { padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  cardAddress: { fontSize: 12, color: "#9ca3af", flex: 1 },

  metaBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  metaText: { fontSize: 12, color: "#666" },

  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
  },
  actionBtnPrimary: { backgroundColor: "#111", borderColor: "#111" },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#111" },
  actionBtnTextPrimary: { color: "white" },

  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  emptySubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
  },
});
