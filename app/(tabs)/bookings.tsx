import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
    DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import GuestGuard from "../../components/auth/GuestGuard";
import CalendarPicker from "../../components/ui/CalendarPicker";
import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { downloadExcel } from "../../lib/exportExcel";
import { useTheme } from "../../lib/theme";

// Optional: Define your backend URL if you want to send actual emails like the Next.js app
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
const BOOKINGS_LOADING_SKELETON_COUNT = 4;
const DEFAULT_PAID_MOVE_IN_ITEMS = {
  rent: false,
  securityDeposit: false,
  advance: false,
};

const joinMoveInLabels = (labels: string[]) => {
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

const buildMoveInDescription = ({
  rentAmount,
  advanceAmount,
  securityDepositAmount,
  paidOffline = false,
}: {
  rentAmount: number;
  advanceAmount: number;
  securityDepositAmount: number;
  paidOffline?: boolean;
}) => {
  const parts: string[] = [];
  if (rentAmount > 0) parts.push("Rent");
  if (advanceAmount > 0) parts.push("Advance");
  if (securityDepositAmount > 0) parts.push("Security Deposit");

  const base = parts.length
    ? `Move-in Payment (${parts.join(" + ")})`
    : "Move-in Payment";

  return paidOffline ? `${base} - Paid Offline` : base;
};

function SkeletonBlock({
  width = "100%",
  height,
  borderRadius = 10,
  backgroundColor,
  style,
}: {
  width?: number | string;
  height: number;
  borderRadius?: number;
  backgroundColor: string;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor,
          opacity,
        },
        style,
      ]}
    />
  );
}

export default function Bookings() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const skeletonColor = isDark ? "rgba(148, 163, 184, 0.22)" : "#e5e7eb";

  // -- State --
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all");

  // Modal State
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<any[]>([]);
  const [bookingSlotsLoading, setBookingSlotsLoading] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [selectedBookingDateKey, setSelectedBookingDateKey] = useState("");
  const [bookingCalendarMonthOffset, setBookingCalendarMonthOffset] =
    useState(0);
  const [bookingMode, setBookingMode] = useState<"slot" | "preferred">("slot");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
  const [showPreferredStartPicker, setShowPreferredStartPicker] =
    useState(false);
  const [showPreferredEndPicker, setShowPreferredEndPicker] = useState(false);
  const [preferredTimeError, setPreferredTimeError] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<any>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [bookingToReject, setBookingToReject] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  // --- ASSIGN TENANT STATES ---
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignBooking, setAssignBooking] = useState<any>(null);
  const [availableProperties, setAvailableProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [wifiDueDay, setWifiDueDay] = useState("");
  const [waterDueDay, setWaterDueDay] = useState("");
  const [electricityDueDay, setElectricityDueDay] = useState("");
  const [paidMoveInItems, setPaidMoveInItems] = useState(
    DEFAULT_PAID_MOVE_IN_ITEMS,
  );
  const togglePaidMoveInItem = (
    key: keyof typeof DEFAULT_PAID_MOVE_IN_ITEMS,
  ) => {
    setPaidMoveInItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [penaltyDetails, setPenaltyDetails] = useState("");
  const [contractFile, setContractFile] = useState<any>(null);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [showAssignWarning, setShowAssignWarning] = useState(false);
  const [showWifiDayPicker, setShowWifiDayPicker] = useState(false);
  const [showWaterDayPicker, setShowWaterDayPicker] = useState(false);
  const [showElectricityDayPicker, setShowElectricityDayPicker] =
    useState(false);
  const [assignStep, setAssignStep] = useState(0);
  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const ASSIGN_STEPS = [
    { label: "Property", icon: "1" },
    { label: "Contract", icon: "2" },
    { label: "Documents", icon: "3" },
    { label: "Utilities", icon: "4" },
  ];

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (session && profile) {
      loadBookings(session.user.id, profile.role, filter);

      const scheduleRealtimeReload = () => {
        if (realtimeReloadTimerRef.current) {
          clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = setTimeout(() => {
          loadBookings(session.user.id, profile.role, filter);
        }, 180);
      };

      const channel = supabase
        .channel("bookings_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings" },
          scheduleRealtimeReload,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "available_time_slots" },
          scheduleRealtimeReload,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "properties" },
          scheduleRealtimeReload,
        );

      if (String(profile.role || "").toLowerCase() === "tenant") {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "applications",
            filter: `tenant=eq.${session.user.id}`,
          },
          scheduleRealtimeReload,
        );
      }

      channel.subscribe();

      return () => {
        if (realtimeReloadTimerRef.current) {
          clearTimeout(realtimeReloadTimerRef.current);
          realtimeReloadTimerRef.current = null;
        }
        supabase.removeChannel(channel);
      };
    }
  }, [session, profile, filter]);

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    setSession(session);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    setProfile(profile);

    loadBookings(session.user.id, profile?.role, "all");
  };

  // --- HELPER: Ported from Next.js ---
  function getTimeSlotInfo(startTime: string, endTime?: string) {
    if (!startTime)
      return {
        icon: "calendar-outline" as any,
        label: "Not Scheduled",
        time: "Select a time",
        color: "#9ca3af",
      };

    const date = new Date(startTime);
    const endDate = endTime ? new Date(endTime) : null;
    const hour = date.getHours();
    const min = date.getMinutes();
    if (hour === 8 && min === 30)
      return {
        icon: "sunny-outline" as any,
        label: "AM 1",
        time: "8:30 - 10:00 AM",
        color: "#f59e0b",
      };
    if (hour === 10 && min === 0)
      return {
        icon: "sunny" as any,
        label: "AM 2",
        time: "10:00 - 11:30 AM",
        color: "#f97316",
      };
    if (hour === 13 && min === 0)
      return {
        icon: "partly-sunny-outline" as any,
        label: "PM 1",
        time: "1:00 - 2:30 PM",
        color: "#6366f1",
      };
    if (hour === 14 && min === 30)
      return {
        icon: "moon-outline" as any,
        label: "PM 2",
        time: "2:30 - 4:00 PM",
        color: "#8b5cf6",
      };
    // Legacy fallback
    if (hour < 12)
      return {
        icon: "sunny-outline" as any,
        label: "Morning",
        time: endDate
          ? `${date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })} - ${endDate.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}`
          : `${hour}:${min.toString().padStart(2, "0")} AM`,
        color: "#f59e0b",
      };
    return {
      icon: "partly-sunny-outline" as any,
      label: "Afternoon",
      time: endDate
        ? `${date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })} - ${endDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}`
        : `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")} PM`,
      color: "#6366f1",
    };
  }

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

  const autoCancelExpiredBookings = async (userId: string, role: string) => {
    try {
      const nowIso = new Date().toISOString();
      const activeStatuses = [
        "pending",
        "pending_approval",
        "approved",
        "accepted",
      ];

      if (role === "landlord") {
        const { data: myProperties } = await supabase
          .from("properties")
          .select("id")
          .eq("landlord", userId);

        const propIds = (myProperties || [])
          .map((p: any) => p.id)
          .filter(Boolean);
        if (propIds.length === 0) return;

        const { data: expired } = await supabase
          .from("bookings")
          .select("id, time_slot_id")
          .in("property_id", propIds)
          .in("status", activeStatuses)
          .lt("booking_date", nowIso);

        if (!expired || expired.length === 0) return;

        const expiredIds = expired.map((b: any) => b.id);
        const slotIds = [
          ...new Set(expired.map((b: any) => b.time_slot_id).filter(Boolean)),
        ];

        await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .in("id", expiredIds);
        if (slotIds.length > 0) {
          await supabase
            .from("available_time_slots")
            .update({ is_booked: false })
            .in("id", slotIds);
        }
        return;
      }

      const { data: expired } = await supabase
        .from("bookings")
        .select("id, time_slot_id")
        .eq("tenant", userId)
        .in("status", activeStatuses)
        .lt("booking_date", nowIso);

      if (!expired || expired.length === 0) return;

      const expiredIds = expired.map((b: any) => b.id);
      const slotIds = [
        ...new Set(expired.map((b: any) => b.time_slot_id).filter(Boolean)),
      ];

      await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .in("id", expiredIds);
      if (slotIds.length > 0) {
        await supabase
          .from("available_time_slots")
          .update({ is_booked: false })
          .in("id", slotIds);
      }
    } catch (e) {
      console.log("autoCancelExpiredBookings error", e);
    }
  };

  const loadBookings = async (
    userId: string,
    role: string,
    activeFilter: string,
  ) => {
    if (!refreshing) setLoading(true);

    try {
      await autoCancelExpiredBookings(userId, role);

      let bookingsData: any[] = [];

      if (role === "landlord") {
        const { data: myProperties } = await supabase
          .from("properties")
          .select("id")
          .eq("landlord", userId);

        if (!myProperties || myProperties.length === 0) {
          setAllBookings([]);
          setBookings([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const propIds = myProperties.map((p: any) => p.id);

        const query = supabase
          .from("bookings")
          .select("*")
          .in("property_id", propIds)
          .order("updated_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        bookingsData = data || [];
      } else {
        // --- TENANT LOGIC ---
        const query = supabase
          .from("bookings")
          .select("*")
          .eq("tenant", userId)
          .order("updated_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        bookingsData = data || [];

        // 2. Fetch "Accepted" Applications (Ready to Book)
        const { data: acceptedApps } = await supabase
          .from("applications")
          .select(
            "id, property_id, tenant, status, message, updated_at, created_at",
          )
          .eq("tenant", userId)
          .eq("status", "accepted");

        if (acceptedApps && acceptedApps.length > 0) {
          const appsToBook = acceptedApps.map((app: any) => ({
            id: app.id,
            is_application: true,
            property_id: app.property_id,
            tenant: app.tenant,
            booking_date: null,
            updated_at: app.updated_at || app.created_at || null,
            created_at: app.created_at || null,
            status: "ready_to_book",
            notes: app.message,
          }));
          bookingsData = [...appsToBook, ...bookingsData];
        }
      }

      if (bookingsData.length === 0) {
        setAllBookings([]);
        setBookings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // ENRICHMENT
      const propIds = [
        ...new Set(bookingsData.map((b) => b.property_id).filter(Boolean)),
      ];
      const tenantIds = [
        ...new Set(bookingsData.map((b) => b.tenant).filter(Boolean)),
      ];

      const { data: properties } = await supabase
        .from("properties")
        .select("id, title, address, city, landlord, status, is_deleted")
        .in("id", propIds);
      const { data: tenantProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, middle_name, last_name, email, phone")
        .in("id", tenantIds);

      const propMap: any = {};
      properties?.forEach((p: any) => {
        propMap[p.id] = p;
      });

      const tenantMap: any = {};
      tenantProfiles?.forEach((t: any) => {
        tenantMap[t.id] = t;
      });

      const enriched = bookingsData.map((b) => ({
        ...b,
        property: propMap[b.property_id],
        tenant_profile: tenantMap[b.tenant],
      }));

      // --- SORTING: Newest request updates first for both roles ---
      let finalBookings = enriched;

      finalBookings.sort((a, b) => {
        const timeA = a?.updated_at
          ? new Date(a.updated_at).getTime()
          : a?.created_at
            ? new Date(a.created_at).getTime()
            : Number.NEGATIVE_INFINITY;
        const timeB = b?.updated_at
          ? new Date(b.updated_at).getTime()
          : b?.created_at
            ? new Date(b.created_at).getTime()
            : Number.NEGATIVE_INFINITY;

        if (timeA !== timeB) return timeB - timeA;

        const fallbackA = String(a?.status || "");
        const fallbackB = String(b?.status || "");
        return fallbackA.localeCompare(fallbackB);
      });

      // Tenant should only see "ready_to_book" entries for properties that are actually available.
      finalBookings = finalBookings.filter((item: any) => {
        const status = String(item?.status || "").toLowerCase();
        if (status !== "ready_to_book") return true;
        const propertyStatus = String(
          item?.property?.status || "",
        ).toLowerCase();
        const isDeleted = !!item?.property?.is_deleted;
        return propertyStatus === "available" && !isDeleted;
      });

      const matchesFilter = (booking: any) => {
        const status = String(booking?.status || "").toLowerCase();
        if (activeFilter === "all") return true;
        if (activeFilter === "pending" || activeFilter === "pending_approval") {
          return ["pending", "pending_approval"].includes(status);
        }
        if (activeFilter === "approved") {
          return ["approved", "accepted", "ready_to_book"].includes(status);
        }
        if (activeFilter === "rejected") return status === "rejected";
        if (activeFilter === "cancelled") return status === "cancelled";
        if (activeFilter === "completed") return status === "completed";
        if (activeFilter === "ready_to_book") return status === "ready_to_book";
        return status === activeFilter;
      };

      setAllBookings(finalBookings);
      setBookings(finalBookings.filter(matchesFilter));

      // AUTO-READ NOTIFICATIONS: If user views bookings, mark booking notifications as read
      markBookingNotificationsRead(userId);
    } catch (error: any) {
      console.error("Error loading bookings:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const markBookingNotificationsRead = async (userId: string) => {
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("recipient", userId)
        .in("type", [
          "booking_request",
          "booking_approved",
          "booking_rejected",
          "booking_cancelled",
          "new_booking",
        ])
        .eq("read", false);
    } catch (e) {
      console.log("Error auto-reading notifications", e);
    }
  };

  // --- ACTIONS ---

  const sendBackendNotification = async (
    type: string,
    recordId: string,
    actorId: string,
  ) => {
    if (!API_URL) return;

    const typeVariants =
      type === "booking_new"
        ? ["new_booking", "booking_request", "booking_new"]
        : [type];

    try {
      for (const notifyType of typeVariants) {
        const res = await fetch(`${API_URL}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: notifyType,
            recordId,
            bookingId: recordId,
            actorId,
          }),
        });

        if (res.ok) {
          break;
        }
      }
    } catch (e) {
      console.error("Backend notify error", e);
    }
  };

  const updateSlotBookingState = async (booking: any, isBooked: boolean) => {
    if (!booking?.time_slot_id) return;

    const { data: byIdRows, error: byIdError } = await supabase
      .from("available_time_slots")
      .update({ is_booked: isBooked })
      .eq("id", booking.time_slot_id)
      .select("id");

    if (!byIdError && byIdRows && byIdRows.length > 0) return;

    const { data: baseSlot } = await supabase
      .from("available_time_slots")
      .select("id, landlord_id, start_time, end_time")
      .eq("id", booking.time_slot_id)
      .maybeSingle();

    if (baseSlot?.landlord_id && baseSlot?.start_time && baseSlot?.end_time) {
      const { data: byRangeRows, error: byRangeError } = await supabase
        .from("available_time_slots")
        .update({ is_booked: isBooked })
        .eq("landlord_id", baseSlot.landlord_id)
        .eq("start_time", baseSlot.start_time)
        .eq("end_time", baseSlot.end_time)
        .select("id");
      if (byRangeError || !byRangeRows || byRangeRows.length === 0) {
        console.log(
          "updateSlotBookingState fallback update failed",
          byRangeError || "no rows updated",
        );
      }
      return;
    }
  };

  const approveBooking = async (booking: any) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "approved" })
      .eq("id", booking.id);
    if (error) return Alert.alert("Error", error.message);

    await updateSlotBookingState(booking, true);

    await createNotification(
      booking.tenant,
      "booking_approved",
      `Your viewing request for ${booking.property?.title} has been approved!`,
      { actor: session.user.id },
    );
    sendBackendNotification("booking_status", booking.id, session.user.id);

    Alert.alert("Success", "Booking approved!");
    loadBookings(session.user.id, profile.role, filter);
  };

  const openRejectModal = (booking: any) => {
    setBookingToReject(booking);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const rejectBooking = async () => {
    if (!bookingToReject) return;

    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      return Alert.alert(
        "Reason Required",
        "Please provide a rejection reason.",
      );
    }

    setSubmittingReject(true);

    const { error } = await supabase
      .from("bookings")
      .update({ status: "rejected" })
      .eq("id", bookingToReject.id);
    if (error) {
      setSubmittingReject(false);
      return Alert.alert("Error", error.message);
    }

    await updateSlotBookingState(bookingToReject, true);

    const { error: emailError } = await supabase.functions.invoke(
      "send-email",
      {
        body: {
          type: "booking_rejection_reason",
          bookingId: bookingToReject.id,
          reason: trimmedReason,
        },
      },
    );

    if (emailError) {
      console.log("Rejection email send failed:", emailError.message);
    }

    if (API_URL && bookingToReject?.tenant_profile?.phone) {
      try {
        await fetch(`${API_URL}/api/send-sms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: bookingToReject.tenant_profile.phone,
            message: `Abalay: Your viewing request for ${bookingToReject.property?.title || "the property"} was rejected. Reason: ${trimmedReason}`,
          }),
        });
      } catch (smsError) {
        console.log("Failed to send rejection SMS:", smsError);
      }
    }

    await createNotification(
      bookingToReject.tenant,
      "booking_rejected",
      `Your viewing request for ${bookingToReject.property?.title} was rejected. Reason: ${trimmedReason}`,
      { actor: session.user.id },
    );
    sendBackendNotification(
      "booking_status",
      bookingToReject.id,
      session.user.id,
    );

    setSubmittingReject(false);
    setShowRejectModal(false);
    setBookingToReject(null);
    setRejectReason("");
    Alert.alert("Success", "Booking rejected.");
    loadBookings(session.user.id, profile.role, filter);
  };

  const promptCancelBooking = (booking: any) => {
    setBookingToCancel(booking);
    setShowCancelModal(true);
  };

  const confirmCancelBooking = async () => {
    if (!bookingToCancel) return;

    const roleLower = String(profile?.role || "").toLowerCase();

    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingToCancel.id);

    if (error) {
      Alert.alert("Error", "Failed to cancel");
    } else {
      await updateSlotBookingState(bookingToCancel, false);

      const notifyRecipient =
        roleLower === "landlord"
          ? bookingToCancel.tenant
          : bookingToCancel.landlord || bookingToCancel.tenant;

      if (notifyRecipient) {
        await createNotification(
          notifyRecipient,
          "booking_cancelled",
          roleLower === "landlord"
            ? `Your viewing for ${bookingToCancel.property?.title} has been cancelled by the landlord.`
            : `${profile?.first_name || "A tenant"} cancelled viewing for ${bookingToCancel.property?.title || "your property"}.`,
          { actor: session.user.id },
        );
      }

      sendBackendNotification(
        "booking_status",
        bookingToCancel.id,
        session.user.id,
      );

      Alert.alert("Success", "Booking cancelled");
      loadBookings(session.user.id, profile.role, filter);
    }

    setShowCancelModal(false);
    setBookingToCancel(null);
  };

  // --- ASSIGN TENANT LOGIC ---

  const navigateToAssignTenant = (booking: any) => {
    const routePropertyId = booking?.property_id || booking?.property?.id;
    if (!routePropertyId) {
      Alert.alert("Error", "No property found for this booking.");
      return;
    }

    const tenantProfile = booking?.tenant_profile || {};
    const tenantName =
      `${tenantProfile.first_name || ""} ${tenantProfile.last_name || ""}`.trim();

    router.push({
      pathname: "/(tabs)/assigntenant",
      params: {
        propertyId: String(routePropertyId),
        bookingId: String(booking.id),
        tenantId: String(booking.tenant || ""),
        tenantName: tenantName,
        tenantPhone: tenantProfile.phone || "",
        tenantFirstName: tenantProfile.first_name || "",
        tenantLastName: tenantProfile.last_name || "",
      },
    } as any);
  };

  const markViewingSuccess = async (booking: any) => {
    const activeCompetingStatuses = [
      "pending",
      "pending_approval",
      "approved",
      "accepted",
    ];

    const { data: competingBookings, error: competingFetchError } =
      await supabase
        .from("bookings")
        .select("id, tenant, time_slot_id")
        .eq("property_id", booking.property_id)
        .neq("id", booking.id)
        .in("status", activeCompetingStatuses);

    if (competingFetchError) {
      return Alert.alert("Error", "Failed to load related booking requests.");
    }

    const { error: viewingDoneError } = await supabase
      .from("bookings")
      .update({ status: "viewing_done" })
      .eq("id", booking.id);

    if (viewingDoneError) {
      return Alert.alert("Error", "Failed to update status");
    }

    const competingIds = (competingBookings || []).map((b: any) => b.id);

    if (competingIds.length > 0) {
      const { error: rejectOthersError } = await supabase
        .from("bookings")
        .update({ status: "rejected" })
        .in("id", competingIds);

      if (rejectOthersError) {
        return Alert.alert(
          "Error",
          "Viewing was marked successful, but other requests could not be rejected.",
        );
      }

      await Promise.all(
        (competingBookings || []).map((other: any) =>
          updateSlotBookingState(other, false),
        ),
      );

      await Promise.all(
        (competingBookings || []).map((other: any) =>
          createNotification(
            other.tenant,
            "booking_rejected",
            `Your viewing request for ${booking.property?.title} was rejected because another viewing for this property was marked successful.`,
            { actor: session.user.id },
          ),
        ),
      );
    }

    await createNotification(
      booking.tenant,
      "viewing_success",
      `Your viewing for ${booking.property?.title} was successful!`,
      { actor: session.user.id },
    );

    Alert.alert("Success", "Viewing marked as successful!");
    loadBookings(session.user.id, profile.role, filter);
    navigateToAssignTenant(booking);
  };

  const openAssignTenantModal = async (booking: any) => {
    const requestedPropertyId = booking?.property_id
      ? String(booking.property_id)
      : booking?.property?.id
        ? String(booking.property.id)
        : "";

    setAssignStep(0);
    setAssignBooking(booking);
    setPenaltyDetails("");
    setStartDate(new Date().toISOString().split("T")[0]);
    setWifiDueDay("");
    setWaterDueDay("");
    setElectricityDueDay("");
    setPaidMoveInItems({ ...DEFAULT_PAID_MOVE_IN_ITEMS });
    setContractFile(null);
    setSelectedPropertyId(requestedPropertyId);
    setShowWifiDayPicker(false);
    setShowWaterDayPicker(false);
    setShowElectricityDayPicker(false);

    // Load landlord properties (robust fallback for schema variations)
    const ownerColumns = ["landlord", "landlord_id", "owner_id", "user_id"];
    let properties: any[] = [];

    for (const ownerColumn of ownerColumns) {
      const { data, error } = await (supabase.from("properties") as any)
        .select("*")
        .eq(ownerColumn, session.user.id);

      if (!error) {
        const loaded = data || [];
        properties = loaded.filter((p: any) => p?.is_deleted !== true);
        if (properties.length > 0) break;
      }
    }

    // Ensure requested property always appears as fallback.
    if (requestedPropertyId) {
      const alreadyIncluded = properties.some(
        (p: any) => String(p.id) === requestedPropertyId,
      );

      if (!alreadyIncluded) {
        if (booking?.property?.id) {
          properties = [booking.property, ...properties];
        } else {
          const { data: requestedProp } = await supabase
            .from("properties")
            .select("*")
            .eq("id", requestedPropertyId)
            .maybeSingle();

          if (requestedProp) {
            properties = [requestedProp, ...properties];
          }
        }
      }
    }

    // Last-resort fallback: keep Assign flow usable even if property queries are blocked.
    if (properties.length === 0 && requestedPropertyId) {
      properties = [
        {
          id: requestedPropertyId,
          title: booking?.property?.title || "Selected Property",
          city: booking?.property?.city || "",
          price: booking?.property?.price || 0,
          amenities: booking?.property?.amenities || [],
          has_advance: booking?.property?.has_advance,
          advance_amount: booking?.property?.advance_amount,
          has_security_deposit: booking?.property?.has_security_deposit,
          security_deposit_amount: booking?.property?.security_deposit_amount,
        },
      ];
    }

    // Sort so the booked property is FIRST
    if (requestedPropertyId) {
      properties.sort((a, b) => {
        if (String(a.id) === requestedPropertyId) return -1;
        if (String(b.id) === requestedPropertyId) return 1;
        return 0;
      });
    }

    setAvailableProperties(properties);
    setSelectedPropertyId(
      requestedPropertyId ||
        (properties.length > 0 ? String(properties[0].id) : ""),
    );
    setShowAssignModal(true);
  };

  const pickContractFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      const file = result.assets[0];
      setContractFile(file);
    } catch (e) {
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const executeAssignment = async () => {
    const booking = assignBooking;
    setUploadingContract(true);

    // Upload
    let contractUrl = null;
    if (contractFile) {
      try {
        // Read file as base64 using fetch hack for Expo
        const response = await fetch(contractFile.uri);
        const blob = await response.blob();
        const reader = new FileReader();

        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            // result is "data:application/pdf;base64,..."
            const base64 = result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        const base64Data = (await base64Promise) as string;

        const fileName = `${selectedPropertyId}_${booking.tenant}_${Date.now()}.pdf`;
        const filePath = `contracts/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("contracts")
          .upload(filePath, decode(base64Data), {
            contentType: "application/pdf",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("contracts")
          .getPublicUrl(filePath);
        contractUrl = urlData.publicUrl;
      } catch (e: any) {
        setUploadingContract(false);
        return Alert.alert("Upload Error", e.message);
      }
    }

    const selectedProp =
      availableProperties.find(
        (p: any) => String(p.id) === String(selectedPropertyId),
      ) || booking.property;
    const rentAmount = selectedProp?.price || 0;
    const hasAdvance =
      typeof selectedProp?.has_advance === "boolean"
        ? selectedProp?.has_advance
        : Number(selectedProp?.advance_amount || 0) > 0;
    const advanceAmount = hasAdvance
      ? Number(selectedProp?.advance_amount || rentAmount)
      : 0;
    const hasSecurityDeposit =
      typeof selectedProp?.has_security_deposit === "boolean"
        ? selectedProp?.has_security_deposit
        : Number(selectedProp?.security_deposit_amount || 0) > 0;
    const securityDeposit = hasSecurityDeposit
      ? Number(selectedProp?.security_deposit_amount || rentAmount)
      : 0;
    const effectivePaidMoveInItems = {
      rent: paidMoveInItems.rent,
      securityDeposit: hasSecurityDeposit && paidMoveInItems.securityDeposit,
      advance: hasAdvance && paidMoveInItems.advance,
    };
    const pendingRentAmount = effectivePaidMoveInItems.rent ? 0 : rentAmount;
    const pendingAdvanceAmount = effectivePaidMoveInItems.advance
      ? 0
      : advanceAmount;
    const pendingSecurityDepositAmount =
      effectivePaidMoveInItems.securityDeposit ? 0 : securityDeposit;
    const paidOfflineRentAmount = effectivePaidMoveInItems.rent
      ? rentAmount
      : 0;
    const paidOfflineAdvanceAmount = effectivePaidMoveInItems.advance
      ? advanceAmount
      : 0;
    const paidOfflineSecurityDepositAmount =
      effectivePaidMoveInItems.securityDeposit ? securityDeposit : 0;
    const hasPendingMoveInAmount =
      pendingRentAmount + pendingAdvanceAmount + pendingSecurityDepositAmount >
      0;
    const hasPaidOfflineMoveInAmount =
      paidOfflineRentAmount +
        paidOfflineAdvanceAmount +
        paidOfflineSecurityDepositAmount >
      0;

    try {
      // DB Updates
      const { data: newOccupancy, error } = await supabase
        .from("tenant_occupancies")
        .insert({
          property_id: selectedPropertyId,
          tenant_id: booking.tenant,
          landlord_id: session.user.id,
          status: "active",
          start_date: new Date(startDate).toISOString(),
          security_deposit: securityDeposit,
          security_deposit_used: 0,
          wifi_due_day: selectedProp?.amenities?.includes("Free WiFi")
            ? null
            : wifiDueDay
              ? parseInt(wifiDueDay)
              : null,
          electricity_due_day: selectedProp?.amenities?.includes(
            "Free Electricity",
          )
            ? null
            : electricityDueDay
              ? parseInt(electricityDueDay)
              : null,
          late_payment_fee: parseFloat(penaltyDetails) || 0,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      await supabase
        .from("properties")
        .update({ status: "occupied" })
        .eq("id", selectedPropertyId);
      await supabase
        .from("bookings")
        .update({ status: "completed" })
        .eq("id", booking.id);

      const totalMoveIn = rentAmount + advanceAmount + securityDeposit;

      // Notification
      try {
        const startDateLabel = new Date(startDate).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        let msg = `Your occupancy will start on ${startDateLabel} for "${selectedProp?.title}".`;
        if (hasPendingMoveInAmount && hasPaidOfflineMoveInAmount) {
          msg += ` Some move-in fees were marked as already paid offline, and a bill was sent for the remaining fees.`;
        } else if (hasPaidOfflineMoveInAmount) {
          msg += ` Move-in fees were marked as already paid offline.`;
        } else if (hasPendingMoveInAmount) {
          msg += ` Move-in bill sent.`;
        }

        await createNotification(booking.tenant, "occupancy_assigned", msg, {
          actor: session.user.id,
          email: true,
          sms: true,
        });

        if (API_URL) {
          const tenantProfile = booking.tenant_profile || {};
          const phoneToUse = tenantProfile?.phone;
          const nameToUse =
            `${tenantProfile?.first_name || ""} ${tenantProfile?.last_name || ""}`.trim() ||
            "Tenant";

          if (phoneToUse) {
            fetch(`${API_URL}/api/send-sms`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phoneNumber: phoneToUse, message: msg }),
            }).catch((e) => console.log("SMS Error:", e));
          }

          fetch(`${API_URL}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId: booking.id,
              type: "assignment",
              customMessage: msg,
            }),
          }).catch((e) => console.log("Email Error:", e));

          if (hasPendingMoveInAmount) {
            fetch(`${API_URL}/api/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "move_in",
                recordId: newOccupancy.id,
                tenantName: nameToUse,
                tenantPhone: phoneToUse,
                tenantEmail: null,
                propertyTitle: selectedProp?.title,
                propertyAddress: "",
                startDate,
                landlordName:
                  `${session?.user?.user_metadata?.first_name || ""} ${session?.user?.user_metadata?.last_name || ""}`.trim() ||
                  "Landlord",
                landlordPhone: session?.user?.user_metadata?.phone || "",
                securityDeposit: pendingSecurityDepositAmount,
                rentAmount: pendingRentAmount,
                advanceAmount: pendingAdvanceAmount,
                contractPdfUrl: contractUrl,
              }),
            }).catch((e) => console.log("Move-in email Error:", e));
          }
        }
      } catch (notifErr) {
        console.log("Notification failed:", notifErr);
      }

      // Bill
      if (hasPendingMoveInAmount) {
        // Tenant hasn't paid yet — create a pending bill
        await supabase.from("payment_requests").insert({
          landlord: session.user.id,
          tenant: booking.tenant,
          property_id: selectedPropertyId,
          occupancy_id: newOccupancy.id,
          rent_amount: pendingRentAmount,
          advance_amount: pendingAdvanceAmount,
          security_deposit_amount: pendingSecurityDepositAmount,
          bills_description: buildMoveInDescription({
            rentAmount: pendingRentAmount,
            advanceAmount: pendingAdvanceAmount,
            securityDepositAmount: pendingSecurityDepositAmount,
          }),
          due_date: new Date(startDate).toISOString(),
          status: "pending",
          is_move_in_payment: true,
        });
      } else {
        // Tenant already paid offline — record as paid so the next due date
        // advances correctly (otherwise dashboard falls back to start_date)
        await supabase.from("payment_requests").insert({
          landlord: session.user.id,
          tenant: booking.tenant,
          property_id: selectedPropertyId,
          occupancy_id: newOccupancy.id,
          rent_amount: paidOfflineRentAmount,
          advance_amount: paidOfflineAdvanceAmount,
          security_deposit_amount: paidOfflineSecurityDepositAmount,
          bills_description: buildMoveInDescription({
            rentAmount: paidOfflineRentAmount,
            advanceAmount: paidOfflineAdvanceAmount,
            securityDepositAmount: paidOfflineSecurityDepositAmount,
            paidOffline: true,
          }),
          due_date: new Date(startDate).toISOString(),
          status: "paid",
          is_move_in_payment: true,
          payment_method: "cash",
        });
      }

      setShowAssignModal(false);
      setAssignBooking(null);
      Alert.alert(
        "Success",
        hasPendingMoveInAmount && hasPaidOfflineMoveInAmount
          ? "Tenant assigned! Remaining move-in bill created."
          : hasPendingMoveInAmount
            ? "Tenant assigned! Move-in payment bill sent."
            : "Tenant assigned successfully!",
      );
      loadBookings(session.user.id, profile.role, filter);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to assign tenant");
    } finally {
      setUploadingContract(false);
      setShowAssignWarning(false);
    }
  };

  const confirmAssignTenant = () => {
    if (!assignBooking || !selectedPropertyId)
      return Alert.alert("Error", "Select a property");

    if (!startDate) {
      return Alert.alert("Error", "Please enter a start date.");
    }

    const selectedPropInfo = availableProperties.find(
      (p: any) => String(p.id) === String(selectedPropertyId),
    );
    const amenities = selectedPropInfo?.amenities || [];
    const isWaterFree = amenities.includes("Free Water");
    const isElecFree = amenities.includes("Free Electricity");
    const isWifiFree = amenities.includes("Free WiFi");
    const requireWifiDueDate = amenities.includes("Paid WiFi");

    if (
      !isWaterFree &&
      (!waterDueDay || parseInt(waterDueDay) < 1 || parseInt(waterDueDay) > 31)
    ) {
      return Alert.alert("Error", "Please enter a valid Water Due Day (1-31)");
    }
    if (
      !isElecFree &&
      (!electricityDueDay ||
        parseInt(electricityDueDay) < 1 ||
        parseInt(electricityDueDay) > 31)
    ) {
      return Alert.alert(
        "Error",
        "Please enter a valid Electricity Due Day (1-31)",
      );
    }
    if (
      requireWifiDueDate &&
      (!wifiDueDay || parseInt(wifiDueDay) < 1 || parseInt(wifiDueDay) > 31)
    ) {
      return Alert.alert("Error", "Please enter a valid WiFi Due Day (1-31)");
    }

    Alert.alert(
      "Warning: Permanent Action",
      "This action CANNOT be undone. This will officially assign the tenant and generate a move-in bill. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Confirm & Assign",
          style: "destructive",
          onPress: executeAssignment,
        },
      ],
    );
  };

  // --- MODAL & SCHEDULING ---

  const openBookingModal = async (booking: any) => {
    if (!booking.property?.landlord)
      return Alert.alert("Error", "Landlord info missing");

    const propertyStatus = String(
      booking?.property?.status || "",
    ).toLowerCase();
    if (propertyStatus && propertyStatus !== "available") {
      return Alert.alert(
        "Unavailable",
        "This property is no longer available for scheduling.",
      );
    }

    setSelectedApplication(booking);
    setBookingSlotsLoading(true);
    setShowBookingModal(true);
    setSubmittingBooking(false);
    setBookingNotes("");
    setAvailableTimeSlots([]);
    setSelectedBookingDateKey("");
    setBookingCalendarMonthOffset(0);
    setBookingMode("slot");
    setPreferredDate("");
    setPreferredStartTime("");
    setPreferredEndTime("");
    setPreferredTimeError("");
    setShowPreferredStartPicker(false);
    setShowPreferredEndPicker(false);

    try {
      const { data } = await supabase
        .from("available_time_slots")
        .select("*")
        .eq("landlord_id", booking.property.landlord)
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true });

      const { data: activeBookedSlots } = await supabase
        .from("bookings")
        .select("id, start_time, end_time")
        .eq("property_id", booking.property_id)
        .eq("landlord", booking.property.landlord)
        .in("status", ["pending", "pending_approval", "approved", "accepted"]);

      const statusLower = String(booking?.status || "").toLowerCase();
      const canUseCurrentSlotAsEditable = [
        "pending",
        "pending_approval",
        "approved",
        "accepted",
      ].includes(statusLower);

      const currentSlotId =
        canUseCurrentSlotAsEditable && booking?.time_slot_id
          ? String(booking.time_slot_id)
          : "";

      const bookedKeys = new Set(
        (activeBookedSlots || [])
          .filter((b: any) => String(b.id) !== String(booking.id))
          .map((b: any) => `${String(b.start_time)}|${String(b.end_time)}`),
      );

      const getSlotDateKey = (startTime: string) => {
        const d = new Date(startTime);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };

      const slotsWithStatus = (data || []).map((slot: any) => {
        const slotId = String(slot.id);
        const slotKey = `${String(slot.start_time)}|${String(slot.end_time)}`;
        const isCurrentSlot = !!currentSlotId && slotId === currentSlotId;
        const isBookedByOtherTenant =
          (Boolean(slot.is_booked) || bookedKeys.has(slotKey)) &&
          !isCurrentSlot;

        return {
          ...slot,
          isCurrentSlot,
          isBookedByOtherTenant,
        };
      });

      setAvailableTimeSlots(slotsWithStatus);
      setBookingCalendarMonthOffset(0);

      const fallbackOriginalSlot =
        canUseCurrentSlotAsEditable && booking?.booking_date
          ? slotsWithStatus.find(
              (slot: any) =>
                new Date(slot.start_time).getTime() ===
                new Date(booking.booking_date).getTime(),
            )
          : null;

      const originalSlotId =
        currentSlotId ||
        (fallbackOriginalSlot ? String(fallbackOriginalSlot.id) : "");

      const selectedSlotData = originalSlotId
        ? slotsWithStatus.find(
            (slot: any) => String(slot.id) === originalSlotId,
          )
        : null;

      const initialDateKey = selectedSlotData
        ? getSlotDateKey(selectedSlotData.start_time)
        : slotsWithStatus[0]
          ? getSlotDateKey(slotsWithStatus[0].start_time)
          : "";

      setSelectedBookingDateKey(initialDateKey);

      if (selectedSlotData) {
        setSelectedTimeSlot(String(selectedSlotData.id));
      } else if (!initialDateKey) {
        setSelectedTimeSlot("");
      } else {
        const firstSelectable = slotsWithStatus.find(
          (slot: any) =>
            getSlotDateKey(slot.start_time) === initialDateKey &&
            !slot.isBookedByOtherTenant,
        );

        setSelectedTimeSlot(firstSelectable ? String(firstSelectable.id) : "");
      }
    } finally {
      setBookingSlotsLoading(false);
    }
  };

  const getOriginalSlotId = (booking: any, slots: any[]) => {
    if (!booking) return "";
    const statusLower = String(booking?.status || "").toLowerCase();
    const canUseCurrentSlotAsEditable = [
      "pending",
      "pending_approval",
      "approved",
      "accepted",
    ].includes(statusLower);

    if (!canUseCurrentSlotAsEditable) return "";

    if (booking.time_slot_id) return String(booking.time_slot_id);
    if (!booking.booking_date) return "";

    const match = slots.find(
      (slot: any) =>
        new Date(slot.start_time).getTime() ===
        new Date(booking.booking_date).getTime(),
    );
    return match ? String(match.id) : "";
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

  const submitBooking = async () => {
    if (!selectedApplication) return;

    const isPreferredMode = bookingMode === "preferred";

    if (!isPreferredMode && !selectedTimeSlot) return;

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
      slotForBooking = availableTimeSlots.find(
        (s) => String(s.id) === String(selectedTimeSlot),
      );

      if (!slotForBooking) {
        return Alert.alert(
          "Error",
          "Selected time slot was not found. Please pick another slot.",
        );
      }

      const slotStart = new Date(slotForBooking.start_time);
      const confirmedSlot = await confirmOneHourWarning(slotStart);
      if (!confirmedSlot) return;
    }

    setSubmittingBooking(true);

    const currentSlotId = getOriginalSlotId(
      selectedApplication,
      availableTimeSlots,
    );
    if (
      currentSlotId &&
      String(selectedTimeSlot) === currentSlotId &&
      !selectedApplication?.is_application
    ) {
      Alert.alert(
        "No Changes",
        "You selected your current schedule. Please pick a different time slot to reschedule.",
      );
      setSubmittingBooking(false);
      return;
    }

    const { data: globalActiveRows } = await supabase
      .from("bookings")
      .select("id")
      .eq("tenant", session.user.id)
      .in("status", ["pending", "pending_approval", "approved", "accepted"]);

    const globalActive = (globalActiveRows || []).find(
      (b: any) => String(b.id) !== String(selectedApplication?.id),
    );

    if (globalActive) {
      Alert.alert(
        "Limit Reached",
        "You can only have 1 active viewing schedule at a time.",
      );
      setSubmittingBooking(false);
      return;
    }

    let newBooking: any = null;

    if (isPreferredMode && preferredStartAt && preferredEndAt) {
      const preferredStartIso = preferredStartAt.toISOString();
      const preferredEndIso = preferredEndAt.toISOString();

      const { data: insertedBooking, error } = await supabase
        .from("bookings")
        .insert({
          property_id: selectedApplication.property_id,
          tenant: session.user.id,
          landlord: selectedApplication.property.landlord,
          start_time: preferredStartIso,
          end_time: preferredEndIso,
          booking_date: preferredStartIso,
          time_slot_id: null,
          status: "pending",
          notes:
            bookingNotes ||
            `Preferred schedule requested: ${preferredDate} ${formatTimeLabel(preferredStartTime)} - ${formatTimeLabel(preferredEndTime)}`,
        })
        .select()
        .single();

      if (error) {
        Alert.alert("Error", error.message);
        setSubmittingBooking(false);
        return;
      }

      newBooking = insertedBooking;
    } else {
      const slot = slotForBooking;

      const { data: latestSlot, error: latestSlotError } = await supabase
        .from("available_time_slots")
        .select("id, landlord_id, start_time, end_time, is_booked")
        .eq("id", slot.id)
        .maybeSingle();

      if (latestSlotError || !latestSlot) {
        Alert.alert(
          "Unavailable",
          "This schedule is no longer available. Please choose another time slot.",
        );
        setSubmittingBooking(false);
        openBookingModal(selectedApplication);
        return;
      }

      const selectedIsCurrent =
        !!currentSlotId && String(slot.id) === String(currentSlotId);
      if (latestSlot.is_booked === true && !selectedIsCurrent) {
        Alert.alert(
          "Unavailable",
          "This schedule is no longer available. Please choose another time slot.",
        );
        setSubmittingBooking(false);
        openBookingModal(selectedApplication);
        return;
      }

      let didReserveSlot = false;

      const { data: lockedByIdRows, error: lockByIdError } = await supabase
        .from("available_time_slots")
        .update({ is_booked: true })
        .eq("id", latestSlot.id)
        .or("is_booked.eq.false,is_booked.is.null")
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
            .or("is_booked.eq.false,is_booked.is.null")
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
              .eq("property_id", selectedApplication.property_id)
              .eq("landlord", selectedApplication.property.landlord)
              .eq("start_time", latestSlot.start_time)
              .eq("end_time", latestSlot.end_time)
              .in("status", [
                "pending",
                "pending_approval",
                "approved",
                "accepted",
              ]);

          if (slotConflictError) {
            Alert.alert(
              "Unavailable",
              "This schedule is no longer available. Please choose another time slot.",
            );
            setSubmittingBooking(false);
            openBookingModal(selectedApplication);
            return;
          }

          const slotConflict = (slotConflictRows || [])[0];

          if (slotConflict) {
            Alert.alert(
              "Unavailable",
              "This schedule is no longer available. Please choose another time slot.",
            );
            setSubmittingBooking(false);
            openBookingModal(selectedApplication);
            return;
          }

          // No active conflict found: continue even if lock update did not apply.
          console.log(
            "reschedule slot lock fallback: proceeding without is_booked lock",
            lockByIdError || lockByRangeError || "no rows updated",
          );
        }
      }

      const { data: insertedBooking, error } = await supabase
        .from("bookings")
        .insert({
          property_id: selectedApplication.property_id,
          tenant: session.user.id,
          landlord: selectedApplication.property.landlord,
          start_time: slot.start_time,
          end_time: slot.end_time,
          booking_date: slot.start_time,
          time_slot_id: slot.id,
          status: "pending",
          notes:
            bookingNotes ||
            `Booking for ${selectedApplication.property?.title}`,
        })
        .select()
        .single();

      if (error) {
        if (didReserveSlot) {
          await supabase
            .from("available_time_slots")
            .update({ is_booked: false })
            .eq("landlord_id", latestSlot.landlord_id)
            .eq("start_time", latestSlot.start_time)
            .eq("end_time", latestSlot.end_time);
        }
        Alert.alert("Error", error.message);
        setSubmittingBooking(false);
        return;
      }

      if (!didReserveSlot) {
        await supabase
          .from("available_time_slots")
          .update({ is_booked: true })
          .eq("id", latestSlot.id);
      }

      newBooking = insertedBooking;
    }

    if (!selectedApplication.is_application) {
      if (
        selectedApplication.status !== "rejected" &&
        selectedApplication.status !== "cancelled"
      ) {
        await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", selectedApplication.id);
        const previousSlotId = getOriginalSlotId(
          selectedApplication,
          availableTimeSlots,
        );
        if (previousSlotId) {
          await updateSlotBookingState(
            { ...selectedApplication, time_slot_id: previousSlotId },
            false,
          );
        }
      }
    }

    // await createNotification(selectedApplication.property.landlord, 'new_booking', `${profile.first_name} requested a viewing.`, { actor: session.user.id });
    if (newBooking)
      sendBackendNotification("booking_new", newBooking.id, session.user.id);

    Alert.alert(
      "Success",
      isPreferredMode ? "Preferred schedule submitted!" : "Viewing scheduled!",
    );
    setSubmittingBooking(false);
    setShowBookingModal(false);
    setBookingSlotsLoading(false);
    setBookingMode("slot");
    setSelectedBookingDateKey("");
    setPreferredDate("");
    setPreferredStartTime("");
    setPreferredEndTime("");
    setPreferredTimeError("");
    setShowPreferredStartPicker(false);
    setShowPreferredEndPicker(false);
    loadBookings(session.user.id, profile.role, filter);
  };

  const nextAssignStep = () => {
    if (assignStep === 0 && !selectedPropertyId)
      return Alert.alert("Error", "Please select a property");
    if (assignStep === 1) {
      if (!startDate) return Alert.alert("Error", "Please enter a start date");
    }
    setAssignStep((s) => Math.min(s + 1, ASSIGN_STEPS.length - 1));
  };

  const prevAssignStep = () => setAssignStep((s) => Math.max(s - 1, 0));

  // --- RENDER ---
  const hasGlobalActive = allBookings.some((b) =>
    ["pending", "pending_approval", "approved", "accepted"].includes(b.status),
  );
  const pendingCount = allBookings.filter(
    (b) => b.status === "pending" || b.status === "pending_approval",
  ).length;
  const approvedCount = allBookings.filter(
    (b) => b.status === "approved" || b.status === "accepted",
  ).length;
  const rejectedCount = allBookings.filter(
    (b) => b.status === "rejected" || b.status === "cancelled",
  ).length;

  const selectedStatusLower = (selectedApplication?.status || "").toLowerCase();
  const isBookAgainFlow =
    !!selectedApplication && selectedStatusLower === "rejected";
  const isRescheduleFlow =
    !!selectedApplication &&
    !selectedApplication?.is_application &&
    ["pending", "pending_approval", "approved", "accepted"].includes(
      selectedStatusLower,
    );
  const originalSlotIdForModal = getOriginalSlotId(
    selectedApplication,
    availableTimeSlots,
  );

  const renderBookingCard = ({ item }: { item: any }) => {
    const timeInfo = getTimeSlotInfo(
      item.start_time || item.booking_date,
      item.end_time,
    );
    const date = item.booking_date ? new Date(item.booking_date) : null;
    const isPending =
      item.status === "pending" || item.status === "pending_approval";
    const isPast = date && date < new Date();
    const statusLower = (item.status || "").toLowerCase();
    const roleLower = (profile?.role || "").toLowerCase();
    const isActiveBooking = [
      "pending",
      "pending_approval",
      "approved",
      "accepted",
    ].includes(statusLower);
    const isTenantPreferredSchedule =
      roleLower === "landlord" && !item?.is_application && !item?.time_slot_id;

    let badgeStyle = styles.badgeGray;
    let badgeText = styles.badgeTextGray;
    let statusText = item.status;

    if (statusLower === "ready_to_book") {
      if (roleLower !== "landlord" && hasGlobalActive) {
        badgeStyle = styles.badgeGray;
        badgeText = styles.badgeTextGray;
        statusText = "Limit Reached";
      } else {
        badgeStyle = styles.badgeBlue;
        badgeText = styles.badgeTextBlue;
        statusText = "Ready to Book";
      }
    } else if (isPending) {
      badgeStyle = styles.badgeYellow;
      badgeText = styles.badgeTextYellow;
      statusText = "Pending";
    } else if (["approved", "accepted"].includes(statusLower)) {
      badgeStyle = styles.badgeGreen;
      badgeText = styles.badgeTextGreen;
      statusText = "Approved";
    } else if (statusLower === "viewing_done") {
      badgeStyle = styles.badgeIndigo;
      badgeText = styles.badgeTextIndigo;
      statusText = "Waiting for Assigning";
    } else if (["rejected", "cancelled"].includes(statusLower)) {
      badgeStyle = styles.badgeRed;
      badgeText = styles.badgeTextRed;
    }

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderColor: isDark ? colors.cardBorder : "#f3f4f6",
          },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.cardTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              {item.property?.title || "Unknown Property"}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <Ionicons
                name="location-outline"
                size={13}
                color={isDark ? colors.textMuted : "#666"}
              />
              <Text
                style={[
                  styles.cardSubtitle,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                {item.property?.address || "No address provided"}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <Ionicons
                name="person-outline"
                size={13}
                color={isDark ? colors.textMuted : "#666"}
              />
              <Text
                style={[
                  styles.cardSubtitle,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                {item.tenant_profile?.first_name || "Unknown"}{" "}
                {item.tenant_profile?.last_name || "Tenant"}
                {item.tenant_profile?.phone
                  ? ` • ${item.tenant_profile.phone}`
                  : ""}
              </Text>
            </View>
            {item.notes ? (
              <Text
                style={[
                  styles.notes,
                  {
                    backgroundColor: isDark ? colors.surface : "#f9fafb",
                    color: isDark ? colors.textSecondary : "#666",
                  },
                ]}
              >
                "{item.notes}"
              </Text>
            ) : null}
          </View>
          <View style={[styles.badge, badgeStyle]}>
            <Text style={[badgeText]}>{statusText}</Text>
          </View>
        </View>

        {isTenantPreferredSchedule && (
          <View style={styles.preferredScheduleTag}>
            <Text style={styles.preferredScheduleTagText}>
              TENANTS PREFERRED SCHEDULE
            </Text>
          </View>
        )}

        {/* NEW: Action Required Banner (Ported from Next.js) */}
        {statusLower === "ready_to_book" &&
          !hasGlobalActive &&
          roleLower !== "landlord" && (
            <View style={styles.actionBanner}>
              <Text style={styles.actionBannerTitle}>Action Required</Text>
              <Text style={styles.actionBannerText}>
                Please schedule a viewing time.
              </Text>
            </View>
          )}

        {/* Date / Time Display (Updated with TimeSlotInfo) */}
        {statusLower !== "ready_to_book" && date && (
          <View
            style={[
              styles.dateContainer,
              { backgroundColor: isDark ? colors.surface : "#f9fafb" },
            ]}
          >
            <Text
              style={[
                styles.dateLabel,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              REQUESTED TIME
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={[
                  styles.dateValue,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                {date.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    backgroundColor: timeInfo.color + "18",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={timeInfo.icon}
                    size={13}
                    color={timeInfo.color}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    {timeInfo.label}
                  </Text>
                  <Text
                    style={[
                      styles.timeValue,
                      { color: isDark ? colors.textMuted : "#666" },
                    ]}
                  >
                    {timeInfo.time}
                  </Text>
                </View>
              </View>
            </View>
            {isPast && (
              <Text
                style={{
                  color: "#ef4444",
                  fontSize: 10,
                  fontWeight: "bold",
                  marginTop: 2,
                }}
              >
                PAST
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionContainer}>
          {roleLower === "landlord" && (
            <View style={{ gap: 8, flex: 1 }}>
              {isPending && (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => approveBooking(item)}
                    style={styles.btnApprove}
                  >
                    <Text style={styles.btnTextWhite}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openRejectModal(item)}
                    style={styles.btnReject}
                  >
                    <Text style={styles.btnTextGray}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}

              {["approved", "accepted"].includes(statusLower) && (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => markViewingSuccess(item)}
                    style={styles.btnApprove}
                  >
                    <Text style={styles.btnTextWhite}>Viewing Success</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => promptCancelBooking(item)}
                    style={styles.btnOutlineRed}
                  >
                    <Text style={styles.btnTextRed}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}

              {statusLower === "viewing_done" && (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => navigateToAssignTenant(item)}
                    style={styles.btnApprove}
                  >
                    <Text style={styles.btnTextWhite}>Assign Tenant</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => promptCancelBooking(item)}
                    style={styles.btnOutlineRed}
                  >
                    <Text style={styles.btnTextRed}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {roleLower !== "landlord" &&
            !isPast &&
            statusLower !== "completed" && (
              <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
                {statusLower === "ready_to_book" && (
                  <TouchableOpacity
                    onPress={() => !hasGlobalActive && openBookingModal(item)}
                    disabled={hasGlobalActive}
                    style={[
                      styles.btnBlack,
                      hasGlobalActive && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.btnTextWhite}>
                      {hasGlobalActive
                        ? "Booking Limit Reached"
                        : "Schedule Viewing"}
                    </Text>
                  </TouchableOpacity>
                )}

                {statusLower === "rejected" && (
                  <TouchableOpacity
                    onPress={() => !hasGlobalActive && openBookingModal(item)}
                    disabled={hasGlobalActive}
                    style={[
                      styles.btnBlack,
                      hasGlobalActive && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.btnTextWhite}>
                      {hasGlobalActive ? "Booking Limit Reached" : "Book Again"}
                    </Text>
                  </TouchableOpacity>
                )}

                {isActiveBooking && (
                  <>
                    {isPending && (
                      <TouchableOpacity
                        onPress={() => openBookingModal(item)}
                        style={styles.btnBlue}
                      >
                        <Text style={styles.btnTextWhite}>Reschedule</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => promptCancelBooking(item)}
                      style={styles.btnOutlineRed}
                    >
                      <Text style={styles.btnTextRed}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
        </View>
      </View>
    );
  };

  const renderBookingSkeletonCard = (cardKey: string) => (
    <View
      key={cardKey}
      style={[
        styles.card,
        {
          backgroundColor: isDark ? colors.card : "white",
          borderColor: isDark ? colors.cardBorder : "#f3f4f6",
        },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <SkeletonBlock
            width="58%"
            height={17}
            borderRadius={8}
            backgroundColor={skeletonColor}
          />
          <SkeletonBlock
            width="72%"
            height={12}
            borderRadius={6}
            backgroundColor={skeletonColor}
            style={{ marginTop: 8 }}
          />
          <SkeletonBlock
            width="64%"
            height={12}
            borderRadius={6}
            backgroundColor={skeletonColor}
            style={{ marginTop: 7 }}
          />
          <SkeletonBlock
            width="90%"
            height={32}
            borderRadius={8}
            backgroundColor={skeletonColor}
            style={{ marginTop: 10 }}
          />
        </View>
        <SkeletonBlock
          width={86}
          height={24}
          borderRadius={8}
          backgroundColor={skeletonColor}
          style={{ marginLeft: 10 }}
        />
      </View>

      <View
        style={[
          styles.dateContainer,
          { backgroundColor: isDark ? colors.surface : "#f9fafb" },
        ]}
      >
        <SkeletonBlock
          width={98}
          height={10}
          borderRadius={5}
          backgroundColor={skeletonColor}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <SkeletonBlock
            width={108}
            height={12}
            borderRadius={6}
            backgroundColor={skeletonColor}
          />
          <SkeletonBlock
            width={98}
            height={12}
            borderRadius={6}
            backgroundColor={skeletonColor}
          />
        </View>
      </View>

      <View style={styles.actionContainer}>
        <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
          <SkeletonBlock
            width={120}
            height={36}
            borderRadius={10}
            backgroundColor={skeletonColor}
          />
          <SkeletonBlock
            width={100}
            height={36}
            borderRadius={10}
            backgroundColor={skeletonColor}
          />
        </View>
      </View>
    </View>
  );

  if (!loading && !session) {
    return (
      <GuestGuard
        message="Please log in to view and manage your bookings."
        returnTo="/(tabs)/bookings"
      />
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
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.surface : "white",
            borderBottomColor: isDark ? colors.border : "#f3f4f6",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.headerTitle,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            Viewing Bookings
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: isDark ? colors.textMuted : "#666" },
            ]}
          >
            Manage your viewing appointments.
          </Text>
        </View>

        {allBookings.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              const rows = allBookings
                .filter((b) => !b.is_application)
                .map((b) => ({
                  Property: b.property?.title || "-",
                  Tenant: b.tenant_profile
                    ? `${b.tenant_profile.first_name || ""} ${b.tenant_profile.last_name || ""}`.trim()
                    : "-",
                  Status: (b.status || "").replace(/_/g, " "),
                  "Booking Date": b.booking_date
                    ? new Date(b.booking_date).toLocaleDateString()
                    : "-",
                  "Start Time": b.start_time
                    ? new Date(b.start_time).toLocaleString()
                    : "-",
                  "End Time": b.end_time
                    ? new Date(b.end_time).toLocaleString()
                    : "-",
                  Notes: b.notes || "-",
                }));
              downloadExcel(
                rows,
                "Bookings",
                `bookings_${new Date().toISOString().slice(0, 10)}`,
              );
            }}
            style={[
              styles.exportBtn,
              {
                borderColor: isDark ? colors.border : "#d1d5db",
                backgroundColor: isDark ? colors.card : "white",
              },
            ]}
          >
            <Ionicons
              name="download-outline"
              size={18}
              color={isDark ? colors.text : "#374151"}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Grid */}
      {/* <View style={styles.statsGrid}>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: isDark ? colors.textMuted : "#999" },
            ]}
          >
            Pending
          </Text>
          <Text
            style={[styles.statValue, { color: isDark ? colors.text : "#111" }]}
          >
            {pendingCount}
          </Text>
        </View>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: isDark ? colors.textMuted : "#999" },
            ]}
          >
            Approved
          </Text>
          <Text style={[styles.statValue, { color: "#16a34a" }]}>
            {approvedCount}
          </Text>
        </View>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Text
            style={[
              styles.statLabel,
              { color: isDark ? colors.textMuted : "#999" },
            ]}
          >
            Rejected
          </Text>
          <Text style={[styles.statValue, { color: "#dc2626" }]}>
            {rejectedCount}
          </Text>
        </View>
      </View> */}

      {/* Filters */}
      <View
        style={[
          styles.filterScroll,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
        >
          {[
            "all",
            "pending",
            "approved",
            "completed",
            "rejected",
            "cancelled",
          ].map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[
                styles.filterBtn,
                { borderColor: isDark ? colors.cardBorder : "#e5e7eb" },
                filter === f && styles.filterBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: isDark ? colors.textSecondary : "#666" },
                  filter === f && styles.filterTextActive,
                ]}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 130 }}
          >
            {Array.from(
              { length: BOOKINGS_LOADING_SKELETON_COUNT },
              (_, index) => `booking-skeleton-${index}`,
            ).map((key) => renderBookingSkeletonCard(key))}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 130 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() =>
                  loadBookings(session?.user?.id, profile?.role, filter)
                }
              />
            }
          >
            {bookings.length === 0 ? (
              <Text style={styles.emptyText}>No bookings found.</Text>
            ) : (
              bookings.map((item) => (
                <View key={item.id}>{renderBookingCard({ item })}</View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      {/* Booking Modal - Redesigned */}
      <Modal
        visible={showBookingModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: isDark ? colors.background : "white",
          }}
        >
          {/* Modal Header */}
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: isDark ? colors.border : "#f3f4f6" },
            ]}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: "#111",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="calendar" size={20} color="white" />
              </View>
              <View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {bookingMode === "preferred"
                    ? selectedApplication && isRescheduleFlow
                      ? "Preferred Reschedule"
                      : "Preferred Schedule"
                    : selectedApplication && isRescheduleFlow
                      ? "Reschedule Viewing"
                      : "Schedule Viewing"}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textMuted : "#9ca3af",
                  }}
                >
                  {bookingMode === "preferred"
                    ? "Set your preferred date and time range"
                    : "Pick a time slot below"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowBookingModal(false);
                setBookingSlotsLoading(false);
                setBookingMode("slot");
                setSelectedBookingDateKey("");
                setPreferredDate("");
                setPreferredStartTime("");
                setPreferredEndTime("");
                setPreferredTimeError("");
                setShowPreferredStartPicker(false);
                setShowPreferredEndPicker(false);
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isDark ? colors.card : "#f3f4f6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="close"
                size={20}
                color={isDark ? colors.textMuted : "#666"}
              />
            </TouchableOpacity>
          </View>

          {/* Property Info */}
          {selectedApplication?.property && (
            <View
              style={{
                margin: 20,
                marginBottom: 0,
                padding: 14,
                backgroundColor: isDark ? colors.card : "#f9fafb",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isDark ? colors.cardBorder : "#f3f4f6",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: isDark ? colors.text : "#111",
                  fontSize: 14,
                }}
              >
                {selectedApplication.property.title}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                <Ionicons
                  name="location-outline"
                  size={12}
                  color={isDark ? colors.textMuted : "#9ca3af"}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textMuted : "#9ca3af",
                  }}
                >
                  {selectedApplication.property.address},{" "}
                  {selectedApplication.property.city}
                </Text>
              </View>
            </View>
          )}

          <View
            style={{
              marginHorizontal: 20,
              marginTop: 12,
              flexDirection: "row",
              borderWidth: 1,
              borderRadius: 12,
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              backgroundColor: isDark ? colors.card : "#f3f4f6",
              padding: 4,
              gap: 4,
            }}
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
                setSelectedTimeSlot("");
                setSelectedBookingDateKey("");
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

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {bookingMode === "slot" ? (
              <>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#9ca3af",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 12,
                  }}
                >
                  Available Time Slots
                </Text>

                {bookingSlotsLoading &&
                (isBookAgainFlow || isRescheduleFlow) ? (
                  <View style={{ paddingVertical: 8 }}>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                        borderRadius: 14,
                        padding: 12,
                        backgroundColor: isDark ? colors.card : "#fafafa",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 12,
                        }}
                      >
                        <SkeletonBlock
                          width={120}
                          height={14}
                          borderRadius={7}
                          backgroundColor={skeletonColor}
                        />
                        <SkeletonBlock
                          width={84}
                          height={14}
                          borderRadius={7}
                          backgroundColor={skeletonColor}
                        />
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        {Array.from({ length: 7 }, (_, idx) => (
                          <SkeletonBlock
                            key={`booking-modal-weekday-skel-${idx}`}
                            width={18}
                            height={10}
                            borderRadius={5}
                            backgroundColor={skeletonColor}
                          />
                        ))}
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {Array.from({ length: 14 }, (_, idx) => (
                          <SkeletonBlock
                            key={`booking-modal-day-skel-${idx}`}
                            width={34}
                            height={34}
                            borderRadius={10}
                            backgroundColor={skeletonColor}
                          />
                        ))}
                      </View>
                    </View>

                    <View style={{ marginTop: 12 }}>
                      <SkeletonBlock
                        width={96}
                        height={12}
                        borderRadius={6}
                        backgroundColor={skeletonColor}
                      />
                      <View style={{ marginTop: 8, gap: 8 }}>
                        {Array.from({ length: 3 }, (_, idx) => (
                          <SkeletonBlock
                            key={`booking-modal-slot-skel-${idx}`}
                            width="100%"
                            height={58}
                            borderRadius={14}
                            backgroundColor={skeletonColor}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                ) : availableTimeSlots.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <View
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        backgroundColor: "#f3f4f6",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 12,
                      }}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={28}
                        color="#d1d5db"
                      />
                    </View>
                    <Text style={{ fontWeight: "700", color: "#111" }}>
                      No slots available
                    </Text>
                    <Text
                      style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}
                    >
                      Contact the landlord directly.
                    </Text>
                  </View>
                ) : (
                  (() => {
                    const slotsByDate: any = {};
                    availableTimeSlots.forEach((slot: any) => {
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
                    const viewDate = new Date(
                      today.getFullYear(),
                      today.getMonth() + bookingCalendarMonthOffset,
                      1,
                    );
                    const year = viewDate.getFullYear();
                    const month = viewDate.getMonth();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const firstDay = new Date(year, month, 1).getDay();

                    const selectedSlotData = availableTimeSlots.find(
                      (s: any) => String(s.id) === String(selectedTimeSlot),
                    );
                    const selectedDateFromSlot = selectedSlotData
                      ? `${new Date(selectedSlotData.start_time).getFullYear()}-${String(new Date(selectedSlotData.start_time).getMonth() + 1).padStart(2, "0")}-${String(new Date(selectedSlotData.start_time).getDate()).padStart(2, "0")}`
                      : "";
                    const selectedDateKey =
                      selectedBookingDateKey || selectedDateFromSlot;

                    const selectedDateSlots = [
                      ...(slotsByDate[selectedDateKey] || []),
                    ].sort(
                      (a: any, b: any) =>
                        new Date(a.start_time).getTime() -
                        new Date(b.start_time).getTime(),
                    );

                    return (
                      <>
                        <View
                          style={[
                            styles.bookingCalendarCard,
                            {
                              backgroundColor: isDark ? colors.card : "#fafafa",
                              borderColor: isDark
                                ? colors.cardBorder
                                : "#e5e7eb",
                            },
                          ]}
                        >
                          <View style={styles.bookingCalendarHeader}>
                            <TouchableOpacity
                              onPress={() =>
                                setBookingCalendarMonthOffset(
                                  (prev) => prev - 1,
                                )
                              }
                              style={styles.bookingCalendarNavBtn}
                            >
                              <Ionicons
                                name="chevron-back"
                                size={20}
                                color={isDark ? colors.text : "#333"}
                              />
                            </TouchableOpacity>
                            <Text
                              style={[
                                styles.bookingCalendarMonth,
                                { color: isDark ? colors.text : "#111" },
                              ]}
                            >
                              {viewDate.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                              })}
                            </Text>
                            <TouchableOpacity
                              onPress={() =>
                                setBookingCalendarMonthOffset(
                                  (prev) => prev + 1,
                                )
                              }
                              style={styles.bookingCalendarNavBtn}
                            >
                              <Ionicons
                                name="chevron-forward"
                                size={20}
                                color={isDark ? colors.text : "#333"}
                              />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.bookingWeekRow}>
                            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                              <Text
                                key={`weekday-${d}-${i}`}
                                style={styles.bookingWeekDay}
                              >
                                {d}
                              </Text>
                            ))}
                          </View>

                          <View style={styles.bookingDaysGrid}>
                            {Array.from({ length: firstDay }).map((_, i) => (
                              <View
                                key={`booking-empty-${i}`}
                                style={styles.bookingDayCell}
                              />
                            ))}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                              const day = i + 1;
                              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                              const dateObj = new Date(year, month, day);
                              const daySlots = slotsByDate[dateKey] || [];
                              const hasSlots = daySlots.length > 0;
                              const selectableCount = daySlots.filter(
                                (slot: any) => !slot.isBookedByOtherTenant,
                              ).length;
                              const isFullyBooked =
                                hasSlots && selectableCount === 0;
                              const isSelected = selectedDateKey === dateKey;
                              const isPast = dateObj < todayStart;

                              return (
                                <TouchableOpacity
                                  key={`booking-day-${day}`}
                                  disabled={!hasSlots || isPast}
                                  onPress={() => {
                                    const slots = slotsByDate[dateKey] || [];
                                    setSelectedBookingDateKey(dateKey);
                                    const firstSelectable = slots.find(
                                      (slot: any) =>
                                        !slot.isBookedByOtherTenant,
                                    );
                                    setSelectedTimeSlot(
                                      firstSelectable
                                        ? String(firstSelectable.id)
                                        : "",
                                    );
                                  }}
                                  style={[
                                    styles.bookingDayCell,
                                    isSelected && styles.bookingDayCellSelected,
                                    (!hasSlots || isPast) &&
                                      styles.bookingDayCellDisabled,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.bookingDayText,
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
                                        styles.bookingDayDot,
                                        isFullyBooked
                                          ? styles.bookingDayDotBooked
                                          : styles.bookingDayDotAvailable,
                                      ]}
                                    />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <View
                            style={[
                              styles.bookingLegendRow,
                              {
                                borderTopColor: isDark
                                  ? colors.border
                                  : "#e5e7eb",
                              },
                            ]}
                          >
                            <View style={styles.bookingLegendItem}>
                              <View
                                style={[
                                  styles.bookingLegendDot,
                                  styles.bookingDayDotAvailable,
                                ]}
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
                            <View style={styles.bookingLegendItem}>
                              <View
                                style={[
                                  styles.bookingLegendDot,
                                  styles.bookingDayDotBooked,
                                ]}
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
                        </View>

                        {selectedDateKey ? (
                          <View style={{ marginTop: 12 }}>
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "700",
                                color: "#9ca3af",
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                                marginBottom: 8,
                              }}
                            >
                              Time Slots
                            </Text>

                            {selectedDateSlots.map((slot: any) => {
                              const info = getTimeSlotInfo(
                                slot.start_time,
                                slot.end_time,
                              );
                              const startDate = new Date(slot.start_time);
                              const endDate = new Date(slot.end_time);
                              const isSelected =
                                String(selectedTimeSlot) === String(slot.id);
                              const isOriginalSlot =
                                !!originalSlotIdForModal &&
                                String(originalSlotIdForModal) ===
                                  String(slot.id);
                              const isBooked = !!slot.isBookedByOtherTenant;
                              const dayName = startDate.toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "short",
                                },
                              );
                              const dateStr = startDate.toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                },
                              );
                              const startStr = startDate.toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              );
                              const endStr = endDate.toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                  hour12: true,
                                },
                              );

                              return (
                                <TouchableOpacity
                                  key={slot.id}
                                  style={[
                                    styles.slotItem,
                                    isBooked && styles.slotItemBooked,
                                    isOriginalSlot &&
                                      !isSelected &&
                                      !isBooked && {
                                        borderColor: "#2563eb",
                                        borderWidth: 1.8,
                                        backgroundColor: isDark
                                          ? "#111827"
                                          : "#eff6ff",
                                      },
                                    isSelected &&
                                      !isBooked &&
                                      styles.slotItemActive,
                                  ]}
                                  onPress={() =>
                                    !isBooked &&
                                    setSelectedTimeSlot(String(slot.id))
                                  }
                                  disabled={isBooked}
                                  activeOpacity={0.8}
                                >
                                  <View
                                    style={[
                                      styles.slotRadio,
                                      isSelected &&
                                        !isBooked &&
                                        styles.slotRadioActive,
                                    ]}
                                  >
                                    {isSelected && !isBooked && (
                                      <View style={styles.slotRadioDot} />
                                    )}
                                  </View>

                                  <View
                                    style={[
                                      styles.slotIconBox,
                                      {
                                        backgroundColor: isBooked
                                          ? "#fee2e2"
                                          : isSelected
                                            ? "rgba(255,255,255,0.15)"
                                            : info.color + "15",
                                      },
                                    ]}
                                  >
                                    <Ionicons
                                      name={info.icon}
                                      size={18}
                                      color={
                                        isBooked
                                          ? "#ef4444"
                                          : isSelected
                                            ? "white"
                                            : info.color
                                      }
                                    />
                                  </View>

                                  <View style={{ flex: 1 }}>
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 6,
                                      }}
                                    >
                                      <Text
                                        style={[
                                          styles.slotText,
                                          isSelected &&
                                            !isBooked &&
                                            styles.slotTextActive,
                                          isBooked && styles.slotTextBooked,
                                        ]}
                                      >
                                        {dayName}, {dateStr}
                                      </Text>
                                      {isOriginalSlot && (
                                        <View
                                          style={{
                                            backgroundColor:
                                              isSelected && !isBooked
                                                ? "rgba(255,255,255,0.22)"
                                                : "#dbeafe",
                                            paddingHorizontal: 7,
                                            paddingVertical: 2,
                                            borderRadius: 6,
                                          }}
                                        >
                                          <Text
                                            style={{
                                              fontSize: 9,
                                              fontWeight: "800",
                                              color:
                                                isSelected && !isBooked
                                                  ? "white"
                                                  : "#1d4ed8",
                                            }}
                                          >
                                            CURRENT SCHEDULE
                                          </Text>
                                        </View>
                                      )}
                                      <View
                                        style={[
                                          styles.slotTypeBadge,
                                          {
                                            backgroundColor: isBooked
                                              ? "#fee2e2"
                                              : isSelected
                                                ? "rgba(255,255,255,0.2)"
                                                : info.color + "18",
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={{
                                            fontSize: 9,
                                            fontWeight: "800",
                                            color: isBooked
                                              ? "#ef4444"
                                              : isSelected
                                                ? "white"
                                                : info.color,
                                          }}
                                        >
                                          {isBooked ? "BOOKED" : info.label}
                                        </Text>
                                      </View>
                                    </View>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        color: isBooked
                                          ? "#ef4444"
                                          : isSelected
                                            ? "rgba(255,255,255,0.7)"
                                            : "#9ca3af",
                                        marginTop: 2,
                                      }}
                                    >
                                      {startStr} – {endStr}
                                      {isBooked ? " • BOOKED" : ""}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </>
                    );
                  })()
                )}
              </>
            ) : (
              <View
                style={[
                  styles.bookingCalendarCard,
                  {
                    backgroundColor: isDark ? colors.card : "#fafafa",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                    padding: 12,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.label,
                    {
                      marginTop: 0,
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
                  <>
                    <Text
                      style={[
                        styles.label,
                        {
                          color: isDark ? colors.textMuted : "#666",
                          marginTop: 12,
                        },
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
                          backgroundColor: isDark ? colors.surface : "#f9fafb",
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
                          backgroundColor: isDark ? colors.surface : "#f9fafb",
                          borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                        },
                        !preferredStartTime && styles.bookingDayCellDisabled,
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
                        Selected range: {formatTimeLabel(preferredStartTime)} -{" "}
                        {formatTimeLabel(preferredEndTime)}
                      </Text>
                    )}
                  </>
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
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginTop: 20,
                marginBottom: 8,
              }}
            >
              Notes (Optional)
            </Text>
            <TextInput
              style={styles.textArea}
              placeholder="Any questions or specific requests?"
              placeholderTextColor="#c4c4c4"
              multiline
              value={bookingNotes}
              onChangeText={setBookingNotes}
            />
            <Text style={{ fontSize: 11, color: "#d1d5db", marginTop: 6 }}>
              Note: You can't cancel the booking once approved.
            </Text>
          </ScrollView>

          {/* Fixed Bottom */}
          <View
            style={{
              padding: 20,
              paddingBottom: 30,
              borderTopWidth: 1,
              borderTopColor: isDark ? colors.border : "#f3f4f6",
              backgroundColor: isDark ? colors.surface : "white",
            }}
          >
            {/** Keep label visible at all times so users can always see the primary action */}
            <TouchableOpacity
              style={[
                styles.modalConfirmBtn,
                (submittingBooking ||
                  (bookingMode === "slot"
                    ? !selectedTimeSlot
                    : !preferredDate ||
                      !preferredStartTime ||
                      !preferredEndTime ||
                      !!preferredTimeError)) &&
                  styles.modalConfirmBtnDisabled,
              ]}
              onPress={submitBooking}
              disabled={
                submittingBooking ||
                (bookingMode === "slot"
                  ? !selectedTimeSlot
                  : !preferredDate ||
                    !preferredStartTime ||
                    !preferredEndTime ||
                    !!preferredTimeError)
              }
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  gap: 8,
                }}
              >
                {submittingBooking ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="white" />
                )}
                <Text
                  style={styles.modalConfirmBtnText}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {submittingBooking
                    ? bookingMode === "preferred"
                      ? "Submitting Preferred Schedule..."
                      : isRescheduleFlow
                        ? "Submitting Reschedule..."
                        : "Submitting Schedule..."
                    : bookingMode === "preferred"
                      ? isRescheduleFlow
                        ? "Submit Preferred Reschedule"
                        : "Submit Preferred Schedule"
                      : isRescheduleFlow
                        ? "Confirm Reschedule"
                        : "Confirm Schedule"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal visible={showCancelModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContentSmall,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#fef2f2",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Ionicons name="warning" size={24} color="#ef4444" />
            </View>
            <Text
              style={[
                styles.modalTitleCenter,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Cancel Viewing?
            </Text>
            <Text
              style={[
                styles.modalTextCenter,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              Are you sure you want to cancel your viewing
              {bookingToCancel?.property?.title
                ? ` for ${bookingToCancel.property.title}`
                : ""}
              ? This action cannot be undone.
            </Text>
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 20,
                width: "100%",
              }}
            >
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                style={[
                  styles.btnOutline,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  },
                ]}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: isDark ? colors.text : "#000",
                  }}
                >
                  Keep it
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmCancelBooking}
                style={styles.btnRed}
              >
                <Text style={styles.btnTextWhite}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRejectModal} animationType="fade" transparent>
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
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Reject Booking
            </Text>
            <Text
              style={{
                fontSize: 13,
                marginTop: 8,
                color: isDark ? colors.textMuted : "#6b7280",
              }}
            >
              Add the reason. It will be sent to tenant via email and SMS.
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  marginTop: 14,
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  color: isDark ? colors.text : "#111",
                  minHeight: 96,
                },
              ]}
              placeholder="Reason for rejection"
              placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
            />
            <View style={{ flexDirection: "row", marginTop: 16, gap: 10 }}>
              <TouchableOpacity
                style={[
                  styles.btnOutline,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  },
                ]}
                onPress={() => {
                  if (submittingReject) return;
                  setShowRejectModal(false);
                  setBookingToReject(null);
                  setRejectReason("");
                }}
              >
                <Text
                  style={{
                    color: isDark ? colors.text : "#111",
                    fontWeight: "700",
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnRed}
                onPress={rejectBooking}
                disabled={submittingReject}
              >
                {submittingReject ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.btnTextWhite}>Confirm Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ASSIGN TENANT MODAL WIZARD */}
      <Modal
        visible={showAssignModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: isDark ? colors.background : "#f9fafb",
          }}
        >
          {/* Top Bar */}
          <View
            style={[
              styles.wizardTopBar,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <TouchableOpacity
              onPress={() => setShowAssignModal(false)}
              style={styles.backBtnText}
            >
              <Ionicons
                name="chevron-down"
                size={18}
                color={isDark ? colors.textSecondary : "#4b5563"}
              />
              <Text
                style={{
                  fontWeight: "600",
                  color: isDark ? colors.textSecondary : "#4b5563",
                  fontSize: 14,
                }}
              >
                Close
              </Text>
            </TouchableOpacity>
            <Text style={styles.stepCounterText}>
              STEP {assignStep + 1} OF {ASSIGN_STEPS.length}
            </Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${((assignStep + 1) / ASSIGN_STEPS.length) * 100}%` },
              ]}
            />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {/* Page Title */}
            <View style={styles.titleContainer}>
              <View style={styles.titleIconBox}>
                <Ionicons name="person-add" size={20} color="white" />
              </View>
              <View>
                <Text style={styles.pageTitle}>Assign Tenant</Text>
                <Text style={styles.pageSubtitle}>
                  Set up the occupancy contract
                </Text>
              </View>
            </View>

            {/* Stepper Pills */}
            <View style={styles.stepperContainer}>
              {ASSIGN_STEPS.map((s, i) => {
                const isPast = i < assignStep;
                const isCurrent = i === assignStep;
                return (
                  <View key={i} style={{ flex: 1, marginHorizontal: 2 }}>
                    <View
                      style={[
                        styles.stepperLine,
                        isPast
                          ? { backgroundColor: "#10b981" }
                          : isCurrent
                            ? { backgroundColor: "#111" }
                            : { backgroundColor: "#e5e7eb" },
                      ]}
                    />
                    <View style={styles.stepperLabelContainer}>
                      <View
                        style={[
                          styles.stepperNumber,
                          isPast
                            ? { backgroundColor: "#10b981" }
                            : isCurrent
                              ? { backgroundColor: "#111" }
                              : { backgroundColor: "#e5e7eb" },
                        ]}
                      >
                        {isPast ? (
                          <Ionicons name="checkmark" size={10} color="white" />
                        ) : (
                          <Text
                            style={[
                              styles.stepperNumberText,
                              (isPast || isCurrent) && { color: "white" },
                            ]}
                          >
                            {i + 1}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stepperLabel,
                          isCurrent && { color: "#111", fontWeight: "bold" },
                        ]}
                      >
                        {s.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.stepContentCard}>
              {assignStep === 0 && (
                <View style={{ width: "100%" }}>
                  {assignBooking?.tenant_profile && (
                    <View style={styles.wizardTenantCard}>
                      <View style={styles.wizardTenantAvatar}>
                        <Text style={{ color: "white", fontWeight: "bold" }}>
                          {assignBooking.tenant_profile.first_name?.[0]}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.wizardTenantRole}>
                          Assigning Tenant
                        </Text>
                        <Text style={styles.wizardTenantName}>
                          {assignBooking.tenant_profile.first_name}{" "}
                          {assignBooking.tenant_profile.last_name}
                        </Text>
                      </View>
                    </View>
                  )}
                  <Text style={styles.wizardLabel}>Select Property *</Text>
                  <ScrollView
                    nestedScrollEnabled
                    style={styles.wizardPropScroll}
                  >
                    {availableProperties.map((p) => {
                      const normalizedId = String(p.id);
                      const isSelected =
                        String(selectedPropertyId) === normalizedId;
                      const isBookedProperty =
                        normalizedId === String(assignBooking?.property_id);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setSelectedPropertyId(normalizedId)}
                          style={[
                            styles.wizardPropItem,
                            isSelected && styles.wizardPropItemSelected,
                            isBookedProperty &&
                              !isSelected &&
                              styles.wizardPropItemBooked,
                          ]}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <View>
                              <Text
                                style={{
                                  fontWeight: "bold",
                                  color: isSelected ? "white" : "#111",
                                }}
                              >
                                {p.title}{" "}
                                {isBookedProperty &&
                                  !isSelected &&
                                  "(Requested)"}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: isSelected ? "#ccc" : "#666",
                                  marginTop: 2,
                                }}
                              >
                                {[p.city, p.state_province]
                                  .filter(Boolean)
                                  .join(", ") || "Location not set"}
                                {" • ₱"}
                                {p.price}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.radioOuter,
                                isSelected && styles.radioOuterSelected,
                              ]}
                            >
                              {isSelected && <View style={styles.radioInner} />}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {assignStep === 1 &&
                (() => {
                  const selectedPropInfo = availableProperties.find(
                    (p: any) => String(p.id) === String(selectedPropertyId),
                  );
                  const rentPrice =
                    selectedPropInfo?.price ||
                    assignBooking?.property?.price ||
                    0;
                  const hasAdvance =
                    typeof selectedPropInfo?.has_advance === "boolean"
                      ? selectedPropInfo?.has_advance
                      : Number(selectedPropInfo?.advance_amount || 0) > 0;
                  const uiAdvanceAmount = hasAdvance
                    ? Number(selectedPropInfo?.advance_amount || rentPrice)
                    : 0;
                  const hasSecurityDeposit =
                    typeof selectedPropInfo?.has_security_deposit === "boolean"
                      ? selectedPropInfo?.has_security_deposit
                      : Number(selectedPropInfo?.security_deposit_amount || 0) >
                        0;
                  const uiSecurityDeposit = hasSecurityDeposit
                    ? Number(
                        selectedPropInfo?.security_deposit_amount || rentPrice,
                      )
                    : 0;
                  const uiTotalMoveIn =
                    rentPrice + uiAdvanceAmount + uiSecurityDeposit;
                  const effectivePaidMoveInItems = {
                    rent: paidMoveInItems.rent,
                    securityDeposit:
                      hasSecurityDeposit && paidMoveInItems.securityDeposit,
                    advance: hasAdvance && paidMoveInItems.advance,
                  };
                  const paidOfflineLabels = [
                    effectivePaidMoveInItems.rent ? "Rent Bill" : null,
                    effectivePaidMoveInItems.securityDeposit
                      ? "Security Deposit"
                      : null,
                    effectivePaidMoveInItems.advance ? "Advance Payment" : null,
                  ].filter(Boolean) as string[];
                  const hasPaidOfflineMoveInAmount =
                    paidOfflineLabels.length > 0;

                  return (
                    <View style={{ width: "100%" }}>
                      <Text style={styles.wizardLabel}>Start Date *</Text>
                      <CalendarPicker
                        selectedDate={startDate}
                        onDateSelect={setStartDate}
                      />

                      <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>Move-in Summary</Text>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>
                            Rent (1st Month):
                          </Text>
                          <Text style={styles.summaryValue}>
                            ₱{rentPrice.toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>Advance Pay:</Text>
                          <Text style={styles.summaryValue}>
                            ₱{uiAdvanceAmount.toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>
                            Security Deposit:
                          </Text>
                          <Text style={styles.summaryValue}>
                            ₱{uiSecurityDeposit.toLocaleString()}
                          </Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryTotalLabel}>
                            Total Amount:
                          </Text>
                          <Text style={styles.summaryTotalValue}>
                            ₱{uiTotalMoveIn.toLocaleString()}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}

              {assignStep === 2 && (
                <View style={{ width: "100%" }}>
                  <Text style={styles.wizardLabel}>
                    Contract PDF (Optional)
                  </Text>
                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={pickContractFile}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={
                        contractFile
                          ? "document-attach"
                          : "cloud-upload-outline"
                      }
                      size={22}
                      color={contractFile ? "#10b981" : "#9ca3af"}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        color: contractFile ? "#10b981" : "#9ca3af",
                        fontWeight: "600",
                      }}
                    >
                      {contractFile
                        ? contractFile.name
                        : "Click to upload contract PDF"}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.wizardLabel}>
                    Late Payment Fee (₱) (Optional)
                  </Text>
                  <TextInput
                    style={styles.wizardInput}
                    value={penaltyDetails}
                    onChangeText={setPenaltyDetails}
                    keyboardType="numeric"
                    placeholder="e.g. 500"
                    placeholderTextColor="#c4c4c4"
                  />
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      marginTop: 4,
                      marginLeft: 4,
                    }}
                  >
                    Amount charged when rent is paid late.
                  </Text>
                </View>
              )}

              {assignStep === 3 &&
                (() => {
                  const selectedPropInfo = availableProperties.find(
                    (p: any) => String(p.id) === String(selectedPropertyId),
                  );
                  const amenities = selectedPropInfo?.amenities || [];
                  const isWaterFree = amenities.includes("Free Water");
                  const isElecFree = amenities.includes("Free Electricity");
                  const isWifiFree = amenities.includes("Free WiFi");
                  const requireWifiDueDate = amenities.includes("Paid WiFi");
                  const rentPrice =
                    selectedPropInfo?.price ||
                    assignBooking?.property?.price ||
                    0;
                  const hasAdvance =
                    typeof selectedPropInfo?.has_advance === "boolean"
                      ? selectedPropInfo?.has_advance
                      : Number(selectedPropInfo?.advance_amount || 0) > 0;
                  const hasSecurityDeposit =
                    typeof selectedPropInfo?.has_security_deposit === "boolean"
                      ? selectedPropInfo?.has_security_deposit
                      : Number(selectedPropInfo?.security_deposit_amount || 0) >
                        0;
                  const effectivePaidMoveInItems = {
                    rent: paidMoveInItems.rent,
                    securityDeposit:
                      hasSecurityDeposit && paidMoveInItems.securityDeposit,
                    advance: hasAdvance && paidMoveInItems.advance,
                  };
                  const paidOfflineLabels = [
                    effectivePaidMoveInItems.rent ? "Rent Bill" : null,
                    effectivePaidMoveInItems.securityDeposit
                      ? "Security Deposit"
                      : null,
                    effectivePaidMoveInItems.advance ? "Advance Payment" : null,
                  ].filter(Boolean) as string[];
                  const hasPaidOfflineMoveInAmount =
                    paidOfflineLabels.length > 0;

                  return (
                    <View style={{ width: "100%" }}>
                      <View style={styles.wizardInfoBox}>
                        <Ionicons
                          name="information-circle"
                          size={16}
                          color="#4f46e5"
                        />
                        <Text style={styles.wizardInfoText}>
                          Select a due day for each utility. A 4-day
                          notification window allows you to prepare for upcoming
                          billing.
                        </Text>
                      </View>

                      {/* Water */}
                      {!isWaterFree ? (
                        <View style={styles.utilityInputCard}>
                          <View
                            style={[
                              styles.utilityIconBox,
                              { backgroundColor: "#eff6ff" },
                            ]}
                          >
                            <Ionicons name="water" size={18} color="#3b82f6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.utilityName}>
                              Water Due Day
                            </Text>
                            <Text style={styles.utilityDesc}>
                              Day of month (1-31)
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.utilityInput,
                              { width: 90, justifyContent: "center" },
                            ]}
                            onPress={() => setShowWaterDayPicker(true)}
                          >
                            <Text
                              style={{
                                textAlign: "center",
                                fontWeight: "bold",
                                color: "#111",
                              }}
                            >
                              {waterDueDay
                                ? `${waterDueDay} - ${Math.min(parseInt(waterDueDay) + 3, 31)}`
                                : "Select"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.utilityFreeCard}>
                          <View
                            style={[
                              styles.utilityIconBox,
                              { backgroundColor: "#dcfce7" },
                            ]}
                          >
                            <Ionicons name="water" size={18} color="#10b981" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[styles.utilityName, { color: "#047857" }]}
                            >
                              Free Water
                            </Text>
                          </View>
                          <View style={styles.utilityBadge}>
                            <Text style={styles.utilityBadgeText}>
                              Included
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Electricity */}
                      {!isElecFree ? (
                        <View style={styles.utilityInputCard}>
                          <View
                            style={[
                              styles.utilityIconBox,
                              { backgroundColor: "#fef3c7" },
                            ]}
                          >
                            <Ionicons name="flash" size={18} color="#f59e0b" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.utilityName}>
                              Electricity Due Day
                            </Text>
                            <Text style={styles.utilityDesc}>
                              Day of month (1-31)
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.utilityInput,
                              { width: 90, justifyContent: "center" },
                            ]}
                            onPress={() => setShowElectricityDayPicker(true)}
                          >
                            <Text
                              style={{
                                textAlign: "center",
                                fontWeight: "bold",
                                color: "#111",
                              }}
                            >
                              {electricityDueDay
                                ? `${electricityDueDay} - ${Math.min(parseInt(electricityDueDay) + 3, 31)}`
                                : "Select"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.utilityFreeCard}>
                          <View
                            style={[
                              styles.utilityIconBox,
                              { backgroundColor: "#dcfce7" },
                            ]}
                          >
                            <Ionicons name="flash" size={18} color="#10b981" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[styles.utilityName, { color: "#047857" }]}
                            >
                              Free Electricity
                            </Text>
                          </View>
                          <View style={styles.utilityBadge}>
                            <Text style={styles.utilityBadgeText}>
                              Included
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* WiFi */}
                      {requireWifiDueDate ? (
                        <View style={styles.utilityInputCard}>
                          <View
                            style={[
                              styles.utilityIconBox,
                              { backgroundColor: "#f3e8ff" },
                            ]}
                          >
                            <Ionicons name="wifi" size={18} color="#8b5cf6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.utilityName}>WiFi Due Day</Text>
                            <Text style={styles.utilityDesc}>
                              Day of month (1-31)
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.utilityInput,
                              { width: 90, justifyContent: "center" },
                            ]}
                            onPress={() => setShowWifiDayPicker(true)}
                          >
                            <Text
                              style={{
                                textAlign: "center",
                                fontWeight: "bold",
                                color: "#111",
                              }}
                            >
                              {wifiDueDay
                                ? `${wifiDueDay} - ${Math.min(parseInt(wifiDueDay) + 3, 31)}`
                                : "Select"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.utilityFreeCard}>
                          <View
                            style={[
                              styles.utilityIconBox,
                              {
                                backgroundColor: isWifiFree
                                  ? "#dcfce7"
                                  : "#f3f4f6",
                              },
                            ]}
                          >
                            <Ionicons
                              name={isWifiFree ? "wifi" : "wifi-outline"}
                              size={18}
                              color={isWifiFree ? "#10b981" : "#6b7280"}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.utilityName,
                                { color: isWifiFree ? "#047857" : "#4b5563" },
                              ]}
                            >
                              {isWifiFree ? "Free WiFi" : "WiFi not provided"}
                            </Text>
                          </View>
                          <View style={styles.utilityBadge}>
                            <Text style={styles.utilityBadgeText}>
                              {isWifiFree ? "Included" : "N/A"}
                            </Text>
                          </View>
                        </View>
                      )}

                      <View style={styles.alreadyPaidCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.alreadyPaidTitle}>
                            Tenant already paid?
                          </Text>
                          <Text style={styles.alreadyPaidDesc}>
                            Tap each fee already paid offline. Only unpaid fees
                            will be auto-billed.
                          </Text>
                        </View>
                        <View style={styles.alreadyPaidOptions}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => togglePaidMoveInItem("rent")}
                            style={[
                              styles.alreadyPaidOption,
                              effectivePaidMoveInItems.rent &&
                                styles.alreadyPaidOptionActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.alreadyPaidOptionText,
                                effectivePaidMoveInItems.rent &&
                                  styles.alreadyPaidOptionTextActive,
                              ]}
                            >
                              Rent Bill
                            </Text>
                          </TouchableOpacity>
                          {hasSecurityDeposit && (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() =>
                                togglePaidMoveInItem("securityDeposit")
                              }
                              style={[
                                styles.alreadyPaidOption,
                                effectivePaidMoveInItems.securityDeposit &&
                                  styles.alreadyPaidOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.alreadyPaidOptionText,
                                  effectivePaidMoveInItems.securityDeposit &&
                                    styles.alreadyPaidOptionTextActive,
                                ]}
                              >
                                Security Deposit
                              </Text>
                            </TouchableOpacity>
                          )}
                          {hasAdvance && (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => togglePaidMoveInItem("advance")}
                              style={[
                                styles.alreadyPaidOption,
                                effectivePaidMoveInItems.advance &&
                                  styles.alreadyPaidOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.alreadyPaidOptionText,
                                  effectivePaidMoveInItems.advance &&
                                    styles.alreadyPaidOptionTextActive,
                                ]}
                              >
                                Advance Payment
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                      {hasPaidOfflineMoveInAmount && (
                        <Text style={styles.alreadyPaidNote}>
                          Paid offline: {joinMoveInLabels(paidOfflineLabels)}
                        </Text>
                      )}
                    </View>
                  );
                })()}
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.bottomActions}>
            {assignStep > 0 && (
              <TouchableOpacity
                style={styles.wizardBtnSecondary}
                onPress={prevAssignStep}
              >
                <Text style={styles.wizardBtnSecondaryText}>Back</Text>
              </TouchableOpacity>
            )}
            {assignStep < ASSIGN_STEPS.length - 1 ? (
              <TouchableOpacity
                style={styles.wizardBtnPrimary}
                onPress={nextAssignStep}
              >
                <Text style={styles.wizardBtnPrimaryText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.wizardBtnPrimary,
                  uploadingContract && { opacity: 0.7 },
                ]}
                onPress={confirmAssignTenant}
                disabled={uploadingContract}
              >
                {uploadingContract ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.wizardBtnPrimaryText}>Assign Tenant</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
          {/* Day Picker Overlay */}
          {(showWaterDayPicker ||
            showElectricityDayPicker ||
            showWifiDayPicker) && (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor: "rgba(0,0,0,0.5)",
                  justifyContent: "center",
                  alignItems: "center",
                  zIndex: 999,
                },
              ]}
            >
              <View
                style={{
                  backgroundColor: "white",
                  borderRadius: 24,
                  padding: 24,
                  alignItems: "center",
                  width: "85%",
                  maxWidth: 350,
                }}
              >
                <Text style={styles.modalTitleCenter}>Select Due Day</Text>
                <Text style={styles.modalTextCenter}>
                  Auto sets a 4-day billing period
                </Text>

                <View style={{ height: 260, marginTop: 20, width: "100%" }}>
                  <ScrollView
                    contentContainerStyle={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "center",
                    }}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <TouchableOpacity
                        key={day}
                        style={{
                          width: 55,
                          height: 40,
                          backgroundColor: "#f3f4f6",
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onPress={() => {
                          if (showWaterDayPicker)
                            setWaterDueDay(day.toString());
                          if (showElectricityDayPicker)
                            setElectricityDueDay(day.toString());
                          if (showWifiDayPicker) setWifiDueDay(day.toString());

                          setShowWaterDayPicker(false);
                          setShowElectricityDayPicker(false);
                          setShowWifiDayPicker(false);
                        }}
                      >
                        <Text style={{ fontWeight: "bold", color: "#111" }}>
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: "#9ca3af",
                    textAlign: "center",
                    marginTop: 12,
                  }}
                >
                  For months with fewer days, the last available day is used.
                </Text>

                <TouchableOpacity
                  style={{
                    marginTop: 20,
                    width: "100%",
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: "#f3f4f6",
                    alignItems: "center",
                  }}
                  onPress={() => {
                    setShowWaterDayPicker(false);
                    setShowElectricityDayPicker(false);
                    setShowWifiDayPicker(false);
                  }}
                >
                  <Text style={{ fontWeight: "bold", color: "#111" }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#111" },
  headerSub: { fontSize: 14, color: "#666", marginTop: 4 },
  exportBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },

  statsGrid: { flexDirection: "row", gap: 10, padding: 20, paddingBottom: 0 },
  statCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 5,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#999",
    textTransform: "uppercase",
  },
  statValue: { fontSize: 20, fontWeight: "900", color: "#111", marginTop: 5 },

  filterScroll: {
    paddingVertical: 12,
    paddingBottom: 8,
    backgroundColor: "#f9fafb",
  },
  filterBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  filterBtnActive: { backgroundColor: "black", borderColor: "black" },
  filterText: { fontSize: 13, fontWeight: "700", color: "#666" },
  filterTextActive: { color: "white" },

  emptyText: { textAlign: "center", color: "#999", marginTop: 40 },

  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: "#111" },
  cardSubtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  notes: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
    backgroundColor: "#f9fafb",
    padding: 8,
    borderRadius: 8,
  },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeGray: { backgroundColor: "#f3f4f6" },
  badgeTextGray: { color: "#666", fontSize: 10, fontWeight: "bold" },
  badgeBlue: { backgroundColor: "#eff6ff" },
  badgeTextBlue: { color: "#1d4ed8", fontSize: 10, fontWeight: "bold" },
  badgeYellow: { backgroundColor: "#fefce8" },
  badgeTextYellow: { color: "#854d0e", fontSize: 10, fontWeight: "bold" },
  badgeGreen: { backgroundColor: "#f0fdf4" },
  badgeTextGreen: { color: "#15803d", fontSize: 10, fontWeight: "bold" },
  badgeRed: { backgroundColor: "#fef2f2" },
  badgeTextRed: { color: "#b91c1c", fontSize: 10, fontWeight: "bold" },
  badgeIndigo: { backgroundColor: "#eef2ff" },
  badgeTextIndigo: { color: "#4338ca", fontSize: 10, fontWeight: "bold" },
  preferredScheduleTag: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#ecfccb",
    borderColor: "#84cc16",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  preferredScheduleTagText: {
    color: "#365314",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  // New Action Banner
  actionBanner: {
    backgroundColor: "#eff6ff",
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#2563eb",
  },
  actionBannerTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1d4ed8",
    textTransform: "uppercase",
  },
  actionBannerText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginTop: 2,
  },

  dateContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
  },
  dateLabel: { fontSize: 10, fontWeight: "bold", color: "#9ca3af" },
  dateValue: { fontSize: 14, fontWeight: "bold", color: "#111", marginTop: 2 },
  timeValue: { fontSize: 12, color: "#666" },

  actionContainer: { marginTop: 16, flexDirection: "row", gap: 10 },

  btnBlack: {
    backgroundColor: "black",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  btnBlue: {
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  btnRed: {
    backgroundColor: "#dc2626",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  btnApprove: {
    backgroundColor: "#16a34a",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  btnReject: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  btnOutline: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  btnOutlineRed: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },

  btnTextWhite: { color: "white", fontWeight: "bold", fontSize: 12 },
  btnTextGray: { color: "#374151", fontWeight: "bold", fontSize: 12 },
  btnTextRed: { color: "#dc2626", fontWeight: "bold", fontSize: 12 },
  btnDisabled: { opacity: 0.5 },
  warningText: {
    fontSize: 10,
    color: "#ef4444",
    fontStyle: "italic",
    alignSelf: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: { backgroundColor: "white", borderRadius: 24, padding: 24 },
  modalContentSmall: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  modalTitleCenter: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    color: "#111",
  },
  modalTextCenter: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },

  bookingModeBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingModeBtnActive: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  bookingModeBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  timeInputBtn: {
    marginTop: 8,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInputText: {
    fontSize: 14,
    fontWeight: "600",
  },
  preferredErrorText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  preferredRangeText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },

  bookingCalendarCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  bookingCalendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  bookingCalendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  bookingCalendarMonth: {
    fontSize: 15,
    fontWeight: "700",
  },
  bookingWeekRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  bookingWeekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "700",
  },
  bookingDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  bookingDayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginBottom: 4,
  },
  bookingDayCellSelected: {
    backgroundColor: "#111827",
  },
  bookingDayCellDisabled: {
    opacity: 0.45,
  },
  bookingDayText: {
    fontSize: 13,
    fontWeight: "600",
  },
  bookingDayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
  bookingDayDotAvailable: {
    backgroundColor: "#22c55e",
  },
  bookingDayDotBooked: {
    backgroundColor: "#ef4444",
  },
  bookingLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  bookingLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bookingLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  slotItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    marginBottom: 8,
    gap: 12,
  },
  slotItemBooked: {
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    opacity: 0.95,
  },
  slotItemActive: { backgroundColor: "#111827", borderColor: "#111827" },
  slotRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  slotRadioActive: { borderColor: "white" },
  slotRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "white",
  },
  slotIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  slotTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  slotText: { fontWeight: "700", color: "#111", fontSize: 13 },
  slotTextActive: { color: "white" },
  slotTextBooked: { color: "#dc2626" },
  noSlots: { textAlign: "center", color: "#999", marginVertical: 20 },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
    color: "#666",
  },
  textArea: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 14,
    height: 80,
    textAlignVertical: "top",
    backgroundColor: "#f9fafb",
    fontSize: 14,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: "#f9fafb",
    color: "#111",
  },

  // WIZARD STYLES (Copied from assigntenant.tsx)
  wizardTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "white",
  },
  backBtnText: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepCounterText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9ca3af",
    letterSpacing: 1,
  },
  progressBarContainer: {
    height: 3,
    backgroundColor: "#f3f4f6",
    width: "100%",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#111",
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
    marginTop: 10,
  },
  titleIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  stepperContainer: { flexDirection: "row", marginBottom: 24 },
  stepperLine: { height: 6, borderRadius: 3, width: "100%" },
  stepperLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  stepperNumber: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperNumberText: { fontSize: 9, fontWeight: "900", color: "#9ca3af" },
  stepperLabel: { fontSize: 11, fontWeight: "600", color: "#9ca3af" },
  stepContentCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 15,
    elevation: 2,
  },
  wizardLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
    paddingLeft: 4,
  },
  wizardInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#111",
    fontWeight: "500",
  },
  wizardReadonlyInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  wizardTenantCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    backgroundColor: "#f0f9ff",
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  wizardTenantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0284c7",
    alignItems: "center",
    justifyContent: "center",
  },
  wizardTenantRole: {
    fontSize: 10,
    color: "#0369a1",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  wizardTenantName: { fontSize: 16, fontWeight: "bold", color: "#0c4a6e" },
  wizardPropScroll: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    backgroundColor: "#f9fafb",
  },
  wizardPropItem: { padding: 16, borderBottomWidth: 1, borderColor: "#f3f4f6" },
  wizardPropItemSelected: { backgroundColor: "#111" },
  wizardPropItemBooked: { backgroundColor: "#dcfce7" },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: "white" },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "white",
  },
  summaryCard: {
    marginTop: 20,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 13, color: "#6b7280" },
  summaryValue: { fontSize: 13, fontWeight: "700", color: "#111" },
  summaryDivider: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 8 },
  summaryTotalLabel: { fontSize: 14, fontWeight: "800", color: "#111" },
  summaryTotalValue: { fontSize: 16, fontWeight: "900", color: "#111" },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    backgroundColor: "#f9fafb",
  },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    padding: 14,
    backgroundColor: "#eef2ff",
    borderRadius: 12,
  },
  infoText: {
    fontSize: 12,
    color: "#4f46e5",
    fontWeight: "500",
    lineHeight: 18,
    flex: 1,
  },
  bottomActions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingBottom: 34,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  wizardBtnPrimary: {
    flex: 1,
    backgroundColor: "#111",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  wizardBtnPrimaryText: { fontSize: 15, fontWeight: "800", color: "white" },
  wizardBtnSecondary: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  wizardBtnSecondaryText: { fontSize: 15, fontWeight: "700", color: "#374151" },
  wizardInfoBox: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    padding: 14,
    backgroundColor: "#eef2ff",
    borderRadius: 12,
  },
  wizardInfoText: {
    fontSize: 12,
    color: "#4f46e5",
    fontWeight: "500",
    lineHeight: 18,
    flex: 1,
  },
  modalConfirmBtn: {
    backgroundColor: "#111",
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalConfirmBtnDisabled: {
    backgroundColor: "#4b5563",
  },
  modalConfirmBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.2,
  },

  // UTILITIES WIZARD STYLES
  utilityInputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginBottom: 12,
  },
  utilityFreeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 12,
  },
  utilityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  utilityName: { fontSize: 13, fontWeight: "800", color: "#111" },
  utilityDesc: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  utilityInput: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    width: 60,
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 13,
    color: "#111",
    fontWeight: "bold",
    textAlign: "center",
  },
  utilityBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  utilityBadgeText: { color: "white", fontSize: 10, fontWeight: "bold" },
  alreadyPaidCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 1,
  },
  alreadyPaidTitle: { fontSize: 13, fontWeight: "800", color: "#111" },
  alreadyPaidDesc: { fontSize: 11, color: "#6b7280", marginTop: 3 },
  alreadyPaidOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  alreadyPaidOption: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  alreadyPaidOptionActive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#10b981",
  },
  alreadyPaidOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  alreadyPaidOptionTextActive: { color: "#047857" },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#d1d5db",
    padding: 2,
    justifyContent: "center",
  },
  switchTrackActive: { backgroundColor: "#10b981" },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  switchThumbActive: { transform: [{ translateX: 22 }] },
  alreadyPaidNote: {
    fontSize: 11,
    color: "#10b981",
    fontWeight: "bold",
    marginTop: 8,
    marginLeft: 4,
  },
});
