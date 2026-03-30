import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
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
import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

// Helper to get Month Year string
function getRentMonth(dueDateString: string) {
  if (!dueDateString) return "-";
  const due = new Date(dueDateString);
  return due.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function Payments() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  // -- State --
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("all"); // 'all', 'pending', 'verify', 'paid', 'cancelled'

  // Data State
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]); // Approved tenants/occupancies for dropdown
  const [payments, setPayments] = useState<any[]>([]); // Paid history

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState("other"); // Default to other since rent/wifi/electric/water are automatic

  // Pay Modal (Tenant) - Smart Logic
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBill, setSelectedBill] = useState<any>(null);
  const [proofImage, setProofImage] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash"); // 'cash', 'stripe', 'paymongo'
  const [uploading, setUploading] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [appliedCredit, setAppliedCredit] = useState(0);
  const [monthsCovered, setMonthsCovered] = useState(1);
  const [contractEndDate, setContractEndDate] = useState<Date | null>(null);
  const [contractStartDate, setContractStartDate] = useState<Date | null>(null);
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [maxMonthsAllowed, setMaxMonthsAllowed] = useState(1);
  const [isBelowMinimum, setIsBelowMinimum] = useState(false);
  const [minimumPayment, setMinimumPayment] = useState(0);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [maxPaymentLimit, setMaxPaymentLimit] = useState<number | null>(null);
  const [exceedsContract, setExceedsContract] = useState(false);
  const [showCashConfirmModal, setShowCashConfirmModal] = useState(false);
  const [landlordAcceptedPayments, setLandlordAcceptedPayments] =
    useState<any>(null);
  const [showBillReceiptModal, setShowBillReceiptModal] = useState(false);

  // Constants
  const getApiUrl = () => {
    let url = process.env.EXPO_PUBLIC_API_URL || "";
    // If on Android Emulator, force 10.0.2.2 if url is localhost OR if url is the LAN IP but unreachable
    // But usually lan IP (192...) works on Emulator. Localhost doesn't.
    // If user set 172... on Emulator, it might fail.
    // Let's rely on standard practice: replace localhost with 10.0.2.2.
    if (Platform.OS === "android" && url.includes("localhost")) {
      return url.replace("localhost", "10.0.2.2");
    }
    return url;
  };
  const API_URL = getApiUrl();

  // Verify Modal (Landlord) - Replaced with Confirm Logic in list or separate modal
  // We'll use Alert for confirmations to keep it simple, or a custom modal if needed.
  // Using simple Action Sheet style or Alert for now.

  // Edit Bill Modal (Landlord)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState<any>({});

  // Form State (Create Bill)
  const [formData, setFormData] = useState<any>({
    property_id: "",
    tenant_id: "",
    occupancy_id: "",
    water_bill: "",
    other_bills: "",
    bills_description: "",
    water_due_date: "",
    other_due_date: "",
  });

  // --- FUNCTIONS ---
  const loadData = async (userId: string, role: string, isSilent = false) => {
    if (!isSilent) setLoading(true);

    // Safety timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (!isSilent) {
        setLoading(false);
        console.log("Load Data timed out - unblocking UI");
      }
    }, 10000);

    try {
      console.log(`Loading payments for ${role} ${userId}`);

      // 1. Check if user is a family member (Tenant only)
      if (role === "tenant" && API_URL) {
        try {
          // Ensure we don't have double slashes
          const urlPrefix = API_URL.endsWith("/")
            ? API_URL.slice(0, -1)
            : API_URL;
          const fmRes = await fetch(
            `${urlPrefix}/api/family-members?member_id=${userId}`,
          );
          if (fmRes.ok) {
            const fmData = await fmRes.json();
            if (fmData.occupancy) {
              console.log(
                "loadData: User is a family member. Loading parent's payments.",
              );
              setPaymentRequests(fmData.fullPaymentRequests || []);
              setPayments(fmData.paymentsHistory || []);
              return; // Exit early since we got the data
            }
          }
        } catch (err) {
          console.error("Family member fetch error in payments:", err);
        }
      }

      // 2. Load Bills with joined properties and profiles (matching web version)
      let query = supabase
        .from("payment_requests")
        .select(
          `
          *,
          properties(title, address),
          tenant_profile:profiles!payment_requests_tenant_fkey(first_name, middle_name, last_name, phone),
          landlord_profile:profiles!payment_requests_landlord_fkey(first_name, middle_name, last_name, phone)
        `,
        )
        .order("created_at", { ascending: false });

      if (role === "landlord") {
        query = query.eq("landlord", userId);
      } else {
        query = query.eq("tenant", userId);
      }

      const { data: bills, error } = await query;
      if (error) {
        console.error("Fetch bills error:", error);
        Alert.alert("Error", "Failed to load bills. Please check connection.");
      }
      setPaymentRequests(bills || []);
      console.log(`Loaded ${bills?.length} bills.`);

      // 2. Load payment history (for stats / history)
      let paymentsQuery = supabase
        .from("payments")
        .select(
          "*, properties(title), profiles!payments_tenant_fkey(first_name, middle_name, last_name)",
        )
        .order("paid_at", { ascending: false });

      if (role === "tenant") {
        paymentsQuery = paymentsQuery.eq("tenant", userId);
      } else if (role === "landlord") {
        paymentsQuery = paymentsQuery.eq("landlord", userId);
      }

      const { data: paymentsData } = await paymentsQuery;
      setPayments(paymentsData || []);
    } catch (e: any) {
      console.error("Load Data Exception:", e);
      Alert.alert("Error", e.message || "An unexpected error occurred");
    } finally {
      clearTimeout(timeout);
      if (!isSilent) setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      setSession(session);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setProfile(data);
      loadData(session.user.id, data?.role);
    } else {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  // Realtime Subscription
  useEffect(() => {
    if (session) {
      const channel = supabase
        .channel("payments_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payment_requests" },
          () => loadData(session.user.id, profile?.role, true),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "payments" },
          () => loadData(session.user.id, profile?.role, true),
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session, profile]);

  // --- LANDLORD ACTIONS ---

  // --- LANDLORD ACTIONS ---
  const [billReceiptImage, setBillReceiptImage] = useState<any>(null);
  const [qrCodeImage, setQrCodeImage] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const pickBillReceipt = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) setBillReceiptImage(result.assets[0]);
  };

  const pickQrCode = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) setQrCodeImage(result.assets[0]);
  };

  const handleCreateBill = async () => {
    if (!formData.tenant_id || !formData.property_id)
      return Alert.alert("Error", "Please select a tenant");

    let water = 0,
      other = 0;
    let finalDueDate: string | null = null;
    let billTypeLabel = "";

    if (activeTab === "other") {
      other = parseFloat(formData.other_bills) || 0;
      if (other <= 0) return Alert.alert("Error", "Please enter amount");
      finalDueDate = formData.other_due_date || null;
      if (!finalDueDate) return Alert.alert("Error", "Please enter due date");
      billTypeLabel = "Other Bill";
    }

    const total = water + other;
    if (!billReceiptImage)
      return Alert.alert("Error", "Please upload bill receipt");

    setCreating(true);
    try {
      // Upload Receipt
      let receiptUrl = null;
      if (billReceiptImage) {
        const fileName = `receipt_${Date.now()}.jpg`;
        await supabase.storage
          .from("payment-files")
          .upload(fileName, decode(billReceiptImage.base64), {
            contentType: "image/jpeg",
          });
        const { data } = supabase.storage
          .from("payment-files")
          .getPublicUrl(fileName);
        receiptUrl = data.publicUrl;
      }

      // Upload QR
      let qrUrl = null;
      if (qrCodeImage) {
        const fileName = `qr_${Date.now()}.jpg`;
        await supabase.storage
          .from("payment-files")
          .upload(fileName, decode(qrCodeImage.base64), {
            contentType: "image/jpeg",
          });
        const { data } = supabase.storage
          .from("payment-files")
          .getPublicUrl(fileName);
        qrUrl = data.publicUrl;
      }

      const { data: paymentRequest, error } = await supabase
        .from("payment_requests")
        .insert({
          landlord: session.user.id,
          tenant: formData.tenant_id,
          property_id: formData.property_id,
          occupancy_id: formData.occupancy_id || null,
          rent_amount: 0,
          water_bill: water,
          electrical_bill: 0,
          wifi_bill: 0,
          other_bills: other,
          bills_description: formData.bills_description || "No Message",
          due_date: finalDueDate ? new Date(finalDueDate).toISOString() : null,
          water_due_date: formData.water_due_date
            ? new Date(formData.water_due_date).toISOString()
            : null,
          other_due_date: formData.other_due_date
            ? new Date(formData.other_due_date).toISOString()
            : null,
          status: "pending",
          bill_receipt_url: receiptUrl,
          qr_code_url: qrUrl,
        })
        .select()
        .single();

      if (error) throw error;

      await createNotification(
        formData.tenant_id,
        "payment_request",
        `New ${billTypeLabel}: ₱${total.toLocaleString()}`,
        { actor: session.user.id, email: true, sms: true },
      );
      Alert.alert("Success", `${billTypeLabel} sent!`);
      setShowCreateModal(false);
      setFormData({
        property_id: "",
        tenant_id: "",
        occupancy_id: "",
        water_bill: "",
        other_bills: "",
        bills_description: "",
        water_due_date: "",
        other_due_date: "",
      });
      setBillReceiptImage(null);
      setQrCodeImage(null);
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send bill");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelBill = async (id: string) => {
    Alert.alert("Confirm Cancel", "Are you sure?", [
      { text: "No" },
      {
        text: "Yes",
        style: "destructive",
        onPress: async () => {
          await supabase
            .from("payment_requests")
            .update({ status: "cancelled" })
            .eq("id", id);
          loadData(session.user.id, profile.role);
        },
      },
    ]);
  };

  const handleEditBill = (bill: any) => {
    setEditFormData({
      id: bill.id,
      rent_amount: bill.rent_amount?.toString() || "",
      water_bill: bill.water_bill?.toString() || "",
      electrical_bill: bill.electrical_bill?.toString() || "",
      other_bills: bill.other_bills?.toString() || "",
      bills_description: bill.bills_description || "",
      due_date: bill.due_date
        ? new Date(bill.due_date).toISOString().split("T")[0]
        : "",
    });
    setShowEditModal(true);
  };

  const handleUpdateBill = async () => {
    try {
      const { error } = await supabase
        .from("payment_requests")
        .update({
          rent_amount: parseFloat(editFormData.rent_amount) || 0,
          water_bill: parseFloat(editFormData.water_bill) || 0,
          electrical_bill: parseFloat(editFormData.electrical_bill) || 0,
          other_bills: parseFloat(editFormData.other_bills) || 0,
          bills_description: editFormData.bills_description,
          due_date: editFormData.due_date
            ? new Date(editFormData.due_date).toISOString()
            : null,
        })
        .eq("id", editFormData.id);

      if (error) throw error;
      Alert.alert("Success", "Bill updated!");
      setShowEditModal(false);
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  // --- SMART CONFIRM LOGIC (LANDLORD) ---
  const confirmPayment = async (request: any) => {
    Alert.alert(
      "Confirm Payment",
      "Mark this bill as PAID and record transaction?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => executeConfirmPayment(request) },
      ],
    );
  };

  const executeConfirmPayment = async (request: any) => {
    try {
      // 1. Get Occupancy Info
      let monthlyRent = parseFloat(request.rent_amount || 0);
      let contractEndDate: Date | null = null;

      if (request.occupancy_id) {
        const { data: occ } = await supabase
          .from("tenant_occupancies")
          .select("contract_end_date, rent_amount, start_date")
          .eq("id", request.occupancy_id)
          .single();
        if (occ) {
          monthlyRent = parseFloat(occ.rent_amount || request.rent_amount || 0);
          contractEndDate = occ.contract_end_date
            ? new Date(occ.contract_end_date)
            : null;
        }
      }

      // 2. Calculate Totals
      const billTotal =
        parseFloat(request.rent_amount || 0) +
        parseFloat(request.security_deposit_amount || 0) +
        parseFloat(request.advance_amount || 0) +
        parseFloat(request.water_bill || 0) +
        parseFloat(request.electrical_bill || 0) +
        parseFloat(request.other_bills || 0);

      // 3. Extra Months for Advance
      // For move-in payments, advance_amount is a one-time deposit, NOT advance rent months
      // So we skip creating extra "paid" bills for move-in payments
      let extraMonths = 0;
      if (
        !request.is_move_in_payment &&
        monthlyRent > 0 &&
        parseFloat(request.advance_amount || 0) > 0
      ) {
        extraMonths = Math.floor(
          parseFloat(request.advance_amount) / monthlyRent,
        );
      }

      // 4. Record Payment
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          property_id: request.property_id,
          application_id: request.application_id,
          tenant: request.tenant,
          landlord: session.user.id,
          amount: billTotal,
          water_bill: request.water_bill,
          electrical_bill: request.electrical_bill,
          other_bills: request.other_bills,
          bills_description: request.bills_description,
          method: request.payment_method || "cash",
          status: "recorded",
          due_date: request.due_date,
          currency: "PHP",
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 5. Handle Renewal Payment Due Date Update
      let actualNextDueDate = request.due_date;
      if (request.is_renewal_payment && request.occupancy_id) {
        // Find latest paid bill to calculate next due date
        const { data: lastPaidBill } = await supabase
          .from("payment_requests")
          .select("due_date, rent_amount, advance_amount")
          .eq("tenant", request.tenant)
          .eq("occupancy_id", request.occupancy_id)
          .in("status", ["paid", "pending_confirmation"])
          .neq("id", request.id)
          .gt("rent_amount", 0)
          .order("due_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastPaidBill && lastPaidBill.due_date) {
          const lastDue = new Date(lastPaidBill.due_date);
          const lastRent = parseFloat(lastPaidBill.rent_amount || 0);
          const lastAdv = parseFloat(lastPaidBill.advance_amount || 0);
          let monthsFromLast = 1;
          if (lastRent > 0 && lastAdv > 0) {
            monthsFromLast = 1 + Math.floor(lastAdv / lastRent);
          }

          const targetDate = new Date(lastDue);
          targetDate.setMonth(targetDate.getMonth() + monthsFromLast);
          actualNextDueDate = targetDate.toISOString();
        } else {
          // Fallback to start_date + 1 month
          const { data: occ } = await supabase
            .from("tenant_occupancies")
            .select("start_date")
            .eq("id", request.occupancy_id)
            .single();
          if (occ?.start_date) {
            const d = new Date(occ.start_date);
            d.setMonth(d.getMonth() + 1);
            actualNextDueDate = d.toISOString();
          }
        }
      }

      // 6. Update Status
      const updateData: any = { status: "paid", payment_id: payment.id };
      if (
        request.is_renewal_payment &&
        actualNextDueDate !== request.due_date
      ) {
        updateData.due_date = actualNextDueDate;
      }
      await supabase
        .from("payment_requests")
        .update(updateData)
        .eq("id", request.id);

      // 7. Handle Advance Payments (Create Paid future bills)
      if (extraMonths > 0 && request.occupancy_id && actualNextDueDate) {
        const baseDueDate = new Date(actualNextDueDate);
        for (let i = 1; i <= extraMonths; i++) {
          const fDate = new Date(baseDueDate);
          fDate.setMonth(fDate.getMonth() + i);
          if (contractEndDate && fDate > contractEndDate) break;

          await supabase.from("payment_requests").insert({
            landlord: session.user.id,
            tenant: request.tenant,
            property_id: request.property_id,
            occupancy_id: request.occupancy_id,
            rent_amount: monthlyRent,
            water_bill: 0,
            electrical_bill: 0,
            other_bills: 0,
            bills_description: `Advance Payment (Month ${i + 1})`,
            due_date: fDate.toISOString(),
            status: "paid",
            paid_at: new Date().toISOString(),
            is_advance_payment: true,
            payment_id: payment.id,
          });
        }
      }

      // 8. Balance updates (Credit)
      const totalPaidByTenant = parseFloat(request.amount_paid || 0);

      if (totalPaidByTenant > 0) {
        const billOwed =
          parseFloat(request.rent_amount || 0) +
          parseFloat(request.security_deposit_amount || 0) +
          parseFloat(request.advance_amount || 0) +
          parseFloat(request.water_bill || 0) +
          parseFloat(request.electrical_bill || 0) +
          parseFloat(request.other_bills || 0);
        const remainingCredit = totalPaidByTenant - billOwed;

        if (request.is_renewal_payment) {
          // Reset renewal status
          if (request.occupancy_id) {
            await supabase
              .from("tenant_occupancies")
              .update({ renewal_status: null, renewal_requested: false })
              .eq("id", request.occupancy_id);
          }
          // Check for incorrect credit from renewal and remove
          if (request.occupancy_id) {
            const { data: existing } = await supabase
              .from("tenant_balances")
              .select("amount")
              .eq("tenant_id", request.tenant)
              .eq("occupancy_id", request.occupancy_id)
              .maybeSingle();
            if (existing && existing.amount > 0) {
              const adv = parseFloat(request.advance_amount || 0);
              if (Math.abs(existing.amount - adv) < 1) {
                // Likely incorrect credit -> remove
                await supabase
                  .from("tenant_balances")
                  .update({ amount: 0, last_updated: new Date().toISOString() })
                  .eq("tenant_id", request.tenant)
                  .eq("occupancy_id", request.occupancy_id);
              } else {
                // Credit doesn't match - reduce by advance amount
                const newBalance = Math.max(0, existing.amount - adv);
                await supabase
                  .from("tenant_balances")
                  .update({
                    amount: newBalance,
                    last_updated: new Date().toISOString(),
                  })
                  .eq("tenant_id", request.tenant)
                  .eq("occupancy_id", request.occupancy_id);
              }
            }
          }
        } else if (remainingCredit > 0 && request.occupancy_id) {
          const { data: existing } = await supabase
            .from("tenant_balances")
            .select("amount")
            .eq("tenant_id", request.tenant)
            .eq("occupancy_id", request.occupancy_id)
            .maybeSingle();
          const newBal = (existing?.amount || 0) + remainingCredit;
          await supabase
            .from("tenant_balances")
            .upsert(
              {
                tenant_id: request.tenant,
                occupancy_id: request.occupancy_id,
                amount: newBal,
              },
              { onConflict: "tenant_id,occupancy_id" },
            );
        }
      } else {
        // No amount_paid recorded - still handle renewal status reset
        if (request.is_renewal_payment && request.occupancy_id) {
          await supabase
            .from("tenant_occupancies")
            .update({ renewal_status: null, renewal_requested: false })
            .eq("id", request.occupancy_id);
        }
      }

      // Detailed notification message matching web
      let notifMsg = `Your payment for ${request.properties?.title || request.property?.title || "property"} has been confirmed by your landlord.`;
      if (request.is_renewal_payment && extraMonths > 0) {
        notifMsg = `Your renewal payment for ${request.properties?.title || request.property?.title || "property"} has been confirmed! This covers ${extraMonths + 1} months - your next due date has been advanced accordingly.`;
      } else if (extraMonths > 0) {
        notifMsg += ` This includes ${extraMonths} advance month(s).`;
      }

      await createNotification(request.tenant, "payment_confirmed", notifMsg, {
        actor: session.user.id,
        email: true,
        sms: true,
      });

      // Send SMS/Email via API (matching website)
      try {
        await fetch(`${API_URL}/api/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "payment_confirmed",
            recordId: request.id,
          }),
        });
      } catch (notifyErr) {
        console.error("Failed to notify tenant of confirmation:", notifyErr);
      }

      Alert.alert(
        "Success",
        request.is_renewal_payment
          ? `Renewal payment confirmed! Covers ${extraMonths + 1} months.`
          : extraMonths > 0
            ? `Payment confirmed! ${extraMonths} advance month(s) created.`
            : "Payment confirmed and recorded!",
      );
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const rejectPayment = async (request: any) => {
    const billTotal =
      parseFloat(request.rent_amount || 0) +
      parseFloat(request.security_deposit_amount || 0) +
      parseFloat(request.advance_amount || 0) +
      parseFloat(request.water_bill || 0) +
      parseFloat(request.electrical_bill || 0) +
      parseFloat(request.other_bills || 0);

    Alert.alert(
      "Reject Payment",
      "Are you sure you want to REJECT this payment? The tenant will be notified.",
      [
        { text: "Cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("payment_requests")
              .update({ status: "rejected" })
              .eq("id", request.id);

            // Detailed notification matching website
            const propertyTitle =
              request.properties?.title ||
              request.property?.title ||
              "property";
            await supabase.from("notifications").insert({
              recipient: request.tenant,
              actor: session.user.id,
              type: "payment_rejected",
              message: `Your payment of ₱${billTotal.toLocaleString()} for ${propertyTitle} was rejected by the landlord. Please contact your landlord for details.`,
              link: "/payments",
              data: { payment_request_id: request.id },
            });

            // Send SMS/Email via API notify (matching website)
            try {
              await fetch(`${API_URL}/api/notify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "payment_rejected",
                  recordId: request.id,
                  actorId: session.user.id,
                }),
              });
            } catch (notifyErr) {
              console.error("Notify API Error on reject:", notifyErr);
            }

            loadData(session.user.id, profile.role);
          },
        },
      ],
    );
  };

  // --- TENANT ACTIONS: PAY BILL ---

  // --- TENANT ACTIONS: PAY BILL ---
  const handlePayBill = async (request: any) => {
    setSelectedBill(request);

    // Fetch landlord's accepted payment methods (matching website)
    try {
      const { data: landlordProfile } = await supabase
        .from("profiles")
        .select("accepted_payments")
        .eq("id", request.landlord)
        .single();
      setLandlordAcceptedPayments(
        landlordProfile?.accepted_payments || { cash: true },
      );
    } catch (e) {
      console.error("Failed to fetch landlord payment methods:", e);
      setLandlordAcceptedPayments({ cash: true });
    }

    // 1. Calculate Total Bill Amount
    const total =
      parseFloat(request.rent_amount || 0) +
      parseFloat(request.security_deposit_amount || 0) +
      parseFloat(request.advance_amount || 0) +
      parseFloat(request.water_bill || 0) +
      parseFloat(request.electrical_bill || 0) +
      parseFloat(request.wifi_bill || 0) +
      parseFloat(request.other_bills || 0);

    // 2. Fetch Tenant Credit (filtered by occupancy)
    let credit = 0;

    // Attempt to identify occupancy ID
    let targetOccupancyId = request.occupancy_id;

    if (!targetOccupancyId) {
      // If legacy bill without ID, try to find active occupancy
      const { data: activeOcc } = await supabase
        .from("tenant_occupancies")
        .select("id")
        .eq("tenant_id", session.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeOcc) targetOccupancyId = activeOcc.id;
    }

    if (targetOccupancyId) {
      // Fetch credit specific to this occupancy
      const { data: bal } = await supabase
        .from("tenant_balances")
        .select("amount")
        .eq("tenant_id", session.user.id)
        .eq("occupancy_id", targetOccupancyId)
        .maybeSingle();
      credit = parseFloat(bal?.amount || 0);
    } else {
      // Fallback to general credit (null occupancy_id)
      const { data: bal } = await supabase
        .from("tenant_balances")
        .select("amount")
        .eq("tenant_id", session.user.id)
        .is("occupancy_id", null)
        .maybeSingle();
      credit = parseFloat(bal?.amount || 0);
    }

    setAppliedCredit(credit);

    // 3. Calculate Contract Limits
    let limit = Infinity;
    let rentPerMonth = parseFloat(request.rent_amount || 0);
    let endDate: Date | null = null;
    let startDate: Date | null = null;
    let maxMonths = 1;

    // Use occupancy ID from step 2
    if (targetOccupancyId) {
      try {
        const { data: occupancy } = await supabase
          .from("tenant_occupancies")
          .select(
            "contract_end_date, start_date, security_deposit, rent_amount",
          )
          .eq("id", targetOccupancyId)
          .single();

        if (occupancy) {
          // Prefer bill rent amount, fallback to occupancy rent
          rentPerMonth = parseFloat(
            request.rent_amount || occupancy.rent_amount || 0,
          );
          endDate = occupancy.contract_end_date
            ? new Date(occupancy.contract_end_date)
            : null;
          startDate = occupancy.start_date
            ? new Date(occupancy.start_date)
            : null;

          if (endDate && startDate) {
            const startYear = startDate.getFullYear();
            const startMonth = startDate.getMonth();
            const endYear = endDate.getFullYear();
            const endMonth = endDate.getMonth();

            // Total months in contract
            const totalContractMonths =
              (endYear - startYear) * 12 + (endMonth - startMonth);

            // Check security deposit to see if it covers last month
            const depositAmount = parseFloat(
              request.security_deposit_amount ||
                occupancy.security_deposit ||
                0,
            );
            let adjustedTotalKey = totalContractMonths;

            // If deposit covers ~1 month rent, deduct 1 month from max payable to prevent overpayment
            if (rentPerMonth > 0 && depositAmount >= rentPerMonth * 0.9) {
              adjustedTotalKey = Math.max(1, totalContractMonths - 1);
            }

            maxMonths = Math.max(1, adjustedTotalKey);

            // Limit logic
            if (endDate < new Date()) {
              // Contract ended? Limit to just this bill + deposit
              maxMonths = 1;
              limit = total + parseFloat(request.security_deposit_amount || 0);
            } else {
              // Max rent payments = months * rent per month
              const maxContractValue = maxMonths * rentPerMonth;

              // Add one-time charges to the limit
              const securityDeposit = parseFloat(
                request.security_deposit_amount || 0,
              );
              const utilities =
                parseFloat(request.water_bill || 0) +
                parseFloat(request.electrical_bill || 0) +
                parseFloat(request.wifi_bill || 0) +
                parseFloat(request.other_bills || 0);
              const advance = parseFloat(request.advance_amount || 0);

              // Final limit calculation: Max Rent + One-Time Charges - Already Paid Credit
              limit = Math.max(
                0,
                maxContractValue +
                  securityDeposit +
                  utilities +
                  advance -
                  credit,
              );
            }
          }
        }
      } catch (err) {
        console.log("Error calculating contract limits", err);
      }
    }

    setMonthlyRent(rentPerMonth);
    setContractEndDate(endDate);
    setContractStartDate(startDate);
    setMaxMonthsAllowed(maxMonths);
    setMaxPaymentLimit(limit);
    setMonthsCovered(1);
    setExceedsContract(false);

    // 4. Set Initial Amounts
    let toPay = Math.max(0, total - credit);

    // For renewals, force total amount
    if (request.advance_amount && parseFloat(request.advance_amount) > 0) {
      toPay = Math.max(0, total - credit);
    }

    setMinimumPayment(toPay);
    setIsBelowMinimum(false);

    // Default input to the total needed amount (capped by limit)
    setCustomAmount(
      Math.min(toPay, limit === Infinity ? toPay : limit).toFixed(2),
    );

    // Trigger month calc immediately for default
    // We defer slightly to let state update or just rely on useEffect if we had one.
    // RN doesn't have the same useEffect for this as web snippet, so we call calc manually if needed,
    // but customAmount setter is enough. We will call calc in render or onChange.

    setShowPayModal(true);
  };

  const calculateMonthsCovered = (amountVal: string) => {
    setCustomAmount(amountVal);
    const amount = parseFloat(amountVal) || 0;

    if (!selectedBill) return;

    if (amount < minimumPayment || (amount === 0 && minimumPayment > 0)) {
      setIsBelowMinimum(true);
      setMonthsCovered(1);
      return;
    }
    setIsBelowMinimum(false);

    // For move-in payments, advance_amount is a one-time deposit charge, not advance rent
    const isMoveIn = selectedBill.is_move_in_payment;
    const oneTimeCharges =
      (parseFloat(selectedBill.security_deposit_amount) || 0) +
      (parseFloat(selectedBill.water_bill) || 0) +
      (parseFloat(selectedBill.other_bills) || 0) +
      (isMoveIn ? parseFloat(selectedBill.advance_amount) || 0 : 0);
    const rentPortion = Math.max(0, amount - oneTimeCharges);

    const rentForCalc =
      parseFloat(selectedBill.rent_amount || 0) > 0
        ? parseFloat(selectedBill.rent_amount)
        : monthlyRent;
    const months = rentForCalc > 0 ? Math.ceil(rentPortion / rentForCalc) : 1;
    const totalMonths = Math.max(1, months);

    const maxRentAllowed = maxMonthsAllowed * rentForCalc;
    const exceeds = rentPortion > maxRentAllowed;

    setMonthsCovered(totalMonths);
    setExceedsContract(exceeds);
  };

  const handlePayMongoPayment = async () => {
    console.log("Handling PayMongo Payment...");
    if (!selectedBill || !customAmount)
      return Alert.alert("Error", "Invalid bill or amount");

    setUploading(true);
    try {
      // Match website: include 'qrph' in allowed methods (create-paymongo-checkout.js line 57)
      const allMethods = [
        "gcash",
        "paymaya",
        "card",
        "grab_pay",
        "dob",
        "qrph",
      ];
      console.log(
        `Sending request to: ${API_URL}/api/payments/create-paymongo-checkout`,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(
        `${API_URL}/api/payments/create-paymongo-checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(customAmount),
            description: `Payment for ${selectedBill.property?.title || "Property"}`,
            remarks: `Payment Request ID: ${selectedBill.id}`,
            paymentRequestId: selectedBill.id,
            allowedMethods: allMethods,
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      const data = await res.json();
      console.log("PayMongo Response:", data);

      if (!res.ok)
        throw new Error(data.error || "Failed to connect to gateway");

      if (data.checkoutUrl) {
        const billId = selectedBill.id;
        const sessionId = data.checkoutSessionId;

        console.log("Opening browser to:", data.checkoutUrl);
        await WebBrowser.openBrowserAsync(data.checkoutUrl);

        // Reset uploading immediately after browser closes so button is not stuck
        setUploading(false);

        // After browser closes, start polling (matching website lines 1153-1209)
        // Poll every 5 seconds for up to 60 attempts (5 minutes)
        console.log("Browser closed, starting payment verification polling...");
        Alert.alert("Verifying", "Checking payment status...");

        let attempts = 0;
        const maxAttempts = 60;

        const pollInterval = setInterval(async () => {
          attempts++;
          console.log(`PayMongo poll attempt ${attempts}/${maxAttempts}`);

          try {
            const verifyRes = await fetch(
              `${API_URL}/api/payments/process-paymongo-success`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ paymentRequestId: billId, sessionId }),
              },
            );

            if (verifyRes.ok) {
              // SUCCESS: Payment verified
              clearInterval(pollInterval);
              console.log("PayMongo payment verified successfully!");
              Alert.alert("Success", "Payment verified and processed!");
              setShowPayModal(false);
              loadData(session.user.id, profile.role);
              setUploading(false);
              return;
            }
          } catch (e) {
            console.log("Poll error (will retry):", e);
          }

          if (attempts >= maxAttempts) {
            // TIMEOUT: Stop polling
            clearInterval(pollInterval);
            setUploading(false);
            Alert.alert(
              "Verification Pending",
              "Automatic verification timed out. The payment may still be processing. Please check your payment history later.",
            );
          }
        }, 5000); // Poll every 5 seconds
      } else {
        Alert.alert("Error", "No checkout URL returned.");
        setUploading(false);
      }
    } catch (e: any) {
      console.error("PayMongo Error:", e);
      if (e.name === "AbortError") {
        Alert.alert(
          "Timeout",
          "Connection to server timed out. Check your network.",
        );
      } else if (e.message.includes("Network request failed")) {
        Alert.alert(
          "Connection Error",
          `Could not reach ${API_URL}. Ensure you are on the same Wi-Fi as the server.`,
        );
      } else {
        Alert.alert(
          "Payment Error",
          e.message || "Failed to initialize payment.",
        );
      }
      setUploading(false);
    }
  };

  const handleCreditPayment = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payments/pay-with-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentRequestId: selectedBill.id,
          tenantId: session.user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await createNotification(
        selectedBill.landlord,
        "payment_confirmation_needed",
        `Tenant paid with credit`,
        { actor: session.user.id, email: true, sms: true },
      );
      Alert.alert("Success", "Paid with credit balance!");
      setShowPayModal(false);
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  };

  const handleStripePayment = async () => {
    // Basic validation first
    const amountVal = parseFloat(customAmount) || 0;
    if (amountVal <= 0) return Alert.alert("Error", "Enter valid amount");
    if (amountVal < minimumPayment)
      return Alert.alert(
        "Error",
        `Minimum payment is ₱${minimumPayment.toLocaleString()}`,
      );
    if (exceedsContract)
      return Alert.alert("Error", "Amount exceeds contract period");

    setUploading(true);
    try {
      /*
       * Use the Next.js API route instead of Supabase Edge Function
       * to create a Checkout Session that returns a URL
       */
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/stripe/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: amountVal,
            description: `Payment for ${selectedBill.property?.title} (${selectedBill.is_move_in_payment ? "Move-in" : "Bill"})`,
            bill_id: selectedBill.id,
            success_url: `${process.env.EXPO_PUBLIC_API_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.EXPO_PUBLIC_API_URL}/payment-cancel`,
            customer_email: session.user.email,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create payment link");
      }

      if (data?.url) {
        // Open the payment link in browser using WebBrowser, same as PayMongo
        const result = await WebBrowser.openBrowserAsync(data.url);

        // After browser closes, check status
        if (data.sessionId) {
          checkStripeStatus(selectedBill.id, data.sessionId);
        } else {
          // Fallback: If sessionId is missing, just try to reload data after a delay
          setTimeout(() => {
            loadData(session.user.id, profile.role);
          }, 3000);
        }
      } else {
        throw new Error("Failed to generate payment link.");
      }
    } catch (e: any) {
      Alert.alert(
        "Error",
        e.message || "Stripe payment initialization failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  const checkStripeStatus = async (billId: string, sessionId: string) => {
    // Poll or check once after delay
    setTimeout(async () => {
      try {
        console.log("Checking Stripe Status for session:", sessionId);

        // Step 1: Retrieve the paymentIntentId from the checkout session
        const sessionRes = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/stripe/retrieve-session`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          },
        );

        const sessionData = await sessionRes.json();
        console.log("Stripe Session Data:", sessionData);

        if (!sessionRes.ok || !sessionData.paymentIntentId) {
          console.log(
            "Could not retrieve payment intent from session. Payment may still be processing.",
          );
          // Reload data in case webhook already processed it
          loadData(session.user.id, profile.role);
          return;
        }

        // Only proceed if payment was actually completed
        if (sessionData.paymentStatus !== "paid") {
          console.log(
            "Payment not yet completed. Status:",
            sessionData.paymentStatus,
          );
          Alert.alert(
            "Info",
            "Payment not yet completed. Please check back later.",
          );
          loadData(session.user.id, profile.role);
          return;
        }

        // Step 2: Call process-stripe-success with the correct paymentIntentId
        const res = await fetch(
          `${process.env.EXPO_PUBLIC_API_URL}/api/payments/process-stripe-success`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paymentRequestId: billId,
              paymentIntentId: sessionData.paymentIntentId,
            }),
          },
        );

        const data = await res.json();
        console.log("Stripe Status Response:", data);

        if (res.ok && data.success) {
          await createNotification(
            selectedBill.landlord,
            "payment_approved",
            `Tenant paid via Stripe: ₱${customAmount}`,
            { actor: session.user.id, email: true, sms: true },
          );
          Alert.alert("Success", "Payment confirmed via Stripe!");
          setShowPayModal(false);
          loadData(session.user.id, profile.role);
        } else {
          // Even if 'process' failed (maybe already processed by webhook), reload data
          loadData(session.user.id, profile.role);
        }
      } catch (e) {
        console.log("Check Stripe Status Error:", e);
        // Silent fail, just reload
        loadData(session.user.id, profile.role);
      }
    }, 5000); // 5 second delay to allow Stripe latency
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled) setProofImage(result.assets[0]);
  };

  // Extracted helper for actual cash/QR submission (matching website pattern)
  const executePaymentSubmission = async () => {
    setShowCashConfirmModal(false);
    setUploading(true);
    try {
      let proofUrl = null;
      if (proofImage) {
        const fileName = `${session.user.id}/${Date.now()}.jpg`;
        await supabase.storage
          .from("payment_proofs")
          .upload(fileName, decode(proofImage.base64), {
            contentType: "image/jpeg",
          });
        const { data } = supabase.storage
          .from("payment_proofs")
          .getPublicUrl(fileName);
        proofUrl = data.publicUrl;
      }

      const amountVal = parseFloat(customAmount) || 0;
      const isMoveIn = selectedBill.is_move_in_payment;
      const oneTimeCharges =
        (parseFloat(selectedBill.security_deposit_amount) || 0) +
        (parseFloat(selectedBill.water_bill) || 0) +
        (parseFloat(selectedBill.other_bills) || 0) +
        (isMoveIn ? parseFloat(selectedBill.advance_amount) || 0 : 0);
      const rentPortion = Math.max(
        0,
        amountVal + appliedCredit - oneTimeCharges,
      );
      const firstMonthRent = parseFloat(selectedBill.rent_amount || 0);
      const advanceAmount = isMoveIn
        ? parseFloat(selectedBill.advance_amount) || 0
        : Math.max(0, rentPortion - firstMonthRent);

      await supabase
        .from("payment_requests")
        .update({
          status: "pending_confirmation",
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod,
          proof_of_payment_url: proofUrl,
          tenant_reference_number: referenceNumber.trim() || null,
          advance_amount: advanceAmount,
          amount_paid: amountVal + appliedCredit,
        })
        .eq("id", selectedBill.id);

      // Notify Landlord
      const totalPaid = amountVal;
      const monthsText =
        monthsCovered > 1 ? ` (${monthsCovered} months advance)` : "";

      await supabase.from("notifications").insert({
        recipient: selectedBill.landlord,
        actor: session.user.id,
        type: "payment_confirmation_needed",
        message: `Tenant paid ₱${totalPaid.toLocaleString()} for ${selectedBill.properties?.title || selectedBill.property?.title || "property"} via ${paymentMethod === "qr_code" ? "QR Code" : "Cash"}${monthsText}. Please confirm payment receipt.`,
        link: "/payments",
        data: { payment_request_id: selectedBill.id },
      });

      // API Notification (matching website)
      try {
        const { data: landlordProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone")
          .eq("id", selectedBill.landlord)
          .single();
        const { data: tenantProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", session.user.id)
          .single();
        const { data: landlordEmail } = await supabase.rpc("get_user_email", {
          user_id: selectedBill.landlord,
        });

        if (landlordEmail || landlordProfile?.phone) {
          fetch(`${API_URL}/api/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "cash_payment",
              landlordEmail,
              landlordPhone: landlordProfile?.phone,
              landlordName: landlordProfile?.first_name || "Landlord",
              tenantName:
                `${tenantProfile?.first_name || ""} ${tenantProfile?.last_name || ""}`.trim() ||
                "Tenant",
              propertyTitle:
                selectedBill.properties?.title ||
                selectedBill.property?.title ||
                "property",
              amount: totalPaid,
              monthsCovered,
              paymentMethod,
            }),
          }).catch((err) => console.error("Notification failed:", err));
        }
      } catch (notifyErr) {
        console.error("Notify Error:", notifyErr);
      }

      Alert.alert(
        "Success",
        "Payment submitted! Waiting for landlord confirmation.",
      );
      setShowPayModal(false);
      setSelectedBill(null);
      setPaymentMethod("cash");
      setProofImage(null);
      setReferenceNumber("");
      loadData(session.user.id, profile.role);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Payment failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const submitPayment = async () => {
    console.log("Submit Payment Clicked. Method:", paymentMethod);
    if (!selectedBill) return;

    // Route to correct handler
    if (paymentMethod === "paymongo") {
      await handlePayMongoPayment();
      return;
    }
    if (paymentMethod === "stripe") {
      await handleStripePayment();
      return;
    }

    const amountVal = parseFloat(customAmount) || 0;

    // Validation
    if (amountVal <= 0) return Alert.alert("Error", "Enter valid amount");
    if (amountVal < minimumPayment)
      return Alert.alert(
        "Error",
        `Minimum payment is ₱${minimumPayment.toLocaleString()}. Partial payments are not allowed.`,
      );
    if (
      exceedsContract ||
      (maxPaymentLimit !== null &&
        maxPaymentLimit !== Infinity &&
        amountVal > maxPaymentLimit)
    ) {
      return Alert.alert(
        "Error",
        `Payment exceeds contract period. Maximum allowed is ${maxMonthsAllowed} month${maxMonthsAllowed > 1 ? "s" : ""} (₱${maxPaymentLimit?.toLocaleString() || 0}).`,
      );
    }

    if (paymentMethod === "qr_code") {
      if (!referenceNumber.trim() && !proofImage) {
        return Alert.alert(
          "Error",
          "Please enter reference number or upload payment proof.",
        );
      }
    }

    // Cash: show confirmation modal first (matching website)
    if (paymentMethod === "cash") {
      setShowCashConfirmModal(true);
    } else {
      // QR/other: proceed immediately
      executePaymentSubmission();
    }
  };

  // --- RENDER ---
  const getTotal = (bill: any) =>
    (parseFloat(bill.rent_amount) || 0) +
    (parseFloat(bill.water_bill) || 0) +
    (parseFloat(bill.electrical_bill) || 0) +
    (parseFloat(bill.wifi_bill) || 0) +
    (parseFloat(bill.other_bills) || 0) +
    (parseFloat(bill.security_deposit_amount) || 0) +
    (parseFloat(bill.advance_amount) || 0);

  // Bill type detection (matching web version)
  const getBillType = (item: any) => {
    const rent = parseFloat(item.rent_amount) || 0;
    const electric = parseFloat(item.electrical_bill) || 0;
    const water = parseFloat(item.water_bill) || 0;
    const wifi = parseFloat(item.wifi_bill) || 0;
    if (rent > 0) return "House Rent";
    if (electric > 0) return "Electric Bill";
    if (water > 0) return "Water Bill";
    if (wifi > 0) return "Wifi Bill";
    return "Other Bill";
  };

  // Total Income calculated from payment_requests (matching website logic)
  const totalIncome = paymentRequests
    .filter((p: any) => p.status === "paid")
    .reduce((sum: number, p: any) => {
      const t =
        parseFloat(p.amount_paid || 0) ||
        parseFloat(p.rent_amount || 0) +
          parseFloat(p.security_deposit_amount || 0) +
          parseFloat(p.advance_amount || 0) +
          parseFloat(p.water_bill || 0) +
          parseFloat(p.electrical_bill || 0) +
          parseFloat(p.wifi_bill || 0) +
          parseFloat(p.other_bills || 0);
      return sum + t;
    }, 0);

  const nextPaymentBill =
    paymentRequests
      .filter((p: any) => {
        const status = (p.status || "pending").toLowerCase();
        return (
          status === "pending" ||
          status === "unpaid" ||
          status === "recorded" ||
          status === "rejected"
        );
      })
      .sort((a: any, b: any) => {
        const aTime = a?.due_date
          ? new Date(a.due_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bTime = b?.due_date
          ? new Date(b.due_date).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })[0] || null;

  const nextPaymentAmount = nextPaymentBill ? getTotal(nextPaymentBill) : 0;

  const renderBillCard = (item: any) => {
    const total = getTotal(item);
    const isLandlord = profile?.role === "landlord";
    const isPastDue =
      item.due_date &&
      new Date(item.due_date) < new Date() &&
      item.status === "pending";
    const billType = getBillType(item);

    // Get display names from joined profiles
    const tenantName = item.tenant_profile
      ? `${item.tenant_profile.first_name || ""} ${item.tenant_profile.last_name || ""}`.trim()
      : "Tenant";
    const landlordName = item.landlord_profile
      ? `${item.landlord_profile.first_name || ""} ${item.landlord_profile.last_name || ""}`.trim()
      : "Landlord";
    const propertyTitle = item.properties?.title || "Property";
    const propertyAddress = item.properties?.address || "";

    // Status Badge Logic matching web
    let badgeBg = "#fefce8";
    let badgeBorder = "#fef9c3";
    let badgeColor = "#a16207";
    let statusText = "Pending";

    if (item.status === "paid") {
      badgeBg = "#f0fdf4";
      badgeBorder = "#bbf7d0";
      badgeColor = "#15803d";
      statusText = "Paid";
    } else if (item.status === "pending_confirmation") {
      badgeBg = "#fefce8";
      badgeBorder = "#fef9c3";
      badgeColor = "#a16207";
      statusText = "Confirming";
    } else if (item.status === "cancelled") {
      badgeBg = "#fef2f2";
      badgeBorder = "#fecaca";
      badgeColor = "#b91c1c";
      statusText = "Cancelled";
    } else if (item.status === "rejected") {
      badgeBg = "#fef2f2";
      badgeBorder = "#fecaca";
      badgeColor = "#b91c1c";
      statusText = "Rejected";
    } else if (isPastDue) {
      badgeBg = "#fef2f2";
      badgeBorder = "#fecaca";
      badgeColor = "#dc2626";
      statusText = "Overdue";
    }

    const rent = parseFloat(item.rent_amount) || 0;
    const water = parseFloat(item.water_bill) || 0;
    const electric = parseFloat(item.electrical_bill) || 0;
    const securityDeposit = parseFloat(item.security_deposit_amount) || 0;
    const advance = parseFloat(item.advance_amount) || 0;
    const other = parseFloat(item.other_bills) || 0;

    return (
      <View
        key={item.id}
        style={[
          styles.billCard,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderColor: isDark ? colors.cardBorder : "#f0f0f0",
          },
        ]}
      >
        {/* Header Row: Property + Status */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text
              style={{
                fontWeight: "800",
                fontSize: 15,
                color: isDark ? colors.text : "#000",
              }}
              numberOfLines={1}
            >
              {propertyTitle}
            </Text>
            {propertyAddress ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                  marginTop: 2,
                }}
              >
                <Ionicons
                  name="location-outline"
                  size={11}
                  color={isDark ? colors.textMuted : "#999"}
                />
                <Text
                  style={{
                    fontSize: 11,
                    color: isDark ? colors.textMuted : "#999",
                  }}
                  numberOfLines={1}
                >
                  {propertyAddress}
                </Text>
              </View>
            ) : null}
          </View>
          <View
            style={{
              backgroundColor: badgeBg,
              borderWidth: 1,
              borderColor: badgeBorder,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: badgeColor,
                textTransform: "uppercase",
              }}
            >
              {statusText}
            </Text>
          </View>
        </View>

        {/* Info Grid: Bill Type, Person, Month, Due Date */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {/* Bill Type Pill */}
          <View
            style={{
              backgroundColor: isDark ? colors.surface : "#f2f3f4",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: isDark ? colors.textSecondary : "#555",
              }}
            >
              {billType}
            </Text>
          </View>

          {/* Month (only for House Rent) */}
          {billType === "House Rent" && (
            <View
              style={{
                backgroundColor: isDark ? colors.surface : "#f2f3f4",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: isDark ? colors.textMuted : "#777",
                }}
              >
                {getRentMonth(item.due_date)}
              </Text>
            </View>
          )}

          {/* Payment Method */}
          {item.payment_method && (
            <View
              style={{
                backgroundColor: isDark ? colors.surface : "#f2f3f4",
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: isDark ? colors.textSecondary : "#555",
                  textTransform: "uppercase",
                }}
              >
                {item.payment_method === "paymongo"
                  ? "E-Wallet/Card"
                  : item.payment_method === "stripe"
                    ? "Stripe"
                    : item.payment_method === "qr_code"
                      ? "QR Code"
                      : item.payment_method === "cash"
                        ? "Cash"
                        : item.payment_method}
              </Text>
            </View>
          )}
        </View>

        {/* Person */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 6,
          }}
        >
          <Ionicons
            name="person-outline"
            size={12}
            color={isDark ? colors.textMuted : "#888"}
          />
          <Text
            style={{
              fontSize: 12,
              color: isDark ? colors.textSecondary : "#666",
            }}
          >
            {isLandlord ? `Tenant: ${tenantName}` : `Landlord: ${landlordName}`}
          </Text>
        </View>

        {/* Message / Description */}
        {item.bills_description && item.bills_description !== "No Message" && (
          <Text
            style={{
              fontSize: 11,
              color: isDark ? colors.textMuted : "#888",
              marginBottom: 6,
              fontStyle: "italic",
            }}
            numberOfLines={2}
          >
            "{item.bills_description}"
          </Text>
        )}

        {/* Reference Number */}
        {item.tenant_reference_number && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 10, color: "#999", fontWeight: "600" }}>
              Ref:
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: "#555",
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              }}
            >
              {item.tenant_reference_number}
            </Text>
          </View>
        )}

        {/* Amount Breakdown */}
        <View
          style={{
            backgroundColor: isDark ? colors.surface : "#fafafa",
            padding: 10,
            borderRadius: 8,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: isDark ? colors.cardBorder : "#f0f0f0",
          }}
        >
          {rent > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.textMuted : "#888",
                }}
              >
                Rent
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: isDark ? colors.text : "#000",
                }}
              >
                ₱{rent.toLocaleString()}
              </Text>
            </View>
          )}
          {securityDeposit > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.textMuted : "#888",
                }}
              >
                Security Deposit
              </Text>
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#b45309" }}
              >
                ₱{securityDeposit.toLocaleString()}
              </Text>
            </View>
          )}
          {advance > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.textMuted : "#888",
                }}
              >
                Advance
              </Text>
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#4f46e5" }}
              >
                ₱{advance.toLocaleString()}
              </Text>
            </View>
          )}
          {water > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.textMuted : "#888",
                }}
              >
                Water
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: isDark ? colors.text : "#000",
                }}
              >
                ₱{water.toLocaleString()}
              </Text>
            </View>
          )}
          {electric > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.textMuted : "#888",
                }}
              >
                Electricity
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: isDark ? colors.text : "#000",
                }}
              >
                ₱{electric.toLocaleString()}
              </Text>
            </View>
          )}
          {other > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: isDark ? colors.textMuted : "#888",
                }}
              >
                Other
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: isDark ? colors.text : "#000",
                }}
              >
                ₱{other.toLocaleString()}
              </Text>
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderTopWidth: 1,
              borderColor: isDark ? colors.border : "#e5e5e5",
              paddingTop: 6,
              marginTop: 3,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: isDark ? colors.text : "#000",
              }}
            >
              Total
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "800",
                color: isDark ? colors.text : "#000",
              }}
            >
              ₱{total.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Due Date */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 10,
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={12}
            color={isPastDue ? "#dc2626" : "#888"}
          />
          <Text
            style={{
              fontSize: 12,
              color: isPastDue ? "#dc2626" : "#666",
              fontWeight: isPastDue ? "700" : "500",
            }}
          >
            Due:{" "}
            {item.due_date
              ? new Date(item.due_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "N/A"}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* Tenant: Pay Now */}
          {!isLandlord && item.status === "pending" && (
            <TouchableOpacity
              onPress={() => handlePayBill(item)}
              style={styles.actionBtnPrimary}
            >
              <Ionicons name="card-outline" size={14} color="white" />
              <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>
                Pay Now
              </Text>
            </TouchableOpacity>
          )}
          {/* Tenant: Waiting */}
          {!isLandlord && item.status === "pending_confirmation" && (
            <Text
              style={{
                fontSize: 11,
                color: "#999",
                fontWeight: "600",
                fontStyle: "italic",
                paddingVertical: 8,
              }}
            >
              Waiting for approval...
            </Text>
          )}
          {/* Tenant: Resend (Rejected) */}
          {!isLandlord && item.status === "rejected" && (
            <TouchableOpacity
              onPress={() => handlePayBill(item)}
              style={[styles.actionBtnPrimary, { backgroundColor: "#333" }]}
            >
              <Ionicons name="refresh" size={14} color="white" />
              <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>
                Resend
              </Text>
            </TouchableOpacity>
          )}

          {/* Landlord: Pending - Mark Paid / Edit / Cancel */}
          {isLandlord && item.status === "pending" && (
            <>
              <TouchableOpacity
                onPress={() => confirmPayment(item)}
                style={[styles.actionBtnSmall, { backgroundColor: "#22c55e" }]}
              >
                <Text
                  style={{ color: "white", fontWeight: "700", fontSize: 11 }}
                >
                  Paid
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleEditBill(item)}
                style={[
                  styles.actionBtnSmall,
                  {
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#ddd",
                  },
                ]}
              >
                <Text
                  style={{ color: "#333", fontWeight: "700", fontSize: 11 }}
                >
                  Edit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleCancelBill(item.id)}
                style={[styles.actionBtnSmall, { backgroundColor: "#fef2f2" }]}
              >
                <Text
                  style={{ color: "#dc2626", fontWeight: "700", fontSize: 11 }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}
          {/* Landlord: Pending Confirmation - Confirm / Reject */}
          {isLandlord && item.status === "pending_confirmation" && (
            <>
              <TouchableOpacity
                onPress={() => confirmPayment(item)}
                style={[styles.actionBtnSmall, { backgroundColor: "#000" }]}
              >
                <Text
                  style={{ color: "white", fontWeight: "700", fontSize: 11 }}
                >
                  Confirm
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => rejectPayment(item)}
                style={[
                  styles.actionBtnSmall,
                  {
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#000",
                  },
                ]}
              >
                <Text
                  style={{ color: "#000", fontWeight: "700", fontSize: 11 }}
                >
                  Reject
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: isDark ? colors.background : "#f9fafb",
      }}
      edges={["top"]}
    >
      <View
        style={{
          padding: 20,
          backgroundColor: isDark ? colors.surface : "white",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "900",
              color: isDark ? colors.text : "#000",
            }}
          >
            Payments
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: isDark ? colors.textMuted : "#888",
              marginTop: 2,
            }}
          >
            Manage bills and income
          </Text>
        </View>
        {profile?.role === "landlord" && (
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            style={styles.navCreateBtn}
          >
            <Ionicons name="add" size={20} color="white" />
            <Text
              style={{
                color: "white",
                fontWeight: "bold",
                fontSize: 12,
                marginLeft: 4,
              }}
            >
              New Bill
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Landlord Stats */}
      {profile?.role === "landlord" && (
        <View style={{ flexDirection: "row", padding: 15, gap: 10 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? colors.card : "white",
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: isDark ? colors.cardBorder : "#f0f0f0",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: isDark ? colors.textMuted : "#888",
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              Total Income
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "900",
                color: isDark ? colors.text : "#000",
              }}
            >
              ₱
              {totalIncome.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? colors.card : "white",
              padding: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: isDark ? colors.cardBorder : "#f0f0f0",
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: isDark ? colors.textMuted : "#888",
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              Total Payments
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "900",
                color: isDark ? colors.text : "#000",
              }}
            >
              {payments.length}
            </Text>
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: 15, paddingBottom: 10 }}>
        <View
          style={[
            styles.nextPaymentCard,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#f0f0f0",
            },
          ]}
        >
          <Text
            style={[
              styles.nextPaymentLabel,
              { color: isDark ? colors.textMuted : "#6b7280" },
            ]}
          >
            Next Payment
          </Text>
          <Text
            style={[
              styles.nextPaymentAmount,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            ₱
            {nextPaymentAmount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </Text>
          {nextPaymentBill?.due_date ? (
            <Text
              style={[
                styles.nextPaymentDate,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              Due{" "}
              {new Date(nextPaymentBill.due_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          ) : (
            <Text
              style={[
                styles.nextPaymentDate,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              No upcoming due date
            </Text>
          )}
        </View>
      </View>

      <View
        style={[
          styles.tabContainer,
          {
            backgroundColor: isDark ? colors.surface : "white",
            borderColor: isDark ? colors.border : "#f0f0f0",
          },
        ]}
      >
        {["all", "pending", "verify", "paid", "cancelled"].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setFilter(t)}
            style={[
              styles.tab,
              { backgroundColor: isDark ? colors.card : "#f3f4f6" },
              filter === t && styles.tabActive,
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: isDark ? colors.textSecondary : "#666" },
                filter === t && styles.tabTextActive,
              ]}
            >
              {t === "verify"
                ? "To Verify"
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 15, paddingBottom: 130 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(session.user.id, profile.role)}
            />
          }
        >
          {loading ? (
            <ActivityIndicator color="black" style={{ marginTop: 20 }} />
          ) : (
            (() => {
              const filtered = paymentRequests.filter((p: any) => {
                if (filter === "all") return true;
                if (filter === "pending") {
                  return (
                    !p.status ||
                    p.status === "pending" ||
                    p.status === "rejected" ||
                    p.status === "recorded" ||
                    p.status === "unpaid"
                  );
                }
                if (filter === "verify")
                  return p.status === "pending_confirmation";
                if (filter === "paid") return p.status === "paid";
                if (filter === "cancelled") return p.status === "cancelled";
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <View style={{ alignItems: "center", marginTop: 50 }}>
                    <Ionicons name="documents-outline" size={48} color="#ccc" />
                    <Text
                      style={{
                        textAlign: "center",
                        marginTop: 10,
                        color: "#999",
                        fontWeight: "600",
                      }}
                    >
                      {filter === "all"
                        ? "No bills found"
                        : filter === "pending"
                          ? "No pending bills"
                          : filter === "verify"
                            ? "No payments to verify"
                            : filter === "cancelled"
                              ? "No cancelled bills"
                              : "No paid history"}
                    </Text>
                  </View>
                );
              }
              return filtered.map(renderBillCard);
            })()
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* CREATE MODAL */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: isDark ? colors.background : "#fff" },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.text : "#000" },
              ]}
            >
              Send Bill
            </Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons
                name="close"
                size={24}
                color={isDark ? colors.textMuted : "#000"}
              />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
            {["other"].map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setActiveTab(t)}
                style={[styles.chip, activeTab === t && styles.chipActive]}
              >
                <Text
                  style={[
                    styles.chipText,
                    activeTab === t && { color: "white" },
                  ]}
                >
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View
            style={{
              backgroundColor: isDark ? colors.card : "#f9fafb",
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: isDark ? colors.textSecondary : "#4b5563",
              }}
            >
              <Text style={{ fontWeight: "bold" }}>Note: </Text>
              House rent payment bills are sent automatically 3 days before due
              date. WiFi, electricity, and water only send{" "}
              <Text style={{ fontWeight: "bold" }}>
                reminder notifications
              </Text>{" "}
              (SMS & email).
            </Text>
          </View>

          <ScrollView>
            <Text style={styles.label}>SELECT TENANT</Text>
            <ScrollView horizontal style={{ marginBottom: 15 }}>
              {tenants.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() =>
                    setFormData({
                      ...formData,
                      tenant_id: t.id,
                      property_id: t.property_id,
                      occupancy_id: t.occupancy_id,
                    })
                  }
                  style={[
                    styles.chip,
                    formData.tenant_id === t.id && styles.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      formData.tenant_id === t.id && { color: "white" },
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {activeTab === "other" && (
              <View>
                <Text style={styles.label}>AMOUNT</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  onChangeText={(t) =>
                    setFormData({ ...formData, other_bills: t })
                  }
                />
                <Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  onChangeText={(t) =>
                    setFormData({ ...formData, other_due_date: t })
                  }
                  placeholder="YYYY-MM-DD"
                />
              </View>
            )}

            <Text style={styles.label}>MESSAGE (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              onChangeText={(t) =>
                setFormData({ ...formData, bills_description: t })
              }
              placeholder="Details..."
            />

            <Text style={styles.label}>BILL RECEIPT (REQUIRED)</Text>
            <TouchableOpacity
              onPress={pickBillReceipt}
              style={styles.uploadBtn}
            >
              {billReceiptImage ? (
                <Image
                  source={{ uri: billReceiptImage.uri }}
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                />
              ) : (
                <Text style={{ color: "#999" }}>Tap to upload Receipt</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>QR CODE (OPTIONAL)</Text>
            <TouchableOpacity onPress={pickQrCode} style={styles.uploadBtn}>
              {qrCodeImage ? (
                <Image
                  source={{ uri: qrCodeImage.uri }}
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                />
              ) : (
                <Text style={{ color: "#999" }}>Tap to upload QR</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCreateBill}
              disabled={creating}
              style={[
                styles.payBtn,
                { marginTop: 20, alignItems: "center", padding: 15 },
              ]}
            >
              {creating ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  SEND BILL
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: isDark ? colors.background : "#fff" },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.text : "#000" },
              ]}
            >
              Edit Bill
            </Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Ionicons
                name="close"
                size={24}
                color={isDark ? colors.textMuted : "#000"}
              />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.label}>RENT AMOUNT</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={editFormData.rent_amount}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, rent_amount: t })
              }
            />

            <Text style={styles.label}>WATER BILL</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={editFormData.water_bill}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, water_bill: t })
              }
            />

            <Text style={styles.label}>ELECTRICAL BILL</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={editFormData.electrical_bill}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, electrical_bill: t })
              }
            />

            <Text style={styles.label}>OTHER BILLS</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={editFormData.other_bills}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, other_bills: t })
              }
            />

            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              style={styles.input}
              value={editFormData.bills_description}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, bills_description: t })
              }
            />

            <Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={editFormData.due_date}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, due_date: t })
              }
            />

            <TouchableOpacity
              onPress={handleUpdateBill}
              style={[
                styles.payBtn,
                { marginTop: 20, alignItems: "center", padding: 15 },
              ]}
            >
              <Text style={{ color: "white", fontWeight: "bold" }}>
                UPDATE BILL
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* PAY MODAL - REDESIGNED */}
      <Modal
        visible={showPayModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View
          style={[
            styles.modalContainer,
            { backgroundColor: isDark ? colors.background : "#fff" },
          ]}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 25,
              position: "relative",
            }}
          >
            <TouchableOpacity
              onPress={() => setShowPayModal(false)}
              style={{
                position: "absolute",
                left: 0,
                padding: 8,
                backgroundColor: isDark ? colors.card : "#f3f4f6",
                borderRadius: 20,
              }}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={isDark ? colors.text : "#000"}
              />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: isDark ? colors.text : "#000",
              }}
            >
              Payment
            </Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Bill Summary - Detailed Breakdown */}
            <View
              style={{
                backgroundColor: isDark ? colors.card : "#f9fafb",
                padding: 16,
                borderRadius: 16,
                marginBottom: 24,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: isDark ? colors.surface : "#e5e7eb",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Ionicons
                    name="receipt"
                    size={20}
                    color={isDark ? colors.textSecondary : "#4b5563"}
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: isDark ? colors.text : "#111",
                    }}
                  >
                    Bill Details
                  </Text>
                  <Text style={{ fontSize: 12, color: "#6b7280" }}>
                    {selectedBill?.bills_description}
                  </Text>
                </View>
              </View>

              {selectedBill && (
                <View style={{ gap: 8 }}>
                  {parseFloat(selectedBill.rent_amount || 0) > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Rent
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        ₱{parseFloat(selectedBill.rent_amount).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {parseFloat(selectedBill.advance_amount || 0) > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Advance Payment
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        ₱
                        {parseFloat(
                          selectedBill.advance_amount,
                        ).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {parseFloat(selectedBill.security_deposit_amount || 0) >
                    0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Security Deposit
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        ₱
                        {parseFloat(
                          selectedBill.security_deposit_amount,
                        ).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {parseFloat(selectedBill.water_bill || 0) > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Water Bill
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        ₱{parseFloat(selectedBill.water_bill).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {parseFloat(selectedBill.electrical_bill || 0) > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Electric Bill
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        ₱
                        {parseFloat(
                          selectedBill.electrical_bill,
                        ).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  {parseFloat(selectedBill.other_bills || 0) > 0 && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Other Fees
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        ₱{parseFloat(selectedBill.other_bills).toLocaleString()}
                      </Text>
                    </View>
                  )}

                  {selectedBill.due_date && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isDark ? colors.textMuted : "#6b7280",
                        }}
                      >
                        Due Date
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "600",
                          color: isDark ? colors.text : "#374151",
                        }}
                      >
                        {new Date(selectedBill.due_date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" },
                        )}
                      </Text>
                    </View>
                  )}

                  <View
                    style={{
                      height: 1,
                      backgroundColor: isDark ? colors.border : "#e5e7eb",
                      marginVertical: 8,
                    }}
                  />

                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: isDark ? colors.text : "#111",
                      }}
                    >
                      Total Due
                    </Text>
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "900",
                        color: "#048818ff",
                      }}
                    >
                      ₱
                      {selectedBill
                        ? getTotal(selectedBill).toLocaleString()
                        : 0}
                    </Text>
                  </View>
                </View>
              )}

              {/* View Bill Receipt Button (matching website) */}
              {selectedBill?.bill_receipt_url && (
                <TouchableOpacity
                  onPress={() => setShowBillReceiptModal(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    backgroundColor: isDark ? colors.surface : "#f3f4f6",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  }}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={isDark ? colors.textSecondary : "#374151"}
                  />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: isDark ? colors.text : "#374151",
                    }}
                  >
                    View Original Bill Receipt
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Amount Input */}
            <View style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: isDark ? colors.textMuted : "#6b7280",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Amount to Pay
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: isDark ? colors.card : "#fff",
                  borderWidth: 1,
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  borderRadius: 16,
                  paddingHorizontal: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: isDark ? colors.text : "#111",
                    marginRight: 8,
                  }}
                >
                  ₱
                </Text>
                <TextInput
                  style={{
                    flex: 1,
                    height: 56,
                    fontSize: 18,
                    fontWeight: "700",
                    color: isDark ? colors.text : "#111",
                  }}
                  value={customAmount}
                  onChangeText={calculateMonthsCovered}
                  keyboardType="numeric"
                  placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
                />
              </View>

              {/* Messages for Amount Input */}
              <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                {monthsCovered > 1 && !exceedsContract && (
                  <View>
                    <Text
                      style={{
                        color: "#059669",
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      ✓ Covers {monthsCovered} months
                    </Text>
                    {contractEndDate && (
                      <Text
                        style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}
                      >
                        Until{" "}
                        {new Date(
                          new Date(selectedBill.due_date).setMonth(
                            new Date(selectedBill.due_date).getMonth() +
                              monthsCovered -
                              1,
                          ),
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </Text>
                    )}
                  </View>
                )}

                {exceedsContract && (
                  <View>
                    <Text
                      style={{
                        color: "#dc2626",
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      ⚠ Exceeds Contract Period!
                    </Text>
                    <Text
                      style={{ color: "#dc2626", fontSize: 11, marginTop: 2 }}
                    >
                      Max allowed is {maxMonthsAllowed} months (₱
                      {maxPaymentLimit?.toLocaleString()}). Contract ends{" "}
                      {contractEndDate?.toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                      .
                    </Text>
                  </View>
                )}

                {isBelowMinimum && (
                  <Text
                    style={{
                      color: "#dc2626",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Minimum: ₱{minimumPayment.toLocaleString()}
                  </Text>
                )}
              </View>
            </View>

            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: isDark ? colors.text : "#111",
                marginBottom: 16,
              }}
            >
              Payment Methods
            </Text>

            {/* Payment Methods List - Only show what landlord accepts */}
            <View>
              {/* Cash - Always available */}
              <TouchableOpacity
                onPress={() => setPaymentMethod("cash")}
                activeOpacity={0.9}
                style={[
                  styles.methodCard,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                  },
                  paymentMethod === "cash" && {
                    borderColor: "#048818",
                    backgroundColor: isDark ? "rgba(4,136,24,0.1)" : "#f0fdf4",
                  },
                ]}
              >
                <View
                  style={[
                    styles.methodIcon,
                    { backgroundColor: isDark ? colors.surface : "#f9fafb" },
                  ]}
                >
                  <Ionicons
                    name="cash"
                    size={22}
                    color={
                      paymentMethod === "cash"
                        ? "#048818"
                        : isDark
                          ? colors.textSecondary
                          : "#6b7280"
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.methodTitle,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    Cash Payment
                  </Text>
                  <Text
                    style={[
                      styles.methodSubtitle,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    Upload proof of payment
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: isDark ? colors.border : "#d1d5db" },
                    paymentMethod === "cash" && styles.radioSelected,
                  ]}
                >
                  {paymentMethod === "cash" && (
                    <View style={styles.radioInner} />
                  )}
                </View>
              </TouchableOpacity>

              {/* PayMongo / E-Wallet - Only if landlord has GCash or Maya */}
              {(landlordAcceptedPayments?.gcash ||
                landlordAcceptedPayments?.maya) && (
                <TouchableOpacity
                  onPress={() => setPaymentMethod("paymongo")}
                  activeOpacity={0.9}
                  style={[
                    styles.methodCard,
                    {
                      backgroundColor: isDark ? colors.card : "white",
                      borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                    },
                    paymentMethod === "paymongo" && {
                      borderColor: "#048818",
                      backgroundColor: isDark
                        ? "rgba(4,136,24,0.1)"
                        : "#f0fdf4",
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.methodIcon,
                      { backgroundColor: isDark ? colors.surface : "#f9fafb" },
                    ]}
                  >
                    <Ionicons
                      name="wallet"
                      size={22}
                      color={
                        paymentMethod === "paymongo"
                          ? "#048818"
                          : isDark
                            ? colors.textSecondary
                            : "#6b7280"
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.methodTitle,
                        { color: isDark ? colors.text : "#111" },
                      ]}
                    >
                      E-Wallet
                    </Text>
                    <Text
                      style={[
                        styles.methodSubtitle,
                        { color: isDark ? colors.textMuted : "#6b7280" },
                      ]}
                    >
                      {[
                        landlordAcceptedPayments?.gcash && "GCash",
                        landlordAcceptedPayments?.maya && "Maya",
                      ]
                        .filter(Boolean)
                        .join(" / ")}{" "}
                      • Cards
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: isDark ? colors.border : "#d1d5db" },
                      paymentMethod === "paymongo" && styles.radioSelected,
                    ]}
                  >
                    {paymentMethod === "paymongo" && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </TouchableOpacity>
              )}

              {/* Credit Balance (if available) */}
              {appliedCredit > 0 && (
                <TouchableOpacity
                  onPress={handleCreditPayment}
                  disabled={minimumPayment > 0}
                  activeOpacity={0.9}
                  style={[
                    styles.methodCard,
                    minimumPayment <= 0 && styles.methodCardSelected,
                    { opacity: minimumPayment > 0 ? 0.6 : 1 },
                  ]}
                >
                  <View style={styles.methodIcon}>
                    <Ionicons
                      name="wallet"
                      size={22}
                      color={minimumPayment <= 0 ? "#048818" : "#6b7280"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.methodTitle}>Wallet Balance</Text>
                    <Text style={styles.methodSubtitle}>
                      Available: ₱{appliedCredit.toLocaleString()}
                    </Text>
                  </View>
                  {minimumPayment <= 0 ? (
                    <View style={[styles.radio, styles.radioSelected]}>
                      <View style={styles.radioInner} />
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: "#dc2626",
                      }}
                    >
                      Insufficient
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Cash / QR Code Proof Fields (matching website) */}
            {(paymentMethod === "cash" || paymentMethod === "qr_code") && (
              <View
                style={{
                  marginTop: 24,
                  padding: 16,
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderRadius: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: isDark ? colors.textSecondary : "#374151",
                    marginBottom: 12,
                  }}
                >
                  PROOF OF PAYMENT
                </Text>

                <TextInput
                  style={{
                    backgroundColor: isDark ? colors.surface : "#fff",
                    borderWidth: 1,
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 14,
                    marginBottom: 12,
                    color: isDark ? colors.text : "#111",
                  }}
                  placeholder="Reference Number (Optional)"
                  placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
                  value={referenceNumber}
                  onChangeText={setReferenceNumber}
                />

                <TouchableOpacity
                  onPress={pickImage}
                  style={{
                    height: 120,
                    backgroundColor: isDark ? colors.surface : "#fff",
                    borderWidth: 1,
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                    borderStyle: "dashed",
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {proofImage ? (
                    <Image
                      source={{ uri: proofImage.uri }}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: 12,
                      }}
                    />
                  ) : (
                    <View style={{ alignItems: "center" }}>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={24}
                        color={isDark ? colors.textMuted : "#9ca3af"}
                      />
                      <Text
                        style={{
                          color: isDark ? colors.textMuted : "#9ca3af",
                          fontSize: 12,
                          fontWeight: "600",
                          marginTop: 8,
                        }}
                      >
                        Upload Screenshot or Photo
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Footer - Sticky Button */}
          <View
            style={{
              paddingTop: 16,
              borderTopWidth: 1,
              borderColor: isDark ? colors.border : "#f3f4f6",
            }}
          >
            <TouchableOpacity
              onPress={submitPayment}
              disabled={uploading}
              activeOpacity={0.9}
              style={{
                backgroundColor: uploading ? "#555" : "#000000ff",
                height: 58,
                borderRadius: 29,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 10,
                shadowColor: "#000000ff",
                shadowOpacity: uploading ? 0.1 : 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: uploading ? 2 : 6,
                opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? (
                <>
                  <ActivityIndicator color="white" size="small" />
                  <Text
                    style={{ color: "white", fontSize: 15, fontWeight: "700" }}
                  >
                    Redirecting, please wait...
                  </Text>
                </>
              ) : (
                <Text
                  style={{ color: "white", fontSize: 16, fontWeight: "800" }}
                >
                  Continue to Pay ₱{customAmount}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CASH CONFIRMATION MODAL (matching website) */}
      <Modal visible={showCashConfirmModal} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 360,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "#fef3c7",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="alert-circle" size={32} color="#d97706" />
            </View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: "#111",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              Confirm Cash Payment?
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#6b7280",
                textAlign: "center",
                marginBottom: 24,
                lineHeight: 20,
              }}
            >
              Are you sure you want to mark this bill as paid via CASH?{"\n\n"}
              This will notify the landlord to confirm your payment receipt.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
              <TouchableOpacity
                onPress={() => setShowCashConfirmModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "700", color: "#374151" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={executePaymentSubmission}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#000",
                  alignItems: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.2,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 4,
                }}
              >
                <Text style={{ fontWeight: "700", color: "#fff" }}>
                  Yes, Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* BILL RECEIPT IMAGE VIEWER MODAL (matching website) */}
      <Modal
        visible={showBillReceiptModal && !!selectedBill?.bill_receipt_url}
        transparent
        animationType="fade"
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.85)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowBillReceiptModal(false)}
            style={{
              position: "absolute",
              top: 50,
              right: 20,
              backgroundColor: "rgba(0,0,0,0.5)",
              padding: 10,
              borderRadius: 20,
              zIndex: 10,
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {selectedBill?.bill_receipt_url && (
            <Image
              source={{ uri: selectedBill.bill_receipt_url }}
              style={{ width: "95%", height: "70%", borderRadius: 12 }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ... existing styles ...
  billCard: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#000",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  // NEW PAYMENT STYLES
  methodCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderWidth: 1.5,
    borderColor: "#f3f4f6",
    borderRadius: 16,
    marginBottom: 12,
  },
  methodCardSelected: {
    borderColor: "#048818",
    backgroundColor: "#f0fdf4",
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },
  methodSubtitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: "#048818",
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#048818",
  },

  // Legacy kept for other modals
  iconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  badgeGreen: { backgroundColor: "#dcfce7", borderColor: "#dcfce7" },
  badgeOrange: { backgroundColor: "#ffedd5", borderColor: "#ffedd5" },
  badgeRed: { backgroundColor: "#fee2e2", borderColor: "#fee2e2" },
  badgeGray: { backgroundColor: "#f3f4f6", borderColor: "#f3f4f6" },
  badgeText: { fontSize: 10, fontWeight: "bold", textTransform: "capitalize" },
  payBtn: {
    backgroundColor: "#000",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payBtnText: { color: "white", fontSize: 12, fontWeight: "bold" },
  createBtn: {
    backgroundColor: "black",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    gap: 10,
  },
  modalContainer: {
    flex: 1,
    padding: 24,
    backgroundColor: "white",
    marginTop: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: "bold" },
  tabContainer: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: "#f0f0f0",
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  tabActive: { backgroundColor: "black" },
  tabText: { color: "#666", fontWeight: "bold", fontSize: 12 },
  tabTextActive: { color: "white" },
  nextPaymentCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  nextPaymentLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  nextPaymentAmount: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
  },
  nextPaymentDate: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#666",
    marginBottom: 5,
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  billSection: {
    backgroundColor: "#f8fafc",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  billSectionTitle: { fontSize: 18, fontWeight: "bold" },
  uploadBtn: {
    height: 150,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  chip: { padding: 8, borderRadius: 8, backgroundColor: "#eee" },
  chipActive: { backgroundColor: "black" },
  chipText: { fontSize: 12, fontWeight: "bold", color: "#666" },
  navCreateBtn: {
    backgroundColor: "black",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  // Unused but kept to prevent breakages if referenced elsewhere
  paymentCard: {
    flex: 1,
    padding: 15,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  paymentCardActive: { backgroundColor: "black", borderColor: "black" },
  paymentCardText: { fontSize: 12, fontWeight: "bold", color: "black" },
});
