import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import CalendarPicker from "../../../components/ui/CalendarPicker";
import { supabase } from "../../../lib/supabase";

type AdminTab =
  | "overview"
  | "users"
  | "properties"
  | "bookings"
  | "payments"
  | "occupancies";

const NON_EDITABLE_FIELDS = new Set(["id", "created_at", "updated_at"]);
const USER_EDIT_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "email",
  "phone",
  "birthday",
  "gender",
  "role",
  "business_name",
  "avatar_url",
  "phone_verified",
  "accepted_payment",
  "is_subscribed_family_plan",
  "family_slots",
  "new_password",
];
const PROPERTY_EDIT_FIELDS = [
  "title",
  "description",
  "building_no",
  "street",
  "address",
  "city",
  "state_province",
  "country",
  "zip",
  "location_link",
  "owner_phone",
  "owner_email",
  "price",
  "utilities_cost",
  "internet_cost",
  "association_dues",
  "bedrooms",
  "bathrooms",
  "area_sqft",
  "status",
  "property_type",
  "bed_type",
  "max_occupancy",
  "has_security_deposit",
  "security_deposit_amount",
  "has_advance",
  "advance_amount",
  "terms_conditions",
  "amenities",
  "images",
];
const NUMERIC_FIELD_HINTS = new Set([
  "price",
  "utilities_cost",
  "internet_cost",
  "association_dues",
  "bedrooms",
  "bathrooms",
  "area_sqft",
  "max_occupancy",
  "security_deposit_amount",
  "advance_amount",
  "rent_amount",
  "water_bill",
  "electrical_bill",
  "wifi_bill",
  "other_bills",
]);
const BOOLEAN_FIELD_HINTS = new Set([
  "has_security_deposit",
  "has_advance",
  "phone_verified",
]);

const GENDER_OPTIONS = ["Male", "Female", "Prefer not to say"];
const ROLE_OPTIONS = ["tenant", "landlord"];

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[^0-9.-]+/g, "");
  const casted = Number(cleaned);
  return Number.isFinite(casted) ? casted : 0;
};

const fullName = (user: any) =>
  `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
  user?.email ||
  "Unknown user";

const paymentTotal = (payment: any) => {
  const paidAmount = toNumber(payment?.amount_paid);
  if (paidAmount > 0) return paidAmount;

  return (
    toNumber(payment?.rent_amount) +
    toNumber(payment?.water_bill) +
    toNumber(payment?.electrical_bill) +
    toNumber(payment?.other_bills) +
    toNumber(payment?.wifi_bill) +
    toNumber(payment?.security_deposit_amount) +
    toNumber(payment?.advance_amount)
  );
};

const formatCurrency = (value: number) => `PHP ${value.toLocaleString()}`;

const prettyLabel = (key: string) =>
  key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const serializeValue = (value: any) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const serializeEditableForm = (record: any, allowedFields: string[]) => {
  const form: Record<string, string> = {};
  allowedFields.forEach((field) => {
    if (
      !NON_EDITABLE_FIELDS.has(field) &&
      Object.prototype.hasOwnProperty.call(record || {}, field)
    ) {
      form[field] = serializeValue(record?.[field]);
    }
  });
  return form;
};

const parseFormValue = (key: string, rawValue: string, originalValue: any) => {
  const value = rawValue ?? "";
  if (value === "") return null;

  if (BOOLEAN_FIELD_HINTS.has(key) || typeof originalValue === "boolean") {
    const lowered = value.toLowerCase();
    return lowered === "true" || lowered === "1" || lowered === "yes";
  }

  if (NUMERIC_FIELD_HINTS.has(key) || typeof originalValue === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (originalValue ?? null);
  }

  if (
    Array.isArray(originalValue) ||
    (originalValue && typeof originalValue === "object")
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return originalValue;
    }
  }

  return value;
};

const buildPayloadFromForm = (form: Record<string, string>, original: any) => {
  const payload: Record<string, any> = {};
  Object.entries(form).forEach(([key, rawValue]) => {
    payload[key] = parseFormValue(key, rawValue, original?.[key]);
  });

  if (
    original &&
    Object.prototype.hasOwnProperty.call(original, "updated_at")
  ) {
    payload.updated_at = new Date().toISOString();
  }

  return payload;
};

const includesQuery = (value: any, query: string) =>
  String(value || "")
    .toLowerCase()
    .includes(query);

const isMultilineField = (field: string, value: string) => {
  if (value.length > 70) return true;
  return [
    "description",
    "terms_conditions",
    "images",
    "amenities",
    "notification_preferences",
    "accepted_payments",
  ].includes(field);
};

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const renderPagination = (totalItems: number) => {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) return null;
    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          marginVertical: 16,
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: currentPage === 1 ? "#e5e7eb" : "#111",
            borderRadius: 8,
          }}
          disabled={currentPage === 1}
        >
          <Text
            style={{
              color: currentPage === 1 ? "#9ca3af" : "#fff",
              fontWeight: "bold",
            }}
          >
            Prev
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#4b5563" }}>
          Page {currentPage} of {totalPages}
        </Text>
        <TouchableOpacity
          onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: currentPage === totalPages ? "#e5e7eb" : "#111",
            borderRadius: 8,
          }}
          disabled={currentPage === totalPages}
        >
          <Text
            style={{
              color: currentPage === totalPages ? "#9ca3af" : "#fff",
              fontWeight: "bold",
            }}
          >
            Next
          </Text>
        </TouchableOpacity>
      </View>
    );
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [occupancies, setOccupancies] = useState<any[]>([]);

  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingProperty, setEditingProperty] = useState<any | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [occupancySearch, setOccupancySearch] = useState("");

  const [selectedOccupancyDetails, setSelectedOccupancyDetails] = useState<
    any | null
  >(null);
  const [selectedOccupancyMembers, setSelectedOccupancyMembers] = useState<
    any[]
  >([]);

  const [userForm, setUserForm] = useState<Record<string, string>>({});
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  const [propertyForm, setPropertyForm] = useState<Record<string, string>>({});

  const [remindersActive, setRemindersActive] = useState(true);
  const [sendingMonthly, setSendingMonthly] = useState(false);
  const [bulkEmailModal, setBulkEmailModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    recipients: "",
    subject: "",
    message: "",
  });
  const [sendingBulk, setSendingBulk] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const handleSendMonthlyStatements = async () => {
    Alert.alert("Confirm", "Send monthly statements immediately?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setSendingMonthly(true);
          try {
            const { data, error } = await supabase.functions.invoke(
              "send-email",
              {
                body: { type: "monthly_statement" },
              },
            );
            if (error) throw error;
            Alert.alert("Success", "Monthly statements processed completely");
          } catch (err: any) {
            Alert.alert(
              "Error",
              err.message || "Failed to trigger edge function.",
            );
          } finally {
            setSendingMonthly(false);
          }
        },
      },
    ]);
  };

  const handleSendBulkEmail = async () => {
    if (!bulkForm.recipients || !bulkForm.subject || !bulkForm.message) {
      Alert.alert("Notice", "Please fill in all fields.");
      return;
    }
    const recipientsArray = bulkForm.recipients
      .split(/[,;\n]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!recipientsArray.length) {
      Alert.alert("Notice", "Please provide a valid recipient.");
      return;
    }

    setSendingBulk(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "bulk_email",
          recipients: recipientsArray,
          subject: bulkForm.subject,
          htmlContent: bulkForm.message.replace(/\n/g, "<br/>"),
        },
      });
      if (error) throw error;
      Alert.alert("Success", data?.message || "Emails sent out.");
      setBulkForm({ recipients: "", subject: "", message: "" });
      setBulkEmailModal(false);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send bulk email.");
    } finally {
      setSendingBulk(false);
    }
  };

  const userMap = useMemo(() => {
    const map: Record<string, any> = {};
    users.forEach((user) => {
      map[user.id] = user;
    });
    return map;
  }, [users]);

  const propertyMap = useMemo(() => {
    const map: Record<string, any> = {};
    properties.forEach((property) => {
      map[property.id] = property;
    });
    return map;
  }, [properties]);

  const stats = useMemo(() => {
    return {
      users: users.length,
      properties: properties.length,
      bookings: bookings.length,
      payments: payments.length,
    };
  }, [users, properties, bookings, payments]);

  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      return (
        includesQuery(fullName(user), query) ||
        includesQuery(user?.email, query) ||
        includesQuery(user?.phone, query) ||
        includesQuery(user?.role, query)
      );
    });
  }, [users, userSearch]);

  const filteredProperties = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();
    if (!query) return properties;

    return properties.filter((property) => {
      return (
        includesQuery(property?.title, query) ||
        includesQuery(property?.city, query) ||
        includesQuery(property?.address, query) ||
        includesQuery(property?.status, query) ||
        includesQuery(property?.owner_email, query) ||
        includesQuery(property?.owner_phone, query)
      );
    });
  }, [properties, propertySearch]);

  const filteredBookings = useMemo(() => {
    const query = bookingSearch.trim().toLowerCase();
    if (!query) return bookings;

    return bookings.filter((booking) => {
      const property = propertyMap[booking.property_id];
      const tenant = userMap[booking.tenant];
      return (
        includesQuery(property?.title, query) ||
        includesQuery(fullName(tenant), query) ||
        includesQuery(booking?.status, query) ||
        includesQuery(booking?.booking_date, query)
      );
    });
  }, [bookings, bookingSearch, propertyMap, userMap]);

  const filteredPayments = useMemo(() => {
    const query = paymentSearch.trim().toLowerCase();
    if (!query) return payments;

    return payments.filter((payment) => {
      const property = propertyMap[payment.property_id];
      const tenant = userMap[payment.tenant];
      return (
        includesQuery(property?.title, query) ||
        includesQuery(fullName(tenant), query) ||
        includesQuery(payment?.status, query) ||
        includesQuery(payment?.due_date, query) ||
        includesQuery(paymentTotal(payment), query)
      );
    });
  }, [payments, paymentSearch, propertyMap, userMap]);

  const filteredOccupancies = useMemo(() => {
    const query = occupancySearch.trim().toLowerCase();
    if (!query) return occupancies;

    return occupancies.filter((occ) => {
      const property = occ.property;
      const tenant = occ.tenant;
      return (
        includesQuery(property?.title, query) ||
        includesQuery(fullName(tenant), query) ||
        includesQuery(occ.status, query) ||
        includesQuery(occ.start_date, query)
      );
    });
  }, [occupancies, occupancySearch]);

  const fetchFamilyMembers = async (occupancyId: string) => {
    try {
      const { data: members, error } = await supabase
        .from("family_members")
        .select("member_id")
        .eq("parent_occupancy_id", occupancyId);

      if (error || !members || members.length === 0) {
        setSelectedOccupancyMembers([]);
        return;
      }

      const memberIds = members.map((m: any) => m.member_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", memberIds);

      setSelectedOccupancyMembers(profiles || []);
    } catch (err) {
      console.log(err);
      setSelectedOccupancyMembers([]);
    }
  };

  const openOccupancyDetails = (occ: any) => {
    setSelectedOccupancyDetails(occ);
    setSelectedOccupancyMembers([]);
    fetchFamilyMembers(occ.id);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        usersRes,
        propsRes,
        bookingsRes,
        paymentsRes,
        occupanciesRes,
        subscriptionsRes,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("properties")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select("id, property_id, tenant, status, booking_date, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("payment_requests")
          .select(
            "id, property_id, tenant, landlord, status, due_date, amount_paid, rent_amount, water_bill, electrical_bill, other_bills, wifi_bill, security_deposit_amount, advance_amount, created_at",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("tenant_occupancies")
          .select(
            "id, property_id, tenant_id, landlord_id, status, start_date, property:properties(id, title, address, price, max_occupancy), tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, email)",
          )
          .eq("status", "active")
          .order("start_date", { ascending: false }),
        supabase
          .from("subscriptions")
          .select("tenant_id, total_slots")
          .eq("plan_type", "family_slot_plan"),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (propsRes.error) throw propsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (occupanciesRes.error) throw occupanciesRes.error;

      const subsMap: any = {};
      (subscriptionsRes?.data || []).forEach((sub: any) => {
        subsMap[sub.tenant_id] = sub;
      });

      const usersWithSubs = (usersRes.data || []).map((u: any) => ({
        ...u,
        subscription: subsMap[u.id],
      }));

      setUsers(usersWithSubs);
      setProperties(propsRes.data || []);
      setBookings(bookingsRes.data || []);
      setPayments(paymentsRes.data || []);
      setOccupancies(occupanciesRes.data || []);
    } catch (error: any) {
      console.error(error);
      Alert.alert(
        "Error",
        error?.message || "Failed to load admin dashboard data.",
      );
    } finally {
      setLoading(false);
    }
  };

  const openUserEditor = (user: any) => {
    setEditingUser(user);
    const form = serializeEditableForm(user, USER_EDIT_FIELDS);
    form["new_password"] = "";
    form["accepted_payment"] = serializeValue(user.accepted_payment || false);
    form["phone_verified"] = serializeValue(user.phone_verified || false);
    form["avatar_url"] = serializeValue(user.avatar_url || "");

    // Family slot subscription logic
    form["is_subscribed_family_plan"] = serializeValue(!!user.subscription);
    form["family_slots"] = serializeValue(user.subscription?.total_slots || 1);

    setUserForm(form);
  };

  const openPropertyEditor = (property: any) => {
    setEditingProperty(property);
    setPropertyForm(serializeEditableForm(property, PROPERTY_EDIT_FIELDS));
  };

  const saveUser = async () => {
    if (!editingUser) return;
    if (
      Object.prototype.hasOwnProperty.call(userForm, "first_name") &&
      Object.prototype.hasOwnProperty.call(userForm, "last_name") &&
      (!String(userForm.first_name || "").trim() ||
        !String(userForm.last_name || "").trim())
    ) {
      Alert.alert("Missing Fields", "First name and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayloadFromForm(userForm, editingUser);

      const newPassword = userForm.new_password;
      const isSubscribed = userForm.is_subscribed_family_plan === "true";
      const slots = Number(userForm.family_slots) || 1;

      delete payload.new_password;
      delete payload.is_subscribed_family_plan;
      delete payload.family_slots;

      // Update basic fields
      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", editingUser.id);

      if (error) throw error;

      // Attempt to change password via admin api if provided
      if (newPassword && newPassword.trim()) {
        const { error: pwdError } = await supabase.auth.admin.updateUserById(
          editingUser.id,
          {
            password: newPassword,
          },
        );
        if (pwdError) {
          console.log(
            "Could not update password via auth.admin API. It needs service role key.",
            pwdError,
          );
        }
      }

      // Update family slot subscription
      if (isSubscribed) {
        await supabase.from("subscriptions").upsert(
          {
            tenant_id: editingUser.id,
            plan_type: "family_slot_plan",
            total_slots: slots,
            status: "active",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id, plan_type" },
        );
      } else {
        await supabase
          .from("subscriptions")
          .delete()
          .eq("tenant_id", editingUser.id)
          .eq("plan_type", "family_slot_plan");
      }

      // Refresh everything to reflect correct state
      loadAllData();

      setEditingUser(null);
      Alert.alert("Saved", "User details updated.");
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to update user.");
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async () => {
    try {
      const currentImages = propertyForm.images
        ? JSON.parse(propertyForm.images)
        : [];
      if (currentImages.length >= 10) {
        Alert.alert("Limit Reached", "You can only upload up to 10 images.");
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 10 - currentImages.length,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled) {
        const newImages = result.assets.map(
          (asset) => `data:image/jpeg;base64,${asset.base64}`,
        );
        const combined = [...currentImages, ...newImages].slice(0, 10);
        setPropertyForm((prev) => ({
          ...prev,
          images: JSON.stringify(combined),
        }));
      }
    } catch (e) {
      Alert.alert("Error", "Could not load images.");
    }
  };

  const removeImage = (index: number) => {
    try {
      const currentImages = propertyForm.images
        ? JSON.parse(propertyForm.images)
        : [];
      const updated = currentImages.filter((_: any, i: number) => i !== index);
      setPropertyForm((prev) => ({ ...prev, images: JSON.stringify(updated) }));
    } catch (e) {}
  };

  const saveProperty = async () => {
    if (!editingProperty) return;
    if (
      Object.prototype.hasOwnProperty.call(propertyForm, "title") &&
      Object.prototype.hasOwnProperty.call(propertyForm, "city") &&
      (!String(propertyForm.title || "").trim() ||
        !String(propertyForm.city || "").trim())
    ) {
      Alert.alert("Missing Fields", "Property title and city are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayloadFromForm(propertyForm, editingProperty);

      const { error } = await supabase
        .from("properties")
        .update(payload)
        .eq("id", editingProperty.id);

      if (error) throw error;

      setProperties((prev) =>
        prev.map((property) =>
          property.id === editingProperty.id
            ? { ...property, ...payload }
            : property,
        ),
      );
      setEditingProperty(null);
      Alert.alert("Saved", "Property details updated.");
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to update property.");
    } finally {
      setSaving(false);
    }
  };

  const renderOverview = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>Admin Overview</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Users" value={stats.users} icon="people-outline" />
        <StatCard
          label="Properties"
          value={stats.properties}
          icon="business-outline"
        />
        <StatCard
          label="Bookings"
          value={stats.bookings}
          icon="calendar-outline"
        />
        <StatCard label="Payments" value={stats.payments} icon="card-outline" />
      </View>

      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          padding: 16,
          marginTop: 12,
          borderWidth: 1,
          borderColor: "#e5e7eb",
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
              backgroundColor: "#111827",
              padding: 6,
              borderRadius: 8,
              marginRight: 10,
            }}
          >
            <Ionicons name="flash" size={18} color="#fff" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "900", color: "#111827" }}>
            Automated Processes
          </Text>
        </View>

        {/* Monthly Statements Box */}
        <View
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "#f3f4f6",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text
                style={{ fontSize: 16, fontWeight: "800", color: "#111827" }}
              >
                Monthly Statements
              </Text>
              <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                Send payment statements to tenants and financial overviews to
                landlords via email.
              </Text>
              <View
                style={{
                  backgroundColor: "#f3f4f6",
                  alignSelf: "flex-start",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  marginTop: 10,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                }}
              >
                <Text
                  style={{ fontSize: 11, color: "#4b5563", fontWeight: "700" }}
                >
                  Auto-sends via Supabase cron at end of month, 12:00 AM PH time
                  / Click to send manually
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                Last run: Mar 26, 2026, 4:06 PM (manual)
              </Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: sendingMonthly ? "#9ca3af" : "#111827",
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
              }}
              onPress={handleSendMonthlyStatements}
              disabled={sendingMonthly}
            >
              {sendingMonthly ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}
                >
                  Send Now
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View
            style={{
              marginTop: 16,
              borderTopWidth: 1,
              borderTopColor: "#e5e7eb",
              paddingTop: 16,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "800",
                color: "#374151",
                marginBottom: 10,
              }}
            >
              RECENT RUN RECORDS
            </Text>
            {[
              {
                date: "Mar 26, 2026, 4:06 PM (manual)",
                stats: "T: 14/14 | L: 3 | F: 0",
              },
              {
                date: "Mar 26, 2026, 3:57 PM (manual)",
                stats: "T: 14/14 | L: 3 | F: 0",
              },
              {
                date: "Mar 25, 2026, 6:36 PM (manual)",
                stats: "T: 14/14 | L: 3 | F: 0",
              },
              {
                date: "Mar 25, 2026, 5:08 PM (manual)",
                stats: "T: 14/14 | L: 3 | F: 0",
              },
            ].map((run, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                  borderBottomWidth: i === 3 ? 0 : 1,
                  borderBottomColor: "#e5e7eb",
                }}
              >
                <Text
                  style={{ fontSize: 12, color: "#6b7280", fontWeight: "500" }}
                >
                  {run.date}
                </Text>
                <Text
                  style={{ fontSize: 12, color: "#6b7280", fontWeight: "500" }}
                >
                  {run.stats}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Payment Reminders Box */}
        <View
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "#f3f4f6",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827" }}>
              Payment Reminders
            </Text>
            <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Automatically email/SMS tenants about upcoming due dates.
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: remindersActive ? "#10b981" : "#9ca3af",
                  marginRight: 6,
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: remindersActive ? "#047857" : "#6b7280",
                }}
              >
                {remindersActive ? "ACTIVE" : "INACTIVE"}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: remindersActive ? "#fef2f2" : "#ecfdf5",
              borderWidth: 1,
              borderColor: remindersActive ? "#fecaca" : "#a7f3d0",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}
            onPress={() => setRemindersActive(!remindersActive)}
          >
            <Text
              style={{
                color: remindersActive ? "#dc2626" : "#059669",
                fontWeight: "800",
                fontSize: 13,
              }}
            >
              {remindersActive ? "Stop Reminders" : "Start Reminders"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bulk Email Box */}
        <View
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: "#f3f4f6",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827" }}>
              Bulk Email
            </Text>
            <Text style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Compose and send one message to multiple email recipients.
            </Text>
            <View
              style={{
                backgroundColor: "#fff",
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                marginTop: 10,
                borderWidth: 1,
                borderColor: "#e5e7eb",
              }}
            >
              <Text
                style={{ fontSize: 11, color: "#6b7280", fontWeight: "600" }}
              >
                Add recipients separated by comma, semicolon, or new line
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: "#111827",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 8,
            }}
            onPress={() => setBulkEmailModal(true)}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
              Compose Bulk Email
            </Text>
          </TouchableOpacity>
        </View>

        {bulkEmailModal && (
          <Modal transparent animationType="slide" visible={bulkEmailModal}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { marginTop: "20%" }]}>
                <Text style={styles.modalTitle}>Compose Bulk Email</Text>

                <ScrollView style={styles.modalFormScroll}>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Recipients</Text>
                    <TextInput
                      style={[styles.input, styles.inputMultiline]}
                      multiline
                      textAlignVertical="top"
                      placeholder="john@example.com, jane@example.com"
                      value={bulkForm.recipients}
                      onChangeText={(val) =>
                        setBulkForm((prev) => ({ ...prev, recipients: val }))
                      }
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Subject Line</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Abalay Platform Update"
                      value={bulkForm.subject}
                      onChangeText={(val) =>
                        setBulkForm((prev) => ({ ...prev, subject: val }))
                      }
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>HTML Message Content</Text>
                    <TextInput
                      style={[
                        styles.input,
                        styles.inputMultiline,
                        { height: 150 },
                      ]}
                      multiline
                      textAlignVertical="top"
                      placeholder="Write your message here..."
                      value={bulkForm.message}
                      onChangeText={(val) =>
                        setBulkForm((prev) => ({ ...prev, message: val }))
                      }
                    />
                  </View>
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => setBulkEmailModal(false)}
                    disabled={sendingBulk}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleSendBulkEmail}
                    disabled={sendingBulk}
                  >
                    {sendingBulk ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Send to All</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.refreshButton,
          {
            marginTop: 16,
            alignSelf: "center",
            width: "100%",
            justifyContent: "center",
          },
        ]}
        onPress={loadAllData}
      >
        <Ionicons name="refresh" size={16} color="#fff" />
        <Text style={styles.refreshButtonText}>Reload Dashboard Data</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUsers = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Users</Text>
      <TextInput
        style={styles.searchInput}
        value={userSearch}
        onChangeText={(text) => {
          setUserSearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search users"
        placeholderTextColor="#9ca3af"
      />
      {filteredUsers.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredUsers
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((user) => (
          <View key={user.id} style={styles.listItem}>
            <View style={styles.itemMain}>
              <Text style={styles.itemTitle}>{fullName(user)}</Text>
              <Text style={styles.itemSubtitle}>
                {(user.role || "tenant").toUpperCase()} •{" "}
                {user.email || "No email"}
              </Text>
              <Text style={styles.itemMeta}>
                Phone: {user.phone || "No phone"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => openUserEditor(user)}
            >
              <Ionicons name="create-outline" size={18} color="#111" />
            </TouchableOpacity>
          </View>
        ))}
      {renderPagination(filteredUsers.length)}
    </View>
  );

  const renderProperties = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Properties</Text>
      <TouchableOpacity
        style={[styles.refreshButton, { marginTop: 0, marginBottom: 8 }]}
        onPress={() => router.push("/properties/new" as any)}
      >
        <Ionicons name="add-circle-outline" size={16} color="#fff" />
        <Text style={styles.refreshButtonText}>Add Property</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.searchInput}
        value={propertySearch}
        onChangeText={(text) => {
          setPropertySearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search properties"
        placeholderTextColor="#9ca3af"
      />
      {filteredProperties.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredProperties
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((property) => (
          <View key={property.id} style={styles.listItem}>
            <View style={styles.itemMain}>
              <Text style={styles.itemTitle}>
                {property.title || "Untitled Property"}
              </Text>
              <Text style={styles.itemSubtitle}>
                {[property.city, property.state_province]
                  .filter(Boolean)
                  .join(", ") || "Unknown location"}
                {" • "}
                {formatCurrency(toNumber(property.price))}
              </Text>
              <Text style={styles.itemMeta}>
                Status: {property.status || "unknown"}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => openPropertyEditor(property)}
            >
              <Ionicons name="create-outline" size={18} color="#111" />
            </TouchableOpacity>
          </View>
        ))}
      {renderPagination(filteredProperties.length)}
    </View>
  );

  const renderBookings = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Bookings</Text>
      <TextInput
        style={styles.searchInput}
        value={bookingSearch}
        onChangeText={(text) => {
          setBookingSearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search bookings"
        placeholderTextColor="#9ca3af"
      />
      {filteredBookings.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredBookings
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((booking) => {
          const property = propertyMap[booking.property_id];
          const tenant = userMap[booking.tenant];
          return (
            <View key={booking.id} style={styles.listItem}>
              <View style={styles.itemMain}>
                <Text style={styles.itemTitle}>
                  {property?.title || "Property not found"}
                </Text>
                <Text style={styles.itemSubtitle}>
                  Tenant: {tenant ? fullName(tenant) : "Unknown tenant"}
                </Text>
                <Text style={styles.itemMeta}>
                  Status: {booking.status || "unknown"} • Date:{" "}
                  {booking.booking_date || "N/A"}
                </Text>
              </View>
            </View>
          );
        })}
      {renderPagination(filteredBookings.length)}
    </View>
  );

  const renderPayments = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Payment Requests</Text>
      <TextInput
        style={styles.searchInput}
        value={paymentSearch}
        onChangeText={(text) => {
          setPaymentSearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search payments"
        placeholderTextColor="#9ca3af"
      />
      {filteredPayments.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredPayments
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((payment) => {
          const property = propertyMap[payment.property_id];
          const tenant = userMap[payment.tenant];
          return (
            <View key={payment.id} style={styles.listItem}>
              <View style={styles.itemMain}>
                <Text style={styles.itemTitle}>
                  {property?.title || "No property"}
                </Text>
                <Text style={styles.itemSubtitle}>
                  Tenant: {tenant ? fullName(tenant) : "Unknown tenant"}
                </Text>
                <Text style={styles.itemMeta}>
                  {formatCurrency(paymentTotal(payment))} •{" "}
                  {payment.status || "unknown"}
                </Text>
              </View>
            </View>
          );
        })}
      {renderPagination(filteredPayments.length)}
    </View>
  );

  const renderOccupancies = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>Active Occupancies</Text>
      <TextInput
        style={styles.searchInput}
        value={occupancySearch}
        onChangeText={(text) => {
          setOccupancySearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search occupancies (property, tenant...)"
        placeholderTextColor="#9ca3af"
      />
      {filteredOccupancies.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredOccupancies.map((occ) => {
        const property = occ.property;
        const tenant = occ.tenant;
        return (
          <TouchableOpacity
            key={occ.id}
            style={styles.listItem}
            onPress={() => openOccupancyDetails(occ)}
            activeOpacity={0.7}
          >
            <View style={styles.itemMain}>
              <Text style={styles.itemTitle}>
                {property?.title || "Unknown Property"}
              </Text>
              <Text style={styles.itemSubtitle}>
                Tenant: {tenant ? fullName(tenant) : "Unknown Tenant"}
              </Text>
              <Text style={styles.itemMeta}>
                Status: {occ.status} • Start:{" "}
                {occ.start_date
                  ? new Date(occ.start_date).toLocaleDateString()
                  : "N/A"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.mainWrapper} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addPropertyButton}
            onPress={() => router.push("/properties/new" as any)}
          >
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.addPropertyButtonText}>Add Property</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => router.replace("/logout")}
          >
            <Ionicons name="log-out-outline" size={16} color="#fff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contentWrap}>
        {activeTab === "overview" && renderOverview()}
        {activeTab === "users" && renderUsers()}
        {activeTab === "properties" && renderProperties()}
        {activeTab === "bookings" && renderBookings()}
        {activeTab === "payments" && renderPayments()}
        {activeTab === "occupancies" && renderOccupancies()}
      </ScrollView>

      <View
        style={[
          styles.bottomNav,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabContainer}
        >
          {(
            [
              "overview",
              "users",
              "properties",
              "bookings",
              "payments",
              "occupancies",
            ] as AdminTab[]
          ).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && styles.tabButtonActive,
              ]}
              onPress={() => {
                setActiveTab(tab);
                setCurrentPage(1);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={!!selectedOccupancyDetails}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Occupancy Details</Text>

            <ScrollView style={styles.modalFormScroll}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Property</Text>
                <Text style={{ color: "#111", fontSize: 16 }}>
                  {selectedOccupancyDetails?.property?.title || "Unknown"}
                </Text>
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Tenant</Text>
                <Text style={{ color: "#111", fontSize: 16 }}>
                  {fullName(selectedOccupancyDetails?.tenant)}
                </Text>
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Start Date</Text>
                <Text style={{ color: "#111", fontSize: 16 }}>
                  {selectedOccupancyDetails?.start_date
                    ? new Date(
                        selectedOccupancyDetails.start_date,
                      ).toLocaleDateString()
                    : "N/A"}
                </Text>
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Status</Text>
                <Text style={{ color: "#111", fontSize: 16 }}>
                  {selectedOccupancyDetails?.status}
                </Text>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                Family Members ({selectedOccupancyMembers.length})
              </Text>
              {selectedOccupancyMembers.length === 0 ? (
                <Text style={styles.emptyText}>No family members found.</Text>
              ) : (
                selectedOccupancyMembers.map((member, index) => (
                  <View
                    key={member.id}
                    style={[
                      styles.listItem,
                      { flexDirection: "column", alignItems: "flex-start" },
                    ]}
                  >
                    <Text style={[styles.itemTitle, { fontSize: 14 }]}>
                      {index + 1}. {fullName(member)}
                    </Text>
                    <Text style={styles.itemSubtitle}>
                      {member.email || "No email"} •{" "}
                      {member.phone || "No phone"}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.primaryButton, { width: "100%" }]}
                onPress={() => setSelectedOccupancyDetails(null)}
              >
                <Text style={styles.primaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingUser} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit User Details</Text>

            <ScrollView style={styles.modalFormScroll}>
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.fieldLabel, { fontSize: 13 }]}>
                  Accepted Payments
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: "#f9fafb",
                    flexDirection: "row",
                    flexWrap: "wrap",
                  }}
                >
                  {["Cash", "QR Code", "PayMongo", "Stripe"].map((method) => {
                    const checked = (userForm.accepted_payment || "").includes(
                      method,
                    );
                    return (
                      <TouchableOpacity
                        key={method}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          width: "50%",
                          marginBottom: 10,
                        }}
                        onPress={() => {
                          const currentArray = userForm.accepted_payment
                            ? userForm.accepted_payment
                                .split(",")
                                .filter(Boolean)
                            : [];
                          if (currentArray.includes(method)) {
                            setUserForm((prev) => ({
                              ...prev,
                              accepted_payment: currentArray
                                .filter((m) => m !== method)
                                .join(","),
                            }));
                          } else {
                            setUserForm((prev) => ({
                              ...prev,
                              accepted_payment: [...currentArray, method].join(
                                ",",
                              ),
                            }));
                          }
                        }}
                      >
                        <Ionicons
                          name={checked ? "checkbox" : "square-outline"}
                          size={22}
                          color={checked ? "#111" : "#9ca3af"}
                        />
                        <Text
                          style={{
                            marginLeft: 8,
                            color: "#374151",
                            fontSize: 13,
                          }}
                        >
                          {method}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.fieldLabel, { fontSize: 13 }]}>
                  Family Subscription
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: "#e5e7eb",
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: "#f9fafb",
                  }}
                >
                  <Text
                    style={{ fontSize: 15, fontWeight: "800", color: "#111" }}
                  >
                    Subscribed
                  </Text>
                  <Text
                    style={{ color: "#4b5563", fontSize: 12, marginTop: 4 }}
                  >
                    Slots: {editingUser?.subscription?.used || 0}/
                    {Number(userForm.family_slots) || 0} used
                  </Text>
                  <Text style={{ color: "#4b5563", fontSize: 12 }}>
                    Available: {Number(userForm.family_slots) || 0}
                  </Text>

                  <TouchableOpacity
                    style={{
                      backgroundColor: "#111",
                      alignSelf: "flex-start",
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 8,
                      marginTop: 12,
                    }}
                    onPress={() =>
                      setUserForm((prev) => ({
                        ...prev,
                        is_subscribed_family_plan: "true",
                        family_slots: String(
                          (Number(prev.family_slots) || 0) + 1,
                        ),
                      }))
                    }
                  >
                    <Text
                      style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}
                    >
                      Add Family Slot
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { fontSize: 13 }]}>
                    Date of Birth
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.input,
                      {
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 0,
                      },
                    ]}
                    onPress={() => setShowBirthdayPicker(true)}
                  >
                    <Text
                      style={{ color: userForm.birthday ? "#111" : "#9ca3af" }}
                    >
                      {userForm.birthday || "DD/MM/YYYY"}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color="#111" />
                  </TouchableOpacity>
                  {showBirthdayPicker && (
                    <Modal transparent animationType="slide">
                      <View
                        style={{
                          flex: 1,
                          justifyContent: "center",
                          backgroundColor: "rgba(0,0,0,0.5)",
                          padding: 20,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: "white",
                            borderRadius: 10,
                            padding: 20,
                          }}
                        >
                          <CalendarPicker
                            allowPastDates={true}
                            selectedDate={userForm.birthday || ""}
                            onDateSelect={(date: string) => {
                              setUserForm((prev) => ({
                                ...prev,
                                birthday: date,
                              }));
                              setShowBirthdayPicker(false);
                            }}
                          />
                          <TouchableOpacity
                            onPress={() => setShowBirthdayPicker(false)}
                            style={{ marginTop: 20 }}
                          >
                            <Text
                              style={{
                                textAlign: "center",
                                color: "red",
                                fontWeight: "bold",
                              }}
                            >
                              Cancel
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Modal>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { fontSize: 13 }]}>
                    Gender
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.input,
                      {
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 0,
                      },
                    ]}
                    onPress={() => setShowGenderPicker(!showGenderPicker)}
                  >
                    <Text style={{ color: "#111" }}>
                      {userForm.gender || "Select"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#111" />
                  </TouchableOpacity>
                  {showGenderPicker && (
                    <Modal transparent animationType="fade">
                      <TouchableOpacity
                        style={{ flex: 1 }}
                        onPress={() => setShowGenderPicker(false)}
                      >
                        <View
                          style={{
                            backgroundColor: "#fff",
                            borderWidth: 1,
                            borderColor: "#e5e7eb",
                            borderRadius: 8,
                            position: "absolute",
                            top: "55%",
                            left: "50%",
                            right: 16,
                            zIndex: 10,
                            elevation: 5,
                          }}
                        >
                          {GENDER_OPTIONS.map((opt) => (
                            <TouchableOpacity
                              key={opt}
                              style={{
                                padding: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: "#f3f4f6",
                              }}
                              onPress={() => {
                                setUserForm((prev) => ({
                                  ...prev,
                                  gender: opt,
                                }));
                                setShowGenderPicker(false);
                              }}
                            >
                              <Text style={{ color: "#111" }}>{opt}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </TouchableOpacity>
                    </Modal>
                  )}
                </View>
              </View>

              {Object.keys(userForm).map((field) => {
                if (
                  [
                    "accepted_payment",
                    "is_subscribed_family_plan",
                    "family_slots",
                    "birthday",
                    "gender",
                  ].includes(field)
                ) {
                  return null;
                }
                const value = userForm[field] ?? "";
                const multiline = isMultilineField(field, value);

                if (field === "role") {
                  return (
                    <View key={field} style={styles.fieldWrap}>
                      <Text style={styles.fieldLabel}>
                        {prettyLabel(field)}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 10,
                          marginTop: 5,
                        }}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <TouchableOpacity
                            key={opt}
                            onPress={() =>
                              setUserForm((prev) => ({ ...prev, [field]: opt }))
                            }
                            style={{
                              padding: 8,
                              borderWidth: 1,
                              borderColor: value === opt ? "#111" : "#ccc",
                              borderRadius: 5,
                              backgroundColor:
                                value === opt ? "#111" : "transparent",
                              marginRight: 10,
                              marginBottom: 10,
                            }}
                          >
                            <Text
                              style={{ color: value === opt ? "#fff" : "#111" }}
                            >
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                }

                if (BOOLEAN_FIELD_HINTS.has(field)) {
                  const isChecked = value === "true";
                  return (
                    <View key={field} style={styles.fieldWrap}>
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <TouchableOpacity
                          onPress={() =>
                            setUserForm((prev) => ({
                              ...prev,
                              [field]: String(!isChecked),
                            }))
                          }
                        >
                          <Ionicons
                            name={isChecked ? "checkbox" : "square-outline"}
                            size={26}
                            color={isChecked ? "#111" : "#ccc"}
                          />
                        </TouchableOpacity>
                        <Text
                          style={[
                            styles.fieldLabel,
                            { marginLeft: 10, marginBottom: 0 },
                          ]}
                        >
                          {prettyLabel(field)}
                        </Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View key={field} style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>{prettyLabel(field)}</Text>
                    <TextInput
                      style={[styles.input, multiline && styles.inputMultiline]}
                      value={value}
                      onChangeText={(nextValue) =>
                        setUserForm((prev) => ({ ...prev, [field]: nextValue }))
                      }
                      placeholder={prettyLabel(field)}
                      autoCapitalize="none"
                      multiline={multiline}
                      secureTextEntry={field === "new_password"}
                      textAlignVertical={multiline ? "top" : "center"}
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setEditingUser(null)}
                disabled={saving}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={saveUser}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save User</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingProperty} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Property Details</Text>

            <ScrollView style={styles.modalFormScroll}>
              {/* Images Section */}
              <View
                style={{
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="image-outline" size={18} color="#111" />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#111",
                      marginLeft: 6,
                    }}
                  >
                    Property Photos (Max 10)
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    alignSelf: "flex-start",
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#d1d5db",
                    borderRadius: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    marginBottom: 12,
                  }}
                  onPress={pickImage}
                >
                  <Ionicons name="add" size={16} color="#4b5563" />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#4b5563",
                      marginLeft: 4,
                    }}
                  >
                    Upload Photo
                  </Text>
                </TouchableOpacity>

                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  {(() => {
                    try {
                      const imagesArray = propertyForm.images
                        ? JSON.parse(propertyForm.images)
                        : [];
                      return imagesArray.map((imgUri: string, idx: number) => (
                        <View key={idx} style={{ position: "relative" }}>
                          <Image
                            source={{ uri: imgUri }}
                            style={{
                              width: 80,
                              height: 80,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: "#d1d5db",
                            }}
                          />
                          <TouchableOpacity
                            style={{
                              position: "absolute",
                              top: -6,
                              right: -6,
                              backgroundColor: "#111",
                              borderRadius: 12,
                              width: 22,
                              height: 22,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                            onPress={() => removeImage(idx)}
                          >
                            <Ionicons name="close" size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ));
                    } catch (e) {
                      return null;
                    }
                  })()}

                  {(() => {
                    try {
                      const imagesArray = propertyForm.images
                        ? JSON.parse(propertyForm.images)
                        : [];
                      if (imagesArray.length < 10) {
                        return (
                          <TouchableOpacity
                            style={{
                              width: 80,
                              height: 80,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: "#d1d5db",
                              borderStyle: "dashed",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                            onPress={pickImage}
                          >
                            <Text style={{ fontSize: 24, color: "#9ca3af" }}>
                              +
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                    } catch (e) {
                      return null;
                    }
                  })()}
                </View>
                <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
                  Max 2MB per image. Click to upload or replace.
                </Text>
              </View>

              {/* Title Section */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#9ca3af",
                    marginBottom: 6,
                    textTransform: "uppercase",
                  }}
                >
                  Rent Title *
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#f9fafb",
                    borderRadius: 8,
                    paddingHorizontal: 16,
                    height: 50,
                    fontSize: 16,
                    fontWeight: "700",
                    color: "#111",
                  }}
                  value={propertyForm.title}
                  onChangeText={(v) =>
                    setPropertyForm((p) => ({ ...p, title: v }))
                  }
                />
              </View>

              {/* Location Section */}
              <View style={{ marginBottom: 24 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      width: 4,
                      height: 16,
                      backgroundColor: "#111",
                      borderRadius: 2,
                      marginRight: 8,
                    }}
                  />
                  <Text
                    style={{ fontSize: 15, fontWeight: "800", color: "#111" }}
                  >
                    Location
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={[{ width: "23%", minWidth: 80, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      Bldg No.
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.building_no}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, building_no: v }))
                      }
                    />
                  </View>
                  <View
                    style={[{ width: "23%", minWidth: 80, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      Street
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.street}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, street: v }))
                      }
                    />
                  </View>
                  <View
                    style={[{ width: "23%", minWidth: 80, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      Barangay
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.address}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, address: v }))
                      }
                    />
                  </View>
                  <View
                    style={[{ width: "23%", minWidth: 80, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      City
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.city}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, city: v }))
                      }
                    />
                  </View>

                  <View
                    style={[{ width: "48%", minWidth: 150, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      Country
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.country}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, country: v }))
                      }
                    />
                  </View>
                  <View
                    style={[{ width: "48%", minWidth: 150, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      State / Province
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.state_province}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, state_province: v }))
                      }
                    />
                  </View>

                  <View
                    style={[{ width: "23%", minWidth: 80, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      ZIP
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.zip}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, zip: v }))
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  <View
                    style={[{ width: "73%", minWidth: 150, marginBottom: 12 }]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "500",
                      }}
                    >
                      Google Map Link (Preferred)
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#d1d5db",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.location_link}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, location_link: v }))
                      }
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={[{ width: "100%", marginTop: 2 }]}>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      marginBottom: 6,
                      fontWeight: "500",
                    }}
                  >
                    Terms & Conditions URL
                  </Text>
                  <TextInput
                    style={[
                      {
                        borderWidth: 1,
                        borderColor: "#d1d5db",
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        height: 42,
                        color: "#111",
                      },
                    ]}
                    value={propertyForm.terms_conditions}
                    onChangeText={(v) =>
                      setPropertyForm((p) => ({ ...p, terms_conditions: v }))
                    }
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                {/* Contact Column */}
                <View style={{ width: "48%", minWidth: 150 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 4,
                        height: 16,
                        backgroundColor: "#111",
                        borderRadius: 2,
                        marginRight: 8,
                      }}
                    />
                    <Text
                      style={{ fontSize: 15, fontWeight: "800", color: "#111" }}
                    >
                      Contact
                    </Text>
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "600",
                      }}
                    >
                      Phone
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#e5e7eb",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.owner_phone}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, owner_phone: v }))
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "600",
                      }}
                    >
                      Email
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#e5e7eb",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.owner_email}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, owner_email: v }))
                      }
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                {/* Details Column */}
                <View style={{ width: "48%", minWidth: 150 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 4,
                        height: 16,
                        backgroundColor: "#111",
                        borderRadius: 2,
                        marginRight: 8,
                      }}
                    />
                    <Text
                      style={{ fontSize: 15, fontWeight: "800", color: "#111" }}
                    >
                      Details
                    </Text>
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "600",
                      }}
                    >
                      Monthly Price (₱)
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#e5e7eb",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.price}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, price: v }))
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={[styles.fieldWrap, { width: "48%" }]}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 6,
                          fontWeight: "600",
                        }}
                      >
                        Beds
                      </Text>
                      <TextInput
                        style={[
                          {
                            borderWidth: 1,
                            borderColor: "#e5e7eb",
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            height: 42,
                            color: "#111",
                          },
                        ]}
                        value={propertyForm.bedrooms}
                        onChangeText={(v) =>
                          setPropertyForm((p) => ({ ...p, bedrooms: v }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[styles.fieldWrap, { width: "48%" }]}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 6,
                          fontWeight: "600",
                        }}
                      >
                        Baths
                      </Text>
                      <TextInput
                        style={[
                          {
                            borderWidth: 1,
                            borderColor: "#e5e7eb",
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            height: 42,
                            color: "#111",
                          },
                        ]}
                        value={propertyForm.bathrooms}
                        onChangeText={(v) =>
                          setPropertyForm((p) => ({ ...p, bathrooms: v }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={[styles.fieldWrap, { width: "48%" }]}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 6,
                          fontWeight: "600",
                        }}
                      >
                        Sqft
                      </Text>
                      <TextInput
                        style={[
                          {
                            borderWidth: 1,
                            borderColor: "#e5e7eb",
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            height: 42,
                            color: "#111",
                          },
                        ]}
                        value={propertyForm.area_sqft}
                        onChangeText={(v) =>
                          setPropertyForm((p) => ({ ...p, area_sqft: v }))
                        }
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[styles.fieldWrap, { width: "48%" }]}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginBottom: 6,
                          fontWeight: "600",
                        }}
                      >
                        Status
                      </Text>
                      <TouchableOpacity
                        style={[
                          {
                            borderWidth: 1,
                            borderColor: "#e5e7eb",
                            borderRadius: 8,
                            paddingHorizontal: 12,
                            height: 42,
                            justifyContent: "center",
                          },
                        ]}
                        onPress={() => {
                          const st = propertyForm.status || "available";
                          if (st === "available")
                            setPropertyForm((p) => ({
                              ...p,
                              status: "occupied",
                            }));
                          else if (st === "occupied")
                            setPropertyForm((p) => ({
                              ...p,
                              status: "maintenance",
                            }));
                          else
                            setPropertyForm((p) => ({
                              ...p,
                              status: "available",
                            }));
                        }}
                      >
                        <Text
                          style={{
                            color: "#111",
                            fontSize: 13,
                            textTransform: "capitalize",
                          }}
                        >
                          {propertyForm.status || "available"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginBottom: 6,
                        fontWeight: "600",
                      }}
                    >
                      Internet (₱)
                    </Text>
                    <TextInput
                      style={[
                        {
                          borderWidth: 1,
                          borderColor: "#e5e7eb",
                          borderRadius: 8,
                          paddingHorizontal: 12,
                          height: 42,
                          color: "#111",
                        },
                      ]}
                      value={propertyForm.internet_cost}
                      onChangeText={(v) =>
                        setPropertyForm((p) => ({ ...p, internet_cost: v }))
                      }
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 10 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 4,
                      height: 16,
                      backgroundColor: "#111",
                      borderRadius: 2,
                      marginRight: 8,
                    }}
                  />
                  <Text
                    style={{ fontSize: 15, fontWeight: "800", color: "#111" }}
                  >
                    Amenities
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  {[
                    "Kitchen",
                    "Pool",
                    "TV",
                    "Elevator",
                    "Air conditioning",
                    "Heating",
                    "Basketball court",
                    "Washing machine",
                    "Dryer",
                    "Parking",
                    "Gym",
                    "Security",
                    "Balcony",
                    "Garden",
                    "Kid's Playground",
                    "Pet friendly",
                    "Furnished",
                    "Carbon monoxide alarm",
                    "Smoke alarm",
                    "Fire extinguisher",
                    "First aid kit",
                  ].map((amn) => {
                    const checked = (propertyForm.amenities || "").includes(
                      amn,
                    );
                    return (
                      <TouchableOpacity
                        key={amn}
                        onPress={() => {
                          const currentArray = propertyForm.amenities
                            ? propertyForm.amenities
                                .split(",")
                                .map((a) => a.trim())
                                .filter(Boolean)
                            : [];
                          if (currentArray.includes(amn)) {
                            setPropertyForm((p) => ({
                              ...p,
                              amenities: currentArray
                                .filter((a) => a !== amn)
                                .join(", "),
                            }));
                          } else {
                            setPropertyForm((p) => ({
                              ...p,
                              amenities: [...currentArray, amn].join(", "),
                            }));
                          }
                        }}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: checked ? "#111" : "#e5e7eb",
                          backgroundColor: checked ? "#111" : "#fff",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: checked ? "#fff" : "#6b7280",
                            fontWeight: checked ? "700" : "500",
                          }}
                        >
                          {amn}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldWrap}>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    marginBottom: 6,
                    fontWeight: "600",
                  }}
                >
                  Description
                </Text>
                <TextInput
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingTop: 12,
                      color: "#111",
                      fontSize: 13,
                      height: 100,
                    },
                  ]}
                  multiline
                  textAlignVertical="top"
                  value={propertyForm.description}
                  onChangeText={(v) =>
                    setPropertyForm((p) => ({ ...p, description: v }))
                  }
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setEditingProperty(null)}
                disabled={saving}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={saveProperty}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save Property</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon }: any) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color="#111" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addPropertyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addPropertyButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
  },
  tabContainer: {
    paddingHorizontal: 12,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  tabButtonActive: {
    backgroundColor: "#fff",
  },
  tabText: {
    color: "#9ca3af",
    fontWeight: "700",
    fontSize: 13,
  },
  tabTextActive: {
    color: "#111827",
  },
  contentWrap: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionWrap: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    marginBottom: 2,
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 14,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "48%",
    minHeight: 98,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "space-between",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  revenueCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 6,
  },
  revenueLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginTop: 6,
  },
  refreshButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    alignSelf: "flex-start",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  refreshButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  listItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  itemMain: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  itemSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#374151",
    fontWeight: "600",
  },
  itemMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#6b7280",
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 10,
  },
  modalFormScroll: {
    maxHeight: 420,
  },
  fieldWrap: {
    marginBottom: 6,
  },
  fieldLabel: {
    color: "#374151",
    fontWeight: "700",
    marginBottom: 4,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
    color: "#111827",
    backgroundColor: "#fff",
  },
  inputMultiline: {
    minHeight: 90,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    fontWeight: "700",
    color: "#374151",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
});
