import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
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
import WebViewMap from "../../components/WebViewMap";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
const canUseNativeMapLibre =
  Platform.OS !== "web" && Constants.appOwnership !== "expo";
const MapLibreGL: any = canUseNativeMapLibre
  ? require("@maplibre/maplibre-react-native").default
  : null;
const MAPLIBRE_LOW_MEMORY_PROPS = {
  attributionEnabled: false,
  logoEnabled: false,
  compassEnabled: false,
  scaleBarEnabled: false,
  preferredFramesPerSecond: 30,
  surfaceView: Platform.OS === "android",
};

const API_URL = process.env.EXPO_PUBLIC_API_URL || "";

const { width, height } = Dimensions.get("window");

export default function PropertyDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { isDark, colors } = useTheme();

  // -- STATE --
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [landlordProfile, setLandlordProfile] = useState<any>(null);
  const [landlordRatingAverage, setLandlordRatingAverage] = useState(0);
  const [landlordRatingCount, setLandlordRatingCount] = useState(0);
  const [hasActiveOccupancy, setHasActiveOccupancy] = useState(false);
  const [occupiedPropertyTitle, setOccupiedPropertyTitle] = useState("");
  const [propertyStatsInfo, setPropertyStatsInfo] = useState({
    isMostFavorite: false,
    isTopRated: false,
    favoriteCount: 0,
    reviewCount: 0,
  });

  // Data State
  const [reviews, setReviews] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [showBookingOptions, setShowBookingOptions] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [bookingNote, setBookingNote] = useState("");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);

  // Modals
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [reviewFilter, setReviewFilter] = useState("most_relevant");
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [directionInput, setDirectionInput] = useState("");

  // Location
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [routeInfo, setRouteInfo] = useState<any>(null);
  const [isRouting, setIsRouting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        loadProfile(session.user.id);
      }
    });
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setProfile(data);
      if (data.role === "tenant") {
        checkActiveOccupancy(userId);
      }
    }
  };

  const checkActiveOccupancy = async (userId: string) => {
    const { data } = await supabase
      .from("tenant_occupancies")
      .select("*, property:properties(title)")
      .eq("tenant_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (data) {
      setHasActiveOccupancy(true);
      setOccupiedPropertyTitle(data.property?.title || "a property");
    }
  };

  useEffect(() => {
    if (id) {
      loadProperty();
      loadReviews();
      loadPropertyStats();
    }
  }, [id]);

  const loadPropertyStats = async () => {
    const { data } = await supabase.from("property_stats").select("*");
    if (data && id) {
      const mostFav = data
        .filter((d: any) => (d.favorite_count || 0) > 0)
        .sort(
          (a: any, b: any) => b.favorite_count - a.favorite_count,
        )[0]?.property_id;
      const topRated = data
        .filter((d: any) => (d.review_count || 0) > 0)
        .sort(
          (a: any, b: any) =>
            (b.avg_rating || 0) - (a.avg_rating || 0) ||
            b.review_count - a.review_count,
        )[0]?.property_id;

      const currentPropStats = data.find((d: any) => d.property_id === id) || {
        favorite_count: 0,
        review_count: 0,
      };

      setPropertyStatsInfo({
        isMostFavorite: mostFav === id,
        isTopRated: topRated === id,
        favoriteCount: currentPropStats.favorite_count || 0,
        reviewCount: currentPropStats.review_count || 0,
      });
    }
  };

  useEffect(() => {
    if (property?.landlord) {
      loadTimeSlots(property.landlord);
    }
  }, [property]);

  const loadProperty = async () => {
    setLoading(true);
    const { data: propertyData, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error || !propertyData) {
      setLoading(false);
      return;
    }

    setProperty(propertyData);
    if (propertyData.landlord) {
      const { data: landlordData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", propertyData.landlord)
        .maybeSingle();
      if (landlordData) setLandlordProfile(landlordData);

      await loadLandlordRating(propertyData.landlord);
    }
    setLoading(false);
  };

  const loadLandlordRating = async (landlordId: string) => {
    try {
      const { data, error } = await supabase
        .from("landlord_ratings")
        .select("rating")
        .eq("landlord_id", landlordId);

      if (error) {
        console.warn("loadLandlordRating warning:", error.message);
        setLandlordRatingAverage(0);
        setLandlordRatingCount(0);
        return;
      }

      const count = (data || []).length;
      const sum = (data || []).reduce(
        (acc: number, row: any) => acc + Number(row.rating || 0),
        0,
      );

      setLandlordRatingCount(count);
      setLandlordRatingAverage(count > 0 ? sum / count : 0);
    } catch (err) {
      console.warn("loadLandlordRating error:", err);
      setLandlordRatingAverage(0);
      setLandlordRatingCount(0);
    }
  };

  const loadReviews = async () => {
    const { data } = await supabase
      .from("reviews")
      .select(
        "*, tenant:profiles!reviews_user_id_fkey(first_name, last_name, avatar_url)",
      )
      .eq("property_id", id)
      .order("created_at", { ascending: false });
    if (data) setReviews(data);
  };

  const loadTimeSlots = async (landlordId: string) => {
    const { data } = await supabase
      .from("available_time_slots")
      .select("*")
      .eq("landlord_id", landlordId)
      .eq("is_booked", false)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });
    if (data) setTimeSlots(data);
  };

  // --- HELPER: Extract Coordinates (Ported from Next.js) ---
  const extractCoordinates = (link: string) => {
    if (!link) return null;
    const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const qMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    const placeMatch = link.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);

    const match = atMatch || qMatch || placeMatch;
    if (match) {
      return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
    }
    return null;
  };

  // --- MAP ROUTING (Ported) ---
  const calculateRoute = async () => {
    if (!property) return;
    setIsRouting(true);
    // Use device location (simulated for now or use expo-location if permissible,
    // but user code uses browser geolocation. We'll simplify to just showing the property on map first
    // or routing from a fixed point if needed.
    // For this merge, we'll focus on the MapView marker first.)

    // NOTE: Real routing requires user location.
    // We will leave this placeholder or implement if requested with expo-location.
    setIsRouting(false);
  };

  // --- ACTIONS ---

  const handleOpenBooking = () => {
    const latestStatus = String(property?.status || "")
      .trim()
      .toLowerCase();
    if (latestStatus !== "available") {
      Alert.alert(
        "Unavailable",
        "This property is no longer available for viewing.",
      );
      return;
    }

    if (!session) {
      Alert.alert("Login Required", "You need to login first.", [
        { text: "OK", onPress: () => router.push("/") },
      ]);
      return;
    }
    setShowBookingOptions(true);
  };

  const handleCancelBooking = () => {
    setShowBookingOptions(false);
    setSelectedSlotId("");
    setBookingNote("");
    setTermsAccepted(false);
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlotId)
      return Alert.alert("Error", "Please select a viewing time.");
    setSubmitting(true);

    try {
      // 1. Check Active Occupancy
      const { data: activeOcc } = await supabase
        .from("tenant_occupancies")
        .select("id")
        .eq("property_id", id)
        .eq("tenant_id", session.user.id)
        .in("status", ["active", "pending_end"])
        .maybeSingle();

      if (activeOcc) {
        throw new Error("You are currently occupying this property.");
      }

      // 1.5 Check latest property status before creating booking
      const { data: latestProperty, error: latestPropertyError } =
        await supabase
          .from("properties")
          .select("status, is_deleted")
          .eq("id", id)
          .maybeSingle();

      if (latestPropertyError) throw latestPropertyError;

      const latestStatus = String(latestProperty?.status || "")
        .trim()
        .toLowerCase();

      if (
        !latestProperty ||
        latestProperty?.is_deleted ||
        latestStatus !== "available"
      ) {
        throw new Error("This property is no longer available for viewing.");
      }

      // 2. Check Existing Booking
      const { data: globalActive } = await supabase
        .from("bookings")
        .select("id")
        .eq("tenant", session.user.id)
        .in("status", ["pending", "pending_approval", "approved", "accepted"])
        .maybeSingle();

      if (globalActive) {
        throw new Error(
          "You already have an active viewing request. Cancel it first.",
        );
      }

      // 3. Create Booking
      const slot = timeSlots.find((s) => s.id === selectedSlotId);
      if (!slot) throw new Error("Time slot not found.");

      const { data: newBooking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          property_id: id,
          tenant: session.user.id,
          landlord: property.landlord,
          start_time: slot.start_time,
          end_time: slot.end_time,
          booking_date: slot.start_time,
          time_slot_id: slot.id,
          status: "pending",
          notes: bookingNote || "No message provided",
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // 4. Update Slot
      await supabase
        .from("available_time_slots")
        .update({ is_booked: true })
        .eq("id", slot.id);

      // 5. Notifications (Supabase + API/SMS)
      if (property.landlord) {
        // In-App (Supabase) - REMOVED due to RLS. Handled via /api/notify if backend supports.
        // await createNotification(
        //   property.landlord,
        //   'new_booking',
        //   `${profile?.first_name || 'A tenant'} requested a viewing for ${property.title}.`,
        //   { actor: session.user.id }
        // );

        // Notify API (Email/System)
        try {
          fetch(`${API_URL}/api/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "booking_new",
              recordId: newBooking.id,
              actorId: session.user.id,
            }),
          });
        } catch (e) {
          console.log("Notify API Error:", e);
        }

        // SMS Notification
        if (landlordProfile?.phone) {
          try {
            fetch(`${API_URL}/api/send-sms`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phoneNumber: landlordProfile.phone,
                message: `EaseRent Alert: New viewing request from ${profile?.first_name || "A Tenant"} for "${property.title}". Log in to review.`,
              }),
            });
          } catch (smsError) {
            console.log("Failed to send SMS:", smsError);
          }
        }
      }

      Alert.alert("Success", "Viewing request sent successfully!");
      handleCancelBooking();
      router.push("/bookings");
    } catch (err: any) {
      console.log("Booking Error:", err);
      Alert.alert("Error", err.message || "Failed to book viewing.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirections = (useCurrent = false) => {
    if (!property) return;

    // Use the same coordinate priority as the map display:
    // 1. Prefer stored latitude/longitude (set by landlord, more accurate)
    // 2. Fall back to extracting from location_link (Google Maps URL)
    const hasStoredCoords = property.latitude && property.longitude;
    const linkCoords = extractCoordinates(property.location_link);

    const lat = hasStoredCoords
      ? property.latitude
      : linkCoords
        ? linkCoords.lat
        : "";
    const lng = hasStoredCoords
      ? property.longitude
      : linkCoords
        ? linkCoords.lng
        : "";

    router.push({
      pathname: "/getDirections",
      params: {
        to: property.address + ", " + property.city,
        lat: lat.toString(),
        lng: lng.toString(),
        auto: useCurrent ? "true" : "false",
        from: useCurrent ? "" : directionInput,
      },
    } as any);
  };

  const openTerms = () => {
    const link =
      property.terms_conditions && property.terms_conditions.startsWith("http")
        ? property.terms_conditions
        : `${API_URL}/terms`; // Fallback
    Linking.openURL(link);
  };

  if (loading)
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#FAFAFA" },
        ]}
      >
        <ActivityIndicator
          size="large"
          color={isDark ? colors.text : "black"}
        />
      </View>
    );
  if (!property)
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#FAFAFA" },
        ]}
      >
        <Text style={{ color: isDark ? colors.text : "#000" }}>
          Property not found
        </Text>
      </View>
    );

  const images =
    property.images && property.images.length > 0
      ? property.images
      : ["https://via.placeholder.com/600x400"];
  const amenities = Array.isArray(property.amenities) ? property.amenities : [];
  const hasFreeWater = amenities.includes("Free Water");
  const hasFreeElectricity = amenities.includes("Free Electricity");
  const includesAdvance =
    typeof property.has_advance === "boolean"
      ? property.has_advance
      : Number(property.advance_amount || 0) > 0;
  const includesSecurityDeposit =
    typeof property.has_security_deposit === "boolean"
      ? property.has_security_deposit
      : Number(property.security_deposit_amount || 0) > 0;
  const isOwner = profile?.id === property.landlord;
  const isLandlordRole = profile?.role === "landlord";
  const propertyStatus = String(property?.status || "")
    .trim()
    .toLowerCase();
  const isBookableStatus = propertyStatus === "available";
  const canBookViewing =
    isBookableStatus &&
    !isOwner &&
    !isLandlordRole &&
    !activeOccupancyCheck(hasActiveOccupancy, occupiedPropertyTitle);

  // Stats calculation
  const avgRating =
    reviews.length > 0
      ? (
          reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
        ).toFixed(1)
      : "New";
  const cleanliness =
    reviews.length > 0
      ? (
          reviews.reduce(
            (acc, r) => acc + (r.cleanliness_rating || r.rating),
            0,
          ) / reviews.length
        ).toFixed(1)
      : "-";
  const communication =
    reviews.length > 0
      ? (
          reviews.reduce(
            (acc, r) => acc + (r.communication_rating || r.rating),
            0,
          ) / reviews.length
        ).toFixed(1)
      : "-";
  const locationRating =
    reviews.length > 0
      ? (
          reviews.reduce((acc, r) => acc + (r.location_rating || r.rating), 0) /
          reviews.length
        ).toFixed(1)
      : "-";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#FAFAFA" },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.backButton,
          {
            backgroundColor: isDark
              ? "rgba(17,17,17,0.85)"
              : "rgba(255,255,255,0.9)",
          },
        ]}
        onPress={() => router.back()}
      >
        <Ionicons
          name="arrow-back"
          size={20}
          color={isDark ? "#fff" : "#111"}
        />
      </TouchableOpacity>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* IMAGE CAROUSEL */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentImageIndex(idx);
            }}
          >
            {images.map((img: string, i: number) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.9}
                onPress={() => setShowGalleryModal(true)}
              >
                <Image
                  source={{ uri: img }}
                  style={{ width, height: 350 }}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Image Counter */}
          <View style={styles.imageCounter}>
            <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>
              {currentImageIndex + 1} / {images.length}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* HEADER */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.title, { color: isDark ? colors.text : "#111" }]}
              >
                {property.title}
              </Text>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusBadge,
                    property.status === "available"
                      ? { backgroundColor: "#ecfdf5", borderColor: "#d1fae5" }
                      : property.status === "occupied"
                        ? { backgroundColor: "#eff6ff", borderColor: "#dbeafe" }
                        : {
                            backgroundColor: "#fef2f2",
                            borderColor: "#fee2e2",
                          },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      property.status === "available"
                        ? { backgroundColor: "#10b981" }
                        : property.status === "occupied"
                          ? { backgroundColor: "#3b82f6" }
                          : { backgroundColor: "#ef4444" },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      property.status === "available"
                        ? { color: "#047857" }
                        : property.status === "occupied"
                          ? { color: "#1d4ed8" }
                          : { color: "#b91c1c" },
                    ]}
                  >
                    {property.status === "available"
                      ? "Available"
                      : property.status === "occupied"
                        ? "Occupied"
                        : "Not Available"}
                  </Text>
                </View>
              </View>

              {/* Top Rated & Most Favorite Badges */}
              {(propertyStatsInfo.isTopRated ||
                propertyStatsInfo.isMostFavorite) && (
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  {propertyStatsInfo.isTopRated && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "#fffbeb",
                        paddingRight: 10,
                        paddingLeft: 4,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderColor: "#fde68a",
                        borderWidth: 1,
                      }}
                    >
                      <Image
                        source={require("../../assets/images/toprated.png")}
                        style={{
                          width: 35,
                          height: 35,
                          resizeMode: "contain",
                          marginRight: 5,
                        }}
                      />
                      <View>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: "#d97706",
                            textTransform: "uppercase",
                          }}
                        >
                          Top Rated
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "bold",
                            color: "#92400e",
                          }}
                        >
                          {propertyStatsInfo.reviewCount} Reviews
                        </Text>
                      </View>
                    </View>
                  )}
                  {propertyStatsInfo.isMostFavorite && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "#fff1f2",
                        paddingRight: 10,
                        paddingLeft: 4,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderColor: "#fecdd3",
                        borderWidth: 1,
                      }}
                    >
                      <Image
                        source={require("../../assets/images/mostfavorite.png")}
                        style={{
                          width: 35,
                          height: 35,
                          resizeMode: "contain",
                          marginRight: 5,
                        }}
                      />
                      <View>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: "#e11d48",
                            textTransform: "uppercase",
                          }}
                        >
                          Most Favorite
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "bold",
                            color: "#9f1239",
                          }}
                        >
                          {propertyStatsInfo.favoriteCount} Favorites
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={[styles.price, { color: isDark ? colors.text : "#111" }]}
              >
                ₱{Number(property.price).toLocaleString()}
              </Text>
              <Text
                style={[
                  styles.perMonth,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                /mo
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginBottom: 20,
            }}
          >
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: isDark ? colors.card : "#f3f4f6" },
              ]}
            >
              <Ionicons
                name="location"
                size={14}
                color={isDark ? colors.textSecondary : "#666"}
              />
            </View>
            <Text
              style={{
                fontSize: 14,
                color: isDark ? colors.textSecondary : "#666",
              }}
            >
              {property.address}, {property.city} {property.zip}
            </Text>
          </View>

          {/* SPECS */}
          <View
            style={[
              styles.specsContainer,
              {
                backgroundColor: isDark ? colors.card : "white",
                borderColor: isDark ? colors.cardBorder : "#eee",
              },
            ]}
          >
            <View style={styles.specItem}>
              <Ionicons
                name="bed-outline"
                size={20}
                color={isDark ? colors.textSecondary : "#333"}
              />
              <View>
                <Text
                  style={[
                    styles.specValue,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {property.bedrooms}
                </Text>
                <Text
                  style={[
                    styles.specLabel,
                    { color: isDark ? colors.textMuted : "#666" },
                  ]}
                >
                  Bedrooms
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.specDivider,
                { backgroundColor: isDark ? colors.border : "#eee" },
              ]}
            />
            <View style={styles.specItem}>
              <Ionicons
                name="water-outline"
                size={20}
                color={isDark ? colors.textSecondary : "#333"}
              />
              <View>
                <Text
                  style={[
                    styles.specValue,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {property.bathrooms}
                </Text>
                <Text
                  style={[
                    styles.specLabel,
                    { color: isDark ? colors.textMuted : "#666" },
                  ]}
                >
                  Bathrooms
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.specDivider,
                { backgroundColor: isDark ? colors.border : "#eee" },
              ]}
            />
            <View style={styles.specItem}>
              <Ionicons
                name="resize-outline"
                size={20}
                color={isDark ? colors.textSecondary : "#333"}
              />
              <View>
                <Text
                  style={[
                    styles.specValue,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {property.area_sqft}
                </Text>
                <Text
                  style={[
                    styles.specLabel,
                    { color: isDark ? colors.textMuted : "#666" },
                  ]}
                >
                  Sq. Ft.
                </Text>
              </View>
            </View>
          </View>

          {/* DESCRIPTION */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              About this property
            </Text>
            <Text
              style={[
                styles.description,
                { color: isDark ? colors.textSecondary : "#444" },
              ]}
            >
              {property.description || "No description provided."}
            </Text>
          </View>

          {/* AMENITIES */}
          {amenities.length > 0 && (
            <View style={styles.section}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Amenities
              </Text>
              <View style={styles.amenitiesRow}>
                {(showAllAmenities ? amenities : amenities.slice(0, 6)).map(
                  (am: string, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.amenityBadge,
                        { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          color: isDark ? colors.textSecondary : "#333",
                        }}
                      >
                        {am}
                      </Text>
                    </View>
                  ),
                )}
              </View>
              {amenities.length > 6 && (
                <TouchableOpacity
                  onPress={() => setShowAllAmenities(!showAllAmenities)}
                  style={{ marginTop: 5 }}
                >
                  <Text style={styles.linkText}>
                    {showAllAmenities
                      ? "Show Less"
                      : `+${amenities.length - 6} more`}
                  </Text>
                </TouchableOpacity>
              )}

              <View
                style={{
                  marginTop: 12,
                  borderWidth: 1,
                  borderRadius: 14,
                  padding: 12,
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#eee",
                  gap: 8,
                }}
              >
                <View style={styles.rowBetween}>
                  <Text
                    style={{ color: isDark ? colors.textSecondary : "#666" }}
                  >
                    Water
                  </Text>
                  <Text
                    style={{
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    {hasFreeWater ? "Free" : "Not Free"}
                  </Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text
                    style={{ color: isDark ? colors.textSecondary : "#666" }}
                  >
                    Electricity
                  </Text>
                  <Text
                    style={{
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    {hasFreeElectricity ? "Free" : "Not Free"}
                  </Text>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: isDark ? colors.border : "#eee",
                    marginVertical: 4,
                  }}
                />
                <View style={styles.rowBetween}>
                  <Text
                    style={{ color: isDark ? colors.textSecondary : "#666" }}
                  >
                    Advance Payment
                  </Text>
                  <Text
                    style={{
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    {includesAdvance ? `₱${Number(property.advance_amount || property.price || 0).toLocaleString()}` : "Excluded"}
                  </Text>
                </View>
                <View style={styles.rowBetween}>
                  <Text
                    style={{ color: isDark ? colors.textSecondary : "#666" }}
                  >
                    Security Deposit
                  </Text>
                  <Text
                    style={{
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    {includesSecurityDeposit ? `₱${Number(property.security_deposit_amount || property.price || 0).toLocaleString()}` : "Excluded"}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* REVIEWS DETAILED SECTION */}
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Reviews{" "}
                <Text
                  style={{
                    fontWeight: "normal",
                    fontSize: 14,
                    color: isDark ? colors.textMuted : "#666",
                  }}
                >
                  ({reviews.length})
                </Text>
              </Text>
              {reviews.length > 0 && (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="star" size={16} color="#facc15" />
                  <Text
                    style={{
                      fontWeight: "900",
                      fontSize: 16,
                      color: isDark ? colors.text : "#000",
                    }}
                  >
                    {avgRating}
                  </Text>
                </View>
              )}
            </View>

            {reviews.length > 0 ? (
              <View>
                {/* Category Breakdown */}
                <View style={styles.catRow}>
                  {[
                    {
                      label: "Cleanliness",
                      val: cleanliness,
                      color: "#3b82f6",
                      icon: "sparkles",
                    },
                    {
                      label: "Communication",
                      val: communication,
                      color: "#22c55e",
                      icon: "chatbubbles",
                    },
                    {
                      label: "Location",
                      val: locationRating,
                      color: "#f97316",
                      icon: "location",
                    },
                  ].map((cat, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.catCard,
                        {
                          backgroundColor: isDark ? colors.surface : "#f9fafb",
                        },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          marginBottom: 5,
                        }}
                      >
                        <Ionicons
                          name={cat.icon as any}
                          size={12}
                          color={cat.color}
                        />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: isDark ? colors.textMuted : "#666",
                          }}
                        >
                          {cat.label}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "900",
                            color: isDark ? colors.text : "#000",
                          }}
                        >
                          {cat.val}
                        </Text>
                        <View
                          style={{
                            flex: 1,
                            height: 4,
                            backgroundColor: isDark ? colors.card : "#eee",
                            borderRadius: 2,
                          }}
                        >
                          <View
                            style={{
                              width: `${(parseFloat(cat.val) / 5) * 100}%`,
                              height: "100%",
                              backgroundColor: cat.color,
                              borderRadius: 2,
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Review List Preview */}
                <View style={{ marginTop: 15 }}>
                  {reviews.slice(0, 3).map((rev, i) => (
                    <View
                      key={i}
                      style={[
                        styles.reviewItem,
                        {
                          backgroundColor: isDark ? colors.card : "white",
                          borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                        },
                      ]}
                    >
                      <View style={styles.rowBetween}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <View style={styles.reviewAvatar}>
                            <Text style={{ fontWeight: "bold", color: "#666" }}>
                              {rev.tenant?.first_name?.charAt(0)}
                            </Text>
                          </View>
                          <View>
                            <Text
                              style={[
                                styles.reviewerName,
                                { color: isDark ? colors.text : "#000" },
                              ]}
                            >
                              {rev.tenant?.first_name} {rev.tenant?.last_name}
                            </Text>
                            <Text style={styles.reviewDate}>
                              {new Date(rev.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.smallRatingBadge}>
                          <Ionicons name="star" size={10} color="#facc15" />
                          <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                            {rev.rating}
                          </Text>
                        </View>
                      </View>

                      {/* Tags */}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 5,
                          marginTop: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text style={styles.microTag}>
                          Cleanliness: {rev.cleanliness_rating || rev.rating}
                        </Text>
                        <Text style={styles.microTag}>
                          Comm: {rev.communication_rating || rev.rating}
                        </Text>
                        <Text style={styles.microTag}>
                          Loc: {rev.location_rating || rev.rating}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.reviewText,
                          { color: isDark ? colors.textSecondary : "#444" },
                        ]}
                        numberOfLines={3}
                      >
                        {rev.comment}
                      </Text>
                    </View>
                  ))}
                  {reviews.length > 3 && (
                    <TouchableOpacity
                      onPress={() => setShowAllReviewsModal(true)}
                      style={styles.showMoreBtn}
                    >
                      <Text style={{ fontWeight: "bold", fontSize: 13 }}>
                        See all {reviews.length} reviews
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.emptyReviews,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#eee",
                  },
                ]}
              >
                <Ionicons
                  name="star-outline"
                  size={32}
                  color={isDark ? colors.textMuted : "#ccc"}
                />
                <Text
                  style={{
                    color: isDark ? colors.textMuted : "#999",
                    marginTop: 5,
                  }}
                >
                  No reviews yet
                </Text>
              </View>
            )}
          </View>

          {/* LOCATION WITH INPUT */}
          <View style={styles.section}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Location
            </Text>
            <View
              style={[
                styles.mapCard,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#eee",
                },
              ]}
            >
              {/* Directions Input */}
              <View
                style={[
                  styles.dirInputContainer,
                  { backgroundColor: isDark ? colors.surface : "#f9fafb" },
                ]}
              >
                <View
                  style={[
                    styles.dirInputRow,
                    {
                      backgroundColor: isDark ? colors.card : "white",
                      borderColor: isDark ? colors.cardBorder : "#eee",
                    },
                  ]}
                >
                  <Ionicons
                    name="location"
                    size={16}
                    color="#2563eb"
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={{
                      flex: 1,
                      fontSize: 12,
                      paddingVertical: 4,
                      color: isDark ? colors.text : "#000",
                    }}
                    placeholder="Enter your location..."
                    placeholderTextColor={isDark ? colors.textMuted : "#999"}
                    value={directionInput}
                    onChangeText={setDirectionInput}
                  />
                  {directionInput.length > 0 && (
                    <TouchableOpacity onPress={() => handleDirections(false)}>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "bold",
                          color: "#2563eb",
                        }}
                      >
                        GO
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.myLocBtn}
                  onPress={() => handleDirections(true)}
                >
                  <Ionicons
                    name="navigate"
                    size={14}
                    color={isDark ? colors.textSecondary : "#666"}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "bold",
                      color: isDark ? colors.textSecondary : "#666",
                    }}
                  >
                    Use My Location
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.mapContainer}>
                {(() => {
                  if (
                    !(
                      property.location_link ||
                      (property.latitude && property.longitude)
                    ) ||
                    Platform.OS === "web"
                  ) {
                    return (
                      <View style={styles.center}>
                        <Text style={{ color: "#666" }}>Map not available</Text>
                      </View>
                    );
                  }

                  const mapCoords =
                    property.latitude && property.longitude
                      ? { lat: property.latitude, lng: property.longitude }
                      : extractCoordinates(property.location_link);

                  const centerCoord = [
                    mapCoords?.lng || 123.8854,
                    mapCoords?.lat || 10.3157,
                  ];

                  if (MapLibreGL) {
                    return (
                      <MapLibreGL.MapView
                        style={StyleSheet.absoluteFillObject}
                        styleURL="https://tiles.openfreemap.org/styles/bright"
                        scrollEnabled={false}
                        zoomEnabled={false}
                        rotateEnabled={false}
                        pitchEnabled={false}
                        {...MAPLIBRE_LOW_MEMORY_PROPS}
                      >
                        <MapLibreGL.Camera
                          centerCoordinate={centerCoord}
                          zoomLevel={14}
                          animationDuration={0}
                        />
                        <MapLibreGL.PointAnnotation
                          id="property-marker"
                          coordinate={centerCoord}
                          title={property.title}
                        >
                          <View
                            style={{
                              width: 30,
                              height: 30,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Ionicons
                              name="location"
                              size={30}
                              color="#ef4444"
                            />
                          </View>
                        </MapLibreGL.PointAnnotation>
                      </MapLibreGL.MapView>
                    );
                  }

                  return (
                    <WebViewMap
                      center={centerCoord as [number, number]}
                      zoom={14}
                      interactive={false}
                      markers={[
                        {
                          id: "property-marker",
                          coordinate: centerCoord as [number, number],
                          title: property.title,
                          color: "#ef4444",
                        },
                      ]}
                      style={StyleSheet.absoluteFillObject}
                    />
                  );
                })()}
              </View>
              <View
                style={[
                  styles.mapFooter,
                  { borderTopColor: isDark ? colors.border : "#eee" },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textSecondary : "#666",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {property.address}, {property.city}
                </Text>
                <TouchableOpacity onPress={() => handleDirections(true)}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "bold",
                      color: "#2563eb",
                    }}
                  >
                    View Larger Map
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* LANDLORD & CONTACT SECTION */}
          <View style={styles.section}>
            <View
              style={[
                styles.landlordContainer,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#eee",
                },
              ]}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 15,
                }}
              >
                <Text
                  style={[
                    styles.sectionTitle,
                    { marginBottom: 0, color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Posted by
                </Text>
                <Text style={{ fontSize: 10, color: "#999" }}>
                  Joined{" "}
                  {landlordProfile?.created_at
                    ? new Date(landlordProfile.created_at).getFullYear()
                    : "Recently"}
                </Text>
              </View>

              {/* Profile */}
              <View style={styles.hostProfile}>
                {landlordProfile?.avatar_url ? (
                  <Image
                    source={{ uri: landlordProfile.avatar_url }}
                    style={styles.hostAvatar}
                  />
                ) : (
                  <View style={styles.hostAvatarPlaceholder}>
                    <Text
                      style={{
                        color: "white",
                        fontWeight: "bold",
                        fontSize: 18,
                      }}
                    >
                      {landlordProfile?.first_name?.charAt(0)}
                    </Text>
                  </View>
                )}
                <View>
                  <Text
                    style={{
                      fontWeight: "bold",
                      fontSize: 16,
                      color: isDark ? colors.text : "#000",
                    }}
                  >
                    {landlordProfile?.first_name} {landlordProfile?.last_name}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      marginTop: 4,
                    }}
                  >
                    <Ionicons name="star" size={12} color="#eab308" />
                    <Text
                      style={{
                        fontSize: 12,
                        color: isDark ? colors.textMuted : "#666",
                        fontWeight: "600",
                      }}
                    >
                      {landlordRatingCount > 0
                        ? `${landlordRatingAverage.toFixed(1)} rating for ${landlordRatingCount} response${landlordRatingCount === 1 ? "" : "s"}`
                        : "No Review"}
                    </Text>
                  </View>
                  {/* <Text style={{ fontSize: 12, color: '#666' }}>{landlordProfile?.role === 'landlord' ? 'Posted By' : 'Agent'}</Text>
                  <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                    {[1, 2, 3, 4, 5].map(s => <Ionicons key={s} name="star" size={10} color="#facc15" />)}
                    <Text style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>(superhost)</Text>
                  </View> */}
                </View>
              </View>

              {/* CONTACT INFO */}
              {(property.owner_phone ||
                property.owner_email ||
                landlordProfile?.city) && (
                <View style={{ marginBottom: 15, gap: 8 }}>
                  {property.owner_phone && (
                    <View style={styles.contactRow}>
                      <View
                        style={[
                          styles.iconCircle,
                          {
                            backgroundColor: isDark ? colors.badge : "#f3f4f6",
                          },
                        ]}
                      >
                        <Ionicons
                          name="call"
                          size={14}
                          color={isDark ? colors.textSecondary : "#666"}
                        />
                      </View>
                      <Text
                        onPress={() =>
                          Linking.openURL(`tel:${property.owner_phone}`)
                        }
                        style={{
                          fontWeight: "500",
                          color: isDark ? colors.text : "#000",
                        }}
                      >
                        {property.owner_phone}
                      </Text>
                    </View>
                  )}
                  {property.owner_email && (
                    <View style={styles.contactRow}>
                      <View
                        style={[
                          styles.iconCircle,
                          {
                            backgroundColor: isDark ? colors.badge : "#f3f4f6",
                          },
                        ]}
                      >
                        <Ionicons
                          name="mail"
                          size={14}
                          color={isDark ? colors.textSecondary : "#666"}
                        />
                      </View>
                      <Text
                        onPress={() =>
                          Linking.openURL(`mailto:${property.owner_email}`)
                        }
                        style={{
                          fontWeight: "500",
                          color: isDark ? colors.text : "#000",
                        }}
                      >
                        {property.owner_email}
                      </Text>
                    </View>
                  )}
                  {/* Location Logic */}
                  {(property.address || property.city) && (
                    <View style={styles.contactRow}>
                      <View
                        style={[
                          styles.iconCircle,
                          {
                            backgroundColor: isDark ? colors.badge : "#f3f4f6",
                          },
                        ]}
                      >
                        <Ionicons
                          name="location"
                          size={14}
                          color={isDark ? colors.textSecondary : "#666"}
                        />
                      </View>
                      <Text
                        style={{
                          fontWeight: "500",
                          color: isDark ? colors.text : "#000",
                        }}
                      >
                        {property.address}, {property.city} {property.zip}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Warning / Actions */}
              <View style={{ marginTop: 20 }}>
                {isOwner ? (
                  <View style={styles.infoBoxBlue}>
                    <Text style={styles.infoTextBlue}>
                      You are the owner of this property.
                    </Text>
                  </View>
                ) : isLandlordRole ? (
                  <View style={styles.infoBoxGray}>
                    <Text style={styles.infoTextGray}>
                      Logged in as Landlord
                    </Text>
                  </View>
                ) : activeOccupancyCheck(
                    hasActiveOccupancy,
                    occupiedPropertyTitle,
                  ) ? (
                  <View style={styles.infoBoxYellow}>
                    <Text style={styles.infoTextYellow}>
                      You have an active occupancy.
                    </Text>
                  </View>
                ) : !isBookableStatus ? (
                  <View style={styles.infoBoxGray}>
                    <Text style={styles.infoTextGray}>
                      This property is not available for viewing.
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* GALLERY MODAL */}
      <Modal visible={showGalleryModal} transparent={true} animationType="fade">
        <View style={styles.galleryModal}>
          <TouchableOpacity
            style={styles.galleryClose}
            onPress={() => setShowGalleryModal(false)}
          >
            <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          <View style={styles.galleryCounter}>
            <Text style={{ color: "white", fontWeight: "bold" }}>
              {currentImageIndex + 1} / {images.length}
            </Text>
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            onMomentumScrollEnd={(e) => {
              setCurrentImageIndex(
                Math.round(e.nativeEvent.contentOffset.x / width),
              );
            }}
          >
            {images.map((img: string, i: number) => (
              <View key={i} style={{ width, height, justifyContent: "center" }}>
                <Image
                  source={{ uri: img }}
                  style={{ width, height: 500 }}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ALL REVIEWS MODAL */}
      <Modal visible={showAllReviewsModal} animationType="slide">
        <View
          style={{
            flex: 1,
            backgroundColor: isDark ? colors.background : "white",
          }}
        >
          <View
            style={{
              padding: 20,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottomWidth: 1,
              borderBottomColor: isDark ? colors.border : "#eee",
              marginTop: 40,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: isDark ? colors.text : "#000",
              }}
            >
              All Reviews ({reviews.length})
            </Text>
            <TouchableOpacity onPress={() => setShowAllReviewsModal(false)}>
              <Ionicons
                name="close"
                size={24}
                color={isDark ? colors.text : "black"}
              />
            </TouchableOpacity>
          </View>
          {/* Filter Tabs */}
          <View
            style={{
              flexDirection: "row",
              padding: 10,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? colors.border : "#f9fafb",
            }}
          >
            {["most_relevant", "recent", "highest", "lowest"].map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => setReviewFilter(f)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor:
                    reviewFilter === f
                      ? isDark
                        ? colors.text
                        : "black"
                      : isDark
                        ? colors.card
                        : "#f3f4f6",
                  marginRight: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "bold",
                    color:
                      reviewFilter === f
                        ? isDark
                          ? colors.background
                          : "white"
                        : isDark
                          ? colors.textMuted
                          : "#666",
                    textTransform: "capitalize",
                  }}
                >
                  {f.replace("_", " ")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={reviews.sort((a, b) => {
              if (reviewFilter === "recent")
                return (
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
                );
              if (reviewFilter === "highest") return b.rating - a.rating;
              if (reviewFilter === "lowest") return a.rating - b.rating;
              return 0;
            })}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ padding: 20 }}
            renderItem={({ item }) => (
              <View
                style={[styles.reviewItem, { marginTop: 0, marginBottom: 15 }]}
              >
                <View style={styles.rowBetween}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View style={styles.reviewAvatar}>
                      <Text style={{ fontWeight: "bold", color: "#666" }}>
                        {item.tenant?.first_name?.charAt(0)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.reviewerName}>
                        {item.tenant?.first_name} {item.tenant?.last_name}
                      </Text>
                      <Text style={styles.reviewDate}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.smallRatingBadge}>
                    <Ionicons name="star" size={10} color="#facc15" />
                    <Text style={{ fontSize: 10, fontWeight: "bold" }}>
                      {item.rating}
                    </Text>
                  </View>
                </View>
                <Text style={styles.reviewText}>{item.comment}</Text>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* BOOKING MODAL (Bottom Sheet) */}
      <Modal visible={showBookingOptions} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <View style={styles.rowBetween}>
              <Text
                style={[
                  styles.sectionTitle,
                  { marginBottom: 15, color: isDark ? colors.text : "#111" },
                ]}
              >
                Book Viewing
              </Text>
              <TouchableOpacity
                onPress={handleCancelBooking}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={28}
                  color={isDark ? colors.textMuted : "#ccc"}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: height * 0.7 }}
            >
              {/* CALENDAR IMPLEMENTATION COPY */}
              {(() => {
                const slotsByDate: any = {};
                timeSlots.forEach((slot) => {
                  const d = new Date(slot.start_time);
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  if (!slotsByDate[key]) slotsByDate[key] = [];
                  slotsByDate[key].push(slot);
                });

                const today = new Date();
                const todayStart = new Date(
                  today.getFullYear(),
                  today.getMonth(),
                  today.getDate(),
                );
                // Build from day 1 to avoid month-overflow skips (e.g. Mar 31 -> May).
                const viewDate = new Date(
                  today.getFullYear(),
                  today.getMonth() + calendarMonthOffset,
                  1,
                );
                const year = viewDate.getFullYear();
                const month = viewDate.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const firstDay = new Date(year, month, 1).getDay();

                const selectedSlotData = timeSlots.find(
                  (s) => s.id === selectedSlotId,
                );
                const selectedDateKey = selectedSlotData
                  ? `${new Date(selectedSlotData.start_time).getFullYear()}-${String(new Date(selectedSlotData.start_time).getMonth() + 1).padStart(2, "0")}-${String(new Date(selectedSlotData.start_time).getDate()).padStart(2, "0")}`
                  : null;

                return (
                  <View
                    style={[
                      styles.calendarContainer,
                      { backgroundColor: isDark ? colors.card : "white" },
                    ]}
                  >
                    <View style={styles.calendarHeader}>
                      <TouchableOpacity
                        onPress={() =>
                          setCalendarMonthOffset((prev) => prev - 1)
                        }
                        style={{ padding: 5 }}
                      >
                        <Ionicons
                          name="chevron-back"
                          size={20}
                          color={isDark ? colors.text : "#333"}
                        />
                      </TouchableOpacity>
                      <Text
                        style={[
                          styles.monthName,
                          { color: isDark ? colors.text : "#000" },
                        ]}
                      >
                        {viewDate.toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setCalendarMonthOffset((prev) => prev + 1)
                        }
                        style={{ padding: 5 }}
                      >
                        <Ionicons
                          name="chevron-forward"
                          size={20}
                          color={isDark ? colors.text : "#333"}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.weekRow}>
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <Text key={i} style={styles.weekDay}>
                          {d}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.daysGrid}>
                      {Array.from({ length: firstDay }).map((_, i) => (
                        <View key={`empty-${i}`} style={styles.dayCell} />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const dateObj = new Date(year, month, day);
                        const hasSlots = !!slotsByDate[dateKey];
                        const isSelected = selectedDateKey === dateKey;
                        const isPast = dateObj < todayStart;

                        return (
                          <TouchableOpacity
                            key={day}
                            disabled={!hasSlots || isPast}
                            onPress={() => {
                              const slots = slotsByDate[dateKey];
                              if (slots && slots.length > 0)
                                setSelectedSlotId(slots[0].id);
                            }}
                            style={[
                              styles.dayCell,
                              isSelected && styles.dayCellSelected,
                              (!hasSlots || isPast) && styles.dayCellDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                { color: isDark ? colors.text : "#333" },
                                isSelected && { color: "white" },
                                (!hasSlots || isPast) && {
                                  color: isDark ? "#555" : "#ccc",
                                },
                              ]}
                            >
                              {day}
                            </Text>
                            {hasSlots && !isPast && !isSelected && (
                              <View
                                style={[
                                  styles.dayDot,
                                  {
                                    backgroundColor: isDark
                                      ? colors.text
                                      : "black",
                                  },
                                ]}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {selectedDateKey && (
                      <View
                        style={[
                          styles.slotSelector,
                          {
                            borderTopColor: isDark ? colors.border : "#f3f4f6",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.label,
                            { color: isDark ? colors.textMuted : "#666" },
                          ]}
                        >
                          AVAILABLE TIMES
                        </Text>
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 5,
                          }}
                        >
                          {slotsByDate[selectedDateKey]?.map((slot: any) => {
                            const isActive = selectedSlotId === slot.id;
                            return (
                              <TouchableOpacity
                                key={slot.id}
                                onPress={() => setSelectedSlotId(slot.id)}
                                style={[
                                  styles.timeChip,
                                  {
                                    backgroundColor: isDark
                                      ? colors.surface
                                      : "#f3f4f6",
                                    borderColor: isDark
                                      ? colors.cardBorder
                                      : "#eee",
                                  },
                                  isActive && styles.timeChipActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.timeChipText,
                                    { color: isDark ? colors.text : "#333" },
                                    isActive && { color: "white" },
                                  ]}
                                >
                                  {new Date(slot.start_time).toLocaleTimeString(
                                    [],
                                    { hour: "numeric", minute: "2-digit" },
                                  )}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })()}

              <Text
                style={[
                  styles.label,
                  { marginTop: 15, color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                MESSAGE (OPTIONAL)
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#eee",
                    color: isDark ? colors.text : "#000",
                  },
                ]}
                multiline
                numberOfLines={3}
                placeholder="Requests or questions?..."
                placeholderTextColor={isDark ? colors.textMuted : "#999"}
                value={bookingNote}
                onChangeText={setBookingNote}
              />

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setTermsAccepted(!termsAccepted)}
              >
                <Ionicons
                  name={termsAccepted ? "checkbox" : "square-outline"}
                  size={20}
                  color={isDark ? colors.text : "black"}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <Text
                    style={{
                      fontSize: 12,
                      marginLeft: 8,
                      color: isDark ? colors.text : "#000",
                    }}
                  >
                    I agree to{" "}
                  </Text>
                  <TouchableOpacity onPress={openTerms}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "bold",
                        textDecorationLine: "underline",
                        color: isDark ? colors.accent : "#000",
                      }}
                    >
                      Terms & Conditions
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnBlack,
                  (!termsAccepted || !selectedSlotId) && {
                    backgroundColor: "#ccc",
                  },
                ]}
                disabled={!termsAccepted || !selectedSlotId || submitting}
                onPress={handleConfirmBooking}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.btnTextWhite}>Confirm Booking</Text>
                )}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* STICKY FOOTER */}
      {canBookViewing && (
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: isDark ? colors.surface : "white",
              borderTopColor: isDark ? colors.border : "#eee",
            },
          ]}
        >
          <TouchableOpacity style={styles.btnBlack} onPress={handleOpenBooking}>
            <Text style={styles.btnTextWhite}>Book a Viewing</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function activeOccupancyCheck(hasActive: boolean, title: string) {
  if (hasActive) return true;
  return false;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  backButton: {
    position: "absolute",
    top: 54,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  content: { padding: 20 },

  // Image
  imageContainer: { width: "100%", height: 350, position: "relative" },
  imageCounter: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  // Header
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#111",
    lineHeight: 28,
    marginBottom: 5,
  },
  price: { fontSize: 24, fontWeight: "900", color: "#111" },
  perMonth: { fontSize: 12, color: "#666", textAlign: "right" },
  address: { fontSize: 14, color: "#666", marginBottom: 20 },

  badgeRow: { flexDirection: "row", gap: 5, marginTop: 5 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
    gap: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "bold", textTransform: "uppercase" },

  // Specs
  specsContainer: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  specItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  specValue: { fontSize: 16, fontWeight: "bold", color: "#111" },
  specLabel: { fontSize: 10, color: "#666", textTransform: "uppercase" },
  specDivider: { width: 1, height: "100%", backgroundColor: "#eee" },

  // Section
  section: { marginBottom: 25 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#111",
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  description: { fontSize: 14, lineHeight: 22, color: "#444" },

  // Reviews
  ratingCard: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  bigRatingBox: { flexDirection: "row", alignItems: "center", gap: 10 },
  bigRatingValue: { fontSize: 28, fontWeight: "900", color: "#111" },
  bigRatingTotal: { fontSize: 16, color: "#ccc" },
  ratingLabel: { fontSize: 10, color: "#666", textTransform: "uppercase" },
  catRatings: { flexDirection: "row", gap: 15 },
  catItem: { alignItems: "center", gap: 2 },
  emptyReviews: {
    alignItems: "center",
    padding: 20,
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  reviewItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewerName: { fontSize: 12, fontWeight: "bold" },
  reviewDate: { fontSize: 10, color: "#999" },
  smallRatingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fefce8",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  reviewText: { fontSize: 12, color: "#444", marginTop: 8, lineHeight: 18 },
  showMoreBtn: {
    alignSelf: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    marginTop: 10,
    width: "100%",
    alignItems: "center",
    backgroundColor: "white",
  },

  // Map
  mapCard: {
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#eee",
  },
  mapPlaceholder: {
    height: 150,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
  },
  mapFooter: { padding: 10, borderTopWidth: 1, borderTopColor: "#eee" },
  linkText: {
    fontSize: 10,
    fontWeight: "bold",
    textDecorationLine: "underline",
  },

  // Landlord & Booking
  landlordCard: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  landlordAvatar: { width: 40, height: 40, borderRadius: 20 },
  landlordAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "black",
    alignItems: "center",
    justifyContent: "center",
  },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },

  infoBoxBlue: {
    backgroundColor: "#eff6ff",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbeafe",
    marginBottom: 10,
  },
  infoTextBlue: {
    color: "#1e40af",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  infoBoxGray: {
    backgroundColor: "#f3f4f6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  infoTextGray: {
    color: "#666",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  infoBoxYellow: {
    backgroundColor: "#fefce8",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fef9c3",
    marginBottom: 10,
  },
  infoTextYellowHeader: { color: "#854d0e", fontSize: 12, fontWeight: "bold" },
  infoTextYellow: { color: "#a16207", fontSize: 12 },

  btnBlack: {
    backgroundColor: "black",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnTextWhite: { color: "white", fontWeight: "bold", fontSize: 14 },

  bookingForm: {
    backgroundColor: "#f9fafb",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  slotCard: {
    backgroundColor: "white",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginRight: 8,
    minWidth: 100,
  },
  slotCardActive: { backgroundColor: "black", borderColor: "black" },
  slotDate: { fontSize: 10, fontWeight: "bold", color: "#666" },
  slotTime: { fontSize: 12, fontWeight: "bold", color: "#333" },
  label: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#666",
    letterSpacing: 0.5,
  },
  textArea: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 10,
    height: 80,
    marginVertical: 10,
    textAlignVertical: "top",
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 15 },

  // Amenities
  amenitiesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenityBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },

  // Gallery Modal
  galleryModal: { flex: 1, backgroundColor: "black" },
  galleryClose: { position: "absolute", top: 50, right: 20, zIndex: 10 },
  galleryCounter: { position: "absolute", top: 50, left: 20, zIndex: 10 },

  // New Reviews
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 15 },
  catCard: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#f9fafb",
    padding: 8,
    borderRadius: 8,
  },
  microTag: {
    fontSize: 9,
    color: "#666",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Map
  mapContainer: {
    height: 200,
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },

  // Calendar
  calendarContainer: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  monthName: { fontWeight: "bold", fontSize: 14 },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  weekDay: {
    width: 30,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "bold",
    color: "#ccc",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  dayCellSelected: { backgroundColor: "black", borderRadius: 20 },
  dayCellDisabled: { opacity: 0.3 },
  dayText: { fontSize: 12, fontWeight: "bold", color: "#333" },
  dayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "black",
    position: "absolute",
    bottom: 4,
  },

  slotSelector: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#eee",
  },
  timeChipActive: { backgroundColor: "black", borderColor: "black" },
  timeChipText: { fontSize: 12, fontWeight: "bold", color: "#333" },

  // New Location Styles
  dirInputContainer: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  dirInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  myLocBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-end",
  },

  // New Landlord Section
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    zIndex: 100,
  },
  landlordContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#eee",
  },
  hostProfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginBottom: 20,
  },
  hostAvatar: { width: 50, height: 50, borderRadius: 25 },
  hostAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "black",
    alignItems: "center",
    justifyContent: "center",
  },
  contactGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  contactBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
  },
  contactBtnText: { fontWeight: "bold", fontSize: 12 },

  // Booking Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "90%",
  },
});
