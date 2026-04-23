import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
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
import CalendarPicker from "../../components/ui/CalendarPicker";
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

const CARTO_RASTER_STYLE = JSON.stringify({
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "carto",
      type: "raster",
      source: "carto",
    },
  ],
});

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
  const [geocodedLocation, setGeocodedLocation] = useState<{lat: number, lng: number} | null>(null);
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
  const [selectedSlotDateKey, setSelectedSlotDateKey] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [bookingNote, setBookingNote] = useState("");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [bookingMode, setBookingMode] = useState<"slot" | "preferred">("slot");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
  const [showPreferredStartPicker, setShowPreferredStartPicker] =
    useState(false);
  const [showPreferredEndPicker, setShowPreferredEndPicker] = useState(false);
  const [preferredTimeError, setPreferredTimeError] = useState("");

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
    setHasActiveOccupancy(false);
    setOccupiedPropertyTitle("");

    const { data: primaryOccupancy } = await supabase
      .from("tenant_occupancies")
      .select("property:properties(title)")
      .eq("tenant_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (primaryOccupancy) {
      setHasActiveOccupancy(true);
      const p = primaryOccupancy.property as any;
      const t = Array.isArray(p) ? p[0]?.title : p?.title;
      setOccupiedPropertyTitle(t || "a property");
      return;
    }

    const { data: familyLink } = await supabase
      .from("family_members")
      .select("parent_occupancy_id")
      .eq("member_id", userId)
      .maybeSingle();

    if (familyLink?.parent_occupancy_id) {
      const { data: parentOccupancy } = await supabase
        .from("tenant_occupancies")
        .select("property:properties(title)")
        .eq("id", familyLink.parent_occupancy_id)
        .eq("status", "active")
        .maybeSingle();

      if (parentOccupancy) {
        setHasActiveOccupancy(true);
        const p = parentOccupancy.property as any;
        const t = Array.isArray(p) ? p[0]?.title : p?.title;
        setOccupiedPropertyTitle(t || "a property");
        return;
      }
    }

    if (!API_URL) return;

    try {
      const urlPrefix = API_URL.endsWith("/") ? API_URL.slice(0, -1) : API_URL;
      const response = await fetch(
        `${urlPrefix}/api/family-members?member_id=${encodeURIComponent(userId)}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      const occupancy = data?.occupancy;
      const occupancyStatus = String(occupancy?.status || "")
        .trim()
        .toLowerCase();

      if (occupancy && occupancyStatus === "active") {
        setHasActiveOccupancy(true);
        setOccupiedPropertyTitle(
          occupancy?.property?.title ||
            occupancy?.property_title ||
            "a property",
        );
      }
    } catch (error) {
      console.log("checkActiveOccupancy family lookup error:", error);
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

    if (property && !property.latitude && !property.location_link) {
      const addressParts = [
        property.barangay,
        property.city,
        property.state_province,
        property.country || "Philippines",
      ].filter(Boolean);

      if (addressParts.length > 0) {
        Location.geocodeAsync(addressParts.join(", "))
          .then((results) => {
            if (results && results.length > 0) {
              setGeocodedLocation({
                lat: results[0].latitude,
                lng: results[0].longitude,
              });
            }
          })
          .catch((err) => console.log("Geocode error", err));
      }
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

    const landlordId =
      propertyData.landlord ||
      propertyData.landlord_id ||
      propertyData.owner_id ||
      propertyData.user_id ||
      null;

    setProperty({ ...propertyData, landlord: landlordId });
    if (landlordId) {
      const { data: landlordData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", landlordId)
        .maybeSingle();
      if (landlordData) setLandlordProfile(landlordData);

      await loadLandlordRating(landlordId);
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
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    const { data: activeBookedSlots } = await supabase
      .from("bookings")
      .select("start_time, end_time")
      .eq("property_id", id)
      .eq("landlord", landlordId)
      .in("status", ["pending", "pending_approval", "approved", "accepted"]);

    if (data) {
      const bookedKeys = new Set(
        (activeBookedSlots || []).map(
          (b: any) => `${String(b.start_time)}|${String(b.end_time)}`,
        ),
      );

      const withBookingState = data.map((slot: any) => {
        const slotKey = `${String(slot.start_time)}|${String(slot.end_time)}`;
        return {
          ...slot,
          isBookedByTenant: Boolean(slot.is_booked) || bookedKeys.has(slotKey),
        };
      });

      setTimeSlots(withBookingState);
    }
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

  const formatTimeLabel = (time24: string) => {
    if (!time24) return "";
    const [hourStr, minuteStr] = time24.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return time24;
    const value = new Date();
    value.setHours(hour, minute, 0, 0);
    return value.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const toTimeString = (date: Date) => {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  const getPickerValueFromTime = (
    time24: string,
    fallbackHour: number,
    fallbackMinute: number,
  ) => {
    const base = new Date();
    const [h, m] = String(time24 || "").split(":");
    const parsedHour = Number(h);
    const parsedMinute = Number(m);

    base.setHours(
      Number.isNaN(parsedHour) ? fallbackHour : parsedHour,
      Number.isNaN(parsedMinute) ? fallbackMinute : parsedMinute,
      0,
      0,
    );

    return base;
  };

  const handlePreferredStartTimeChange = (_event: any, selected?: Date) => {
    if (!selected) {
      setShowPreferredStartPicker(false);
      return;
    }

    const start = toTimeString(selected);

    if (isPastForPreferredDate(start)) {
      setPreferredTimeError(
        "Start time cannot be in the past for the selected date.",
      );
      setShowPreferredStartPicker(false);
      return;
    }

    setPreferredTimeError("");
    setPreferredStartTime(start);
    setShowPreferredStartPicker(false);

    if (preferredEndTime && preferredEndTime <= start) {
      setPreferredEndTime("");
    }
  };

  const handlePreferredEndTimeChange = (_event: any, selected?: Date) => {
    if (!selected) {
      setShowPreferredEndPicker(false);
      return;
    }

    const end = toTimeString(selected);

    if (isPastForPreferredDate(end)) {
      setPreferredTimeError(
        "End time cannot be in the past for the selected date.",
      );
      setShowPreferredEndPicker(false);
      return;
    }

    if (preferredStartTime && end <= preferredStartTime) {
      setPreferredTimeError("End time should be later than start time.");
      setShowPreferredEndPicker(false);
      return;
    }

    setPreferredTimeError("");
    setPreferredEndTime(end);
    setShowPreferredEndPicker(false);
  };

  const parsePreferredDateTime = (dateValue: string, timeValue: string) => {
    const [yearStr, monthStr, dayStr] = dateValue.split("-");
    const [hourStr, minuteStr] = timeValue.split(":");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) {
      return null;
    }

    const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const getRoundedNow = (minuteStep = 5) => {
    const now = new Date();
    now.setSeconds(0, 0);
    const minutes = now.getMinutes();
    const remainder = minutes % minuteStep;
    if (remainder !== 0) {
      now.setMinutes(minutes + (minuteStep - remainder));
    }
    return now;
  };

  const isPreferredDateToday = () => {
    if (!preferredDate) return false;
    const [yearStr, monthStr, dayStr] = preferredDate.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);

    if ([year, month, day].some((value) => Number.isNaN(value))) {
      return false;
    }

    const now = new Date();
    return (
      now.getFullYear() === year &&
      now.getMonth() + 1 === month &&
      now.getDate() === day
    );
  };

  const isPastForPreferredDate = (time24: string) => {
    if (!preferredDate || !time24) return false;
    const value = parsePreferredDateTime(preferredDate, time24);
    if (!value) return true;
    return value.getTime() < Date.now();
  };

  const getPreferredStartPickerValue = () => {
    const startValue = getPickerValueFromTime(preferredStartTime, 9, 0);
    if (!isPreferredDateToday()) return startValue;

    const minNow = getRoundedNow();
    return startValue < minNow ? minNow : startValue;
  };

  const getPreferredEndPickerValue = () => {
    const minNow = getRoundedNow();

    if (preferredEndTime) {
      const endValue = getPickerValueFromTime(preferredEndTime, 10, 0);
      if (!isPreferredDateToday()) return endValue;
      return endValue < minNow ? minNow : endValue;
    }

    if (preferredStartTime) {
      const basedOnStart = getPickerValueFromTime(preferredStartTime, 10, 0);
      basedOnStart.setMinutes(basedOnStart.getMinutes() + 30);
      if (!isPreferredDateToday()) return basedOnStart;
      return basedOnStart < minNow ? minNow : basedOnStart;
    }

    return isPreferredDateToday() ? minNow : getPickerValueFromTime("", 10, 0);
  };

  const openBookingModal = (mode: "slot" | "preferred") => {
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
      Alert.alert("Login Required", "You need to login first to book a viewing.", [
        { 
          text: "OK", 
          onPress: () => router.push(`/login?returnTo=${encodeURIComponent(`/properties/${id}`)}` as any) 
        },
        { text: "Cancel", style: "cancel" }
      ]);
      return;
    }

    setBookingMode(mode);
    setShowBookingOptions(true);
    setBookingNote("");
    setTermsAccepted(false);
    setSelectedSlotDateKey("");

    if (mode === "slot") {
      setPreferredDate("");
      setPreferredStartTime("");
      setPreferredEndTime("");
      setPreferredTimeError("");
      setShowPreferredStartPicker(false);
      setShowPreferredEndPicker(false);
      return;
    }

    setSelectedSlotId("");
    setCalendarMonthOffset(0);
    setPreferredDate("");
    setPreferredStartTime("");
    setPreferredEndTime("");
    setPreferredTimeError("");
    setShowPreferredStartPicker(false);
    setShowPreferredEndPicker(false);
  };

  const handleOpenBooking = () => {
    openBookingModal("slot");
  };

  const handleOpenPreferredBooking = () => {
    openBookingModal("preferred");
  };

  const handleCancelBooking = () => {
    if (submitting) return;
    setShowBookingOptions(false);
    setBookingMode("slot");
    setSelectedSlotId("");
    setSelectedSlotDateKey("");
    setBookingNote("");
    setTermsAccepted(false);
    setPreferredDate("");
    setPreferredStartTime("");
    setPreferredEndTime("");
    setPreferredTimeError("");
    setShowPreferredStartPicker(false);
    setShowPreferredEndPicker(false);
  };

  const confirmOneHourWarning = async (startAt: Date) => {
    const diffMs = startAt.getTime() - Date.now();
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes > 60 || diffMinutes <= 0) return true;

    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Warning",
        "This viewing is scheduled within 1 hour from now. Do you want to continue?",
        [
          {
            text: "Back",
            style: "cancel",
            onPress: () => resolve(false),
          },
          {
            text: "Continue",
            onPress: () => resolve(true),
          },
        ],
      );
    });
  };

  const handleConfirmBooking = async () => {
    const isPreferredMode = bookingMode === "preferred";

    if (!isPreferredMode && !selectedSlotId) {
      return Alert.alert("Error", "Please select a viewing time.");
    }

    let preferredStartAt: Date | null = null;
    let preferredEndAt: Date | null = null;
    let slotForBooking: any = null;

    if (isPreferredMode) {
      if (!preferredDate || !preferredStartTime || !preferredEndTime) {
        return Alert.alert(
          "Error",
          "Please select your preferred date, start time, and end time.",
        );
      }

      preferredStartAt = parsePreferredDateTime(
        preferredDate,
        preferredStartTime,
      );
      preferredEndAt = parsePreferredDateTime(preferredDate, preferredEndTime);

      if (!preferredStartAt || !preferredEndAt) {
        return Alert.alert(
          "Error",
          "Invalid preferred schedule. Please choose another date and time range.",
        );
      }

      if (preferredEndAt <= preferredStartAt) {
        return Alert.alert(
          "Error",
          "End time should be later than the start time.",
        );
      }

      if (preferredStartAt.getTime() < Date.now()) {
        return Alert.alert(
          "Error",
          "Preferred schedule must be set in the future.",
        );
      }

      const confirmedPreferred = await confirmOneHourWarning(preferredStartAt);
      if (!confirmedPreferred) return;
    } else {
      slotForBooking = timeSlots.find(
        (s) => String(s.id) === String(selectedSlotId),
      );
      if (!slotForBooking) {
        return Alert.alert("Error", "Time slot not found.");
      }

      const slotStart = new Date(slotForBooking.start_time);
      const confirmedSlot = await confirmOneHourWarning(slotStart);
      if (!confirmedSlot) return;
    }

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
      const { data: globalActiveRows } = await supabase
        .from("bookings")
        .select("id")
        .eq("tenant", session.user.id)
        .in("status", ["pending", "pending_approval", "approved", "accepted"]);

      const globalActive = (globalActiveRows || [])[0];

      if (globalActive) {
        throw new Error(
          "You already have an active viewing request. Cancel it first.",
        );
      }

      let newBooking: any = null;

      if (isPreferredMode && preferredStartAt && preferredEndAt) {
        const preferredStartIso = preferredStartAt.toISOString();
        const preferredEndIso = preferredEndAt.toISOString();

        const { data: insertedBooking, error: bookingError } = await supabase
          .from("bookings")
          .insert({
            property_id: id,
            tenant: session.user.id,
            landlord: property.landlord,
            start_time: preferredStartIso,
            end_time: preferredEndIso,
            booking_date: preferredStartIso,
            time_slot_id: null,
            status: "pending",
            notes:
              bookingNote ||
              `Preferred schedule requested: ${preferredDate} ${formatTimeLabel(preferredStartTime)} - ${formatTimeLabel(preferredEndTime)}`,
          })
          .select()
          .single();

        if (bookingError) {
          throw bookingError;
        }

        newBooking = insertedBooking;
      } else {
        // 3. Create Booking
        const slot = slotForBooking;

        const { data: latestSlot, error: latestSlotError } = await supabase
          .from("available_time_slots")
          .select("id, landlord_id, start_time, end_time, is_booked")
          .eq("id", slot.id)
          .maybeSingle();

        if (latestSlotError || !latestSlot || latestSlot.is_booked) {
          await loadTimeSlots(property.landlord);
          throw new Error(
            "The selected schedule is not available anymore. Please choose another slot.",
          );
        }

        let didReserveSlot = false;

        // Prefer lock by exact slot ID, then fallback to matching time range.
        const { data: lockedByIdRows, error: lockByIdError } = await supabase
          .from("available_time_slots")
          .update({ is_booked: true })
          .eq("id", latestSlot.id)
          .eq("is_booked", false)
          .select("id");

        if (!lockByIdError && lockedByIdRows && lockedByIdRows.length > 0) {
          didReserveSlot = true;
        }

        if (!didReserveSlot) {
          const { data: lockedByRangeRows, error: lockByRangeError } =
            await supabase
              .from("available_time_slots")
              .update({ is_booked: true })
              .eq("landlord_id", latestSlot.landlord_id)
              .eq("start_time", latestSlot.start_time)
              .eq("end_time", latestSlot.end_time)
              .eq("is_booked", false)
              .select("id");

          if (
            !lockByRangeError &&
            lockedByRangeRows &&
            lockedByRangeRows.length > 0
          ) {
            didReserveSlot = true;
          } else {
            const { data: slotConflictRows, error: slotConflictError } =
              await supabase
                .from("bookings")
                .select("id")
                .eq("property_id", id)
                .eq("landlord", property.landlord)
                .eq("start_time", latestSlot.start_time)
                .eq("end_time", latestSlot.end_time)
                .in("status", [
                  "pending",
                  "pending_approval",
                  "approved",
                  "accepted",
                ]);

            if (slotConflictError) {
              throw slotConflictError;
            }

            const slotConflict = (slotConflictRows || [])[0];

            if (slotConflict) {
              await loadTimeSlots(property.landlord);
              throw new Error(
                "Failed to reserve the selected schedule. Please choose another slot.",
              );
            }

            // If no active booking conflict exists, continue and rely on booking record.
            console.log(
              "Slot lock fallback: proceeding without is_booked lock",
              lockByIdError || lockByRangeError || "no rows updated",
            );
          }
        }

        const { data: insertedBooking, error: bookingError } = await supabase
          .from("bookings")
          .insert({
            property_id: id,
            tenant: session.user.id,
            landlord: property.landlord,
            start_time: latestSlot.start_time,
            end_time: latestSlot.end_time,
            booking_date: latestSlot.start_time,
            time_slot_id: latestSlot.id,
            status: "pending",
            notes: bookingNote || "No message provided",
          })
          .select()
          .single();

        if (bookingError) {
          if (didReserveSlot) {
            await supabase
              .from("available_time_slots")
              .update({ is_booked: false })
              .eq("landlord_id", latestSlot.landlord_id)
              .eq("start_time", latestSlot.start_time)
              .eq("end_time", latestSlot.end_time);
          }
          throw bookingError;
        }

        // Best-effort sync for schemas/policies where lock fallback path was used.
        if (!didReserveSlot) {
          await supabase
            .from("available_time_slots")
            .update({ is_booked: true })
            .eq("id", latestSlot.id);
        }

        newBooking = insertedBooking;
      }

      // 5. Notifications (best-effort, non-blocking)
      if (property.landlord) {
        // In-App (Supabase) - REMOVED due to RLS. Handled via /api/notify if backend supports.
        // await createNotification(
        //   property.landlord,
        //   'new_booking',
        //   `${profile?.first_name || 'A tenant'} requested a viewing for ${property.title}.`,
        //   { actor: session.user.id }
        // );

        // Notify API (Email/System) - do not block booking completion.
        if (API_URL) {
          void (async () => {
            try {
              const notifyTypes = [
                "new_booking",
                "booking_request",
                "booking_new",
              ];

              for (const notifyType of notifyTypes) {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);

                try {
                  const notifyRes = await fetch(`${API_URL}/api/notify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      type: notifyType,
                      recordId: newBooking.id,
                      bookingId: newBooking.id,
                      actorId: session.user.id,
                    }),
                    signal: controller.signal,
                  });

                  if (notifyRes.ok) {
                    clearTimeout(timeout);
                    break;
                  }
                } finally {
                  clearTimeout(timeout);
                }
              }
            } catch (e) {
              console.log("Notify API Error:", e);
            }
          })();
        }

        // SMS Notification
        if (API_URL && landlordProfile?.phone) {
          try {
            void fetch(`${API_URL}/api/send-sms`, {
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

      Alert.alert(
        "Success",
        isPreferredMode
          ? "Preferred schedule request sent successfully!"
          : "Viewing request sent successfully!",
      );
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
        : geocodedLocation
          ? geocodedLocation.lat
          : "";
    const lng = hasStoredCoords
      ? property.longitude
      : linkCoords
        ? linkCoords.lng
        : geocodedLocation
          ? geocodedLocation.lng
          : "";

    router.push({
      pathname: "/getDirections",
      params: {
        to:
          fullLocation ||
          [property.address, cityWithState].filter(Boolean).join(", "),
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
  const cityWithState = [property.city, property.state_province]
    .filter(Boolean)
    .join(", ");
  const fullLocation = [
    property.address,
    cityWithState,
    property.country,
  ]
    .filter(Boolean)
    .join(", ");

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
      <Stack.Screen options={{ headerShown: false }} />
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
                        backgroundColor: isDark ? 'rgba(217, 119, 6, 0.2)' : "#fffbeb",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderColor: isDark ? 'rgba(217, 119, 6, 0.5)' : "#fde68a",
                        borderWidth: 1,
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: isDark ? "#fbbf24" : "#d97706",
                            textTransform: "uppercase",
                          }}
                        >
                          Top Rated
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "bold",
                            color: isDark ? "#fcd34d" : "#92400e",
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
                        backgroundColor: isDark ? 'rgba(225, 29, 72, 0.2)' : "#fff1f2",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderColor: isDark ? 'rgba(225, 29, 72, 0.5)' : "#fecdd3",
                        borderWidth: 1,
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "bold",
                            color: isDark ? "#f43f5e" : "#e11d48",
                            textTransform: "uppercase",
                          }}
                        >
                          Most Favorite
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "bold",
                            color: isDark ? "#fb7185" : "#9f1239",
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
              {fullLocation || "Location not set"}
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
            <View
              style={[
                styles.specDivider,
                { backgroundColor: isDark ? colors.border : "#eee" },
              ]}
            />
            <View style={styles.specItem}>
              <Ionicons
                name="people-outline"
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
                  {property.max_occupancy === 0
                    ? "No Limits"
                    : property.max_occupancy}
                </Text>
                <Text
                  style={[
                    styles.specLabel,
                    { color: isDark ? colors.textMuted : "#666" },
                  ]}
                >
                  {property.max_occupancy === 0 ? "" : "Good for"}
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
                    {includesAdvance
                      ? `₱${Number(property.advance_amount || property.price || 0).toLocaleString()}`
                      : "Excluded"}
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
                    {includesSecurityDeposit
                      ? `₱${Number(property.security_deposit_amount || property.price || 0).toLocaleString()}`
                      : "Excluded"}
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
                  const mapCoords =
                    property.latitude && property.longitude
                      ? { lat: property.latitude, lng: property.longitude }
                      : extractCoordinates(property.location_link) || geocodedLocation;

                  if (!mapCoords || Platform.OS === "web") {
                    return (
                      <View style={styles.center}>
                        <Text style={{ color: "#666" }}>Map not available</Text>
                      </View>
                    );
                  }

                  const centerCoord = [
                    mapCoords?.lng || 123.8854,
                    mapCoords?.lat || 10.3157,
                  ];

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
                  {fullLocation || "Location not set"}
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
                        {fullLocation || "Location not set"}
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
                {bookingMode === "preferred"
                  ? "Set a Preferred Schedule"
                  : "Book Viewing"}
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

            <View
              style={[
                styles.bookingModeRow,
                {
                  backgroundColor: isDark ? colors.card : "#f3f4f6",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => setBookingMode("slot")}
                style={[
                  styles.bookingModeBtn,
                  bookingMode === "slot" && [
                    styles.bookingModeBtnActive,
                    { backgroundColor: isDark ? colors.text : "#111" },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.bookingModeBtnText,
                    { color: isDark ? colors.textMuted : "#6b7280" },
                    bookingMode === "slot" && {
                      color: isDark ? colors.background : "white",
                    },
                  ]}
                >
                  Available Slots
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setBookingMode("preferred");
                  setSelectedSlotId("");
                  setSelectedSlotDateKey("");
                  setPreferredTimeError("");
                  setShowPreferredStartPicker(false);
                  setShowPreferredEndPicker(false);
                }}
                style={[
                  styles.bookingModeBtn,
                  bookingMode === "preferred" && [
                    styles.bookingModeBtnActive,
                    { backgroundColor: isDark ? colors.text : "#111" },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.bookingModeBtnText,
                    { color: isDark ? colors.textMuted : "#6b7280" },
                    bookingMode === "preferred" && {
                      color: isDark ? colors.background : "white",
                    },
                  ]}
                >
                  Preferred Schedule
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: height * 0.7 }}
            >
              {bookingMode === "slot" && (
                <>
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
                      (s) => String(s.id) === String(selectedSlotId),
                    );
                    const selectedDateKeyFromSlot = selectedSlotData
                      ? `${new Date(selectedSlotData.start_time).getFullYear()}-${String(new Date(selectedSlotData.start_time).getMonth() + 1).padStart(2, "0")}-${String(new Date(selectedSlotData.start_time).getDate()).padStart(2, "0")}`
                      : null;
                    const selectedDateKey =
                      selectedSlotDateKey || selectedDateKeyFromSlot;

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
                            const daySlots = slotsByDate[dateKey] || [];
                            const hasSlots = daySlots.length > 0;
                            const availableCount = daySlots.filter(
                              (slot: any) => !slot.isBookedByTenant,
                            ).length;
                            const isFullyBooked =
                              hasSlots && availableCount === 0;
                            const isSelected = selectedDateKey === dateKey;
                            const isPast = dateObj < todayStart;

                            return (
                              <TouchableOpacity
                                key={day}
                                disabled={!hasSlots || isPast}
                                onPress={() => {
                                  const slots = slotsByDate[dateKey];
                                  setSelectedSlotDateKey(dateKey);
                                  if (slots && slots.length > 0) {
                                    const firstAvailable = slots.find(
                                      (slot: any) => !slot.isBookedByTenant,
                                    );
                                    setSelectedSlotId(
                                      firstAvailable
                                        ? String(firstAvailable.id)
                                        : "",
                                    );
                                  }
                                }}
                                style={[
                                  styles.dayCell,
                                  isSelected && styles.dayCellSelected,
                                  (!hasSlots || isPast) &&
                                    styles.dayCellDisabled,
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
                                      isFullyBooked
                                        ? styles.dayDotBooked
                                        : styles.dayDotAvailable,
                                    ]}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <View
                          style={[
                            styles.calendarLegend,
                            {
                              borderTopColor: isDark
                                ? colors.border
                                : "#f3f4f6",
                            },
                          ]}
                        >
                          <View style={styles.legendItem}>
                            <View
                              style={[styles.legendDot, styles.dayDotAvailable]}
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: isDark
                                  ? colors.textSecondary
                                  : "#374151",
                              }}
                            >
                              Available
                            </Text>
                          </View>
                          <View style={styles.legendItem}>
                            <View
                              style={[styles.legendDot, styles.dayDotBooked]}
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: isDark
                                  ? colors.textSecondary
                                  : "#374151",
                              }}
                            >
                              Fully Booked
                            </Text>
                          </View>
                        </View>

                        {selectedDateKey && (
                          <View
                            style={[
                              styles.slotSelector,
                              {
                                borderTopColor: isDark
                                  ? colors.border
                                  : "#f3f4f6",
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
                              {[...(slotsByDate[selectedDateKey] || [])]
                                .sort(
                                  (a: any, b: any) =>
                                    new Date(a.start_time).getTime() -
                                    new Date(b.start_time).getTime(),
                                )
                                .map((slot: any) => {
                                  const sortedDaySlots = [
                                    ...(slotsByDate[selectedDateKey] || []),
                                  ].sort(
                                    (a: any, b: any) =>
                                      new Date(a.start_time).getTime() -
                                      new Date(b.start_time).getTime(),
                                  );
                                  const slotStart = new Date(slot.start_time);
                                  const slotEnd = new Date(slot.end_time);
                                  const isMorning = slotStart.getHours() < 12;
                                  const periodSlots = sortedDaySlots.filter(
                                    (s: any) => {
                                      const h = new Date(
                                        s.start_time,
                                      ).getHours();
                                      return isMorning ? h < 12 : h >= 12;
                                    },
                                  );
                                  const periodIndex =
                                    periodSlots.findIndex(
                                      (s: any) =>
                                        String(s.id) === String(slot.id),
                                    ) + 1;
                                  const slotLabel = `${isMorning ? "AM" : "PM"} ${Math.max(periodIndex, 1)}`;
                                  const isActive =
                                    String(selectedSlotId) === String(slot.id);
                                  const isBooked = !!slot.isBookedByTenant;

                                  return (
                                    <TouchableOpacity
                                      key={slot.id}
                                      disabled={isBooked}
                                      onPress={() =>
                                        !isBooked &&
                                        setSelectedSlotId(String(slot.id))
                                      }
                                      style={[
                                        styles.timeChip,
                                        {
                                          backgroundColor: isBooked
                                            ? isDark
                                              ? "#3b1010"
                                              : "#fef2f2"
                                            : isDark
                                              ? colors.surface
                                              : "#f3f4f6",
                                          borderColor: isBooked
                                            ? "#ef4444"
                                            : isDark
                                              ? colors.cardBorder
                                              : "#eee",
                                        },
                                        isActive &&
                                          !isBooked &&
                                          styles.timeChipActive,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.timeChipText,
                                          {
                                            color: isBooked
                                              ? "#ef4444"
                                              : isDark
                                                ? colors.text
                                                : "#333",
                                          },
                                          isActive &&
                                            !isBooked && { color: "white" },
                                        ]}
                                      >
                                        {slotLabel} •{" "}
                                        {slotStart.toLocaleTimeString([], {
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                        {" - "}
                                        {slotEnd.toLocaleTimeString([], {
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                        {isBooked ? " • BOOKED" : ""}
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
                </>
              )}

              {bookingMode === "preferred" && (
                <View
                  style={[
                    styles.calendarContainer,
                    { backgroundColor: isDark ? colors.card : "white" },
                  ]}
                >
                  <Text
                    style={[
                      styles.label,
                      {
                        marginBottom: 8,
                        color: isDark ? colors.textMuted : "#666",
                      },
                    ]}
                  >
                    PREFERRED DATE
                  </Text>

                  <CalendarPicker
                    selectedDate={preferredDate}
                    onDateSelect={(date) => {
                      setPreferredDate(date);
                      setPreferredStartTime("");
                      setPreferredEndTime("");
                      setPreferredTimeError("");
                      setShowPreferredStartPicker(false);
                      setShowPreferredEndPicker(false);
                    }}
                    allowPastDates={false}
                    isDark={isDark}
                    themeColors={{
                      card: colors.card,
                      border: colors.cardBorder,
                      text: colors.text,
                      textMuted: colors.textMuted,
                      background: colors.background,
                    }}
                  />

                  {preferredDate ? (
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
                        START TIME
                      </Text>

                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === "android") {
                            DateTimePickerAndroid.open({
                              value: getPreferredStartPickerValue(),
                              mode: "time",
                              onChange: handlePreferredStartTimeChange,
                            });
                          } else {
                            setShowPreferredStartPicker((prev) => !prev);
                          }
                        }}
                        style={[
                          styles.timeInputBtn,
                          {
                            backgroundColor: isDark
                              ? colors.surface
                              : "#f9fafb",
                            borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                          },
                        ]}
                      >
                        <Ionicons
                          name="time-outline"
                          size={18}
                          color={isDark ? colors.text : "#111"}
                        />
                        <Text
                          style={[
                            styles.timeInputText,
                            { color: isDark ? colors.text : "#111" },
                          ]}
                        >
                          {preferredStartTime
                            ? formatTimeLabel(preferredStartTime)
                            : "Tap to input start time"}
                        </Text>
                      </TouchableOpacity>

                      {Platform.OS === "ios" && showPreferredStartPicker && (
                        <DateTimePicker
                          value={getPreferredStartPickerValue()}
                          mode="time"
                          display="spinner"
                          themeVariant={isDark ? "dark" : "light"}
                          onChange={handlePreferredStartTimeChange}
                        />
                      )}

                      <Text
                        style={[
                          styles.label,
                          {
                            color: isDark ? colors.textMuted : "#666",
                            marginTop: 12,
                          },
                        ]}
                      >
                        END TIME
                      </Text>

                      <TouchableOpacity
                        disabled={!preferredStartTime}
                        onPress={() => {
                          if (Platform.OS === "android") {
                            DateTimePickerAndroid.open({
                              value: getPreferredEndPickerValue(),
                              mode: "time",
                              onChange: handlePreferredEndTimeChange,
                            });
                          } else {
                            setShowPreferredEndPicker((prev) => !prev);
                          }
                        }}
                        style={[
                          styles.timeInputBtn,
                          {
                            backgroundColor: isDark
                              ? colors.surface
                              : "#f9fafb",
                            borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                          },
                          !preferredStartTime && styles.dayCellDisabled,
                        ]}
                      >
                        <Ionicons
                          name="time-outline"
                          size={18}
                          color={isDark ? colors.text : "#111"}
                        />
                        <Text
                          style={[
                            styles.timeInputText,
                            { color: isDark ? colors.text : "#111" },
                            !preferredStartTime && {
                              color: isDark ? "#6b7280" : "#9ca3af",
                            },
                          ]}
                        >
                          {preferredEndTime
                            ? formatTimeLabel(preferredEndTime)
                            : preferredStartTime
                              ? "Tap to input end time"
                              : "Select start time first"}
                        </Text>
                      </TouchableOpacity>

                      {Platform.OS === "ios" && showPreferredEndPicker && (
                        <DateTimePicker
                          value={getPreferredEndPickerValue()}
                          mode="time"
                          display="spinner"
                          themeVariant={isDark ? "dark" : "light"}
                          onChange={handlePreferredEndTimeChange}
                        />
                      )}

                      {!!preferredTimeError && (
                        <Text
                          style={[
                            styles.preferredErrorText,
                            { color: isDark ? "#fca5a5" : "#b91c1c" },
                          ]}
                        >
                          {preferredTimeError}
                        </Text>
                      )}

                      {preferredStartTime && preferredEndTime && (
                        <Text
                          style={[
                            styles.preferredRangeText,
                            {
                              color: isDark ? colors.textSecondary : "#374151",
                            },
                          ]}
                        >
                          Selected range: {formatTimeLabel(preferredStartTime)}{" "}
                          - {formatTimeLabel(preferredEndTime)}
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text
                      style={{
                        marginTop: 12,
                        fontSize: 12,
                        color: isDark ? colors.textMuted : "#6b7280",
                      }}
                    >
                      Select a date first to choose your preferred time range.
                    </Text>
                  )}
                </View>
              )}

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
                  (!termsAccepted ||
                    (bookingMode === "slot"
                      ? !selectedSlotId
                      : !preferredDate ||
                        !preferredStartTime ||
                        !preferredEndTime ||
                        !!preferredTimeError)) && {
                    backgroundColor: "#ccc",
                  },
                ]}
                disabled={
                  !termsAccepted ||
                  submitting ||
                  (bookingMode === "slot"
                    ? !selectedSlotId
                    : !preferredDate ||
                      !preferredStartTime ||
                      !preferredEndTime ||
                      !!preferredTimeError)
                }
                onPress={handleConfirmBooking}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.btnTextWhite}>
                    {bookingMode === "preferred"
                      ? "Submit Preferred Schedule"
                      : "Confirm Viewing schedule"}
                  </Text>
                )}
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </KeyboardAvoidingView>

          {submitting && (
            <View style={styles.bookingSubmittingOverlay}>
              <View
                style={[
                  styles.bookingSubmittingCard,
                  {
                    backgroundColor: isDark ? colors.surface : "white",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  },
                ]}
              >
                <ActivityIndicator
                  size="large"
                  color={isDark ? colors.text : "#111"}
                />
                <Text
                  style={[
                    styles.bookingSubmittingText,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Please wait, we are confirming your booking. Please do not
                  close this app.
                </Text>
              </View>
            </View>
          )}
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
          {/* <TouchableOpacity
            style={[
              styles.preferredFooterBtn,
              {
                borderColor: isDark ? colors.cardBorder : "#d1d5db",
                backgroundColor: isDark ? colors.card : "#f9fafb",
              },
            ]}
            onPress={handleOpenPreferredBooking}
          >
            <Text
              style={[
                styles.preferredFooterText,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Set a Preferred Schedule
            </Text>
          </TouchableOpacity> */}
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
  dayDotAvailable: {
    backgroundColor: "#16a34a",
  },
  dayDotBooked: {
    backgroundColor: "#ef4444",
  },
  calendarLegend: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
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
  bookingSubmittingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  bookingSubmittingCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  bookingSubmittingText: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  preferredFooterBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  preferredFooterText: {
    fontWeight: "700",
    fontSize: 14,
  },
  bookingModeRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  bookingModeBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingModeBtnActive: {
    backgroundColor: "#111",
  },
  bookingModeBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  timeInputBtn: {
    marginTop: 6,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  timeInputText: {
    fontSize: 13,
    fontWeight: "600",
  },
  preferredRangeText: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "700",
  },
  preferredErrorText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "600",
  },
});
