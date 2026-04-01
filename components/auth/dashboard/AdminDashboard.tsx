import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from "../../../lib/supabase";

type AdminTab = "overview" | "users" | "properties" | "bookings" | "payments";

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
];
const PROPERTY_EDIT_FIELDS = [
  "title",
  "description",
  "building_no",
  "street",
  "address",
  "city",
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

const toNumber = (value: any) => {
  const casted = Number(value);
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allTimeRevenue, setAllTimeRevenue] = useState(0);

  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingProperty, setEditingProperty] = useState<any | null>(null);

  const [userSearch, setUserSearch] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");

  const [userForm, setUserForm] = useState<Record<string, string>>({});

  const [propertyForm, setPropertyForm] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAllData();
  }, []);

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
      revenue: allTimeRevenue,
    };
  }, [users, properties, bookings, payments, allTimeRevenue]);

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

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        usersRes,
        propsRes,
        bookingsRes,
        paymentsRes,
        paidRequestsRes,
        paymentsLedgerRes,
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
          .from("payment_requests")
          .select(
            "amount_paid, rent_amount, water_bill, electrical_bill, wifi_bill, other_bills, security_deposit_amount, advance_amount",
          )
          .eq("status", "paid"),
        supabase.from("payments").select("amount"),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (propsRes.error) throw propsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (paidRequestsRes.error) throw paidRequestsRes.error;
      if (paymentsLedgerRes.error) throw paymentsLedgerRes.error;

      const paidRequestsTotal = (paidRequestsRes.data || []).reduce(
        (sum, payment) => sum + paymentTotal(payment),
        0,
      );
      const paymentsLedgerTotal = (paymentsLedgerRes.data || []).reduce(
        (sum, payment: any) => sum + toNumber(payment?.amount),
        0,
      );

      setUsers(usersRes.data || []);
      setProperties(propsRes.data || []);
      setBookings(bookingsRes.data || []);
      setPayments(paymentsRes.data || []);
      setAllTimeRevenue(
        paidRequestsTotal > 0 ? paidRequestsTotal : paymentsLedgerTotal,
      );
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
    setUserForm(serializeEditableForm(user, USER_EDIT_FIELDS));
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

      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", editingUser.id);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((user) =>
          user.id === editingUser.id ? { ...user, ...payload } : user,
        ),
      );
      setEditingUser(null);
      Alert.alert("Saved", "User details updated.");
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to update user.");
    } finally {
      setSaving(false);
    }
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

      <View style={styles.revenueCard}>
        <Text style={styles.revenueLabel}>All-Time Payment Total</Text>
        <Text style={styles.revenueValue}>{formatCurrency(stats.revenue)}</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadAllData}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.refreshButtonText}>Reload Admin Data</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderUsers = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Users</Text>
      <TextInput
        style={styles.searchInput}
        value={userSearch}
        onChangeText={setUserSearch}
        placeholder="Search users"
        placeholderTextColor="#9ca3af"
      />
      {filteredUsers.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredUsers.map((user) => (
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
    </View>
  );

  const renderProperties = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Properties</Text>
      <TextInput
        style={styles.searchInput}
        value={propertySearch}
        onChangeText={setPropertySearch}
        placeholder="Search properties"
        placeholderTextColor="#9ca3af"
      />
      {filteredProperties.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredProperties.map((property) => (
        <View key={property.id} style={styles.listItem}>
          <View style={styles.itemMain}>
            <Text style={styles.itemTitle}>
              {property.title || "Untitled Property"}
            </Text>
            <Text style={styles.itemSubtitle}>
              {property.city || "Unknown City"} •{" "}
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
    </View>
  );

  const renderBookings = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Bookings</Text>
      <TextInput
        style={styles.searchInput}
        value={bookingSearch}
        onChangeText={setBookingSearch}
        placeholder="Search bookings"
        placeholderTextColor="#9ca3af"
      />
      {filteredBookings.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredBookings.map((booking) => {
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
    </View>
  );

  const renderPayments = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Payment Requests</Text>
      <TextInput
        style={styles.searchInput}
        value={paymentSearch}
        onChangeText={setPaymentSearch}
        placeholder="Search payments"
        placeholderTextColor="#9ca3af"
      />
      {filteredPayments.length === 0 && (
        <Text style={styles.emptyText}>Empty</Text>
      )}
      {filteredPayments.map((payment) => {
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
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => router.replace("/logout")}
        >
          <Ionicons name="log-out-outline" size={16} color="#fff" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contentWrap}>
        {activeTab === "overview" && renderOverview()}
        {activeTab === "users" && renderUsers()}
        {activeTab === "properties" && renderProperties()}
        {activeTab === "bookings" && renderBookings()}
        {activeTab === "payments" && renderPayments()}
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
            ] as AdminTab[]
          ).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab(tab)}
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

      <Modal visible={!!editingUser} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit User Details</Text>

            <ScrollView style={styles.modalFormScroll}>
              {Object.keys(userForm).map((field) => {
                const value = userForm[field] ?? "";
                const multiline = isMultilineField(field, value);
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
              {Object.keys(propertyForm).map((field) => {
                const value = propertyForm[field] ?? "";
                const multiline = isMultilineField(field, value);
                const numericKeyboard =
                  NUMERIC_FIELD_HINTS.has(field) ||
                  typeof editingProperty?.[field] === "number";
                return (
                  <View key={field} style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>{prettyLabel(field)}</Text>
                    <TextInput
                      style={[styles.input, multiline && styles.inputMultiline]}
                      value={value}
                      onChangeText={(nextValue) =>
                        setPropertyForm((prev) => ({
                          ...prev,
                          [field]: nextValue,
                        }))
                      }
                      placeholder={prettyLabel(field)}
                      keyboardType={numericKeyboard ? "numeric" : "default"}
                      multiline={multiline}
                      textAlignVertical={multiline ? "top" : "center"}
                    />
                  </View>
                );
              })}
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
