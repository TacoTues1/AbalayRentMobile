import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Svg, { Circle, G } from "react-native-svg";
import CalendarPicker from "../../../components/ui/CalendarPicker";
import { useRealtime } from "../../../hooks/useRealtime";
import { supabase } from "../../../lib/supabase";

function DonutChart({ segments, title }: { segments: { label: string, value: number, color: string }[], title: string }) {
  const total = segments.reduce((acc, curr) => acc + curr.value, 0);
  const radius = 32;
  const strokeWidth = 16;
  const center = radius + strokeWidth;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: "#f3f4f6",
        flexGrow: 1,
        minWidth: 160,
        alignItems: "center",
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "800", color: "#111827", marginBottom: 12 }}>
        {title}
      </Text>
      <View style={{ width: center * 2, height: center * 2, marginBottom: 12 }}>
        <Svg width={center * 2} height={center * 2}>
          <G rotation="-90" origin={`${center}, ${center}`}>
            {total === 0 ? (
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="#e5e7eb"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
            ) : (
              segments.map((s, i) => {
                if (s.value === 0) return null;
                const percentage = (s.value / total) * 100;
                const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                const strokeDashoffset = -currentOffset;
                currentOffset += (percentage / 100) * circumference;
                return (
                  <Circle
                    key={i}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    fill="transparent"
                  />
                );
              })
            )}
          </G>
        </Svg>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {segments.map((s, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text style={{ fontSize: 11, color: "#4b5563", fontWeight: "700" }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
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

type AdminTab =
  | "Overview"
  | "User"
  | "Properties"
  | "Bookings"
  | "Payments"
  | "Occupancies"
  | "Schedules"
  | "Maintenance"
  | "Leave Monitoring"
  | "Pending Tickets";

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
  "accepted_payments",
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
    toNumber(payment?.other_bills) +
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
  const [activeTab, setActiveTab] = useState<AdminTab>("Overview");
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
  const [bugReports, setBugReports] = useState<any[]>([]);

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
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [bookingForm, setBookingForm] = useState<Record<string, string>>({});
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [paymentForm, setPaymentForm] = useState<Record<string, string>>({});
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [scheduleForm, setScheduleForm] = useState<Record<string, string>>({});
  const [editingMaintenance, setEditingMaintenance] = useState<any | null>(
    null,
  );
  const [maintenanceForm, setMaintenanceForm] = useState<
    Record<string, string>
  >({});
  const [editingLeave, setEditingLeave] = useState<any | null>(null);
  const [leaveForm, setLeaveForm] = useState<Record<string, string>>({});
  const [showCreateModal, setShowCreateModal] = useState<AdminTab | null>(null);

  const [schedules, setSchedules] = useState<any[]>([]);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [maintenanceRequests, setMaintenanceRequests] = useState<any[]>([]);
  const [maintenanceSearch, setMaintenanceSearch] = useState("");
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveSearch, setLeaveSearch] = useState("");
  const [bugSearch, setBugSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketComments, setTicketComments] = useState<any[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commenting, setCommenting] = useState(false);

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
      usersAdmin: users.filter(u => (u.role || "tenant").toLowerCase() === 'admin').length,
      usersLandlord: users.filter(u => (u.role || "tenant").toLowerCase() === 'landlord').length,
      usersTenant: users.filter(u => (u.role || "tenant").toLowerCase() === 'tenant').length,
      properties: properties.length,
      propertiesAvailable: properties.filter(p => p.status === 'available').length,
      propertiesOccupied: properties.filter(p => p.status === 'occupied').length,
      bookings: bookings.length,
      bookingsCompleted: bookings.filter(b => b.status === 'completed' || b.status === 'approved').length,
      payments: payments.length,
      schedules: schedules.length,
      maintenance: maintenanceRequests.length,
      maintenanceClosed: maintenanceRequests.filter(m => m.status === 'resolved' || m.status === 'closed').length,
      leaves: leaveRequests.length,
      leavesApproved: leaveRequests.filter(l => l.end_request_status === 'approved').length,
      bugReports: bugReports.length,
      bugReportsClosed: bugReports.filter(b => b.status === 'resolved' || b.status === 'closed').length,
      occupancies: occupancies.length,
      occupanciesActive: occupancies.filter(o => o.status === 'active').length,
      occupanciesEnded: occupancies.filter(o => o.status === 'ended').length,
    };
  }, [
    users,
    properties,
    bookings,
    payments,
    schedules,
    maintenanceRequests,
    leaveRequests,
    bugReports,
    occupancies,
  ]);

  const filteredMaintenance = useMemo(() => {
    const query = maintenanceSearch.trim().toLowerCase();
    if (!query) return maintenanceRequests;
    return maintenanceRequests.filter(
      (r) =>
        includesQuery(r.title, query) ||
        includesQuery(r.description, query) ||
        includesQuery(userMap[r.tenant]?.first_name, query),
    );
  }, [maintenanceRequests, maintenanceSearch, userMap]);

  const filteredLeaves = useMemo(() => {
    const query = leaveSearch.trim().toLowerCase();
    if (!query) return leaveRequests;
    return leaveRequests.filter(
      (r) =>
        includesQuery(userMap[r.tenant_id]?.first_name, query) ||
        includesQuery(propertyMap[r.property_id]?.title, query) ||
        includesQuery(r.end_request_reason, query),
    );
  }, [leaveRequests, leaveSearch, userMap, propertyMap]);

  const filteredSchedules = useMemo(() => {
    const query = scheduleSearch.trim().toLowerCase();
    if (!query) return schedules;

    return schedules.filter((s) => {
      const landlord = userMap[s.landlord_id];
      return (
        includesQuery(fullName(landlord), query) ||
        includesQuery(s.start_time, query) ||
        includesQuery(s.end_time, query)
      );
    });
  }, [schedules, scheduleSearch, userMap]);

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

  const filteredBugReports = useMemo(() => {
    const query = bugSearch.trim().toLowerCase();
    if (!query) return bugReports;
    return bugReports.filter(
      (b) =>
        includesQuery(b.id, query) ||
        includesQuery(b.subject, query) ||
        includesQuery(b.description, query) ||
        includesQuery(b.issue, query) ||
        includesQuery(b.requester?.first_name, query) ||
        includesQuery(b.requester?.last_name, query) ||
        includesQuery(b.requester?.email, query) ||
        includesQuery(b.status, query),
    );
  }, [bugReports, bugSearch]);

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

    return occupancies.filter((occ: any) => {
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

  const loadAllData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [
        usersRes,
        propsRes,
        bookingsRes,
        paymentsRes,
        occupanciesRes,
        subscriptionsRes,
        landlordSubsRes,
        schedulesRes,
        maintenanceRes,
        leavesRes,
        familyMembersRes,
        bugReportsRes,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("properties")
          .select("*")
          .eq("is_deleted", false)
          .order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("payment_requests")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("tenant_occupancies")
          .select(
            "id, property_id, tenant_id, landlord_id, status, start_date, property:properties(id, title, address, price, max_occupancy), tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, email)",
          )
          .in("status", ["active", "pending_end"])
          .order("start_date", { ascending: false }),
        supabase
          .from("subscriptions")
          .select("tenant_id, total_slots")
          .eq("plan_type", "family_slot_plan"),
        supabase
          .from("landlord_subscriptions")
          .select("landlord_id, total_slots, paid_slots"),
        supabase
          .from("available_time_slots")
          .select("*")
          .order("start_time", { ascending: false }),
        supabase
          .from("maintenance_requests")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("tenant_occupancies")
          .select(
            "*, property:properties(title), tenant:profiles!tenant_occupancies_tenant_id_fkey(first_name, last_name)",
          )
          .not("end_request_status", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("family_members").select("id, tenant_id"),
        supabase
          .from("support_tickets")
          .select("*, requester:profiles!support_tickets_requester_id_fkey(first_name, last_name, email), claimed_by_profile:profiles!support_tickets_claimed_by_fkey(first_name, last_name, email)")
          .order("created_at", { ascending: false }),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (propsRes.error) throw propsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (occupanciesRes.error) throw occupanciesRes.error;
      if (schedulesRes.error) throw schedulesRes.error;
      if (maintenanceRes.error) throw maintenanceRes.error;
      if (leavesRes.error) throw leavesRes.error;

      const subsMap: any = {};
      (subscriptionsRes?.data || []).forEach((sub: any) => {
        subsMap[sub.tenant_id] = sub;
      });

      const landlordSubsMap: any = {};
      (landlordSubsRes?.data || []).forEach((sub: any) => {
        landlordSubsMap[sub.landlord_id] = sub;
      });

      const familyMembers = familyMembersRes?.data || [];
      const propertiesList = propsRes?.data || [];

      const usersWithSubs = (usersRes.data || []).map((u: any) => {
        // Calculate usage even if no sub record exists yet
        const familyUsed = familyMembers.filter(
          (m: any) => m.tenant_id === u.id,
        ).length;
        const propertiesUsed = propertiesList.filter(
          (p: any) => p.landlord === u.id,
        ).length;
        const propertiesOccupied = propertiesList.filter(
          (p: any) => p.landlord === u.id && p.status === "occupied",
        ).length;

        const sub = subsMap[u.id] || {
          tenant_id: u.id,
          total_slots: 1,
          paid_slots: 0,
          plan_type: "free",
        };
        const lSub = landlordSubsMap[u.id] || {
          landlord_id: u.id,
          total_slots: 3,
          paid_slots: 0,
          plan_type: "free",
        };

        sub.used = familyUsed;
        lSub.used = propertiesUsed;
        lSub.occupied = propertiesOccupied;

        return {
          ...u,
          subscription: sub,
          landlordSubscription: lSub,
        };
      });

      setUsers(usersWithSubs);
      setProperties(propsRes.data || []);
      setBookings(bookingsRes.data || []);
      setPayments(paymentsRes.data || []);
      setOccupancies(occupanciesRes.data || []);
      setSchedules(schedulesRes.data || []);
      setMaintenanceRequests(maintenanceRes.data || []);
      setLeaveRequests(leavesRes.data || []);
      setBugReports(bugReportsRes?.data || []);
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

  useRealtime(
    [
      "profiles",
      "properties",
      "bookings",
      "payment_requests",
      "tenant_occupancies",
      "available_time_slots",
      "maintenance_requests",
      "subscriptions",
      "landlord_subscriptions",
      "family_members",
      "support_tickets",
    ],
    () => {
      console.log("Admin Realtime update triggered");
      loadAllData(true);
    },
    true,
  );

  const openUserEditor = (user: any) => {
    setEditingUser(user);
    const form = serializeEditableForm(user, USER_EDIT_FIELDS);
    form["new_password"] = "";

    // Handle accepted_payments (JSON to CSV for UI)
    let paymentsCSV = "";
    if (user.accepted_payments) {
      if (typeof user.accepted_payments === "object") {
        const p = user.accepted_payments;
        const active = [];
        if (p.cash) active.push("Cash");
        if (p.qr_code) active.push("QR Code");
        if (p.paymongo) active.push("PayMongo");
        if (p.stripe) active.push("Stripe");
        paymentsCSV = active.join(",");
      } else if (typeof user.accepted_payments === "string") {
        paymentsCSV = user.accepted_payments;
      }
    }
    form["accepted_payments"] = paymentsCSV;

    form["phone_verified"] = serializeValue(user.phone_verified || false);
    form["avatar_url"] = serializeValue(user.avatar_url || "");

    // Family slot subscription logic
    form["is_subscribed_family_plan"] = serializeValue(!!user.subscription);
    form["family_slots"] = serializeValue(user.subscription?.total_slots || 1);

    // Landlord property slot logic
    form["property_paid_slots"] = serializeValue(
      user.landlordSubscription?.paid_slots || 0,
    );
    form["property_total_slots"] = serializeValue(
      user.landlordSubscription?.total_slots || 3,
    );

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
      delete payload.property_paid_slots;
      delete payload.property_total_slots;

      // Handle accepted_payments (CSV to JSON for DB)
      if (userForm.accepted_payments !== undefined) {
        const methods = (userForm.accepted_payments || "")
          .split(",")
          .filter(Boolean);
        payload.accepted_payments = {
          cash: methods.includes("Cash"),
          qr_code: methods.includes("QR Code"),
          paymongo: methods.includes("PayMongo"),
          stripe: methods.includes("Stripe"),
        };
      }

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

      // Update landlord property slots if applicable
      if ((editingUser.role || "").toLowerCase() === "landlord") {
        const propPaidSlots = Number(userForm.property_paid_slots) || 0;
        const propTotalSlots = Number(userForm.property_total_slots) || 3;

        delete payload.property_paid_slots;
        delete payload.property_total_slots;

        await supabase.from("landlord_subscriptions").upsert(
          {
            landlord_id: editingUser.id,
            paid_slots: propPaidSlots,
            total_slots: propTotalSlots,
            plan_type: propPaidSlots > 0 ? "paid" : "free",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "landlord_id" },
        );
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

  const cancelBooking = async (id: string) => {
    Alert.alert("Confirm", "Cancel this booking?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        onPress: async () => {
          const { error } = await supabase
            .from("bookings")
            .update({ status: "cancelled" })
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const deleteBooking = async (id: string) => {
    Alert.alert("Confirm", "Permanently delete this booking?", [
      { text: "No", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("bookings")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const cancelPayment = async (id: string) => {
    Alert.alert("Confirm", "Cancel this payment request?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes",
        onPress: async () => {
          const { error } = await supabase
            .from("payment_requests")
            .update({ status: "cancelled" })
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const deletePayment = async (id: string) => {
    Alert.alert("Confirm", "Permanently delete this payment?", [
      { text: "No", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("payment_requests")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const deleteSchedule = async (id: string) => {
    Alert.alert("Confirm", "Delete this time slot?", [
      { text: "No", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("available_time_slots")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const endOccupancy = async (occ: any) => {
    Alert.alert("Confirm", "End this occupancy and make property available?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Occupancy",
        style: "destructive",
        onPress: async () => {
          try {
            const { error: occErr } = await supabase
              .from("tenant_occupancies")
              .update({ status: "ended", end_date: new Date().toISOString() })
              .eq("id", occ.id);
            if (occErr) throw occErr;

            const { error: propErr } = await supabase
              .from("properties")
              .update({ status: "available" })
              .eq("id", occ.property_id);
            if (propErr) throw propErr;

            Alert.alert("Success", "Occupancy ended.");
            loadAllData();
          } catch (err: any) {
            Alert.alert("Error", err.message);
          }
        },
      },
    ]);
  };

  const saveBooking = async () => {
    if (!editingBooking) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update(bookingForm)
        .eq("id", editingBooking.id);
      if (error) throw error;
      setEditingBooking(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const savePayment = async () => {
    if (!editingPayment) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payment_requests")
        .update(paymentForm)
        .eq("id", editingPayment.id);
      if (error) throw error;
      setEditingPayment(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async () => {
    if (!editingSchedule) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("available_time_slots")
        .update(scheduleForm)
        .eq("id", editingSchedule.id);
      if (error) throw error;
      setEditingSchedule(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const createBooking = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("bookings").insert([bookingForm]);
      if (error) throw error;
      setShowCreateModal(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const createPayment = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("payment_requests")
        .insert([paymentForm]);
      if (error) throw error;
      setShowCreateModal(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const createSchedule = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("available_time_slots")
        .insert([scheduleForm]);
      if (error) throw error;
      setShowCreateModal(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const openBookingEditor = (booking: any) => {
    setEditingBooking(booking);
    setBookingForm({
      status: booking.status,
      booking_date: booking.booking_date,
      notes: booking.notes || "",
    });
  };

  const openPaymentEditor = (payment: any) => {
    setEditingPayment(payment);
    setPaymentForm({
      status: payment.status,
      due_date: payment.due_date,
      rent_amount: String(payment.rent_amount || "0"),
    });
  };

  const openScheduleEditor = (slot: any) => {
    setEditingSchedule(slot);
    setScheduleForm({
      landlord_id: slot.landlord_id,
      start_time: slot.start_time,
      end_time: slot.end_time,
      is_booked: String(slot.is_booked),
    });
  };

  const openPaymentCreator = () => {
    setShowCreateModal("Payments");
    setPaymentForm({
      status: "pending",
      due_date: new Date().toISOString().split("T")[0],
      rent_amount: "0",
      property_id: "",
      tenant: "",
      landlord: "",
    });
  };

  const openBookingCreator = () => {
    setShowCreateModal("Bookings");
    setBookingForm({
      status: "pending",
      booking_date: new Date().toISOString().split("T")[0],
      property_id: "",
      tenant: "",
      landlord: "",
    });
  };

  const openScheduleCreator = () => {
    setShowCreateModal("Schedules");
    setScheduleForm({
      landlord_id: "",
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      is_booked: "false",
    });
  };

  const deleteMaintenance = (id: string) => {
    Alert.alert("Confirm", "Delete this maintenance request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("maintenance_requests")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const saveMaintenance = async () => {
    if (!editingMaintenance) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("maintenance_requests")
        .update(maintenanceForm)
        .eq("id", editingMaintenance.id);
      if (error) throw error;
      setEditingMaintenance(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const openMaintenanceEditor = (req: any) => {
    setEditingMaintenance(req);
    setMaintenanceForm({
      title: req.title,
      description: req.description,
      status: req.status,
      priority: req.priority,
      category: req.category || "Others",
    });
  };

  const deleteLeave = (id: string) => {
    Alert.alert("Confirm", "Delete this leave request record?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("tenant_occupancies")
            .delete()
            .eq("id", id);
          if (error) Alert.alert("Error", error.message);
          else loadAllData();
        },
      },
    ]);
  };

  const saveLeave = async () => {
    if (!editingLeave) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenant_occupancies")
        .update(leaveForm)
        .eq("id", editingLeave.id);
      if (error) throw error;
      setEditingLeave(null);
      loadAllData();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const openLeaveEditor = (req: any) => {
    setEditingLeave(req);
    setLeaveForm({
      status: req.status,
      end_request_date: req.end_request_date,
      end_request_reason: req.end_request_reason,
      end_request_status: req.end_request_status || "pending",
    });
  };

  const renderOverview = () => (
    <View style={styles.sectionWrap}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ backgroundColor: "#111827", padding: 6, borderRadius: 8 }}>
            <Ionicons name="pie-chart" size={16} color="#fff" />
          </View>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Analytics Overview</Text>
        </View>
        <TouchableOpacity
          style={{ backgroundColor: "#111827", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
          onPress={() => setBulkEmailModal(true)}
        >
          <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>Send Email</Text>
        </TouchableOpacity>
      </View>

      {/* Monitoring Section */}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <DonutChart
          title="Total Users"
          segments={[
            { label: "Admin", value: stats.usersAdmin, color: "#9ca3af" },
            { label: "Landlord", value: stats.usersLandlord, color: "#4b5563" },
            { label: "Tenant", value: stats.usersTenant, color: "#111827" },
          ]}
        />
        <DonutChart
          title="Bookings"
          segments={[
            { label: "Completed", value: stats.bookingsCompleted, color: "#111827" },
          ]}
        />
        <DonutChart
          title="Properties"
          segments={[
            { label: "Available", value: stats.propertiesAvailable, color: "#111827" },
            { label: "Occupied", value: stats.propertiesOccupied, color: "#4b5563" },
          ]}
        />
        <DonutChart
          title="Maintenance"
          segments={[
            { label: "Closed", value: stats.maintenanceClosed, color: "#111827" },
          ]}
        />
        <DonutChart
          title="Pending Tickets"
          segments={[
            { label: "Closed", value: stats.bugReportsClosed, color: "#111827" },
          ]}
        />
        <DonutChart
          title="Leave Pending"
          segments={[
            { label: "Approved", value: stats.leavesApproved, color: "#111827" },
          ]}
        />
        <DonutChart
          title="Active Occupancy"
          segments={[
            { label: "Active", value: stats.occupanciesActive, color: "#111827" },
            { label: "Ended", value: stats.occupanciesEnded, color: "#4b5563" },
          ]}
        />
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
        onPress={() => loadAllData()}
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
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>All Bookings</Text>
        <TouchableOpacity style={styles.createBtn} onPress={openBookingCreator}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createBtnText}>New Booking</Text>
        </TouchableOpacity>
      </View>
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
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openBookingEditor(booking)}>
                  <Ionicons name="create-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => cancelBooking(booking.id)}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color="#f59e0b"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteBooking(booking.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      {renderPagination(filteredBookings.length)}
    </View>
  );

  const renderSchedules = () => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Landlord Schedules</Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={openScheduleCreator}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createBtnText}>New Schedule</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        value={scheduleSearch}
        onChangeText={(text) => {
          setScheduleSearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search schedules (landlord name...)"
        placeholderTextColor="#9ca3af"
      />
      {filteredSchedules.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredSchedules
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((slot) => {
          const landlord = userMap[slot.landlord_id];
          return (
            <View key={slot.id} style={styles.listItem}>
              <View style={styles.itemMain}>
                <Text style={styles.itemTitle}>
                  Landlord: {landlord ? fullName(landlord) : "Unknown"}
                </Text>
                <Text style={styles.itemSubtitle}>
                  {new Date(slot.start_time).toLocaleString()} -{" "}
                  {new Date(slot.end_time).toLocaleTimeString()}
                </Text>
                <Text style={styles.itemMeta}>
                  Booked: {slot.is_booked ? "Yes" : "No"}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openScheduleEditor(slot)}>
                  <Ionicons name="create-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteSchedule(slot.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
    </View>
  );

  const renderMaintenance = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>Maintenance Monitoring</Text>
      <TextInput
        style={styles.searchInput}
        value={maintenanceSearch}
        onChangeText={(text) => {
          setMaintenanceSearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search maintenance (title, description...)"
        placeholderTextColor="#9ca3af"
      />
      {filteredMaintenance.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredMaintenance
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((req) => {
          const tenant = userMap[req.tenant];
          const property = propertyMap[req.property_id];
          return (
            <View key={req.id} style={styles.listItem}>
              <View style={styles.itemMain}>
                <Text style={styles.itemTitle}>{req.title}</Text>
                <Text style={styles.itemSubtitle}>
                  {property?.title || "Unknown Property"} •{" "}
                  {tenant ? fullName(tenant) : "Unknown Tenant"}
                </Text>
                <Text style={styles.itemMeta}>
                  Status: {req.status} • Priority: {req.priority}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openMaintenanceEditor(req)}>
                  <Ionicons name="create-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteMaintenance(req.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      {renderPagination(filteredMaintenance.length)}
    </View>
  );

  const renderLeaves = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>Leave Monitoring</Text>
      <TextInput
        style={styles.searchInput}
        value={leaveSearch}
        onChangeText={(text) => {
          setLeaveSearch(text);
          setCurrentPage(1);
        }}
        placeholder="Search leaves (tenant, property...)"
        placeholderTextColor="#9ca3af"
      />
      {filteredLeaves.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredLeaves
        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
        .map((req) => {
          const tenant = userMap[req.tenant_id];
          const property = propertyMap[req.property_id];
          return (
            <View key={req.id} style={styles.listItem}>
              <View style={styles.itemMain}>
                <Text style={styles.itemTitle}>
                  {tenant ? fullName(tenant) : "Unknown Tenant"}
                </Text>
                <Text style={styles.itemSubtitle}>
                  {property?.title || req.property?.title || "Unknown Property"}
                </Text>
                <Text style={styles.itemMeta}>
                  Status: {req.end_request_status?.toUpperCase() || "PENDING"} •
                  Date: {req.end_request_date}
                </Text>
                <Text style={[styles.itemMeta, { marginTop: 2 }]}>
                  Reason: {req.end_request_reason}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openLeaveEditor(req)}>
                  <Ionicons name="create-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteLeave(req.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      {renderPagination(filteredLeaves.length)}
    </View>
  );

  const renderPayments = () => (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>All Payment Requests</Text>
        <TouchableOpacity style={styles.createBtn} onPress={openPaymentCreator}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createBtnText}>New Payment</Text>
        </TouchableOpacity>
      </View>
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
              <View style={styles.itemActions}>
                <TouchableOpacity onPress={() => openPaymentEditor(payment)}>
                  <Ionicons name="create-outline" size={20} color="#4b5563" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => cancelPayment(payment.id)}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color="#f59e0b"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deletePayment(payment.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
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

  const deleteBug = (id: string) => {
    Alert.alert("Confirm", "Delete this ticket?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase
              .from("support_tickets")
              .delete()
              .eq("id", id);
            if (error) throw error;
            loadAllData(true);
          } catch (err: any) {
            Alert.alert("Error", err.message);
          }
        },
      },
    ]);
  };

  const updateBugStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      loadAllData(true);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  const claimTicket = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("support_tickets")
        .update({ 
          claimed_by: userId, 
          claimed_at: new Date().toISOString(), 
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq("id", id);
      if (error) throw error;
      loadAllData(true);
      if (selectedTicket && selectedTicket.id === id) {
        setSelectedTicket({ ...selectedTicket, claimed_by: userId, status: 'in_progress' });
      }
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }
  };

  const openTicketModal = async (ticket: any) => {
    setSelectedTicket(ticket);
    setTicketComments([]);
    try {
      const { data, error } = await supabase
        .from("support_ticket_comments")
        .select("*, author:profiles!support_ticket_comments_author_id_fkey(first_name, last_name, role)")
        .eq("ticket_id", ticket.id)
        .order("created_at", { ascending: true });
      if (!error && data) {
        setTicketComments(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitTicketComment = async () => {
    if (!commentBody.trim() || !selectedTicket) return;
    setCommenting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("support_ticket_comments")
        .insert({
          ticket_id: selectedTicket.id,
          author_id: userId,
          body: commentBody.trim()
        });
      if (error) throw error;
      setCommentBody("");
      openTicketModal(selectedTicket);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setCommenting(false);
    }
  };

  const renderPendingTickets = () => (
    <View style={styles.sectionWrap}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "900", color: "#111827" }}>Pending Tickets</Text>
          <Text style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Review, claim, and resolve Help Center requests.</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TextInput
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minWidth: 200, backgroundColor: "#fff" }}
            value={bugSearch}
            onChangeText={(text) => {
              setBugSearch(text);
              setCurrentPage(1);
            }}
            placeholder="Search request..."
            placeholderTextColor="#9ca3af"
          />
          <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#f9fafb" }}>
            <Text style={{ fontSize: 14, color: "#111827", fontWeight: "600" }}>All Status</Text>
          </View>
        </View>
      </View>

      {filteredBugReports.length === 0 && (
        <Text style={styles.emptyText}>No pending tickets found.</Text>
      )}

      {filteredBugReports.length > 0 && (
        <View style={{ marginTop: 8 }}>
          {filteredBugReports
            .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
            .map((bug) => (
              <TouchableOpacity
                key={bug.id}
                style={styles.listItem}
                onPress={() => openTicketModal(bug)}
              >
                <View style={styles.itemMain}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={[styles.itemTitle, { flex: 1, marginRight: 8 }]} numberOfLines={2}>{bug.subject || "Request"}</Text>
                    <View
                      style={{
                        backgroundColor: bug.status === 'resolved' || bug.status === 'closed' ? '#dcfce7' : bug.status === 'in_progress' ? '#fef9c3' : '#fee2e2',
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "bold", color: bug.status === 'resolved' || bug.status === 'closed' ? '#166534' : bug.status === 'in_progress' ? '#854d0e' : '#991b1b' }}>
                        {bug.status === 'resolved' || bug.status === 'closed' ? 'Closed' : (bug.status || "PENDING").toUpperCase().replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.itemSubtitle}>
                    {bug.requester ? `${bug.requester.first_name || ''} ${bug.requester.last_name || ''}`.trim() : "Unknown User"} • {bug.request_type || bug.issue || "Support"}
                  </Text>
                  <Text style={[styles.itemMeta, { marginTop: 4, color: "#4b5563" }]} numberOfLines={2}>
                    {bug.description}
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <Text style={[styles.itemMeta, { fontSize: 11 }]}>
                      Claimed: {bug.claimed_by_profile ? `${bug.claimed_by_profile.first_name || ''} ${bug.claimed_by_profile.last_name || ''}`.trim() : "No"}
                    </Text>
                    <Text style={[styles.itemMeta, { fontSize: 11 }]}>
                      {new Date(bug.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
        </View>
      )}

      <Modal visible={!!selectedTicket} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "90%" }}>
            {selectedTicket && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: "#111827", marginBottom: 4 }}>{selectedTicket.subject}</Text>
                    <Text style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>#{selectedTicket.id.substring(0, 8).toUpperCase()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedTicket(null)} style={{ padding: 8, backgroundColor: "#f3f4f6", borderRadius: 20 }}>
                    <Ionicons name="close" size={20} color="#4b5563" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                  <View style={{ backgroundColor: "#f9fafb", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                    <Text style={{ fontSize: 14, color: "#374151", lineHeight: 22 }}>{selectedTicket.description}</Text>
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                    <View style={{ backgroundColor: "#f3f4f6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#6b7280", marginBottom: 2 }}>REQUESTER</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>{selectedTicket.requester ? `${selectedTicket.requester.first_name || ''} ${selectedTicket.requester.last_name || ''}`.trim() : "Unknown"}</Text>
                    </View>
                    <View style={{ backgroundColor: "#f3f4f6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#6b7280", marginBottom: 2 }}>TYPE</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>{selectedTicket.request_type || selectedTicket.issue || "Support"}</Text>
                    </View>
                    <View style={{ backgroundColor: "#f3f4f6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: "#6b7280", marginBottom: 2 }}>CREATED</Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>{new Date(selectedTicket.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>

                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 12 }}>Comments</Text>
                    {ticketComments.length === 0 ? (
                      <Text style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No comments yet.</Text>
                    ) : (
                      ticketComments.map((comment, i) => (
                        <View key={i} style={{ backgroundColor: "#f9fafb", padding: 12, borderRadius: 12, marginBottom: 8 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={{ fontSize: 12, fontWeight: "700", color: "#374151" }}>{comment.author ? `${comment.author.first_name || ''} ${comment.author.last_name || ''}`.trim() : "Someone"}</Text>
                            <Text style={{ fontSize: 10, color: "#9ca3af" }}>{new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
                          </View>
                          <Text style={{ fontSize: 13, color: "#111827", lineHeight: 20 }}>{comment.body}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  {selectedTicket.status !== 'closed' && selectedTicket.status !== 'resolved' && (
                    <View style={{ marginBottom: 24 }}>
                      <TextInput
                        style={{ backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 16, fontSize: 14, minHeight: 100 }}
                        placeholder="Write a reply..."
                        multiline
                        textAlignVertical="top"
                        value={commentBody}
                        onChangeText={setCommentBody}
                      />
                      <TouchableOpacity
                        style={{ backgroundColor: "#111", paddingVertical: 12, borderRadius: 12, marginTop: 12, alignItems: "center" }}
                        disabled={commenting || !commentBody.trim()}
                        onPress={submitTicketComment}
                      >
                        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "bold" }}>{commenting ? "Sending..." : "Send Reply"}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={{ borderTopWidth: 1, borderColor: "#e5e7eb", paddingTop: 24, gap: 12 }}>
                    {!selectedTicket.claimed_by && (
                      <TouchableOpacity
                        style={{ backgroundColor: "#111", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
                        onPress={() => claimTicket(selectedTicket.id)}
                      >
                        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "bold" }}>Claim Ticket</Text>
                      </TouchableOpacity>
                    )}
                    
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: "#fef9c3", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
                        onPress={() => {
                          updateBugStatus(selectedTicket.id, "in_progress");
                          setSelectedTicket({ ...selectedTicket, status: "in_progress" });
                        }}
                      >
                        <Text style={{ color: "#854d0e", fontSize: 14, fontWeight: "bold" }}>Mark In Progress</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: "#dcfce7", paddingVertical: 14, borderRadius: 12, alignItems: "center" }}
                        onPress={() => {
                          updateBugStatus(selectedTicket.id, "resolved");
                          setSelectedTicket({ ...selectedTicket, status: "resolved" });
                        }}
                      >
                        <Text style={{ color: "#166534", fontSize: 14, fontWeight: "bold" }}>Mark Resolved</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <TouchableOpacity
                      style={{ backgroundColor: "#fee2e2", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12 }}
                      onPress={() => {
                        setSelectedTicket(null);
                        deleteBug(selectedTicket.id);
                      }}
                    >
                      <Text style={{ color: "#991b1b", fontSize: 14, fontWeight: "bold" }}>Delete Ticket</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
      {renderPagination(filteredBugReports.length)}
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
          {/* <TouchableOpacity
            style={styles.addPropertyButton}
            onPress={() => router.push("/properties/new" as any)}
          >
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.addPropertyButtonText}>Add Property</Text>
          </TouchableOpacity> */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => router.replace("/logout")}
          >
            <Ionicons name="log-out-outline" size={16} color="#fff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.contentWrap}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => loadAllData()}
            tintColor="#111"
            colors={["#111"]}
          />
        }
      >
        {activeTab === "Overview" && renderOverview()}
        {activeTab === "User" && renderUsers()}
        {activeTab === "Properties" && renderProperties()}
        {activeTab === "Bookings" && renderBookings()}
        {activeTab === "Payments" && renderPayments()}
        {activeTab === "Occupancies" && renderOccupancies()}
        {activeTab === "Schedules" && renderSchedules()}
        {activeTab === "Maintenance" && renderMaintenance()}
        {activeTab === "Leave Monitoring" && renderLeaves()}
        {activeTab === "Pending Tickets" && renderPendingTickets()}
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
              "Overview",
              "User",
              "Properties",
              "Bookings",
              "Payments",
              "Occupancies",
              "Schedules",
              "Maintenance",
              "Leave Monitoring",
              "Pending Tickets",
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
                style={[
                  styles.primaryButton,
                  { backgroundColor: "#ef4444", flex: 1 },
                ]}
                onPress={() => {
                  const occ = selectedOccupancyDetails;
                  setSelectedOccupancyDetails(null);
                  endOccupancy(occ);
                }}
              >
                <Text style={styles.primaryButtonText}>End Occupancy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1 }]}
                onPress={() => setSelectedOccupancyDetails(null)}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
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
                    const checked = (userForm.accepted_payments || "").includes(
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
                          const currentArray = userForm.accepted_payments
                            ? userForm.accepted_payments
                                .split(",")
                                .filter(Boolean)
                            : [];
                          if (currentArray.includes(method)) {
                            setUserForm((prev) => ({
                              ...prev,
                              accepted_payments: currentArray
                                .filter((m) => m !== method)
                                .join(","),
                            }));
                          } else {
                            setUserForm((prev) => ({
                              ...prev,
                              accepted_payments: [...currentArray, method].join(
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

              {(editingUser?.role || "").toLowerCase() === "tenant" && (
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
                      style={{ color: "#4b5563", fontSize: 13, marginTop: 4 }}
                    >
                      Active Family: {editingUser?.subscription?.used || 0}
                    </Text>
                    <Text style={{ color: "#4b5563", fontSize: 13 }}>
                      Total Slots: {Number(userForm.family_slots) || 1}
                    </Text>
                    <Text style={{ color: "#4b5563", fontSize: 13 }}>
                      Available:{" "}
                      {Math.max(
                        0,
                        (Number(userForm.family_slots) || 1) -
                          (editingUser?.subscription?.used || 0),
                      )}
                    </Text>

                    <View
                      style={{ flexDirection: "row", gap: 8, marginTop: 12 }}
                    >
                      <TouchableOpacity
                        style={{
                          backgroundColor:
                            (Number(userForm.family_slots) || 0) <= 1
                              ? "#9ca3af"
                              : "#dc2626",
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                        disabled={(Number(userForm.family_slots) || 0) <= 1}
                        onPress={() => {
                          const currentSlots =
                            Number(userForm.family_slots) || 0;
                          const used = editingUser?.subscription?.used || 0;
                          if (currentSlots - 1 < used) {
                            Alert.alert(
                              "Cannot Remove",
                              `This tenant has ${used} active family members. You cannot reduce slots below this number.`,
                            );
                            return;
                          }
                          setUserForm((prev) => ({
                            ...prev,
                            family_slots: String(
                              Math.max(1, (Number(prev.family_slots) || 0) - 1),
                            ),
                          }));
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          − Remove Slot
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          backgroundColor: "#111",
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 8,
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
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          + Add Slot
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {(editingUser?.role || "").toLowerCase() === "landlord" && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.fieldLabel, { fontSize: 13 }]}>
                    Property Slots
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
                      {(Number(userForm.property_paid_slots) || 0) > 0
                        ? "Paid Plan"
                        : "Free Plan"}
                    </Text>
                    <Text
                      style={{ color: "#4b5563", fontSize: 13, marginTop: 4 }}
                    >
                      Occupied:{" "}
                      {editingUser?.landlordSubscription?.occupied || 0}
                    </Text>
                    <Text style={{ color: "#4b5563", fontSize: 13 }}>
                      Total Properties:{" "}
                      {editingUser?.landlordSubscription?.used || 0}
                    </Text>
                    <Text style={{ color: "#4b5563", fontSize: 13 }}>
                      Total Slots: {Number(userForm.property_total_slots) || 3}
                    </Text>
                    <Text style={{ color: "#4b5563", fontSize: 13 }}>
                      Available:{" "}
                      {Math.max(
                        0,
                        (Number(userForm.property_total_slots) || 3) -
                          (editingUser?.landlordSubscription?.used || 0),
                      )}
                    </Text>

                    <View
                      style={{ flexDirection: "row", gap: 8, marginTop: 12 }}
                    >
                      <TouchableOpacity
                        style={{
                          backgroundColor:
                            (Number(userForm.property_total_slots) || 3) <= 3
                              ? "#9ca3af"
                              : "#dc2626",
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                        disabled={
                          (Number(userForm.property_total_slots) || 3) <= 3
                        }
                        onPress={() => {
                          const currentSlots =
                            Number(userForm.property_total_slots) || 3;
                          const occupied =
                            editingUser?.landlordSubscription?.occupied || 0;
                          if (currentSlots - 1 < occupied) {
                            Alert.alert(
                              "Cannot Remove",
                              `This landlord has ${occupied} OCCUPIED properties. You cannot reduce slots below the number of active tenants.`,
                            );
                            return;
                          }
                          setUserForm((prev) => {
                            const newPaid = Math.max(
                              0,
                              (Number(prev.property_paid_slots) || 0) - 1,
                            );
                            return {
                              ...prev,
                              property_paid_slots: String(newPaid),
                              property_total_slots: String(
                                Math.max(3, 3 + newPaid),
                              ),
                            };
                          });
                        }}
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          − Remove Slot
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          backgroundColor: "#111",
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                        onPress={() =>
                          setUserForm((prev) => ({
                            ...prev,
                            property_paid_slots: String(
                              (Number(prev.property_paid_slots) || 0) + 1,
                            ),
                            property_total_slots: String(
                              Math.min(
                                10,
                                3 + (Number(prev.property_paid_slots) || 0) + 1,
                              ),
                            ),
                          }))
                        }
                      >
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          + Add Slot
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

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
                    "accepted_payments",
                    "is_subscribed_family_plan",
                    "family_slots",
                    "property_paid_slots",
                    "property_total_slots",
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
      {/* Booking Edit/Create Modal */}
      <Modal
        visible={!!editingBooking || showCreateModal === "Bookings"}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingBooking ? "Edit Booking" : "New Booking"}
            </Text>
            <ScrollView style={styles.modalFormScroll}>
              {!editingBooking && (
                <>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Property ID</Text>
                    <TextInput
                      style={styles.input}
                      value={bookingForm.property_id}
                      onChangeText={(v) =>
                        setBookingForm({ ...bookingForm, property_id: v })
                      }
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Tenant ID</Text>
                    <TextInput
                      style={styles.input}
                      value={bookingForm.tenant}
                      onChangeText={(v) =>
                        setBookingForm({ ...bookingForm, tenant: v })
                      }
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Landlord ID</Text>
                    <TextInput
                      style={styles.input}
                      value={bookingForm.landlord}
                      onChangeText={(v) =>
                        setBookingForm({ ...bookingForm, landlord: v })
                      }
                    />
                  </View>
                </>
              )}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={bookingForm.booking_date}
                  onChangeText={(v) =>
                    setBookingForm({ ...bookingForm, booking_date: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Status</Text>
                <TextInput
                  style={styles.input}
                  value={bookingForm.status}
                  onChangeText={(v) =>
                    setBookingForm({ ...bookingForm, status: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, { height: 80 }]}
                  multiline
                  value={bookingForm.notes}
                  onChangeText={(v) =>
                    setBookingForm({ ...bookingForm, notes: v })
                  }
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setEditingBooking(null);
                  setShowCreateModal(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={editingBooking ? saveBooking : createBooking}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Edit/Create Modal */}
      <Modal
        visible={!!editingPayment || showCreateModal === "Payments"}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingPayment ? "Edit Payment" : "New Payment Request"}
            </Text>
            <ScrollView style={styles.modalFormScroll}>
              {!editingPayment && (
                <>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Property ID</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentForm.property_id}
                      onChangeText={(v) =>
                        setPaymentForm({ ...paymentForm, property_id: v })
                      }
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Tenant ID</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentForm.tenant}
                      onChangeText={(v) =>
                        setPaymentForm({ ...paymentForm, tenant: v })
                      }
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Landlord ID</Text>
                    <TextInput
                      style={styles.input}
                      value={paymentForm.landlord}
                      onChangeText={(v) =>
                        setPaymentForm({ ...paymentForm, landlord: v })
                      }
                    />
                  </View>
                </>
              )}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Due Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={paymentForm.due_date}
                  onChangeText={(v) =>
                    setPaymentForm({ ...paymentForm, due_date: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Rent Amount</Text>
                <TextInput
                  style={styles.input}
                  value={paymentForm.rent_amount}
                  keyboardType="numeric"
                  onChangeText={(v) =>
                    setPaymentForm({ ...paymentForm, rent_amount: v })
                  }
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Status</Text>
                <TextInput
                  style={styles.input}
                  value={paymentForm.status}
                  onChangeText={(v) =>
                    setPaymentForm({ ...paymentForm, status: v })
                  }
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setEditingPayment(null);
                  setShowCreateModal(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={editingPayment ? savePayment : createPayment}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Schedule Edit/Create Modal */}
      <Modal
        visible={!!editingSchedule || showCreateModal === "Schedules"}
        transparent
        animationType="slide"
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingSchedule ? "Edit Schedule Slot" : "New Schedule Slot"}
            </Text>
            <ScrollView style={styles.modalFormScroll}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Landlord ID</Text>
                <TextInput
                  style={styles.input}
                  value={scheduleForm.landlord_id}
                  onChangeText={(v) =>
                    setScheduleForm({ ...scheduleForm, landlord_id: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Start Time (ISO)</Text>
                <TextInput
                  style={styles.input}
                  value={scheduleForm.start_time}
                  onChangeText={(v) =>
                    setScheduleForm({ ...scheduleForm, start_time: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>End Time (ISO)</Text>
                <TextInput
                  style={styles.input}
                  value={scheduleForm.end_time}
                  onChangeText={(v) =>
                    setScheduleForm({ ...scheduleForm, end_time: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Is Booked (true/false)</Text>
                <TextInput
                  style={styles.input}
                  value={scheduleForm.is_booked}
                  onChangeText={(v) =>
                    setScheduleForm({ ...scheduleForm, is_booked: v })
                  }
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setEditingSchedule(null);
                  setShowCreateModal(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={editingSchedule ? saveSchedule : createSchedule}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Maintenance Editor Modal */}
      <Modal visible={!!editingMaintenance} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Maintenance Request</Text>
            <ScrollView style={styles.modalFormScroll}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={maintenanceForm.title}
                  onChangeText={(v) =>
                    setMaintenanceForm({ ...maintenanceForm, title: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.input, { height: 80 }]}
                  multiline
                  value={maintenanceForm.description}
                  onChangeText={(v) =>
                    setMaintenanceForm({ ...maintenanceForm, description: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Status</Text>
                <TextInput
                  style={styles.input}
                  value={maintenanceForm.status}
                  onChangeText={(v) =>
                    setMaintenanceForm({ ...maintenanceForm, status: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Priority</Text>
                <TextInput
                  style={styles.input}
                  value={maintenanceForm.priority}
                  onChangeText={(v) =>
                    setMaintenanceForm({ ...maintenanceForm, priority: v })
                  }
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setEditingMaintenance(null)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={saveMaintenance}
              >
                <Text style={styles.primaryButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Leave Editor Modal */}
      <Modal visible={!!editingLeave} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Leave Request</Text>
            <ScrollView style={styles.modalFormScroll}>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>
                  Overall Status (pending_end/active/ended)
                </Text>
                <TextInput
                  style={styles.input}
                  value={leaveForm.status}
                  onChangeText={(v) =>
                    setLeaveForm({ ...leaveForm, status: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>
                  Request Status (pending/approved/rejected)
                </Text>
                <TextInput
                  style={styles.input}
                  value={leaveForm.end_request_status}
                  onChangeText={(v) =>
                    setLeaveForm({ ...leaveForm, end_request_status: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Requested End Date</Text>
                <TextInput
                  style={styles.input}
                  value={leaveForm.end_request_date}
                  onChangeText={(v) =>
                    setLeaveForm({ ...leaveForm, end_request_date: v })
                  }
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Reason</Text>
                <TextInput
                  style={[styles.input, { height: 80 }]}
                  multiline
                  value={leaveForm.end_request_reason}
                  onChangeText={(v) =>
                    setLeaveForm({ ...leaveForm, end_request_reason: v })
                  }
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setEditingLeave(null)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={saveLeave}
              >
                <Text style={styles.primaryButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  createBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
