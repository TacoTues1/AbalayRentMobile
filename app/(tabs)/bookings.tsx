import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
import CalendarPicker from "../../components/ui/CalendarPicker";
import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

// Optional: Define your backend URL if you want to send actual emails like the Next.js app
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

export default function Bookings() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

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
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<any>(null);

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
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [penaltyDetails, setPenaltyDetails] = useState("");
  const [contractFile, setContractFile] = useState<any>(null);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [showAssignWarning, setShowAssignWarning] = useState(false);
  const [showWifiDayPicker, setShowWifiDayPicker] = useState(false);
  const [showWaterDayPicker, setShowWaterDayPicker] = useState(false);
  const [showElectricityDayPicker, setShowElectricityDayPicker] =
    useState(false);
  const [assignStep, setAssignStep] = useState(0);
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

      const channel = supabase
        .channel("bookings_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings" },
          () => {
            loadBookings(session.user.id, profile.role, filter);
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session, profile, filter]);

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return router.replace("/");
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
  function getTimeSlotInfo(bookingDate: string) {
    if (!bookingDate)
      return {
        icon: "calendar-outline" as any,
        label: "Not Scheduled",
        time: "Select a time",
        color: "#9ca3af",
      };

    const date = new Date(bookingDate);
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
        time: `${hour}:${min.toString().padStart(2, "0")} AM`,
        color: "#f59e0b",
      };
    return {
      icon: "partly-sunny-outline" as any,
      label: "Afternoon",
      time: `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")} PM`,
      color: "#6366f1",
    };
  }

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

        const propIds = myProperties.map((p) => p.id);

        const query = supabase
          .from("bookings")
          .select("*")
          .in("property_id", propIds)
          .order("booking_date", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        bookingsData = data || [];
      } else {
        // --- TENANT LOGIC ---
        const query = supabase
          .from("bookings")
          .select("*")
          .eq("tenant", userId)
          .order("booking_date", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        bookingsData = data || [];

        // 2. Fetch "Accepted" Applications (Ready to Book)
        const { data: acceptedApps } = await supabase
          .from("applications")
          .select("id, property_id, tenant, status, message")
          .eq("tenant", userId)
          .eq("status", "accepted");

        if (acceptedApps && acceptedApps.length > 0) {
          const appsToBook = acceptedApps.map((app) => ({
            id: app.id,
            is_application: true,
            property_id: app.property_id,
            tenant: app.tenant,
            booking_date: null,
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
      properties?.forEach((p) => {
        propMap[p.id] = p;
      });

      const tenantMap: any = {};
      tenantProfiles?.forEach((t) => {
        tenantMap[t.id] = t;
      });

      const enriched = bookingsData.map((b) => ({
        ...b,
        property: propMap[b.property_id],
        tenant_profile: tenantMap[b.tenant],
      }));

      // --- SORTING & DEDUPE (Matches Next.js) ---
      let finalBookings = enriched;
      const hasActiveBooking = bookingsData.some((b) =>
        ["pending", "pending_approval", "approved", "accepted"].includes(
          b.status,
        ),
      );

      const getSortWeight = (booking: any) => {
        const s = (booking.status || "").toLowerCase();
        if (["pending", "pending_approval"].includes(s)) return 1;
        if (s === "ready_to_book") {
          if (role !== "landlord" && hasActiveBooking) return 3;
          return 2;
        }
        if (["approved", "accepted"].includes(s)) return 4;
        if (["approved", "accepted"].includes(s)) return 4;
        if (["rejected", "cancelled"].includes(s)) return 5;
        if (s === "viewing_done") return 0; // Priority
        return 6;
      };

      finalBookings.sort((a, b) => {
        const weightA = getSortWeight(a);
        const weightB = getSortWeight(b);
        if (weightA !== weightB) return weightA - weightB;
        return (
          new Date(b.booking_date || 0).getTime() -
          new Date(a.booking_date || 0).getTime()
        );
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
    try {
      await fetch(`${API_URL}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, recordId, actorId }),
      });
    } catch (e) {
      console.error("Backend notify error", e);
    }
  };

  const approveBooking = async (booking: any) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "approved" })
      .eq("id", booking.id);
    if (error) return Alert.alert("Error", error.message);

    if (booking.time_slot_id) {
      await supabase
        .from("available_time_slots")
        .update({ is_booked: true })
        .eq("id", booking.time_slot_id);
    }

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

  const rejectBooking = async (booking: any) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "rejected" })
      .eq("id", booking.id);
    if (error) return Alert.alert("Error", error.message);

    if (booking.time_slot_id) {
      await supabase
        .from("available_time_slots")
        .update({ is_booked: false })
        .eq("id", booking.time_slot_id);
    }

    await createNotification(
      booking.tenant,
      "booking_rejected",
      `Your viewing request for ${booking.property?.title} was rejected.`,
      { actor: session.user.id },
    );
    sendBackendNotification("booking_status", booking.id, session.user.id);

    Alert.alert("Success", "Booking rejected.");
    loadBookings(session.user.id, profile.role, filter);
  };

  const promptCancelBooking = (booking: any) => {
    setBookingToCancel(booking);
    setShowCancelModal(true);
  };

  const confirmCancelBooking = async () => {
    if (!bookingToCancel) return;

    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingToCancel.id);
    if (error) {
      Alert.alert("Error", "Failed to cancel");
    } else {
      if (bookingToCancel.time_slot_id) {
        await supabase
          .from("available_time_slots")
          .update({ is_booked: false })
          .eq("id", bookingToCancel.time_slot_id);
      }
      // Send notification
      await createNotification(
        bookingToCancel.tenant,
        "booking_cancelled",
        `Your viewing for ${bookingToCancel.property?.title} has been cancelled.`,
        { actor: session.user.id },
      );

      Alert.alert("Success", "Booking cancelled");
      loadBookings(session.user.id, profile.role, filter);
    }
    setShowCancelModal(false);
    setBookingToCancel(null);
  };

  // --- ASSIGN TENANT LOGIC ---

  const markViewingSuccess = async (booking: any) => {
    const { error } = await supabase
      .from("bookings")
      .update({ status: "viewing_done" })
      .eq("id", booking.id);

    if (!error) {
      await createNotification(
        booking.tenant,
        "viewing_success",
        `Your viewing for ${booking.property?.title} was successful!`,
        { actor: session.user.id },
      );
      Alert.alert("Success", "Viewing marked as successful!");
      loadBookings(session.user.id, profile.role, filter);
    } else {
      Alert.alert("Error", "Failed to update status");
    }
  };

  const openAssignTenantModal = async (booking: any) => {
    setAssignStep(0);
    setAssignBooking(booking);
    setPenaltyDetails("");
    setStartDate(new Date().toISOString().split("T")[0]);
    setWifiDueDay("");
    setWaterDueDay("");
    setElectricityDueDay("");
    setAlreadyPaid(false);
    setContractFile(null);
    setSelectedPropertyId(booking.property_id || ""); // Default to booked property
    setShowWifiDayPicker(false);
    setShowWaterDayPicker(false);
    setShowElectricityDayPicker(false);

    // Load available properties
    const { data: props } = await supabase
      .from("properties")
      .select("*")
      .eq("landlord", session.user.id)
      .eq("status", "available")
      .eq("is_deleted", false);

    let properties = props || [];

    // Sort so the booked property is FIRST
    if (booking.property_id) {
      properties.sort((a, b) => {
        if (a.id === booking.property_id) return -1;
        if (b.id === booking.property_id) return 1;
        return 0;
      });
    }

    setAvailableProperties(properties);
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

    const selectedProp = availableProperties.find((p: any) => p.id === selectedPropertyId) || booking.property;
    const rentAmount = selectedProp?.price || 0;
    const hasAdvance = typeof selectedProp?.has_advance === 'boolean' ? selectedProp?.has_advance : (Number(selectedProp?.advance_amount || 0) > 0);
    const advanceAmount = hasAdvance ? Number(selectedProp?.advance_amount || rentAmount) : 0;
    const hasSecurityDeposit = typeof selectedProp?.has_security_deposit === 'boolean' ? selectedProp?.has_security_deposit : (Number(selectedProp?.security_deposit_amount || 0) > 0);
    const securityDeposit = hasSecurityDeposit ? Number(selectedProp?.security_deposit_amount || rentAmount) : 0;

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
      const msg = `You have been assigned to ${selectedProp?.title}. Move-in bill sent.`;
      try {
        const msg = `You have been assigned to "${selectedProp?.title}". Move-in bill sent.`;
        await createNotification(booking.tenant, "occupancy_assigned", msg, {
          actor: session.user.id,
          email: true,
          sms: true,
        });
        if (API_URL) {
          fetch(`${API_URL}/api/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "occupancy_assigned",
              recordId: newOccupancy.id,
              actorId: session.user.id,
            }),
          }).catch((notifyErr) =>
            console.log("Assignment notify API failed:", notifyErr),
          );
        }
      } catch (notifErr) {
        console.log("Notification failed:", notifErr);
      }

      // Bill
      if (!alreadyPaid) {
        await supabase.from("payment_requests").insert({
          landlord: session.user.id,
          tenant: booking.tenant,
          property_id: selectedPropertyId,
          occupancy_id: newOccupancy.id,
          rent_amount: rentAmount,
          advance_amount: advanceAmount,
          security_deposit_amount: securityDeposit,
          bills_description:
            "Move-in Payment (Rent + Advance + Security Deposit)",
          due_date: new Date(startDate).toISOString(),
          status: "pending",
          is_move_in_payment: true,
        });
      }

      setShowAssignModal(false);
      setAssignBooking(null);
      Alert.alert(
        "Success",
        alreadyPaid
          ? "Tenant assigned successfully!"
          : "Tenant assigned! Move-in payment bill sent.",
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
      (p: any) => p.id === selectedPropertyId,
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
      "Confirm Assignment?",
      "This will generate a move-in bill and mark the property as occupied.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm & Assign", onPress: executeAssignment },
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
    setShowBookingModal(true);
    setSubmittingBooking(false);
    setBookingNotes("");
    setAvailableTimeSlots([]);

    const { data } = await supabase
      .from("available_time_slots")
      .select("*")
      .eq("landlord_id", booking.property.landlord)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    const currentSlotId = booking?.time_slot_id
      ? String(booking.time_slot_id)
      : "";
    const filteredSlots = (data || []).filter((slot: any) => {
      const slotId = String(slot.id);
      return !slot.is_booked || (currentSlotId && slotId === currentSlotId);
    });

    setAvailableTimeSlots(filteredSlots);

    const fallbackOriginalSlot = booking?.booking_date
      ? filteredSlots.find(
          (slot: any) =>
            new Date(slot.start_time).getTime() ===
            new Date(booking.booking_date).getTime(),
        )
      : null;

    const originalSlotId =
      currentSlotId ||
      (fallbackOriginalSlot ? String(fallbackOriginalSlot.id) : "");

    if (
      originalSlotId &&
      filteredSlots.some((slot: any) => String(slot.id) === originalSlotId)
    ) {
      setSelectedTimeSlot(originalSlotId);
    } else {
      setSelectedTimeSlot("");
    }
  };

  const getOriginalSlotId = (booking: any, slots: any[]) => {
    if (!booking) return "";
    if (booking.time_slot_id) return String(booking.time_slot_id);
    if (!booking.booking_date) return "";

    const match = slots.find(
      (slot: any) =>
        new Date(slot.start_time).getTime() ===
        new Date(booking.booking_date).getTime(),
    );
    return match ? String(match.id) : "";
  };

  const submitBooking = async () => {
    if (!selectedTimeSlot || !selectedApplication) return;
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

    const { data: globalActive } = await supabase
      .from("bookings")
      .select("id")
      .eq("tenant", session.user.id)
      .in("status", ["pending", "pending_approval", "approved", "accepted"])
      .maybeSingle();

    if (globalActive && globalActive.id !== selectedApplication.id) {
      Alert.alert(
        "Limit Reached",
        "You can only have 1 active viewing schedule at a time.",
      );
      setSubmittingBooking(false);
      return;
    }

    const slot = availableTimeSlots.find(
      (s) => String(s.id) === String(selectedTimeSlot),
    );
    if (!slot) {
      Alert.alert(
        "Error",
        "Selected time slot was not found. Please pick another slot.",
      );
      setSubmittingBooking(false);
      return;
    }

    const { data: newBooking, error } = await supabase
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
          bookingNotes || `Booking for ${selectedApplication.property?.title}`,
      })
      .select()
      .single();

    if (error) {
      Alert.alert("Error", error.message);
      setSubmittingBooking(false);
      return;
    }

    await supabase
      .from("available_time_slots")
      .update({ is_booked: true })
      .eq("id", slot.id);

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
          await supabase
            .from("available_time_slots")
            .update({ is_booked: false })
            .eq("id", previousSlotId);
        }
      }
    }

    // await createNotification(selectedApplication.property.landlord, 'new_booking', `${profile.first_name} requested a viewing.`, { actor: session.user.id });
    if (newBooking)
      sendBackendNotification("booking_new", newBooking.id, session.user.id);

    Alert.alert("Success", "Viewing scheduled!");
    setSubmittingBooking(false);
    setShowBookingModal(false);
    loadBookings(session.user.id, profile.role, filter);
  };

  const canModifyBooking = (bookingDate: string) => {
    if (!bookingDate) return true;
    const diff =
      (new Date(bookingDate).getTime() - new Date().getTime()) /
      (1000 * 60 * 60);
    return diff >= 12;
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
    const timeInfo = getTimeSlotInfo(item.booking_date);
    const date = item.booking_date ? new Date(item.booking_date) : null;
    const isPending =
      item.status === "pending" || item.status === "pending_approval";
    const isPast = date && date < new Date();
    const statusLower = (item.status || "").toLowerCase();
    const roleLower = (profile?.role || "").toLowerCase();

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
                    onPress={() => rejectBooking(item)}
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
                <TouchableOpacity
                  onPress={() => openAssignTenantModal(item)}
                  style={styles.btnBlack}
                >
                  <Ionicons
                    name="person-add"
                    size={14}
                    color="white"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.btnTextWhite}>Assign Tenant</Text>
                </TouchableOpacity>
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

                {[
                  "pending",
                  "pending_approval",
                  "approved",
                  "accepted",
                ].includes(statusLower) &&
                  canModifyBooking(item.booking_date) && (
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
                {!canModifyBooking(item.booking_date) &&
                  ["pending", "pending_approval", "approved"].includes(
                    statusLower,
                  ) && (
                    <View
                      style={{
                        padding: 8,
                        backgroundColor: "#fef2f2",
                        borderRadius: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "#ef4444",
                          fontSize: 10,
                          fontWeight: "bold",
                        }}
                      >
                        Cannot modify (within 12h)
                      </Text>
                    </View>
                  )}
              </View>
            )}
        </View>
      </View>
    );
  };

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
          },
        ]}
      >
        <Text
          style={[styles.headerTitle, { color: isDark ? colors.text : "#111" }]}
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

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
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
      </View>

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
          <ActivityIndicator
            size="large"
            color="black"
            style={{ marginTop: 50 }}
          />
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
                  {selectedApplication && isRescheduleFlow
                    ? "Reschedule Viewing"
                    : "Schedule Viewing"}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textMuted : "#9ca3af",
                  }}
                >
                  Pick a time slot below
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowBookingModal(false)}
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

          <ScrollView contentContainerStyle={{ padding: 20 }}>
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

            {availableTimeSlots.length === 0 ? (
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
                  <Ionicons name="calendar-outline" size={28} color="#d1d5db" />
                </View>
                <Text style={{ fontWeight: "700", color: "#111" }}>
                  No slots available
                </Text>
                <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  Contact the landlord directly.
                </Text>
              </View>
            ) : (
              availableTimeSlots.map((slot) => {
                const info = getTimeSlotInfo(slot.start_time);
                const startDate = new Date(slot.start_time);
                const endDate = new Date(slot.end_time);
                const isSelected = String(selectedTimeSlot) === String(slot.id);
                const isOriginalSlot =
                  !!originalSlotIdForModal &&
                  String(originalSlotIdForModal) === String(slot.id);
                const dayName = startDate.toLocaleDateString("en-US", {
                  weekday: "short",
                });
                const dateStr = startDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
                const startStr = startDate.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });
                const endStr = endDate.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });

                return (
                  <TouchableOpacity
                    key={slot.id}
                    style={[
                      styles.slotItem,
                      isOriginalSlot &&
                        !isSelected && {
                          borderColor: "#2563eb",
                          borderWidth: 1.8,
                          backgroundColor: isDark ? "#111827" : "#eff6ff",
                        },
                      isSelected && styles.slotItemActive,
                    ]}
                    onPress={() => setSelectedTimeSlot(String(slot.id))}
                    activeOpacity={0.8}
                  >
                    {/* Selection Indicator */}
                    <View
                      style={[
                        styles.slotRadio,
                        isSelected && styles.slotRadioActive,
                      ]}
                    >
                      {isSelected && <View style={styles.slotRadioDot} />}
                    </View>

                    {/* Slot Type Icon */}
                    <View
                      style={[
                        styles.slotIconBox,
                        {
                          backgroundColor: isSelected
                            ? "rgba(255,255,255,0.15)"
                            : info.color + "15",
                        },
                      ]}
                    >
                      <Ionicons
                        name={info.icon}
                        size={18}
                        color={isSelected ? "white" : info.color}
                      />
                    </View>

                    {/* Slot Details */}
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
                            isSelected && styles.slotTextActive,
                          ]}
                        >
                          {dayName}, {dateStr}
                        </Text>
                        {isOriginalSlot && (
                          <View
                            style={{
                              backgroundColor: isSelected
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
                                color: isSelected ? "white" : "#1d4ed8",
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
                              backgroundColor: isSelected
                                ? "rgba(255,255,255,0.2)"
                                : info.color + "18",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "800",
                              color: isSelected ? "white" : info.color,
                            }}
                          >
                            {info.label}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{
                          fontSize: 12,
                          color: isSelected
                            ? "rgba(255,255,255,0.7)"
                            : "#9ca3af",
                          marginTop: 2,
                        }}
                      >
                        {startStr} – {endStr}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
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
                (submittingBooking || !selectedTimeSlot) &&
                  styles.modalConfirmBtnDisabled,
              ]}
              onPress={submitBooking}
              disabled={submittingBooking || !selectedTimeSlot}
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
                    ? isRescheduleFlow
                      ? "Submitting Reschedule..."
                      : "Submitting Schedule..."
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
                      const isSelected = selectedPropertyId === p.id;
                      const isBookedProperty =
                        p.id === assignBooking?.property_id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setSelectedPropertyId(p.id)}
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
                                {p.city} • ₱{p.price}
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
                    (p: any) => p.id === selectedPropertyId,
                  );
                  const rentPrice =
                    selectedPropInfo?.price ||
                    assignBooking?.property?.price ||
                    0;
                  const hasAdvance = typeof selectedPropInfo?.has_advance === 'boolean' ? selectedPropInfo?.has_advance : (Number(selectedPropInfo?.advance_amount || 0) > 0);
                  const uiAdvanceAmount = hasAdvance ? Number(selectedPropInfo?.advance_amount || rentPrice) : 0;
                  const hasSecurityDeposit = typeof selectedPropInfo?.has_security_deposit === 'boolean' ? selectedPropInfo?.has_security_deposit : (Number(selectedPropInfo?.security_deposit_amount || 0) > 0);
                  const uiSecurityDeposit = hasSecurityDeposit ? Number(selectedPropInfo?.security_deposit_amount || rentPrice) : 0;
                  const uiTotalMoveIn = rentPrice + uiAdvanceAmount + uiSecurityDeposit;

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
                    placeholder="e.g. 500 (defaults to 0)"
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
                    (p: any) => p.id === selectedPropertyId,
                  );
                  const amenities = selectedPropInfo?.amenities || [];
                  const isWaterFree = amenities.includes("Free Water");
                  const isElecFree = amenities.includes("Free Electricity");
                  const isWifiFree = amenities.includes("Free WiFi");
                  const requireWifiDueDate = amenities.includes("Paid WiFi");

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
                              { backgroundColor: isWifiFree ? "#dcfce7" : "#f3f4f6" },
                            ]}
                          >
                            <Ionicons name={isWifiFree ? "wifi" : "wifi-outline"} size={18} color={isWifiFree ? "#10b981" : "#6b7280"} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[styles.utilityName, { color: isWifiFree ? "#047857" : "#4b5563" }]}
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
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <Text style={styles.alreadyPaidTitle}>
                            Tenant already paid?
                          </Text>
                          <Text style={styles.alreadyPaidDesc}>
                            Skip auto-billing if payment was received offline.
                          </Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setAlreadyPaid(!alreadyPaid)}
                        >
                          <View
                            style={[
                              styles.switchTrack,
                              alreadyPaid && styles.switchTrackActive,
                            ]}
                          >
                            <View
                              style={[
                                styles.switchThumb,
                                alreadyPaid && styles.switchThumbActive,
                              ]}
                            />
                          </View>
                        </TouchableOpacity>
                      </View>
                      {alreadyPaid && (
                        <Text style={styles.alreadyPaidNote}>
                          ✓ No move-in bill will be generated
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
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 1,
  },
  alreadyPaidTitle: { fontSize: 13, fontWeight: "800", color: "#111" },
  alreadyPaidDesc: { fontSize: 11, color: "#6b7280", marginTop: 3 },
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
