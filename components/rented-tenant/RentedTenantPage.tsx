import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export default function RentedTenantPage() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark, colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [occupancy, setOccupancy] = useState<any>(null);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [rentPaymentHistory, setRentPaymentHistory] = useState<any[]>([]);

  const [rentPrice, setRentPrice] = useState("");
  const [wifiDueDay, setWifiDueDay] = useState("");
  const [waterDueDay, setWaterDueDay] = useState("");
  const [electricityDueDay, setElectricityDueDay] = useState("");
  const [lateFee, setLateFee] = useState("");
  const [showWifiPicker, setShowWifiPicker] = useState(false);
  const [showWaterPicker, setShowWaterPicker] = useState(false);
  const [showElecPicker, setShowElecPicker] = useState(false);

  const isRentLikeBill = (bill: any) => {
    if (!bill) return false;

    const rentAmount = Number(bill.rent_amount || 0);
    if (rentAmount > 0) return true;

    if (bill.is_advance_payment || bill.is_move_in_payment) {
      return true;
    }

    const text = String(bill.bills_description || "").toLowerCase();
    return text.includes("rent") || text.includes("house");
  };

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        router.replace("/");
        return;
      }

      const { data: occ, error: occError } = await supabase
        .from("tenant_occupancies")
        .select(
          "id, property_id, tenant_id, landlord_id, wifi_due_day, water_due_day, electricity_due_day, late_payment_fee, property:properties(id, title, price, amenities), tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, email, phone, avatar_url)",
        )
        .eq("id", id)
        .eq("landlord_id", session.user.id)
        .single();

      if (occError || !occ) {
        Alert.alert("Not found", "Rented tenant details not found.");
        router.back();
        return;
      }

      const normalizedOcc = {
        ...occ,
        property: Array.isArray(occ.property) ? occ.property[0] : occ.property,
        tenant: Array.isArray(occ.tenant) ? occ.tenant[0] : occ.tenant,
      };

      setOccupancy(normalizedOcc);
      setRentPrice(String(normalizedOcc?.property?.price ?? ""));
      setWifiDueDay(
        normalizedOcc?.wifi_due_day ? String(normalizedOcc.wifi_due_day) : "",
      );
      setWaterDueDay(
        normalizedOcc?.water_due_day ? String(normalizedOcc.water_due_day) : "",
      );
      setElectricityDueDay(
        normalizedOcc?.electricity_due_day
          ? String(normalizedOcc.electricity_due_day)
          : "",
      );
      setLateFee(
        normalizedOcc?.late_payment_fee
          ? String(normalizedOcc.late_payment_fee)
          : "",
      );

      const { data: fm, error: fmError } = await supabase
        .from("family_members")
        .select("*")
        .eq("parent_occupancy_id", normalizedOcc.id);
      if (fmError) throw fmError;

      const memberIds = (fm || []).map((m: any) => m.member_id);
      if (memberIds.length === 0) {
        setFamilyMembers([]);
      } else {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", memberIds);
        if (profilesError) throw profilesError;

        const merged = (profiles || []).map((p: any) => {
          const relation = fm?.find((f: any) => f.member_id === p.id);
          const isInactive =
            relation?.active === false ||
            relation?.is_active === false ||
            relation?.status === "removed";
          return {
            ...p,
            active: !isInactive,
          };
        });

        setFamilyMembers(merged);
      }

      const { data: paidBills, error: paidBillsError } = await supabase
        .from("payment_requests")
        .select(
          "due_date, rent_amount, advance_amount, is_move_in_payment, is_advance_payment, status, occupancy_id, property_id, bills_description",
        )
        .eq("tenant", normalizedOcc.tenant_id)
        .in("status", ["paid", "pending_confirmation", "recorded"])
        .order("due_date", { ascending: true });

      if (paidBillsError) throw paidBillsError;

      const filteredRentHistory = (paidBills || [])
        .filter((bill: any) => {
          if (bill.occupancy_id && bill.occupancy_id !== normalizedOcc.id) {
            return false;
          }
          if (bill.occupancy_id === normalizedOcc.id) return true;
          if (
            !bill.occupancy_id &&
            bill.property_id === normalizedOcc.property_id
          ) {
            return true;
          }
          return false;
        })
        .filter((bill: any) => isRentLikeBill(bill));

      setRentPaymentHistory(filteredRentHistory);
    } catch (e: any) {
      Alert.alert(
        "Error",
        e?.message || "Failed to load rented tenant details.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveChanges = async () => {
    if (!occupancy) return;

    const parsedRent = Number(rentPrice);
    const parsedWifiDay = wifiDueDay ? Number(wifiDueDay) : null;
    const parsedWaterDay = waterDueDay ? Number(waterDueDay) : null;
    const parsedElectricityDay = electricityDueDay
      ? Number(electricityDueDay)
      : null;
    const parsedLateFee = lateFee ? Number(lateFee) : 0;

    if (!Number.isFinite(parsedRent) || parsedRent < 0) {
      Alert.alert("Invalid Value", "Rent price must be a valid number.");
      return;
    }
    if (
      parsedWifiDay !== null &&
      (!Number.isInteger(parsedWifiDay) ||
        parsedWifiDay < 1 ||
        parsedWifiDay > 31)
    ) {
      Alert.alert("Invalid Value", "Wifi due day must be from 1 to 31.");
      return;
    }
    if (
      parsedWaterDay !== null &&
      (!Number.isInteger(parsedWaterDay) ||
        parsedWaterDay < 1 ||
        parsedWaterDay > 31)
    ) {
      Alert.alert("Invalid Value", "Water due day must be from 1 to 31.");
      return;
    }
    if (
      parsedElectricityDay !== null &&
      (!Number.isInteger(parsedElectricityDay) ||
        parsedElectricityDay < 1 ||
        parsedElectricityDay > 31)
    ) {
      Alert.alert("Invalid Value", "Electricity due day must be from 1 to 31.");
      return;
    }
    if (!Number.isFinite(parsedLateFee) || parsedLateFee < 0) {
      Alert.alert("Invalid Value", "Late fee must be a valid number.");
      return;
    }

    setSaving(true);
    try {
      const { error: propertyError } = await supabase
        .from("properties")
        .update({ price: parsedRent })
        .eq("id", occupancy.property_id);
      if (propertyError) throw propertyError;

      const { error: occupancyError } = await supabase
        .from("tenant_occupancies")
        .update({
          wifi_due_day: parsedWifiDay,
          water_due_day: parsedWaterDay,
          electricity_due_day: parsedElectricityDay,
          late_payment_fee: parsedLateFee,
        })
        .eq("id", occupancy.id);
      if (occupancyError) throw occupancyError;

      Alert.alert("Saved", "Property details updated successfully.");
      loadData();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to save property details.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? colors.text : "#111"} />
      </View>
    );
  }

  if (!occupancy) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <Text style={{ color: isDark ? colors.textMuted : "#666" }}>
          No data available.
        </Text>
      </View>
    );
  }

  const propertyAmenities = Array.isArray(occupancy.property?.amenities)
    ? occupancy.property.amenities
    : [];
  const isInternetAvailable =
    propertyAmenities.includes("Free WiFi") ||
    propertyAmenities.includes("Paid WiFi");

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
      contentContainerStyle={{ padding: 16, paddingBottom: 36 }}
    >
      <Text
        style={[
          styles.label,
          { color: isDark ? colors.textMuted : "#999", marginTop: 30 },
        ]}
      >
        RENTED TENANT
      </Text>
      <Text style={[styles.title, { color: isDark ? colors.text : "#111" }]}>
        {occupancy.tenant?.first_name} {occupancy.tenant?.last_name}
      </Text>

      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.surface : "white",
            borderColor: isDark ? colors.cardBorder : "#e5e7eb",
          },
        ]}
      >
        <View style={styles.tenantRow}>
          {occupancy.tenant?.avatar_url ? (
            <Image
              source={{ uri: occupancy.tenant.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View
              style={[
                styles.avatarFallback,
                { backgroundColor: isDark ? colors.card : "#e5e7eb" },
              ]}
            >
              <Ionicons
                name="person"
                size={24}
                color={isDark ? colors.textMuted : "#999"}
              />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.tenantName,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              {occupancy.tenant?.first_name} {occupancy.tenant?.last_name}
            </Text>
            <Text
              style={[
                styles.subText,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              {occupancy.tenant?.email || "No email"}
            </Text>
            <Text
              style={[
                styles.subText,
                { color: isDark ? colors.textMuted : "#999" },
              ]}
            >
              {occupancy.tenant?.phone || "No phone provided"}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.sectionLabel,
            { color: isDark ? colors.textMuted : "#999" },
          ]}
        >
          RENTED UNIT
        </Text>
        <Text
          style={[styles.valueText, { color: isDark ? colors.text : "#111" }]}
        >
          {occupancy.property?.title || "Unknown unit"}
        </Text>

        <Text
          style={[
            styles.sectionLabel,
            { color: isDark ? colors.textMuted : "#999", marginTop: 16 },
          ]}
        >
          RENT PRICE
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              color: isDark ? colors.text : "#000",
            },
          ]}
          value={rentPrice}
          onChangeText={setRentPrice}
          keyboardType="numeric"
          placeholder="Enter rent"
          placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
        />

        <Text
          style={[
            styles.sectionLabel,
            { color: isDark ? colors.textMuted : "#999", marginTop: 16 },
          ]}
        >
          UTILITY DUE DATE SCHEDULE
        </Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <Text
            style={[
              styles.fieldLabel,
              { color: isDark ? colors.text : "#111", marginTop: 0 },
            ]}
          >
            Internet Due Day
          </Text>
          {wifiDueDay ? (
            <TouchableOpacity onPress={() => setWifiDueDay("")}>
              <Text
                style={{ color: "#ef4444", fontSize: 12, fontWeight: "600" }}
              >
                {isInternetAvailable ? "Clear" : "Mark N/A"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[
            styles.input,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            },
          ]}
          onPress={() => {
            const current = new Date();
            if (wifiDueDay) current.setDate(parseInt(wifiDueDay));
            if (Platform.OS === "android") {
              DateTimePickerAndroid.open({
                value: current,
                mode: "date",
                onChange: (event: any, selected?: Date) => {
                  if (event?.type !== "set" || !selected) return;
                  setWifiDueDay(String(selected.getDate()));
                },
              });
            } else {
              setShowWifiPicker(true);
            }
          }}
        >
          <Text
            style={{
              color: wifiDueDay
                ? isDark
                  ? colors.text
                  : "#000"
                : isDark
                  ? colors.textMuted
                  : "#9ca3af",
              fontSize: 14,
            }}
          >
            {wifiDueDay
              ? `Day ${wifiDueDay} of every month`
              : isInternetAvailable
                ? "Tap to set date"
                : "N/A (Not Available) - Tap to set date"}
          </Text>
          <Ionicons
            name="calendar-outline"
            size={18}
            color={isDark ? colors.textMuted : "#6b7280"}
          />
        </TouchableOpacity>
        {Platform.OS === "ios" && showWifiPicker && (
          <DateTimePicker
            value={(() => {
              const d = new Date();
              if (wifiDueDay) d.setDate(parseInt(wifiDueDay));
              return d;
            })()}
            mode="date"
            display="inline"
            themeVariant={isDark ? "dark" : "light"}
            onChange={(_e: any, selected?: Date) => {
              if (selected) setWifiDueDay(String(selected.getDate()));
              setShowWifiPicker(false);
            }}
          />
        )}

        {occupancy.property?.amenities?.includes("Free Water") ? (
          <>
            <Text
              style={[
                styles.fieldLabel,
                { color: isDark ? colors.text : "#111", marginTop: 16 },
              ]}
            >
              Water Due Day
            </Text>
            <View
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.surface : "#f3f4f6",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  justifyContent: "center",
                },
              ]}
            >
              <Text
                style={{ color: "#10b981", fontSize: 14, fontWeight: "600" }}
              >
                Free (Included)
              </Text>
            </View>
          </>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
              }}
            >
              <Text
                style={[
                  styles.fieldLabel,
                  { color: isDark ? colors.text : "#111", marginTop: 0 },
                ]}
              >
                Water Due Day
              </Text>
              {waterDueDay ? (
                <TouchableOpacity onPress={() => setWaterDueDay("")}>
                  <Text
                    style={{
                      color: "#ef4444",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Clear
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
              ]}
              onPress={() => {
                const current = new Date();
                if (waterDueDay) current.setDate(parseInt(waterDueDay));
                if (Platform.OS === "android") {
                  DateTimePickerAndroid.open({
                    value: current,
                    mode: "date",
                    onChange: (event: any, selected?: Date) => {
                      if (event?.type !== "set" || !selected) return;
                      setWaterDueDay(String(selected.getDate()));
                    },
                  });
                } else {
                  setShowWaterPicker(true);
                }
              }}
            >
              <Text
                style={{
                  color: waterDueDay
                    ? isDark
                      ? colors.text
                      : "#000"
                    : isDark
                      ? colors.textMuted
                      : "#9ca3af",
                  fontSize: 14,
                }}
              >
                {waterDueDay
                  ? `Day ${waterDueDay} of every month`
                  : "Tap to set date"}
              </Text>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={isDark ? colors.textMuted : "#6b7280"}
              />
            </TouchableOpacity>
            {Platform.OS === "ios" && showWaterPicker && (
              <DateTimePicker
                value={(() => {
                  const d = new Date();
                  if (waterDueDay) d.setDate(parseInt(waterDueDay));
                  return d;
                })()}
                mode="date"
                display="inline"
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_e: any, selected?: Date) => {
                  if (selected) setWaterDueDay(String(selected.getDate()));
                  setShowWaterPicker(false);
                }}
              />
            )}
          </>
        )}

        {occupancy.property?.amenities?.includes("Free Electricity") ? (
          <>
            <Text
              style={[
                styles.fieldLabel,
                { color: isDark ? colors.text : "#111", marginTop: 16 },
              ]}
            >
              Electricity Due Day
            </Text>
            <View
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.surface : "#f3f4f6",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  justifyContent: "center",
                },
              ]}
            >
              <Text
                style={{ color: "#10b981", fontSize: 14, fontWeight: "600" }}
              >
                Free (Included)
              </Text>
            </View>
          </>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
              }}
            >
              <Text
                style={[
                  styles.fieldLabel,
                  { color: isDark ? colors.text : "#111", marginTop: 0 },
                ]}
              >
                Electricity Due Day
              </Text>
              {electricityDueDay ? (
                <TouchableOpacity onPress={() => setElectricityDueDay("")}>
                  <Text
                    style={{
                      color: "#ef4444",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    Clear
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.card : "#f9fafb",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
              ]}
              onPress={() => {
                const current = new Date();
                if (electricityDueDay)
                  current.setDate(parseInt(electricityDueDay));
                if (Platform.OS === "android") {
                  DateTimePickerAndroid.open({
                    value: current,
                    mode: "date",
                    onChange: (event: any, selected?: Date) => {
                      if (event?.type !== "set" || !selected) return;
                      setElectricityDueDay(String(selected.getDate()));
                    },
                  });
                } else {
                  setShowElecPicker(true);
                }
              }}
            >
              <Text
                style={{
                  color: electricityDueDay
                    ? isDark
                      ? colors.text
                      : "#000"
                    : isDark
                      ? colors.textMuted
                      : "#9ca3af",
                  fontSize: 14,
                }}
              >
                {electricityDueDay
                  ? `Day ${electricityDueDay} of every month`
                  : "Tap to set date"}
              </Text>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={isDark ? colors.textMuted : "#6b7280"}
              />
            </TouchableOpacity>
            {Platform.OS === "ios" && showElecPicker && (
              <DateTimePicker
                value={(() => {
                  const d = new Date();
                  if (electricityDueDay) d.setDate(parseInt(electricityDueDay));
                  return d;
                })()}
                mode="date"
                display="inline"
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_e: any, selected?: Date) => {
                  if (selected)
                    setElectricityDueDay(String(selected.getDate()));
                  setShowElecPicker(false);
                }}
              />
            )}
          </>
        )}

        <Text
          style={[styles.fieldLabel, { color: isDark ? colors.text : "#111" }]}
        >
          Late Payment Fee
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              color: isDark ? colors.text : "#000",
            },
          ]}
          value={lateFee}
          onChangeText={setLateFee}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
        />

        <Text
          style={[
            styles.sectionLabel,
            { color: isDark ? colors.textMuted : "#999", marginTop: 18 },
          ]}
        >
          FAMILY MEMBERS ({familyMembers.length})
        </Text>
        <View
          style={[
            styles.familyBox,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
            },
          ]}
        >
          {familyMembers.length === 0 ? (
            <Text
              style={{
                color: isDark ? colors.textMuted : "#999",
                fontSize: 12,
              }}
            >
              No linked family members
            </Text>
          ) : (
            familyMembers.map((member: any, idx: number) => (
              <Text
                key={`${member.id}-${idx}`}
                style={{
                  color:
                    member.active === false
                      ? isDark
                        ? colors.textMuted
                        : "#999"
                      : isDark
                        ? colors.text
                        : "#111",
                  fontSize: 13,
                  marginBottom: 6,
                  textDecorationLine:
                    member.active === false ? "line-through" : "none",
                }}
              >
                - {member.first_name || "Member"} {member.last_name || ""}{" "}
                {member.active === false ? "(Inactive)" : "(Active)"}
              </Text>
            ))
          )}
        </View>

        <Text
          style={[
            styles.sectionLabel,
            { color: isDark ? colors.textMuted : "#999", marginTop: 18 },
          ]}
        >
          RENT PAYMENT HISTORY ({new Date().getFullYear()})
        </Text>
        <View
          style={[
            styles.familyBox,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
            },
          ]}
        >
          {(() => {
            const paidMonths = new Set<number>();
            const currentYear = new Date().getFullYear();

            rentPaymentHistory.forEach((p: any) => {
              const d = new Date(p.due_date);
              if (
                Number.isNaN(d.getTime()) ||
                d.getFullYear() !== currentYear
              ) {
                return;
              }

              const billMonth = d.getMonth();
              paidMonths.add(billMonth);

              const rent = parseFloat(p.rent_amount || 0);
              const advance = parseFloat(p.advance_amount || 0);
              if (rent > 0 && advance > 0) {
                const extraMonths = Math.floor(advance / rent);
                for (let m = 1; m <= extraMonths; m++) {
                  const coveredMonth = billMonth + m;
                  if (coveredMonth < 12) paidMonths.add(coveredMonth);
                }
              }
            });

            const months = [
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
              "Dec",
            ];

            return (
              <View style={styles.historyGrid}>
                {months.map((month, index) => {
                  const isPaid = paidMonths.has(index);
                  return (
                    <View key={month} style={styles.monthCell}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: isDark ? colors.text : "#111",
                        }}
                      >
                        {month}
                      </Text>
                      <View
                        style={[
                          styles.monthDot,
                          {
                            backgroundColor: isPaid
                              ? "#22c55e"
                              : isDark
                                ? colors.surface
                                : "#e5e7eb",
                          },
                        ]}
                      >
                        {isPaid ? (
                          <Ionicons name="checkmark" size={10} color="white" />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.btn,
              { backgroundColor: isDark ? colors.card : "#eee" },
            ]}
          >
            <Text
              style={{
                color: isDark ? colors.text : "#000",
                fontWeight: "600",
              }}
            >
              Back
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={saveChanges}
            disabled={saving}
            style={[
              styles.btn,
              { backgroundColor: "#111827", opacity: saving ? 0.6 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={{ color: "white", fontWeight: "700" }}>
                Save Changes
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 12 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  tenantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  avatar: { width: 56, height: 56, borderRadius: 10 },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tenantName: { fontSize: 16, fontWeight: "700" },
  subText: { fontSize: 12, marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: "700", marginBottom: 8 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  valueText: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  familyBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  historyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  monthCell: {
    width: "24%",
    alignItems: "center",
    gap: 5,
  },
  monthDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 30,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
});
