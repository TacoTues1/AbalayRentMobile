import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import CalendarPicker from "../../components/ui/CalendarPicker";
import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
const FREE_TENANT_SLOT_COUNT = 1;
const TENANT_SLOT_PRICE_PHP = 50;
const ACTIVE_OCCUPANCY_STATUSES = [
  "active",
  "pending_end",
  "approved",
  "signed",
];
const SUBSCRIPTION_TABLE_CANDIDATES = [
  "subscribtion",
  "subscriptions",
  "subscription",
];
const SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES = [
  "subscribtion_payments",
  "subscription_payments",
];
const USER_COLUMN_CANDIDATES = [
  "landlord_id",
  "user_id",
  "owner_id",
  "profile_id",
];
const PAID_STATUS_VALUES = [
  "paid",
  "completed",
  "success",
  "succeeded",
  "active",
  "approved",
  "verified",
  "done",
];

export default function AssignTenantScreen() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();

  const [session, setSession] = useState<any>(null);
  const [property, setProperty] = useState<any>(null);
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
  const [contractPdf, setContractPdf] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [payingSlots, setPayingSlots] = useState(false);
  const [slotUsage, setSlotUsage] = useState({
    used: 0,
    paidExtra: 0,
    total: FREE_TENANT_SLOT_COUNT,
    remaining: FREE_TENANT_SLOT_COUNT,
  });
  const STEPS = [
    { label: "Tenant", icon: "1" },
    { label: "Contract", icon: "2" },
    { label: "Documents", icon: "3" },
    { label: "Utilities", icon: "4" },
  ];

  const isMissingSchemaError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    const details = String(error?.details || "").toLowerCase();
    const code = String(error?.code || "").toUpperCase();
    return (
      code === "PGRST204" ||
      code === "PGRST205" ||
      message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      details.includes("failed to parse")
    );
  };

  const toNumber = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const hasPaidStatus = (row: any) => {
    const status = String(
      row?.status || row?.payment_status || row?.state || "",
    ).toLowerCase();
    if (!status) return row?.is_paid !== false;
    return PAID_STATUS_VALUES.includes(status);
  };

  const showConfirm = (title: string, message: string, okText = "Continue") =>
    new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: okText, onPress: () => resolve(true) },
      ]);
    });

  const fetchRowsByUserColumn = async (tableName: string, userId: string) => {
    for (const userColumn of USER_COLUMN_CANDIDATES) {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq(userColumn, userId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!error) {
        return data || [];
      }

      if (!isMissingSchemaError(error)) {
        console.log(
          `fetchRowsByUserColumn ${tableName}.${userColumn} failed`,
          error,
        );
      }
    }
    return [];
  };

  const getPaidSlotsFromSubscriptionRows = (rows: any[]) => {
    let maxTotalSlots = 0;
    let summedExtraSlots = 0;

    for (const row of rows || []) {
      if (!hasPaidStatus(row)) continue;

      const totalSlotsCandidate = Math.max(
        toNumber(row?.total_slots),
        toNumber(row?.max_slots),
        toNumber(row?.slot_limit),
        toNumber(row?.allowed_slots),
      );
      if (totalSlotsCandidate > maxTotalSlots) {
        maxTotalSlots = totalSlotsCandidate;
      }

      const extraSlotsCandidate = Math.max(
        toNumber(row?.additional_slots),
        toNumber(row?.extra_slots),
        toNumber(row?.slots),
        toNumber(row?.slot_count),
        toNumber(row?.quantity),
      );
      summedExtraSlots += Math.max(0, extraSlotsCandidate);
    }

    if (maxTotalSlots > 0) {
      return Math.max(0, maxTotalSlots - FREE_TENANT_SLOT_COUNT);
    }

    return Math.max(0, summedExtraSlots);
  };

  const getPaidSlotsFromPaymentRows = (rows: any[]) => {
    let paidSlots = 0;
    for (const row of rows || []) {
      if (!hasPaidStatus(row)) continue;

      const slotQty = Math.max(
        toNumber(row?.slots),
        toNumber(row?.slot_count),
        toNumber(row?.quantity),
        toNumber(row?.additional_slots),
      );

      if (slotQty > 0) {
        paidSlots += slotQty;
        continue;
      }

      const amount = Math.max(
        toNumber(row?.amount),
        toNumber(row?.amount_paid),
        toNumber(row?.total_amount),
      );
      if (amount > 0) {
        paidSlots += Math.floor(amount / TENANT_SLOT_PRICE_PHP);
      }
    }

    return Math.max(0, paidSlots);
  };

  const loadTenantSlotUsage = async (landlordId: string) => {
    setLoadingSlots(true);
    try {
      const { count: usedCount, error: usedCountError } = await supabase
        .from("tenant_occupancies")
        .select("id", { count: "exact", head: true })
        .eq("landlord_id", landlordId)
        .in("status", ACTIVE_OCCUPANCY_STATUSES);

      if (usedCountError) {
        console.log("Failed loading tenant slot usage count:", usedCountError);
      }

      const subscriptionRowsByTable = await Promise.all(
        SUBSCRIPTION_TABLE_CANDIDATES.map((tableName) =>
          fetchRowsByUserColumn(tableName, landlordId),
        ),
      );

      const subscriptionPaymentRowsByTable = await Promise.all(
        SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES.map((tableName) =>
          fetchRowsByUserColumn(tableName, landlordId),
        ),
      );

      const subscriptionRows = subscriptionRowsByTable.flat();
      const paymentRows = subscriptionPaymentRowsByTable.flat();

      const paidFromSubscriptions =
        getPaidSlotsFromSubscriptionRows(subscriptionRows);
      const paidFromPayments = getPaidSlotsFromPaymentRows(paymentRows);
      const paidExtra = Math.max(paidFromSubscriptions, paidFromPayments, 0);
      const totalSlots = FREE_TENANT_SLOT_COUNT + paidExtra;
      const used = usedCount || 0;
      const remaining = Math.max(0, totalSlots - used);

      setSlotUsage({
        used,
        paidExtra,
        total: totalSlots,
        remaining,
      });

      return {
        used,
        paidExtra,
        totalSlots,
        remaining,
      };
    } finally {
      setLoadingSlots(false);
    }
  };

  const recordSlotPurchase = async (
    landlordId: string,
    slotsBought: number,
    amountPaid: number,
    checkoutSessionId?: string,
  ) => {
    const now = new Date().toISOString();
    const paymentPayloadVariants = [
      {
        landlord_id: landlordId,
        slots: slotsBought,
        amount: amountPaid,
        status: "paid",
        payment_method: "qrph",
        provider: "paymongo",
        checkout_session_id: checkoutSessionId || null,
        created_at: now,
      },
      {
        user_id: landlordId,
        slot_count: slotsBought,
        amount_paid: amountPaid,
        payment_status: "paid",
        payment_method: "qrph",
        provider: "paymongo",
        session_id: checkoutSessionId || null,
        created_at: now,
      },
    ];

    for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
      for (const payload of paymentPayloadVariants) {
        const { error } = await supabase.from(tableName).insert(payload);
        if (!error) {
          break;
        }
        if (!isMissingSchemaError(error)) {
          console.log(`recordSlotPurchase failed on ${tableName}:`, error);
        }
      }
    }

    const nextTotalSlots =
      FREE_TENANT_SLOT_COUNT + slotUsage.paidExtra + slotsBought;
    const subscriptionPayloadVariants = [
      {
        landlord_id: landlordId,
        plan_name: "tenant_slot_plan",
        total_slots: nextTotalSlots,
        additional_slots: slotUsage.paidExtra + slotsBought,
        status: "active",
        updated_at: now,
      },
      {
        user_id: landlordId,
        plan_type: "tenant_slot_plan",
        slot_count: slotUsage.paidExtra + slotsBought,
        status: "active",
        updated_at: now,
      },
    ];

    for (const tableName of SUBSCRIPTION_TABLE_CANDIDATES) {
      for (const payload of subscriptionPayloadVariants) {
        const { error } = await supabase.from(tableName).upsert(payload);
        if (!error) {
          break;
        }
        if (!isMissingSchemaError(error)) {
          console.log(`record subscription failed on ${tableName}:`, error);
        }
      }
    }
  };

  const buyTenantSlots = async (slotsToBuy: number) => {
    if (!session?.user?.id) return false;
    if (!API_URL) {
      Alert.alert("Error", "API URL is not configured.");
      return false;
    }

    const normalizedSlots = Math.max(1, Math.floor(slotsToBuy));
    const amount = normalizedSlots * TENANT_SLOT_PRICE_PHP;

    const confirmed = await showConfirm(
      "Buy Tenant Slots",
      `You are about to buy ${normalizedSlots} slot${normalizedSlots > 1 ? "s" : ""} for PHP ${amount}. Proceed with PayMongo QR payment?`,
      "Pay with QR",
    );

    if (!confirmed) return false;

    setPayingSlots(true);
    try {
      const response = await fetch(
        `${API_URL}/api/payments/create-paymongo-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            description: "Tenant Slot Subscription",
            remarks: `Landlord ${session.user.id} bought ${normalizedSlots} tenant slot(s)`,
            allowedMethods: ["qrph"],
            metadata: {
              type: "tenant_slot_subscription",
              landlordId: session.user.id,
              slots: normalizedSlots,
            },
          }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || "Failed to start PayMongo checkout.");
      }

      await WebBrowser.openBrowserAsync(data.checkoutUrl);

      // Try backend verification first; if not available, fallback to manual confirmation.
      let verified = false;
      if (data?.checkoutSessionId) {
        for (let attempt = 0; attempt < 12; attempt++) {
          try {
            const verifyResponse = await fetch(
              `${API_URL}/api/payments/process-paymongo-success`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId: data.checkoutSessionId,
                  type: "tenant_slot_subscription",
                  landlordId: session.user.id,
                  slots: normalizedSlots,
                }),
              },
            );

            if (verifyResponse.ok) {
              verified = true;
              break;
            }
          } catch {}

          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      if (!verified) {
        verified = await showConfirm(
          "Confirm Payment",
          "If you completed the QR payment, tap Confirm to apply your tenant slots.",
          "Confirm",
        );
      }

      if (!verified) return false;

      await recordSlotPurchase(
        session.user.id,
        normalizedSlots,
        amount,
        data?.checkoutSessionId,
      );

      await loadTenantSlotUsage(session.user.id);
      Alert.alert("Success", "Tenant slot purchase completed.");
      return true;
    } catch (error: any) {
      Alert.alert(
        "Payment Failed",
        error?.message || "Unable to process payment.",
      );
      return false;
    } finally {
      setPayingSlots(false);
    }
  };

  const ensureTenantSlotCapacity = async () => {
    if (!session?.user?.id) return false;

    const usage = await loadTenantSlotUsage(session.user.id);
    const needed = Math.max(0, usage.used + 1 - usage.totalSlots);
    if (needed <= 0) return true;

    return buyTenantSlots(needed);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (!s) return router.replace("/");
      setSession(s);
      await loadTenantSlotUsage(s.user.id);

      if (!propertyId) {
        Alert.alert("Error", "No property selected");
        router.back();
        return;
      }

      // Load property
      const { data: prop } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .single();

      if (!prop) {
        Alert.alert("Error", "Property not found");
        router.back();
        return;
      }
      setProperty(prop);

      // Load approved bookings for this property
      const { data: bookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("property_id", propertyId)
        .eq("status", "approved");

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
      } else {
        setApprovedBookings([]);
      }
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
    if (!selectedTenant) return Alert.alert("Error", "Please select a tenant");
    if (!startDate) return Alert.alert("Error", "Please enter a start date");

    const requireWifiDueDate = property?.amenities?.includes("Paid WiFi");
    if (requireWifiDueDate && !wifiDueDay) {
      return Alert.alert("Required", "Please select a Wifi Due Day");
    }

    setSubmitting(true);
    try {
      const hasCapacity = await ensureTenantSlotCapacity();
      if (!hasCapacity) {
        return;
      }

      const rentAmount = property.price || 0;
      const hasAdvance =
        typeof property?.has_advance === "boolean"
          ? property?.has_advance
          : Number(property?.advance_amount || 0) > 0;
      const advanceAmount = hasAdvance
        ? Number(property?.advance_amount || rentAmount)
        : 0;
      const hasSecurityDeposit =
        typeof property?.has_security_deposit === "boolean"
          ? property?.has_security_deposit
          : Number(property?.security_deposit_amount || 0) > 0;
      const securityDeposit = hasSecurityDeposit
        ? Number(property?.security_deposit_amount || rentAmount)
        : 0;
      // Upload contract PDF if selected
      let contractUrl = null;
      if (contractPdf) {
        const fileExt = contractPdf.name.split(".").pop();
        const fileName = `contract_${propertyId}_${Date.now()}.${fileExt}`;

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
          property_id: property.id,
          tenant_id: selectedTenant.tenant,
          landlord_id: session.user.id,
          status: "active",
          start_date: new Date(startDate).toISOString(),
          security_deposit: securityDeposit,
          security_deposit_used: 0,
          wifi_due_day:
            requireWifiDueDate && wifiDueDay ? parseInt(wifiDueDay) : null,
          late_payment_fee: parseFloat(lateFee) || 0,
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Update Property status
      await supabase
        .from("properties")
        .update({ status: "occupied" })
        .eq("id", property.id);

      // 3. Create Move-In Bill
      await supabase.from("payment_requests").insert({
        landlord: session.user.id,
        tenant: selectedTenant.tenant,
        property_id: property.id,
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

      // 4. Notify tenant (non-blocking - don't let notification failure block assignment)
      try {
        const message = `You have been assigned to "${property.title}" from ${startDate}. Move-in bill sent.`;
        await createNotification(
          selectedTenant.tenant,
          "occupancy_assigned",
          message,
          { actor: session.user.id, email: true, sms: true },
        );
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
        console.log("Notification failed (non-critical):", notifErr);
      }

      Alert.alert("Success", "Tenant assigned & Move-in bill created!", [
        { text: "OK", onPress: () => router.back() },
      ]);
      await loadTenantSlotUsage(session.user.id);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to assign tenant");
    } finally {
      setSubmitting(false);
    }
  };

  const rentAmount = property?.price || 0;
  const hasAdvance =
    typeof property?.has_advance === "boolean"
      ? property?.has_advance
      : Number(property?.advance_amount || 0) > 0;
  const advanceAmount = hasAdvance
    ? Number(property?.advance_amount || rentAmount)
    : 0;
  const hasSecurityDeposit =
    typeof property?.has_security_deposit === "boolean"
      ? property?.has_security_deposit
      : Number(property?.security_deposit_amount || 0) > 0;
  const securityDeposit = hasSecurityDeposit
    ? Number(property?.security_deposit_amount || rentAmount)
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
    if (step === 0 && !selectedTenant)
      return Alert.alert("Error", "Please select a tenant");
    if (step === 1) {
      if (!startDate) return Alert.alert("Error", "Please enter a start date");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const renderStepContent = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            {approvedBookings.length === 0 ? (
              <View style={styles.emptyTenants}>
                <Ionicons
                  name="alert-circle-outline"
                  size={24}
                  color="#f59e0b"
                />
                <Text style={styles.emptyTenantsText}>
                  No approved bookings found.
                </Text>
              </View>
            ) : (
              approvedBookings.map((item) => {
                const isSelected = selectedTenant?.id === item.id;
                const name =
                  `${item.tenant_profile?.first_name || ""} ${item.tenant_profile?.last_name || ""}`.trim();
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.tenantCard,
                      isSelected && styles.tenantCardSelected,
                    ]}
                    onPress={() => setSelectedTenant(item)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.tenantAvatar,
                        isSelected && { backgroundColor: "#111" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tenantAvatarText,
                          isSelected && { color: "white" },
                        ]}
                      >
                        {(item.tenant_profile?.first_name ||
                          "?")[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.tenantName,
                          isSelected && { color: "white" },
                        ]}
                      >
                        {name || "Unknown"}
                      </Text>
                      <Text
                        style={[
                          styles.tenantPhone,
                          isSelected && { color: "rgba(255,255,255,0.7)" },
                        ]}
                      >
                        {item.tenant_profile?.phone || "No phone"}
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
              })
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
        const requireWifiDueDate = property?.amenities?.includes("Paid WiFi");
        return (
          <View style={styles.stepContainer}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={16} color="#6366f1" />
              <Text style={styles.infoText}>
                Utilities: Tenants receive reminders 3 days before due dates.
              </Text>
            </View>

            {requireWifiDueDate ? (
              <>
                <Text style={styles.label}>Wifi Due Day *</Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                    justifyContent: "flex-start",
                    marginTop: 5,
                  }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => setWifiDueDay(day.toString())}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor:
                          wifiDueDay === day.toString() ? "black" : "white",
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor:
                          wifiDueDay === day.toString() ? "black" : "#e5e7eb",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "bold",
                          color:
                            wifiDueDay === day.toString() ? "white" : "#374151",
                        }}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: property?.amenities?.includes("Free WiFi")
                      ? "#d1fae5"
                      : "#f3f4f6",
                    marginTop: 15,
                  },
                ]}
              >
                <Ionicons
                  name={
                    property?.amenities?.includes("Free WiFi")
                      ? "wifi"
                      : "wifi-outline"
                  }
                  size={16}
                  color={
                    property?.amenities?.includes("Free WiFi")
                      ? "#059669"
                      : "#6b7280"
                  }
                />
                <Text
                  style={[
                    styles.infoText,
                    {
                      color: property?.amenities?.includes("Free WiFi")
                        ? "#059669"
                        : "#6b7280",
                    },
                  ]}
                >
                  {property?.amenities?.includes("Free WiFi")
                    ? "WiFi is Free! No due date needed."
                    : "WiFi not provided for this property."}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.infoBox,
                { backgroundColor: "#fef3c7", marginTop: 15 },
              ]}
            >
              <Ionicons name="flash" size={16} color="#d97706" />
              <Text style={[styles.infoText, { color: "#92400e" }]}>
                Note: Electricity and Water reminders are sent automatically
                (due date is always 1st week of the month).
              </Text>
            </View>
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

        <View style={styles.slotCard}>
          <View style={styles.slotCardHeader}>
            <Text style={styles.slotTitle}>Tenant Slots</Text>
            {loadingSlots ? (
              <ActivityIndicator size="small" color="#6b7280" />
            ) : (
              <Text style={styles.slotUsageText}>
                {slotUsage.used}/{slotUsage.total} used
              </Text>
            )}
          </View>
          <Text style={styles.slotMetaText}>
            Free plan: {FREE_TENANT_SLOT_COUNT} slot. Extra slots: PHP{" "}
            {TENANT_SLOT_PRICE_PHP} each.
          </Text>
          <Text
            style={[
              styles.slotRemainingText,
              slotUsage.remaining <= 0 && { color: "#dc2626" },
            ]}
          >
            Remaining slots: {slotUsage.remaining}
          </Text>
          <TouchableOpacity
            style={[styles.buySlotBtn, payingSlots && { opacity: 0.6 }]}
            onPress={() => buyTenantSlots(1)}
            disabled={payingSlots || loadingSlots}
          >
            {payingSlots ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.buySlotBtnText}>Buy +1 Slot (PHP 50)</Text>
            )}
          </TouchableOpacity>
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
  slotCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  slotCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  slotTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  slotUsageText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  slotMetaText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  slotRemainingText: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "700",
    marginBottom: 10,
  },
  buySlotBtn: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buySlotBtnText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },

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
    backgroundColor: "#f9fafb",
    borderColor: "#111",
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
});
