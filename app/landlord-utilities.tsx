import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

export default function LandlordUtilitiesPage() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [occupancies, setOccupancies] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [billingSchedule, setBillingSchedule] = useState<any[]>([]);

  // Reminder Settings
  const [reminderSettings, setReminderSettings] = useState({
    rent: true,
    internet: true,
    water: true,
    electricity: true,
  });
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // Edit Due Date State
  const [editingItem, setEditingItem] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  // Action State
  const [sendingBillId, setSendingBillId] = useState<string | null>(null);

  const loadData = async (userId: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      // 1. Load Profile for settings
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      
      setProfile(prof);
      const accepted = prof?.accepted_payments || {};
      const utils = accepted.utility_reminders || {};
      setReminderSettings({
        rent: utils.rent !== false,
        internet: utils.internet !== false,
        water: utils.water !== false,
        electricity: utils.electricity !== false,
      });

      // 2. Load Occupancies
      const { data: occs, error: occError } = await supabase
        .from("tenant_occupancies")
        .select(
          `*, tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name), property:properties(id, title, price)`
        )
        .eq("landlord_id", userId)
        .in("status", ["active", "pending_end"]);

      if (occError) throw occError;
      setOccupancies(occs || []);
      
      // 3. Load existing bills for Billed status
      const { data: billsData } = await supabase
        .from("payment_requests")
        .select(
          "id, occupancy_id, rent_amount, due_date, status",
        )
        .eq("landlord", userId);

      setBills(billsData || []);

      // 4. Calculate Billing Schedule
      calculateSchedule(occs || [], utils, billsData || []);

    } catch (err) {
      console.error("Failed to load utility data:", err);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateSchedule = (occs: any[], utils: any, bills: any[]) => {
    const getUpcomingDateForDay = (dayOfMonth: any) => {
      const safeDay = Math.max(1, Math.min(31, parseInt(dayOfMonth || 10, 10)));
      const today = new Date();
      const candidate = new Date(today.getFullYear(), today.getMonth(), safeDay);
      if (candidate < today) {
        candidate.setMonth(candidate.getMonth() + 1);
      }
      return candidate;
    };

    const schedule: any[] = [];
    occs.forEach((occ) => {
      const rentDueDay = occ.start_date ? new Date(occ.start_date).getDate() : 1;
      const utilityTypes = [
        { key: "rent", label: "Monthly Rent", dueDay: rentDueDay },
        { key: "internet", label: "Internet", dueDay: occ.wifi_due_day || 10 },
        { key: "water", label: "Water", dueDay: occ.water_due_day || 7 },
        {
          key: "electricity",
          label: "Electricity",
          dueDay: occ.electricity_due_day || 7,
        },
      ];

      utilityTypes.forEach((util) => {
        const nextDue = getUpcomingDateForDay(util.dueDay);
        const sendDate = new Date(nextDue);
        sendDate.setDate(sendDate.getDate() - 3);

        // Check if already billed for this month
        const hasBilled = bills.some((b: any) => {
          if (b.occupancy_id !== occ.id) return false;
          const bDate = new Date(b.due_date);
          const isSameMonth =
            bDate.getMonth() === nextDue.getMonth() &&
            bDate.getFullYear() === nextDue.getFullYear();

          if (util.key === "rent")
            return isSameMonth && Number(b.rent_amount) > 0;
          return false;
          return false;
        });

        schedule.push({
          id: `${occ.id}-${util.key}`,
          occupancyId: occ.id,
          tenantId: occ.tenant_id,
          tenantName: `${occ.tenant?.first_name} ${occ.tenant?.last_name}`,
          propertyTitle: occ.property?.title,
          propertyPrice: occ.property?.price,
          billType: util.key,
          billLabel: util.label,
          isEnabled: utils[util.key] !== false,
          nextDueDate: nextDue,
          sendDate: sendDate,
          status: hasBilled ? "Billed" : "Reminder Scheduled",
          hasBilled: hasBilled,
          startDate: occ.start_date,
        });
      });
    });

    schedule.sort((a: any, b: any) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
    setBillingSchedule(schedule);
  };

  const toggleReminder = async (key: string) => {
    if (!session?.user?.id || togglingKey) return;
    setTogglingKey(key);
    try {
      const currentAccepted = profile?.accepted_payments || {};
      const currentUtils = currentAccepted.utility_reminders || {};
      const nextValue = !(currentUtils[key] !== false);

      const updated = {
        ...currentAccepted,
        utility_reminders: {
          ...currentUtils,
          [key]: nextValue,
        },
      };

      const { error } = await supabase
        .from("profiles")
        .update({ accepted_payments: updated })
        .eq("id", session.user.id);

      if (error) throw error;
      
      setReminderSettings(prev => ({ ...prev, [key]: nextValue }));
      // Re-calculate schedule with new settings
      calculateSchedule(occupancies, updated.utility_reminders, bills);
    } catch (err) {
      Alert.alert("Error", "Failed to update setting");
    } finally {
      setTogglingKey(null);
    }
  };

  const handleEditDueDate = (item: any) => {
    setEditingItem(item);
    setTempDate(new Date(item.nextDueDate));
    setShowDatePicker(true);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate && editingItem) {
      saveDueDate(editingItem, selectedDate);
    }
  };

  const saveDueDate = async (item: any, selectedDate: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      Alert.alert("Error", "Please select a future date");
      return;
    }

    setLoading(true);
    try {
      const utilityDueDay = selectedDate.getDate();
      const updates: any = {};
      if (item.billType === "internet") updates.wifi_due_day = utilityDueDay;
      if (item.billType === "water") updates.water_due_day = utilityDueDay;
      if (item.billType === "electricity") updates.electricity_due_day = utilityDueDay;

      const { error } = await supabase
        .from("tenant_occupancies")
        .update(updates)
        .eq("id", item.occupancyId);

      if (error) throw error;
      
      Alert.alert("Success", "Due date updated");
      loadData(session.user.id, true);
    } catch (err) {
      Alert.alert("Error", "Failed to update due date");
    } finally {
      setLoading(false);
      setEditingItem(null);
    }
  };

  const sendNow = async (item: any) => {
    const sendKey = `${item.tenantId}-${item.billType}`;
    setSendingBillId(sendKey);
    try {
      const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const params = new URLSearchParams({
        tenantId: item.tenantId,
        billType: item.billType,
      });
      const headers = currentSession?.access_token
        ? { Authorization: `Bearer ${currentSession.access_token}` }
        : undefined;
      const res = await fetch(`${API_URL}/api/test-rent-reminder?${params.toString()}`, {
        headers,
      });
      const data = await res.json();
      
      if (res.ok) {
        Alert.alert("Success", data?.message || "Reminder sent successfully");
      } else {
        Alert.alert("Error", data.error || "Failed to send reminder");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to connect to server");
    } finally {
      setSendingBillId(null);
    }
  };

  const init = async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) {
      router.replace("/");
      return;
    }
    setSession(s);
    await loadData(s.user.id);
  };

  useEffect(() => {
    init();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session?.user?.id && !loading) {
        loadData(session.user.id, true);
      }
    }, [session, loading])
  );

  const onRefresh = () => {
    if (!session?.user?.id) return;
    setRefreshing(true);
    loadData(session.user.id, true);
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.center, { backgroundColor: isDark ? colors.background : "#f9fafb" }]}>
        <ActivityIndicator size="large" color={isDark ? colors.text : "#111"} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : "#f9fafb" }]} edges={["top"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: isDark ? colors.surface : "#f3f4f6" }]}
        >
          <Ionicons name="arrow-back" size={20} color={isDark ? colors.text : "#111"} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? colors.text : "#111" }]}>
          Billing Schedule
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 50 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Settings Section */}
        <Text style={[styles.sectionTitle, { color: isDark ? colors.text : "#111" }]}>Reminder Settings</Text>
        <View style={[styles.settingsCard, { backgroundColor: isDark ? colors.card : "white" }]}>
          {[
            { key: "rent", label: "Rent SMS/Email", icon: "cash-outline" },
            {
              key: "internet",
              label: "Internet SMS/Email",
              icon: "wifi-outline",
            },
            { key: "water", label: "Water SMS/Email", icon: "water-outline" },
            {
              key: "electricity",
              label: "Electricity SMS/Email",
              icon: "flash-outline",
            },
          ].map((setting) => (
            <View key={setting.key} style={[styles.settingRow, { borderBottomColor: isDark ? colors.border : "#f3f4f6" }]}>
              <View style={styles.settingInfo}>
                <Ionicons name={setting.icon as any} size={18} color={isDark ? colors.textMuted : "#6b7280"} />
                <Text style={[styles.settingLabel, { color: isDark ? colors.text : "#111" }]}>{setting.label}</Text>
              </View>
              <Switch
                value={(reminderSettings as any)[setting.key]}
                onValueChange={() => toggleReminder(setting.key)}
                disabled={togglingKey === setting.key}
                trackColor={{ false: "#d1d5db", true: "#10b981" }}
              />
            </View>
          ))}
        </View>

        {/* Schedule Section */}
        <Text
          style={[
            styles.sectionTitle,
            { color: isDark ? colors.text : "#111", marginTop: 24 },
          ]}
        >
          Billing Schedule
        </Text>
        <Text style={styles.subtitle}>View and manage upcoming reminders for your tenants.</Text>

        {billingSchedule.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={32} color="#9ca3af" />
            <Text style={styles.emptyText}>No upcoming billing reminders.</Text>
          </View>
        ) : (
          billingSchedule.map((item) => (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: isDark ? colors.card : "white" }]}>
              <View style={styles.itemHeader}>
                <View style={styles.tenantInfo}>
                  <Text style={[styles.tenantName, { color: isDark ? colors.text : "#111" }]}>{item.tenantName}</Text>
                  <Text style={styles.propTitle}>{item.propertyTitle}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: isDark ? "#1e293b" : "#f1f5f9" }]}>
                  <Text style={[styles.typeText, { color: isDark ? "#94a3b8" : "#475569" }]}>{item.billLabel}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>AUTO-SEND</Text>
                  <Text style={[styles.detailValue, { color: isDark ? colors.text : "#111" }]}>
                    {item.sendDate.toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>DUE DATE</Text>
                  <Text style={[styles.detailValue, { color: isDark ? colors.text : "#111" }]}>
                    {item.nextDueDate.toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.editBtn, { borderColor: isDark ? colors.border : "#e5e7eb" }]}
                  onPress={() => handleEditDueDate(item)}
                >
                  <Text style={[styles.editBtnText, { color: isDark ? colors.text : "#111" }]}>Edit Due Date</Text>
                </TouchableOpacity>
                
                {(() => {
                  const occStartDate = item.startDate ? new Date(item.startDate) : null;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (occStartDate) occStartDate.setHours(0, 0, 0, 0);
                  const hasStarted = !occStartDate || today >= occStartDate;

                  if (!hasStarted) {
                    return (
                      <View style={styles.startSoonBadge}>
                        <Text style={styles.startSoonText}>
                          Start on {new Date(item.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        styles.sendBtn,
                        (!item.isEnabled ||
                          item.hasBilled ||
                          sendingBillId === item.id) && {
                          backgroundColor: "#d1d5db",
                          borderColor: "#d1d5db",
                        },
                      ]}
                      disabled={
                        !item.isEnabled ||
                        item.hasBilled ||
                        sendingBillId === item.id
                      }
                      onPress={() => sendNow(item)}
                    >
                      {sendingBillId === item.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text
                          style={[
                            styles.sendBtnText,
                            item.hasBilled && { color: "#9ca3af" },
                          ]}
                        >
                          {item.hasBilled ? "Billed" : "Send Now"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </View>

              {!item.isEnabled && (
                <View style={styles.disabledBanner}>
                  <Ionicons name="alert-circle-outline" size={14} color="#f59e0b" />
                  <Text style={styles.disabledText}>Automated reminders for this utility are disabled.</Text>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 16,
    marginTop: -8,
  },
  settingsCard: {
    borderRadius: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    fontSize: 15,
    fontWeight: "800",
  },
  propTitle: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.05)",
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: "row",
    gap: 20,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontWeight: "700",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  editBtn: {
    backgroundColor: "transparent",
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sendBtn: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  sendBtnText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  startSoonBadge: {
    flex: 1,
    height: 40,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  startSoonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#2563eb",
  },
  disabledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    backgroundColor: "rgba(245, 158, 11, 0.05)",
    padding: 8,
    borderRadius: 8,
  },
  disabledText: {
    fontSize: 11,
    color: "#b45309",
    fontWeight: "500",
    flex: 1,
  },
  emptyBox: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d1d5db",
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "600",
  },
});
