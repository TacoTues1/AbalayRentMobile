import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
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
import { supabase } from "../lib/supabase";

type AdminTab = "overview" | "users" | "properties" | "bookings" | "payments";

const toNumber = (value: any) => {
  const casted = Number(value);
  return Number.isFinite(casted) ? casted : 0;
};

const fullName = (user: any) =>
  `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
  user?.email ||
  "Unknown user";

const paymentTotal = (payment: any) => {
  const totalAmount = toNumber(payment?.total_amount);
  if (totalAmount > 0) return totalAmount;
  return (
    toNumber(payment?.rent_amount) +
    toNumber(payment?.water_bill) +
    toNumber(payment?.electrical_bill) +
    toNumber(payment?.other_bills)
  );
};

const formatCurrency = (value: number) => `PHP ${value.toLocaleString()}`;

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingProperty, setEditingProperty] = useState<any | null>(null);

  const [userForm, setUserForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    phone: "",
    role: "tenant",
  });

  const [propertyForm, setPropertyForm] = useState({
    title: "",
    city: "",
    address: "",
    price: "",
    status: "available",
    bedrooms: "1",
    bathrooms: "1",
  });

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
    const revenue = payments.reduce(
      (sum, payment) => sum + paymentTotal(payment),
      0,
    );
    return {
      users: users.length,
      properties: properties.length,
      bookings: bookings.length,
      payments: payments.length,
      revenue,
    };
  }, [users, properties, bookings, payments]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [usersRes, propsRes, bookingsRes, paymentsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, first_name, middle_name, last_name, email, phone, role, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("properties")
          .select(
            "id, title, city, address, price, status, bedrooms, bathrooms, landlord, created_at",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("bookings")
          .select("id, property_id, tenant, status, booking_date, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("payment_requests")
          .select(
            "id, property_id, tenant, landlord, status, due_date, total_amount, rent_amount, water_bill, electrical_bill, other_bills, created_at",
          )
          .order("created_at", { ascending: false }),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (propsRes.error) throw propsRes.error;
      if (bookingsRes.error) throw bookingsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      setUsers(usersRes.data || []);
      setProperties(propsRes.data || []);
      setBookings(bookingsRes.data || []);
      setPayments(paymentsRes.data || []);
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
    setUserForm({
      first_name: user.first_name || "",
      middle_name: user.middle_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      phone: user.phone || "",
      role: (user.role || "tenant").toLowerCase(),
    });
  };

  const openPropertyEditor = (property: any) => {
    setEditingProperty(property);
    setPropertyForm({
      title: property.title || "",
      city: property.city || "",
      address: property.address || "",
      price: String(property.price || 0),
      status: property.status || "available",
      bedrooms: String(property.bedrooms || 1),
      bathrooms: String(property.bathrooms || 1),
    });
  };

  const saveUser = async () => {
    if (!editingUser) return;
    if (!userForm.first_name.trim() || !userForm.last_name.trim()) {
      Alert.alert("Missing Fields", "First name and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        first_name: userForm.first_name.trim(),
        middle_name: userForm.middle_name.trim() || "N/A",
        last_name: userForm.last_name.trim(),
        email: userForm.email.trim() || null,
        phone: userForm.phone.trim() || null,
        role: userForm.role.toLowerCase(),
      };

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
    if (!propertyForm.title.trim() || !propertyForm.city.trim()) {
      Alert.alert("Missing Fields", "Property title and city are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: propertyForm.title.trim(),
        city: propertyForm.city.trim(),
        address: propertyForm.address.trim() || null,
        price: toNumber(propertyForm.price),
        status: propertyForm.status || "available",
        bedrooms: toNumber(propertyForm.bedrooms),
        bathrooms: toNumber(propertyForm.bathrooms),
      };

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
      {users.map((user) => (
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
      {properties.map((property) => (
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
    </View>
  );

  const renderBookings = () => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>All Bookings</Text>
      {bookings.map((booking) => {
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
      {payments.map((payment) => {
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
    <View style={styles.mainWrapper}>
      <View style={styles.topNav}>
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

      <ScrollView contentContainerStyle={styles.contentWrap}>
        {activeTab === "overview" && renderOverview()}
        {activeTab === "users" && renderUsers()}
        {activeTab === "properties" && renderProperties()}
        {activeTab === "bookings" && renderBookings()}
        {activeTab === "payments" && renderPayments()}
      </ScrollView>

      <Modal visible={!!editingUser} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit User Details</Text>

            <TextInput
              style={styles.input}
              value={userForm.first_name}
              onChangeText={(value) =>
                setUserForm((prev) => ({ ...prev, first_name: value }))
              }
              placeholder="First name"
            />
            <TextInput
              style={styles.input}
              value={userForm.middle_name}
              onChangeText={(value) =>
                setUserForm((prev) => ({ ...prev, middle_name: value }))
              }
              placeholder="Middle name"
            />
            <TextInput
              style={styles.input}
              value={userForm.last_name}
              onChangeText={(value) =>
                setUserForm((prev) => ({ ...prev, last_name: value }))
              }
              placeholder="Last name"
            />
            <TextInput
              style={styles.input}
              value={userForm.email}
              onChangeText={(value) =>
                setUserForm((prev) => ({ ...prev, email: value }))
              }
              placeholder="Email"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={userForm.phone}
              onChangeText={(value) =>
                setUserForm((prev) => ({ ...prev, phone: value }))
              }
              placeholder="Phone"
            />
            <TextInput
              style={styles.input}
              value={userForm.role}
              onChangeText={(value) =>
                setUserForm((prev) => ({ ...prev, role: value }))
              }
              placeholder="Role (admin, landlord, tenant)"
              autoCapitalize="none"
            />

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

            <TextInput
              style={styles.input}
              value={propertyForm.title}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, title: value }))
              }
              placeholder="Title"
            />
            <TextInput
              style={styles.input}
              value={propertyForm.city}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, city: value }))
              }
              placeholder="City"
            />
            <TextInput
              style={styles.input}
              value={propertyForm.address}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, address: value }))
              }
              placeholder="Address"
            />
            <TextInput
              style={styles.input}
              value={propertyForm.price}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, price: value }))
              }
              placeholder="Price"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={propertyForm.status}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, status: value }))
              }
              placeholder="Status"
            />
            <TextInput
              style={styles.input}
              value={propertyForm.bedrooms}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, bedrooms: value }))
              }
              placeholder="Bedrooms"
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              value={propertyForm.bathrooms}
              onChangeText={(value) =>
                setPropertyForm((prev) => ({ ...prev, bathrooms: value }))
              }
              placeholder="Bathrooms"
              keyboardType="numeric"
            />

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
  topNav: {
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: "#111827",
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
    paddingBottom: 40,
  },
  sectionWrap: {
    gap: 10,
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
