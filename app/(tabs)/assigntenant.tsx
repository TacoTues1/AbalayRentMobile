import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BlockingLoader from "../../components/ui/BlockingLoader";
import CalendarPicker from "../../components/ui/CalendarPicker";
import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");

export default function AssignTenantScreen() {
  const router = useRouter();
  const {
    propertyId,
    bookingId,
    tenantId: routeTenantId,
    tenantName: routeTenantName,
    tenantPhone: routeTenantPhone,
    tenantFirstName: routeTenantFirstName,
    tenantLastName: routeTenantLastName,
  } = useLocalSearchParams<{
    propertyId: string;
    bookingId?: string;
    tenantId?: string;
    tenantName?: string;
    tenantPhone?: string;
    tenantFirstName?: string;
    tenantLastName?: string;
  }>();

  const [session, setSession] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
  const [availableProperties, setAvailableProperties] = useState<any[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Approved bookings
  const [approvedBookings, setApprovedBookings] = useState<any[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);

  // Form fields
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [lateFee, setLateFee] = useState("");
  const [wifiDueDay, setWifiDueDay] = useState("");
  const [waterDueDay, setWaterDueDay] = useState("");
  const [electricityDueDay, setElectricityDueDay] = useState("");
  const [showWaterDayPicker, setShowWaterDayPicker] = useState(false);
  const [showElectricityDayPicker, setShowElectricityDayPicker] =
    useState(false);
  const [showWifiDayPicker, setShowWifiDayPicker] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);

  const [contractPdf, setContractPdf] = useState<any>(null);
  const [step, setStep] = useState(0);
  const STEPS = [
    { label: "Property", icon: "1" },
    { label: "Schedule", icon: "2" },
    { label: "Charges", icon: "3" },
    { label: "Utilities", icon: "4" },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadApprovedBookingsForProperty = async (
    targetPropertyId: string,
    preferredBookingId?: string,
  ) => {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("*")
      .eq("property_id", targetPropertyId)
      .in("status", ["viewing_done"]);

    if (bookings && bookings.length > 0) {
      const tenantIds = bookings.map((b: any) => b.tenant);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", tenantIds);

      const profileMap = (profiles || []).reduce(
        (acc: any, p: any) => ({ ...acc, [p.id]: p }),
        {},
      );
      const candidates = bookings.map((b: any) => ({
        ...b,
        tenant_profile: profileMap[b.tenant],
      }));

      setApprovedBookings(candidates);

      if (bookingId) {
        if (preferredBookingId) {
          const preferred = candidates.find(
            (candidate: any) =>
              String(candidate.id) === String(preferredBookingId),
          );
          if (preferred) {
            setSelectedTenant(preferred);
          } else {
            // Respect the fallback loaded in loadData if it matches
            setSelectedTenant((prev: any) =>
              String(prev?.id) === String(preferredBookingId) ? prev : null,
            );
          }
        }
        return;
      }

      if (preferredBookingId) {
        const preferred = candidates.find(
          (candidate: any) =>
            String(candidate.id) === String(preferredBookingId),
        );
        if (preferred) {
          setSelectedTenant(preferred);
        } else {
          // Respect current tenant if it matches
          setSelectedTenant((prev: any) =>
            String(prev?.id) === String(preferredBookingId) ? prev : null,
          );
        }
      } else {
        setSelectedTenant((prev: any) => {
          if (!prev) return null;
          return (
            candidates.find((candidate: any) => candidate.id === prev.id) ||
            null
          );
        });
      }
    } else {
      setApprovedBookings([]);

      // If the property has no bookings in the DB, only clear selectedTenant
      // if it does NOT match our preferred/current bookingId (which might be a fallback).
      setSelectedTenant((prev: any) => {
        if (
          preferredBookingId &&
          String(prev?.id) === String(preferredBookingId)
        ) {
          return prev;
        }
        return null;
      });
    }
  };

  const selectProperty = async (
    targetPropertyId: string,
    preferredBookingId?: string,
  ) => {
    setSelectedPropertyId(String(targetPropertyId));
    const selected = availableProperties.find(
      (p: any) => String(p.id) === String(targetPropertyId),
    );
    if (selected) {
      setProperty(selected);
    }
    await loadApprovedBookingsForProperty(
      String(targetPropertyId),
      preferredBookingId || bookingId,
    );
  };

  const loadData = async () => {
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (!s) return router.replace("/");
      setSession(s);

      if (!propertyId) {
        Alert.alert("Error", "No property selected");
        router.back();
        return;
      }

      // Try fetching booking from Supabase, but prepare to use fallback route params
      let routeBooking: any = null;
      let usedFallback = false;

      if (bookingId) {
        const { data, error } = await supabase
          .from("bookings")
          .select(
            "id, property_id, tenant, status, landlord, landlord_id, owner_id, user_id",
          )
          .eq("id", bookingId)
          .maybeSingle();

        if (!error && data) {
          routeBooking = data;
        }
      }

      // If Supabase failed but we have params from the bookings list, rely on them!
      if (!routeBooking && routeTenantId) {
        usedFallback = true;
        routeBooking = {
          id: bookingId || "fallback_id",
          property_id: propertyId,
          tenant: routeTenantId,
          status: "viewing_done",
          landlord: s.user.id,
        };
      }

      if (!routeBooking) {
        Alert.alert(
          "Invalid Access",
          "Booking not found. Please open Assign Tenant from the Bookings page.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/bookings") }],
        );
        return;
      }

      // Verify owner
      if (!usedFallback) {
        const bookingLandlordId =
          routeBooking.landlord ||
          routeBooking.landlord_id ||
          routeBooking.owner_id ||
          routeBooking.user_id;

        if (
          bookingLandlordId &&
          String(bookingLandlordId) !== String(s.user.id)
        ) {
          Alert.alert("Error", "You are not allowed to assign this booking.", [
            { text: "OK", onPress: () => router.replace("/(tabs)/bookings") },
          ]);
          return;
        }
      }

      if (!routeBooking.tenant) {
        Alert.alert(
          "Invalid Access",
          "This booking has no tenant. Please open Assign Tenant from a valid booking request.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/bookings") }],
        );
        return;
      }

      const bookingStatus = String(routeBooking.status || "").toLowerCase();
      // Added approved and accepted here because sometimes assignment happens right after approval.
      if (
        !["viewing_done", "approved", "accepted"].includes(bookingStatus) &&
        !usedFallback
      ) {
        Alert.alert(
          "Action Required",
          "Mark the viewing as successful first before assigning this tenant.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)/bookings") }],
        );
        return;
      }

      let routeTenantProfile: any = null;

      const { data: dbTenantProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", routeBooking.tenant)
        .maybeSingle();

      if (dbTenantProfile) {
        routeTenantProfile = dbTenantProfile;
      } else if (routeTenantName || routeTenantFirstName) {
        // Create a fallback profile using the navigation parameters
        routeTenantProfile = {
          id: routeBooking.tenant,
          first_name:
            routeTenantFirstName || (routeTenantName || "").split(" ")[0] || "",
          last_name:
            routeTenantLastName ||
            (routeTenantName || "").split(" ").slice(1).join(" ") ||
            "",
          phone: routeTenantPhone || "",
        };
      }

      setSelectedTenant({
        ...routeBooking,
        tenant_profile: routeTenantProfile || null,
      });

      const ownerColumns = ["landlord", "landlord_id", "owner_id", "user_id"];
      const propertiesById = new Map<string, any>();

      for (const ownerColumn of ownerColumns) {
        const { data, error } = await (supabase.from("properties") as any)
          .select("*")
          .eq(ownerColumn, s.user.id);

        if (!error) {
          const loaded = data || [];
          loaded.forEach((p: any) => {
            if (p?.is_deleted === true) return;
            propertiesById.set(String(p.id), p);
          });
        }
      }

      let properties: any[] = Array.from(propertiesById.values());

      const requestedId = String(routeBooking.property_id || propertyId);
      const hasRequested = properties.some(
        (p: any) => String(p.id) === requestedId,
      );

      if (!hasRequested) {
        const { data: requestedProp } = await supabase
          .from("properties")
          .select("*")
          .eq("id", requestedId)
          .maybeSingle();

        if (requestedProp && requestedProp.is_deleted !== true) {
          properties = [requestedProp, ...properties];
        }
      }

      if (properties.length === 0) {
        Alert.alert("Error", "No properties found for assignment");
        router.back();
        return;
      }

      properties.sort((a, b) => {
        if (String(a.id) === requestedId) return -1;
        if (String(b.id) === requestedId) return 1;
        return 0;
      });

      setAvailableProperties(properties);

      const initialPropertyId =
        properties.find((p: any) => String(p.id) === requestedId)?.id ||
        properties[0]?.id;

      if (!initialPropertyId) {
        Alert.alert("Error", "No properties found for assignment");
        router.back();
        return;
      }

      setProperty(
        properties.find((p: any) => String(p.id) === String(initialPropertyId)),
      );
      setSelectedPropertyId(String(initialPropertyId));

      await loadApprovedBookingsForProperty(
        String(initialPropertyId),
        String(initialPropertyId) === requestedId ? bookingId : undefined,
      );
    } catch (err: any) {
      console.error("Error loading data:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const pickContractPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setContractPdf(result.assets[0]);
      }
    } catch (err) {
      console.error("Error picking document:", err);
    }
  };

  const handleAssign = async () => {
    if (!selectedPropertyId)
      return Alert.alert("Error", "Please select a property");
    if (!selectedTenant)
      return Alert.alert(
        "Error",
        "Unable to load tenant from the selected booking request.",
      );
    if (!startDate) return Alert.alert("Error", "Please enter a start date");

    const activeProperty =
      availableProperties.find(
        (p: any) => String(p.id) === String(selectedPropertyId),
      ) || property;

    if (!activeProperty) {
      return Alert.alert("Error", "Selected property not found");
    }

    const amenities = activeProperty?.amenities || [];
    const isWaterFree = amenities.includes("Free Water");
    const isElecFree = amenities.includes("Free Electricity");
    const isWifiAvailable =
      amenities.includes("Wifi") ||
      amenities.includes("WiFi") ||
      amenities.includes("Free WiFi") ||
      amenities.includes("Paid WiFi");
    const isWifiFree = amenities.includes("Free WiFi");
    const requireWifiDueDate = isWifiAvailable && !isWifiFree;

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

    setSubmitting(true);
    try {
      const rentAmount = activeProperty.price || 0;
      const hasAdvance =
        typeof activeProperty?.has_advance === "boolean"
          ? activeProperty?.has_advance
          : Number(activeProperty?.advance_amount || 0) > 0;
      const advanceAmount = hasAdvance
        ? Number(activeProperty?.advance_amount || rentAmount)
        : 0;
      const hasSecurityDeposit =
        typeof activeProperty?.has_security_deposit === "boolean"
          ? activeProperty?.has_security_deposit
          : Number(activeProperty?.security_deposit_amount || 0) > 0;
      const securityDeposit = hasSecurityDeposit
        ? Number(activeProperty?.security_deposit_amount || rentAmount)
        : 0;
      // Upload contract PDF if selected
      let contractUrl = null;
      if (contractPdf) {
        const fileExt = contractPdf.name.split(".").pop();
        const fileName = `contract_${selectedPropertyId}_${Date.now()}.${fileExt}`;

        const formData = new FormData();
        formData.append("file", {
          uri: contractPdf.uri,
          name: fileName,
          type: "application/pdf",
        } as any);

        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("contracts")
          .upload(fileName, formData);

        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage
            .from("contracts")
            .getPublicUrl(fileName);
          contractUrl = urlData.publicUrl;
        }
      }

      // 1. Create Occupancy
      const { data: newOccupancy, error } = await supabase
        .from("tenant_occupancies")
        .insert({
          property_id: selectedPropertyId,
          tenant_id: selectedTenant.tenant,
          landlord_id: session.user.id,
          status: "active",
          start_date: new Date(startDate).toISOString(),
          security_deposit: securityDeposit,
          security_deposit_used: 0,
          wifi_due_day:
            isWifiAvailable && !isWifiFree
              ? wifiDueDay
                ? parseInt(wifiDueDay)
                : null
              : null,
          water_due_day: isWaterFree
            ? null
            : waterDueDay
              ? parseInt(waterDueDay)
              : null,
          electricity_due_day: isElecFree
            ? null
            : electricityDueDay
              ? parseInt(electricityDueDay)
              : null,
          late_payment_fee: parseFloat(lateFee) || 0,
        })
        .select("id")
        .single();

      if (error) throw error;

      // 2. Update Property status
      await supabase
        .from("properties")
        .update({ status: "occupied" })
        .eq("id", activeProperty.id);

      // 3. Create Move-In Bill
      if (!alreadyPaid) {
        // Tenant hasn't paid yet — create a pending bill
        await supabase.from("payment_requests").insert({
          landlord: session.user.id,
          tenant: selectedTenant.tenant,
          property_id: activeProperty.id,
          occupancy_id: newOccupancy.id,
          rent_amount: rentAmount,
          security_deposit_amount: securityDeposit,
          advance_amount: advanceAmount,
          bills_description:
            "Move-in Payment (Rent + Advance + Security Deposit)",
          due_date: new Date(startDate).toISOString(),
          status: "pending",
          is_move_in_payment: true,
        });
      } else {
        // Tenant already paid offline — record as paid so the next due date
        // advances correctly (otherwise dashboard falls back to start_date)
        await supabase.from("payment_requests").insert({
          landlord: session.user.id,
          tenant: selectedTenant.tenant,
          property_id: activeProperty.id,
          occupancy_id: newOccupancy.id,
          rent_amount: rentAmount,
          security_deposit_amount: securityDeposit,
          advance_amount: advanceAmount,
          bills_description:
            "Move-in Payment (Rent + Advance + Security Deposit) - Paid Offline",
          due_date: new Date(startDate).toISOString(),
          status: "paid",
          is_move_in_payment: true,
          payment_method: "cash",
        });
      }

      // 4. Notify tenant (non-blocking - don't let notification failure block assignment)
      try {
        let message = `You have been assigned to "${activeProperty.title}" from ${startDate}.`;
        if (alreadyPaid)
          message += ` Move-in fees were marked as already paid.`;
        else message += ` Move-in bill sent.`;

        await createNotification(
          selectedTenant.tenant,
          "occupancy_assigned",
          message,
          { actor: session.user.id, email: true, sms: true },
        );

        if (API_URL) {
          const tenantProfile = selectedTenant.tenant_profile || {
            first_name: routeTenantFirstName,
            last_name: routeTenantLastName,
            phone: routeTenantPhone,
          };
          const phoneToUse = tenantProfile?.phone || routeTenantPhone;
          const nameToUse =
            `${tenantProfile?.first_name || ""} ${tenantProfile?.last_name || ""}`.trim() ||
            routeTenantName ||
            "Tenant";

          if (phoneToUse) {
            fetch(`${API_URL}/api/send-sms`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phoneNumber: phoneToUse, message }),
            }).catch((e) => console.log("SMS Error:", e));
          }

          fetch(`${API_URL}/api/send-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId: selectedTenant.id,
              type: "assignment",
              customMessage: message,
            }),
          }).catch((e) => console.log("Email Error:", e));

          if (!alreadyPaid) {
            fetch(`${API_URL}/api/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "move_in",
                recordId: newOccupancy.id,
                tenantName: nameToUse,
                tenantPhone: phoneToUse,
                tenantEmail: null,
                propertyTitle: activeProperty.title,
                propertyAddress: "",
                startDate,
                landlordName:
                  `${session?.user?.user_metadata?.first_name || ""} ${session?.user?.user_metadata?.last_name || ""}`.trim() ||
                  "Landlord",
                landlordPhone: session?.user?.user_metadata?.phone || "",
                securityDeposit: securityDeposit,
                rentAmount: rentAmount,
                contractPdfUrl: contractUrl,
              }),
            }).catch((e) => console.log("Move-in email Error:", e));
          }
        }
      } catch (notifErr) {
        console.log("Notification failed (non-critical):", notifErr);
      }

      Alert.alert(
        "Success",
        alreadyPaid
          ? "Tenant assigned successfully!"
          : "Tenant assigned! Move-in bill created.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to assign tenant");
    } finally {
      setSubmitting(false);
    }
  };

  const activeProperty =
    availableProperties.find(
      (p: any) => String(p.id) === String(selectedPropertyId),
    ) || property;

  const rentAmount = activeProperty?.price || 0;
  const hasAdvance =
    typeof activeProperty?.has_advance === "boolean"
      ? activeProperty?.has_advance
      : Number(activeProperty?.advance_amount || 0) > 0;
  const advanceAmount = hasAdvance
    ? Number(activeProperty?.advance_amount || rentAmount)
    : 0;
  const hasSecurityDeposit =
    typeof activeProperty?.has_security_deposit === "boolean"
      ? activeProperty?.has_security_deposit
      : Number(activeProperty?.security_deposit_amount || 0) > 0;
  const securityDeposit = hasSecurityDeposit
    ? Number(activeProperty?.security_deposit_amount || rentAmount)
    : 0;
  const totalMoveIn = rentAmount + advanceAmount + securityDeposit;
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator
          size="large"
          color="#111"
          style={{ marginTop: 100 }}
        />
      </SafeAreaView>
    );
  }

  const nextStep = () => {
    if (step === 0 && !selectedPropertyId)
      return Alert.alert("Error", "Please select a property");
    if (step === 0 && !selectedTenant)
      return Alert.alert(
        "Error",
        "Unable to load tenant from the selected booking request.",
      );
    if (step === 1) {
      if (!startDate) return Alert.alert("Error", "Please enter a start date");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const getDueDaysText = (startStr: string) => {
    if (!startStr) return "Select";
    const start = parseInt(startStr);
    if (isNaN(start) || start < 1 || start > 31) return "Select";
    const end = ((start - 1 + 2) % 31) + 1;
    return `${start} - ${end}`;
  };

  const renderStepContent = () => {
    const activeProperty =
      availableProperties.find(
        (p: any) => String(p.id) === String(selectedPropertyId),
      ) || property;

    switch (step) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.label}>Select Property *</Text>
            <ScrollView nestedScrollEnabled style={styles.propertyPickerScroll}>
              {availableProperties.map((p: any) => {
                const normalizedId = String(p.id);
                const isSelected = String(selectedPropertyId) === normalizedId;
                const isRequested = normalizedId === String(propertyId);

                return (
                  <TouchableOpacity
                    key={normalizedId}
                    style={[
                      styles.propertyItem,
                      isSelected && styles.propertyItemSelected,
                      isRequested &&
                        !isSelected &&
                        styles.propertyItemRequested,
                    ]}
                    onPress={() => {
                      void selectProperty(normalizedId);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.propertyItemTitle,
                          isSelected && { color: "white" },
                        ]}
                      >
                        {p.title || "Untitled Property"}
                        {isRequested && !isSelected ? " (Requested)" : ""}
                      </Text>
                      <Text
                        style={[
                          styles.propertyItemMeta,
                          isSelected && { color: "rgba(255,255,255,0.75)" },
                        ]}
                      >
                        {[p.city, p.state_province].filter(Boolean).join(", ")}
                        {p.city || p.state_province ? " • " : ""}₱
                        {Number(p.price || 0).toLocaleString()}
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
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedTenant ? (
              <View style={[styles.tenantCard, styles.lockedTenantCard]}>
                <View style={styles.tenantAvatar}>
                  <Text style={styles.tenantAvatarText}>
                    {(selectedTenant?.tenant_profile?.first_name ||
                      "?")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tenantName}>
                    {`${selectedTenant?.tenant_profile?.first_name || ""} ${selectedTenant?.tenant_profile?.last_name || ""}`.trim() ||
                      "Selected Tenant"}
                  </Text>
                  <Text style={styles.tenantPhone}>
                    {selectedTenant?.tenant_profile?.phone || "No phone"}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.emptyTenants}>
                <Ionicons
                  name="alert-circle-outline"
                  size={24}
                  color="#f59e0b"
                />
                <Text style={styles.emptyTenantsText}>
                  Unable to load tenant from this booking request. Go back to
                  Bookings and tap Assign Tenant again.
                </Text>
              </View>
            )}
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.label}>Start Date *</Text>
            <CalendarPicker
              selectedDate={startDate}
              onDateSelect={setStartDate}
            />

            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Move-in Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Rent:</Text>
                <Text style={styles.summaryValue}>
                  ₱{rentAmount.toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Advance:</Text>
                <Text style={styles.summaryValue}>
                  ₱{advanceAmount.toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Deposit:</Text>
                <Text style={styles.summaryValue}>
                  ₱{securityDeposit.toLocaleString()}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>Total:</Text>
                <Text style={styles.summaryTotalValue}>
                  ₱{totalMoveIn.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.label}>Contract PDF (optional)</Text>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={pickContractPdf}
              activeOpacity={0.8}
            >
              <Ionicons
                name={contractPdf ? "document-attach" : "cloud-upload-outline"}
                size={22}
                color={contractPdf ? "#10b981" : "#9ca3af"}
              />
              <Text
                style={[
                  styles.uploadBtnText,
                  contractPdf && { color: "#10b981" },
                ]}
              >
                {contractPdf
                  ? contractPdf.name
                  : "Click to upload contract PDF"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Late Payment Fee (₱) (Optional)</Text>
            <TextInput
              style={styles.input}
              value={lateFee}
              onChangeText={setLateFee}
              keyboardType="numeric"
              placeholder="e.g. 500 (defaults to 0)"
              placeholderTextColor="#c4c4c4"
            />
            <Text style={styles.hint}>
              Amount charged when rent is paid late.
            </Text>
          </View>
        );
      case 3:
        const amenities = activeProperty?.amenities || [];
        const isWaterFree = amenities.includes("Free Water");
        const isElecFree = amenities.includes("Free Electricity");
        const isWifiAvailable =
          amenities.includes("Wifi") ||
          amenities.includes("WiFi") ||
          amenities.includes("Free WiFi") ||
          amenities.includes("Paid WiFi");
        const isWifiFree = amenities.includes("Free WiFi");
        const requireWifiDueDate = isWifiAvailable && !isWifiFree;

        return (
          <View style={{ width: "100%" }}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={16} color="#4f46e5" />
              <Text style={styles.infoText}>
                Select a due day for each utility. A 4-day notification window
                allows you to prepare for upcoming billing.
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
                  <Text style={styles.utilityName}>Water Due Day</Text>
                  <Text style={styles.utilityDesc}>Day of month (1-31)</Text>
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
                    {getDueDaysText(waterDueDay)}
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
                  <Text style={[styles.utilityName, { color: "#047857" }]}>
                    Free Water
                  </Text>
                </View>
                <View style={styles.utilityBadge}>
                  <Text style={styles.utilityBadgeText}>Included</Text>
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
                  <Text style={styles.utilityName}>Electricity Due Day</Text>
                  <Text style={styles.utilityDesc}>Day of month (1-31)</Text>
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
                    {getDueDaysText(electricityDueDay)}
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
                  <Text style={[styles.utilityName, { color: "#047857" }]}>
                    Free Electricity
                  </Text>
                </View>
                <View style={styles.utilityBadge}>
                  <Text style={styles.utilityBadgeText}>Included</Text>
                </View>
              </View>
            )}

            {/* WiFi */}
            {requireWifiDueDate ? (
              <View style={styles.utilityInputCard}>
                <View
                  style={[
                    styles.utilityIconBox,
                    { backgroundColor: "#e0e7ff" },
                  ]}
                >
                  <Ionicons name="wifi" size={18} color="#4f46e5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.utilityName}>WiFi Due Day</Text>
                  <Text style={styles.utilityDesc}>Day of month (1-31)</Text>
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
                    {getDueDaysText(wifiDueDay)}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.utilityFreeCard}>
                <View
                  style={[
                    styles.utilityIconBox,
                    {
                      backgroundColor: isWifiFree ? "#dcfce7" : "#f3f4f6",
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

            {/* Already Paid Toggle UI */}
            <View style={styles.alreadyPaidCard}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.alreadyPaidTitle}>
                  Tenant already paid move in fee?
                </Text>
                <Text style={styles.alreadyPaidDesc}>
                  Skip auto-billing move-in fees if payment was received
                  offline.
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
                ✓ First bill will be generated for next month
              </Text>
            )}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header / Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtnText}
        >
          <Ionicons name="chevron-back" size={18} color="#4b5563" />
          <Text style={{ fontWeight: "600", color: "#4b5563", fontSize: 14 }}>
            Back
          </Text>
        </TouchableOpacity>
        <Text style={styles.stepCounterText}>
          STEP {step + 1} OF {STEPS.length}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${((step + 1) / STEPS.length) * 100}%` },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Page Title */}
        <View style={styles.titleContainer}>
          <View style={styles.titleIconBox}>
            <Ionicons name="person-add" size={20} color="white" />
          </View>
          <View>
            <Text style={styles.pageTitle}>Assign Tenant</Text>
            <Text style={styles.pageSubtitle}>
              Select a tenant and setup the contract
            </Text>
          </View>
        </View>

        {/* Stepper Pills */}
        <View style={styles.stepperContainer}>
          {STEPS.map((s, i) => {
            const isPast = i < step;
            const isCurrent = i === step;
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

        {/* Step Content */}
        <View style={styles.stepContentCard}>{renderStepContent()}</View>

        {/* Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {step > 0 && (
          <TouchableOpacity
            style={styles.wizardBtnSecondary}
            onPress={prevStep}
          >
            <Text style={styles.wizardBtnSecondaryText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < STEPS.length - 1 ? (
          <TouchableOpacity style={styles.wizardBtnPrimary} onPress={nextStep}>
            <Text style={styles.wizardBtnPrimaryText}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.wizardBtnPrimary, submitting && { opacity: 0.7 }]}
            onPress={handleAssign}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.wizardBtnPrimaryText}>Assign Tenant</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <BlockingLoader
        visible={submitting}
        message="Please wait, we are assigning the tenant. Please do not close this app."
      />
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
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111" }}>
              Select Due Day
            </Text>
            <Text
              style={{
                textAlign: "center",
                color: "#9ca3af",
                marginTop: 4,
                fontSize: 13,
              }}
            >
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
                      if (showWaterDayPicker) setWaterDueDay(day.toString());
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
            <TouchableOpacity
              style={{
                marginTop: 20,
                padding: 14,
                backgroundColor: "#f3f4f6",
                borderRadius: 12,
                width: "100%",
                alignItems: "center",
              }}
              onPress={() => {
                setShowWaterDayPicker(false);
                setShowElectricityDayPicker(false);
                setShowWifiDayPicker(false);
              }}
            >
              <Text style={{ fontWeight: "700", color: "#374151" }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },

  // Top Bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "white",
  },
  backBtnText: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stepCounterText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#9ca3af",
    letterSpacing: 1,
  },

  // Progress Bar
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

  // Title
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

  // Stepper
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

  scrollContent: { padding: 20 },

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
  stepContainer: { width: "100%" },

  // Tenant Cards
  emptyTenants: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
  },
  emptyTenantsText: { fontSize: 13, color: "#92400e", fontWeight: "600" },

  propertyPickerScroll: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    backgroundColor: "#f9fafb",
  },
  propertyItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  propertyItemSelected: {
    backgroundColor: "#111",
    borderBottomColor: "#111",
  },
  propertyItemRequested: {
    backgroundColor: "#dcfce7",
  },
  propertyItemTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  propertyItemMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },

  selectedPropertyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  selectedPropertyLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1d4ed8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedPropertyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginTop: 3,
  },
  selectedPropertyMeta: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
  selectedPropertyBadge: {
    backgroundColor: "#1d4ed8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedPropertyBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "white",
  },

  tenantCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
    marginBottom: 8,
  },
  tenantCardSelected: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  lockedTenantCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#dbeafe",
  },
  lockedTenantBadge: {
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockedTenantBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tenantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  tenantAvatarText: { fontSize: 18, fontWeight: "800", color: "#6b7280" },
  tenantName: { fontSize: 15, fontWeight: "700", color: "#111" },
  tenantPhone: { fontSize: 12, color: "#6b7280", marginTop: 1 },

  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: "#111" },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#111",
  },

  // Form
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
    paddingLeft: 4,
  },
  input: {
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
  readonlyInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  readonlyText: { fontSize: 15, color: "#6b7280", fontWeight: "500" },
  hint: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 6,
    paddingLeft: 4,
    lineHeight: 16,
  },

  // Summary
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

  // Upload
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
  uploadBtnText: { fontSize: 14, color: "#9ca3af", fontWeight: "600" },

  // Info
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

  // Bottom Wizard Actions
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

  // Utility Picker Styles
  utilityInputCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 12,
    gap: 12,
  },
  utilityFreeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginTop: 12,
    gap: 12,
  },
  utilityIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  utilityName: { fontSize: 14, fontWeight: "700", color: "#111" },
  utilityDesc: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  utilityInput: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  utilityBadge: {
    backgroundColor: "white",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  utilityBadgeText: { fontSize: 10, fontWeight: "700", color: "#6b7280" },

  // Already Paid Toggle
  alreadyPaidCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 16,
  },
  alreadyPaidTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  alreadyPaidDesc: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 16,
  },
  alreadyPaidNote: {
    fontSize: 11,
    color: "#059669",
    fontWeight: "700",
    marginTop: 8,
    marginLeft: 4,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    padding: 2,
    justifyContent: "center",
  },
  switchTrackActive: { backgroundColor: "#10b981" },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbActive: { transform: [{ translateX: 20 }] },
});
