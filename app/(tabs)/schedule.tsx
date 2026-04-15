import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Platform,
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
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

// Default landlord slots
const TIME_SLOT_CONFIG: any = {
  am1: {
    label: "AM 1",
    time: "8:30 - 10:00 AM",
    start: "08:30",
    end: "10:00",
    icon: "sunny-outline",
    color: "#f59e0b",
  },
  am2: {
    label: "AM 2",
    time: "10:00 - 11:30 AM",
    start: "10:00",
    end: "11:30",
    icon: "sunny",
    color: "#f97316",
  },
  pm1: {
    label: "PM 1",
    time: "1:00 - 2:30 PM",
    start: "13:00",
    end: "14:30",
    icon: "partly-sunny-outline",
    color: "#6366f1",
  },
  pm2: {
    label: "PM 2",
    time: "2:30 - 4:00 PM",
    start: "14:30",
    end: "16:00",
    icon: "moon-outline",
    color: "#8b5cf6",
  },
};

const SLOT_KEYS = ["am1", "am2", "pm1", "pm2"];
const AM_COLORS = ["#f59e0b", "#f97316", "#f59e0b", "#ea580c", "#d97706"];
const PM_COLORS = ["#6366f1", "#8b5cf6", "#4f46e5", "#7c3aed", "#4338ca"];

const parseTimeValue = (value: string) => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return { hour: h, minute: m, total: h * 60 + m };
};

const to12h = (value: string) => {
  const parsed = parseTimeValue(value);
  if (!parsed) return value;
  const hour12 = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  const suffix = parsed.hour < 12 ? "AM" : "PM";
  return `${hour12}:${String(parsed.minute).padStart(2, "0")} ${suffix}`;
};

const parse12hTimeValue = (value: string) => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const hour12 = Number(match[1]);
  const minute = Number(match[2]);
  const period = String(match[3]).toUpperCase();

  if (!Number.isInteger(hour12) || !Number.isInteger(minute)) return null;
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;

  let hour24 = hour12 % 12;
  if (period === "PM") hour24 += 12;

  return { hour: hour24, minute, total: hour24 * 60 + minute };
};

const to24hString = (hour: number, minute: number) => {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const formatDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseDateKey = (dateKey: string) => {
  const match = String(dateKey || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, monthIndex, day);
};

const isPastDateKey = (dateKey: string) => {
  const date = parseDateKey(dateKey);
  if (!date) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date < today;
};

const getNowTotalMinutesForDateKey = (dateKey: string) => {
  const date = parseDateKey(dateKey);
  if (!date) return null;

  const today = new Date();
  if (
    date.getFullYear() !== today.getFullYear() ||
    date.getMonth() !== today.getMonth() ||
    date.getDate() !== today.getDate()
  ) {
    return null;
  }

  return today.getHours() * 60 + today.getMinutes();
};

const rangesOverlap = (startA: Date, endA: Date, startB: Date, endB: Date) => {
  return startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();
};

const formatRangeLabel = (start: Date, end: Date) => {
  return `${start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} ${start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} - ${end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}`;
};

export default function Schedule() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  // -- State --
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDateSlots, setSelectedDateSlots] = useState<{
    [key: string]: string[];
  }>({}); // dateStr -> array of slot types
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchDate, setSearchDate] = useState("");
  const [customDate, setCustomDate] = useState(formatDateKey(new Date()));
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [customStartTime, setCustomStartTime] = useState("");
  const [customEndTime, setCustomEndTime] = useState("");
  const [submittingCustomSchedule, setSubmittingCustomSchedule] =
    useState(false);

  const slotConfig = TIME_SLOT_CONFIG;
  const slotKeys = SLOT_KEYS;

  useEffect(() => {
    loadSession();
  }, []);

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

    if (profile?.role !== "landlord") {
      Alert.alert("Access Denied", "Only landlords can manage schedules.");
      router.back();
      return;
    }

    loadTimeSlots(session.user.id);
  };

  const loadTimeSlots = async (userId: string) => {
    const { data, error } = await supabase
      .from("available_time_slots")
      .select("*")
      .eq("landlord_id", userId)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    if (error) Alert.alert("Error", error.message);
    else setTimeSlots(data || []);
    setLoading(false);
  };

  // --- LOGIC ---

  const getNextDays = (count = 60) => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < count; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const toggleActiveDate = (dateStr: string) => {
    if (isPastDateKey(dateStr)) {
      return Alert.alert(
        "Invalid Date",
        "Past dates are not allowed for availability.",
      );
    }
    setActiveDate(activeDate === dateStr ? null : dateStr);
  };

  const toggleDateTimeSlot = (dateStr: string, slotType: string) => {
    if (isPastDateKey(dateStr)) {
      return Alert.alert(
        "Invalid Date",
        "Past dates are not allowed for availability.",
      );
    }

    const config = slotConfig[slotType];
    const date = parseDateKey(dateStr);
    const parsedStart = parseTimeValue(config?.start || "");
    const current = selectedDateSlots[dateStr] || [];
    const isSelecting = !current.includes(slotType);

    if (isSelecting && date && parsedStart) {
      const slotStart = new Date(date);
      slotStart.setHours(parsedStart.hour, parsedStart.minute, 0, 0);

      if (slotStart <= new Date()) {
        return Alert.alert(
          "Slot Unavailable",
          "You cannot select a time slot that has already passed.",
        );
      }
    }

    setSelectedDateSlots((prev) => {
      const current = prev[dateStr] || [];
      if (current.includes(slotType)) {
        const updated = current.filter((s) => s !== slotType);
        const newState = { ...prev };
        if (updated.length === 0) {
          delete newState[dateStr];
        } else {
          newState[dateStr] = updated;
        }
        return newState;
      } else {
        return { ...prev, [dateStr]: [...current, slotType] };
      }
    });
  };

  const addCustomSlotTemplate = async () => {
    const parsedStart = parse12hTimeValue(customStartTime);
    const parsedEnd = parse12hTimeValue(customEndTime);

    if (!parsedStart || !parsedEnd) {
      return Alert.alert(
        "Invalid Time",
        "Use 12-hour format h:mm AM/PM (e.g. 8:30 AM).",
      );
    }

    if (parsedEnd.total <= parsedStart.total) {
      return Alert.alert(
        "Invalid Range",
        "End time must be later than start time.",
      );
    }

    const date = parseDateKey(customDate);
    if (!date) {
      return Alert.alert("Invalid Date", "Use date format YYYY-MM-DD.");
    }

    if (isPastDateKey(customDate)) {
      return Alert.alert(
        "Slot Unavailable",
        "You cannot add a custom schedule on a past date.",
      );
    }

    const start = new Date(date);
    start.setHours(parsedStart.hour, parsedStart.minute, 0, 0);

    const end = new Date(date);
    end.setHours(parsedEnd.hour, parsedEnd.minute, 0, 0);

    if (start <= new Date()) {
      return Alert.alert(
        "Slot Unavailable",
        "You cannot add a custom schedule in the past.",
      );
    }

    const customOverlap = timeSlots.find((existing: any) => {
      const existingStart = new Date(existing.start_time);
      const existingEnd = new Date(existing.end_time);
      return rangesOverlap(start, end, existingStart, existingEnd);
    });

    if (customOverlap) {
      const overlapStart = new Date(customOverlap.start_time);
      const overlapEnd = new Date(customOverlap.end_time);
      return Alert.alert(
        "Schedule Conflict",
        `You cannot add this custom schedule because it overlaps with an existing slot: ${formatRangeLabel(overlapStart, overlapEnd)}.`,
      );
    }

    if (!session?.user?.id) return;

    setSubmittingCustomSchedule(true);

    const { error } = await supabase.from("available_time_slots").insert({
      property_id: null,
      landlord_id: session.user.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_booked: false,
    });

    setSubmittingCustomSchedule(false);

    if (error) {
      return Alert.alert("Error", error.message);
    }

    setCustomStartTime("");
    setCustomEndTime("");
    await loadTimeSlots(session.user.id);
    Alert.alert("Success", "Custom schedule added immediately.");
  };

  const selectAllDates = (slotType: string, filterFn: (d: Date) => boolean) => {
    const dates = getNextDays(60).filter(filterFn);
    const newState: any = { ...selectedDateSlots };
    dates.forEach((d) => {
      const dateStr = formatDateKey(d);
      const config = slotConfig[slotType];
      const parsedStart = parseTimeValue(config?.start || "");
      if (parsedStart) {
        const slotStart = new Date(d);
        slotStart.setHours(parsedStart.hour, parsedStart.minute, 0, 0);
        if (slotStart <= new Date()) {
          return;
        }
      }
      const current = newState[dateStr] || [];
      if (!current.includes(slotType)) {
        newState[dateStr] = [...current, slotType];
      }
    });
    setSelectedDateSlots(newState);
  };

  const getTotalSelectedSlots = () => {
    return Object.values(selectedDateSlots).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
  };

  const getCustomDateLabel = () => {
    const parsed = parseDateKey(customDate);
    if (!parsed) return "Select date";
    return parsed.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const openCustomTimePicker = (target: "start" | "end") => {
    if (Platform.OS !== "android") {
      Alert.alert(
        "Time Picker",
        "Custom time picker is currently optimized for Android.",
      );
      return;
    }

    const baseDate = parseDateKey(customDate) || new Date();
    const currentValue = target === "start" ? customStartTime : customEndTime;
    const parsedCurrent = parse12hTimeValue(currentValue);

    const initialValue = new Date(baseDate);
    if (parsedCurrent) {
      initialValue.setHours(parsedCurrent.hour, parsedCurrent.minute, 0, 0);
    } else {
      const now = new Date();
      initialValue.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }

    DateTimePickerAndroid.open({
      value: initialValue,
      mode: "time",
      is24Hour: false,
      onChange: (event, selectedDate) => {
        if (event.type !== "set" || !selectedDate) return;

        const selected12h = to12h(
          to24hString(selectedDate.getHours(), selectedDate.getMinutes()),
        );
        const selectedParsed = parse12hTimeValue(selected12h);
        if (!selectedParsed) return;

        const nowTotal = getNowTotalMinutesForDateKey(customDate);
        if (nowTotal !== null && selectedParsed.total <= nowTotal) {
          Alert.alert(
            "Slot Unavailable",
            "You cannot select a custom time that has already passed.",
          );
          return;
        }

        if (target === "start") {
          setCustomStartTime(selected12h);

          const currentEnd = parse12hTimeValue(customEndTime);
          if (currentEnd && currentEnd.total <= selectedParsed.total) {
            setCustomEndTime("");
          }
          return;
        }

        const startParsed = parse12hTimeValue(customStartTime);
        if (startParsed && selectedParsed.total <= startParsed.total) {
          Alert.alert(
            "Invalid Range",
            "End time must be later than start time.",
          );
          return;
        }

        setCustomEndTime(selected12h);
      },
    });
  };

  const addTimeSlots = async () => {
    const totalSlots = getTotalSelectedSlots();
    if (totalSlots === 0)
      return Alert.alert("Empty", "Select at least one time slot.");

    setSubmitting(true);
    const slotsToCreate = [];
    const conflicts: {
      start: Date;
      end: Date;
      existingStart: Date;
      existingEnd: Date;
    }[] = [];

    for (const dateStr of Object.keys(selectedDateSlots)) {
      if (isPastDateKey(dateStr)) continue;

      const slotTypes = selectedDateSlots[dateStr];
      if (!slotTypes || slotTypes.length === 0) continue;

      for (const type of slotTypes) {
        const config = slotConfig[type];
        if (!config) continue;

        const date = parseDateKey(dateStr);
        if (!date) continue;

        const [sH, sM] = config.start.split(":");
        const start = new Date(date);
        start.setHours(parseInt(sH), parseInt(sM), 0, 0);

        const [eH, eM] = config.end.split(":");
        const end = new Date(date);
        end.setHours(parseInt(eH), parseInt(eM), 0, 0);

        if (start < new Date()) continue;

        const overlap = timeSlots.find((existing: any) => {
          const existingStart = new Date(existing.start_time);
          const existingEnd = new Date(existing.end_time);
          return rangesOverlap(start, end, existingStart, existingEnd);
        });

        if (overlap) {
          conflicts.push({
            start,
            end,
            existingStart: new Date(overlap.start_time),
            existingEnd: new Date(overlap.end_time),
          });
          continue;
        }

        slotsToCreate.push({
          property_id: null,
          landlord_id: session.user.id,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          is_booked: false,
        });
      }
    }

    if (conflicts.length > 0) {
      setSubmitting(false);
      const first = conflicts[0];
      return Alert.alert(
        "Schedule Conflict",
        `Some selected schedules overlap with existing availability. Example conflict:\nNew: ${formatRangeLabel(first.start, first.end)}\nExisting: ${formatRangeLabel(first.existingStart, first.existingEnd)}\n\nPlease remove conflicting selections and try again.`,
      );
    }

    const { error } = await supabase
      .from("available_time_slots")
      .insert(slotsToCreate);

    setSubmitting(false);
    if (slotsToCreate.length === 0) {
      return Alert.alert(
        "No Valid Slots",
        "All selected schedules are already in the past. Please select future dates and times.",
      );
    }
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", `${slotsToCreate.length} slots added.`);
      setShowAddModal(false);
      setSelectedDateSlots({});
      loadTimeSlots(session.user.id);
    }
  };

  const deleteSlot = async (id: string) => {
    Alert.alert("Delete", "Remove this availability?", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("available_time_slots")
            .delete()
            .eq("id", id);
          if (!error) loadTimeSlots(session.user.id);
        },
      },
    ]);
  };

  // --- HELPERS ---
  const getSlotDisplay = (slot: any, daySlots: any[]) => {
    const startDate = new Date(slot.start_time);
    const endDate = new Date(slot.end_time);
    const isMorning = startDate.getHours() < 12;

    const periodSlots = [...(daySlots || [])]
      .filter((s: any) => {
        const h = new Date(s.start_time).getHours();
        return isMorning ? h < 12 : h >= 12;
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      );

    const periodIndex =
      periodSlots.findIndex((s: any) => String(s.id) === String(slot.id)) + 1;
    const safeIndex = Math.max(periodIndex, 1);
    const palette = isMorning ? AM_COLORS : PM_COLORS;
    const color = palette[(safeIndex - 1) % palette.length];

    return {
      label: `${isMorning ? "AM" : "PM"} ${safeIndex}`,
      time: `${startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })} - ${endDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`,
      icon: isMorning ? "sunny-outline" : "partly-sunny-outline",
      color,
    };
  };

  // Group time slots by date
  const getGroupedSlots = () => {
    const filtered = timeSlots.filter(
      (s) => !searchDate || s.start_time.includes(searchDate),
    );
    const groups: any = {};
    filtered.forEach((slot) => {
      const dateKey = new Date(slot.start_time).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(slot);
    });
    return groups;
  };

  // --- RENDER HELPERS ---

  const renderDateRow = ({ item }: { item: Date }) => {
    const dateStr = formatDateKey(item);
    const selected = selectedDateSlots[dateStr] || [];
    const isActive = activeDate === dateStr;
    const hasSelection = selected.length > 0;
    const todayKey = formatDateKey(new Date());
    const isToday = dateStr === todayKey;

    const dayName = item.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = item.getDate();
    const monthStr = item.toLocaleDateString("en-US", { month: "short" });
    const isWeekend = item.getDay() === 0 || item.getDay() === 6;

    return (
      <View style={{ marginHorizontal: 16, marginBottom: 6 }}>
        <TouchableOpacity
          style={[
            styles.dateRow,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
            },
            hasSelection && [
              styles.dateRowSelected,
              {
                borderColor: isDark ? "white" : "#111",
                backgroundColor: isDark ? colors.surface : "#fafafa",
              },
            ],
            isActive && [
              styles.dateRowActive,
              { borderColor: isDark ? "white" : "#111" },
            ],
          ]}
          onPress={() => toggleActiveDate(dateStr)}
          activeOpacity={0.8}
        >
          <View style={styles.dateRowLeft}>
            <View
              style={[
                styles.dateCalendarCard,
                {
                  backgroundColor: isDark ? colors.background : "#f8fafc",
                  borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                },
              ]}
            >
              <View
                style={[
                  styles.dateCalendarTop,
                  { backgroundColor: isDark ? colors.card : "#111827" },
                ]}
              >
                <Text
                  style={[
                    styles.dateCalendarMonth,
                    { color: isDark ? colors.text : "white" },
                  ]}
                >
                  {monthStr.toUpperCase()}
                </Text>
              </View>
              <Text
                style={[
                  styles.dateCalendarDay,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                {dayNum}
              </Text>
            </View>
            <View>
              <View style={styles.dateRowDayWrap}>
                <Text
                  style={[
                    styles.dateRowDay,
                    { color: isDark ? colors.text : "#111" },
                    isWeekend && { color: isDark ? "#fca5a5" : "#ef4444" },
                  ]}
                >
                  {dayName}, {monthStr} {dayNum}
                </Text>
                {isToday && (
                  <View
                    style={[
                      styles.todayBadge,
                      {
                        backgroundColor: isDark ? "white" : "#111",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.todayBadgeText,
                        { color: isDark ? "#111" : "white" },
                      ]}
                    >
                      TODAY
                    </Text>
                  </View>
                )}
              </View>
              {hasSelection ? (
                <View style={{ flexDirection: "row", gap: 4, marginTop: 3 }}>
                  {selected.map((s) => (
                    <View
                      key={s}
                      style={[
                        styles.slotChipMini,
                        { backgroundColor: slotConfig[s]?.color || "#9ca3af" },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "800",
                          color: "white",
                        }}
                      >
                        {slotConfig[s]?.label || "Slot"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text
                  style={[
                    styles.dateRowHint,
                    { color: isDark ? colors.textMuted : "#d1d5db" },
                  ]}
                >
                  Tap to select slots
                </Text>
              )}
            </View>
          </View>
          <Ionicons
            name={isActive ? "chevron-up" : "chevron-down"}
            size={18}
            color={
              hasSelection
                ? isDark
                  ? "white"
                  : "#111"
                : isDark
                  ? colors.textMuted
                  : "#d1d5db"
            }
          />
        </TouchableOpacity>

        {/* Expanded Slot Selection */}
        {isActive && (
          <View
            style={[
              styles.slotSelectionBox,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderColor: isDark ? colors.border : "#f3f4f6",
              },
            ]}
          >
            {slotKeys.map((key) => {
              const isSlotSelected = selected.includes(key);
              const config = slotConfig[key];
              if (!config) return null;
              const parsedStart = parseTimeValue(config.start);
              const slotDate = parseDateKey(dateStr);
              let isPastSlot = false;
              if (parsedStart && slotDate) {
                const slotStart = new Date(slotDate);
                slotStart.setHours(parsedStart.hour, parsedStart.minute, 0, 0);
                isPastSlot = slotStart <= new Date();
              }
              const slotBaseBackground = isDark
                ? config.color + "2b"
                : config.color + "18";
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => toggleDateTimeSlot(dateStr, key)}
                  disabled={isPastSlot}
                  style={[
                    styles.slotToggleBtn,
                    {
                      backgroundColor: slotBaseBackground,
                      borderColor: config.color + "66",
                    },
                    isSlotSelected && {
                      backgroundColor: config.color,
                      borderColor: config.color,
                    },
                    isPastSlot && styles.slotToggleDisabled,
                  ]}
                  activeOpacity={isPastSlot ? 1 : 0.7}
                >
                  <View
                    style={[
                      styles.slotToggleIcon,
                      {
                        backgroundColor: isPastSlot
                          ? isDark
                            ? "rgba(148,163,184,0.18)"
                            : "#e5e7eb"
                          : isSlotSelected
                            ? "rgba(255,255,255,0.25)"
                            : config.color + (isDark ? "25" : "15"),
                      },
                    ]}
                  >
                    <Ionicons
                      name={isSlotSelected ? "checkmark" : config.icon}
                      size={16}
                      color={
                        isPastSlot
                          ? isDark
                            ? "#94a3b8"
                            : "#9ca3af"
                          : isSlotSelected
                            ? "white"
                            : config.color
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.slotToggleLabel,
                        { color: isDark ? colors.text : "#111" },
                        isSlotSelected && { color: "white" },
                        isPastSlot && {
                          color: isDark ? colors.textMuted : "#9ca3af",
                        },
                      ]}
                    >
                      {config.label}
                    </Text>
                    <Text
                      style={[
                        styles.slotToggleTime,
                        { color: isDark ? colors.textMuted : "#9ca3af" },
                        isSlotSelected && { color: "rgba(255,255,255,0.7)" },
                        isPastSlot && {
                          color: isDark ? colors.textMuted : "#9ca3af",
                        },
                      ]}
                    >
                      {config.time}
                    </Text>
                  </View>
                  {isPastSlot && (
                    <View
                      style={[
                        styles.slotExpiredBadge,
                        {
                          backgroundColor: isDark ? "#334155" : "#e5e7eb",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotExpiredText,
                          { color: isDark ? "#cbd5e1" : "#6b7280" },
                        ]}
                      >
                        PASSED
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderSlotCard = (slot: any, daySlots: any[]) => {
    const date = new Date(slot.start_time);
    const slotInfo = getSlotDisplay(slot, daySlots);
    const endDate = new Date(slot.end_time);
    const startStr = date.toLocaleTimeString("en-US", {
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
      <View
        key={slot.id}
        style={[
          styles.slotCard,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderColor: isDark ? colors.cardBorder : "#f3f4f6",
          },
          slot.is_booked && [
            styles.slotBooked,
            {
              backgroundColor: isDark ? colors.surface : "#fafafa",
              borderColor: isDark ? colors.border : "#e5e7eb",
            },
          ],
        ]}
      >
        <View
          style={[
            styles.slotIconBox,
            { backgroundColor: slotInfo.color + (isDark ? "25" : "18") },
          ]}
        >
          <Ionicons
            name={slotInfo.icon as any}
            size={18}
            color={slotInfo.color}
          />
        </View>
        <View style={styles.slotInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={[
                styles.slotLabel,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              {slotInfo.label}
            </Text>
            {slot.is_booked && (
              <View
                style={[
                  styles.bookedBadge,
                  { backgroundColor: isDark ? "white" : "#111" },
                ]}
              >
                <Text
                  style={[
                    styles.bookedBadgeText,
                    { color: isDark ? "#111" : "white" },
                  ]}
                >
                  BOOKED
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.slotTime,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            {startStr} – {endStr}
          </Text>
        </View>
        {!slot.is_booked && (
          <TouchableOpacity
            onPress={() => deleteSlot(slot.id)}
            style={[
              styles.deleteBtn,
              { backgroundColor: isDark ? "#7f1d1d" : "#fef2f2" },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={16}
              color={isDark ? "#fca5a5" : "#ef4444"}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading)
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <ActivityIndicator color={isDark ? "white" : "black"} />
      </View>
    );

  const groupedSlots = getGroupedSlots();
  const groupKeys = Object.keys(groupedSlots);

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.surface : "white",
            borderBottomColor: isDark ? colors.border : "#f3f4f6",
          },
        ]}
      >
        <View>
          <Text
            style={[
              styles.headerTitle,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            Availability
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            Manage your viewing schedule
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addBtn,
            { backgroundColor: isDark ? "white" : "#111" },
          ]}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={18} color={isDark ? "#111" : "white"} />
          <Text
            style={[styles.addBtnText, { color: isDark ? "#111" : "white" }]}
          >
            Add Slots
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stats Row */}
      {/* <View
        style={[
          styles.statsRow,
          { backgroundColor: isDark ? colors.surface : "white" },
        ]}
      >
        <View
          style={[
            styles.statBox,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Text
            style={[styles.statNum, { color: isDark ? colors.text : "#111" }]}
          >
            {timeSlots.length}
          </Text>
          <Text
            style={[
              styles.statLabel,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            Total Slots
          </Text>
        </View>
        <View
          style={[
            styles.statBox,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Text style={[styles.statNum, { color: "#16a34a" }]}>
            {timeSlots.filter((s) => !s.is_booked).length}
          </Text>
          <Text
            style={[
              styles.statLabel,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            Available
          </Text>
        </View>
        <View
          style={[
            styles.statBox,
            {
              backgroundColor: isDark ? colors.card : "#f9fafb",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Text style={[styles.statNum, { color: "#f59e0b" }]}>
            {timeSlots.filter((s) => s.is_booked).length}
          </Text>
          <Text
            style={[
              styles.statLabel,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            Booked
          </Text>
        </View>
      </View> */}

      {/* Search Filter */}
      {timeSlots.length > 0 && (
        <View style={styles.filterContainer}>
          <View
            style={[
              styles.filterBar,
              {
                backgroundColor: isDark ? colors.card : "white",
                borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={isDark ? colors.textMuted : "#9ca3af"}
            />
            <TextInput
              placeholder="Search by date (YYYY-MM-DD)..."
              placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
              style={[
                styles.filterInput,
                { color: isDark ? colors.text : "#111" },
              ]}
              value={searchDate}
              onChangeText={setSearchDate}
            />
            {searchDate.length > 0 && (
              <TouchableOpacity onPress={() => setSearchDate("")}>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={isDark ? colors.textMuted : "#ccc"}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Main List - Grouped by Date */}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 130 }}>
        {groupKeys.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: isDark ? colors.card : "#f3f4f6" },
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={40}
                color={isDark ? colors.textMuted : "#d1d5db"}
              />
            </View>
            <Text
              style={[
                styles.emptyTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              No availability set
            </Text>
            <Text
              style={[
                styles.emptySub,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              Tap "Add Slots" to set your viewing times.
            </Text>
          </View>
        ) : (
          groupKeys.map((dateKey) => (
            <View key={dateKey} style={styles.dateGroup}>
              <View
                style={[
                  styles.dateGroupHeader,
                  { borderBottomColor: isDark ? colors.border : "#f3f4f6" },
                ]}
              >
                <Ionicons
                  name="calendar"
                  size={14}
                  color={isDark ? colors.textMuted : "#9ca3af"}
                />
                <Text
                  style={[
                    styles.dateGroupTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {dateKey}
                </Text>
                <Text
                  style={[
                    styles.dateGroupCount,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  {groupedSlots[dateKey].length} slot
                  {groupedSlots[dateKey].length > 1 ? "s" : ""}
                </Text>
              </View>
              {groupedSlots[dateKey].map((slot: any) =>
                renderSlotCard(slot, groupedSlots[dateKey]),
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* ADD MODAL - Redesigned */}
      <Modal visible={showAddModal} animationType="slide" transparent={true}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: isDark ? colors.background : "#f9fafb",
              height: "85%",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <View
              style={[
                styles.modalHeader,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderBottomColor: isDark ? colors.border : "#f3f4f6",
                },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <View
                  style={[
                    styles.modalHeaderIcon,
                    { backgroundColor: isDark ? colors.card : "#111827" },
                  ]}
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
                    Select Schedule
                  </Text>
                  <Text
                    style={[
                      styles.modalSubtitle,
                      { color: isDark ? colors.textMuted : "#9ca3af" },
                    ]}
                  >
                    Tap a date, then pick time slots
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={[
                  styles.modalCloseBtn,
                  { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                ]}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={isDark ? colors.textMuted : "#666"}
                />
              </TouchableOpacity>
            </View>

            {/* Time Slot Legend */}
            {/* <View
              style={[
                styles.legendRow,
                { backgroundColor: isDark ? colors.surface : "white" },
              ]}
            >
              {slotKeys.map((key) => {
                const config = slotConfig[key];
                if (!config) return null;
                return (
                  <View
                    key={key}
                    style={[
                      styles.legendItem,
                      { backgroundColor: isDark ? colors.card : "#fafafa" },
                    ]}
                  >
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: config.color },
                      ]}
                    />
                    <View>
                      <Text
                        style={[
                          styles.legendLabel,
                          { color: isDark ? colors.text : "#111" },
                        ]}
                      >
                        {config.label}
                      </Text>
                      <Text
                        style={[
                          styles.legendTime,
                          { color: isDark ? colors.textMuted : "#9ca3af" },
                        ]}
                      >
                        {config.time}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View> */}

            <View
              style={[
                styles.customBuilder,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderBottomColor: isDark ? colors.border : "#f3f4f6",
                },
              ]}
            >
              <Text
                style={[
                  styles.customBuilderTitle,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Add Custom AM/PM Slot
              </Text>
              <Text
                style={[
                  styles.customBuilderSub,
                  { color: isDark ? colors.textMuted : "#9ca3af" },
                ]}
              >
                Select date and enter 12-hour time (e.g. 8:30 AM)
              </Text>

              <View style={{ marginTop: 10 }}>
                <Text
                  style={[
                    styles.customTimeLabel,
                    { color: isDark ? colors.textMuted : "#6b7280" },
                  ]}
                >
                  Date
                </Text>
                <View
                  style={{
                    marginTop: 4,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setShowCustomDatePicker((prev) => !prev)}
                    style={[
                      styles.customDateTrigger,
                      {
                        backgroundColor: isDark ? colors.card : "#f9fafb",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={14}
                      color={isDark ? colors.textMuted : "#9ca3af"}
                      style={styles.customTimeIcon}
                    />
                    <Text
                      style={[
                        styles.customDateTriggerText,
                        {
                          color: parseDateKey(customDate)
                            ? isDark
                              ? colors.text
                              : "#111"
                            : isDark
                              ? colors.textMuted
                              : "#9ca3af",
                        },
                      ]}
                    >
                      {getCustomDateLabel()}
                    </Text>
                    <Ionicons
                      name={
                        showCustomDatePicker ? "chevron-up" : "chevron-down"
                      }
                      size={16}
                      color={isDark ? colors.textMuted : "#9ca3af"}
                    />
                  </TouchableOpacity>

                  {showCustomDatePicker && (
                    <View
                      style={[
                        styles.customCalendarWrap,
                        {
                          backgroundColor: isDark ? colors.card : "#fff",
                          borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                        },
                      ]}
                    >
                      <CalendarPicker
                        selectedDate={customDate}
                        onDateSelect={(date) => {
                          setCustomDate(date);
                          setShowCustomDatePicker(false);
                        }}
                      />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.customTimeRow}>
                <View style={styles.customTimeField}>
                  <Text
                    style={[
                      styles.customTimeLabel,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    Start
                  </Text>
                  <View
                    style={[
                      styles.customTimeInputWrap,
                      {
                        backgroundColor: isDark ? colors.card : "#f9fafb",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.customTimePickerPressable}
                      onPress={() => openCustomTimePicker("start")}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={isDark ? colors.textMuted : "#9ca3af"}
                        style={styles.customTimeIcon}
                      />
                      <Text
                        style={[
                          styles.customTimeValueText,
                          customStartTime
                            ? { color: isDark ? colors.text : "#111" }
                            : {
                                color: isDark ? colors.textMuted : "#9ca3af",
                              },
                        ]}
                      >
                        {customStartTime || "Tap to input start time"}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={isDark ? colors.textMuted : "#9ca3af"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.customTimeField}>
                  <Text
                    style={[
                      styles.customTimeLabel,
                      { color: isDark ? colors.textMuted : "#6b7280" },
                    ]}
                  >
                    End
                  </Text>
                  <View
                    style={[
                      styles.customTimeInputWrap,
                      {
                        backgroundColor: isDark ? colors.card : "#f9fafb",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.customTimePickerPressable}
                      onPress={() => openCustomTimePicker("end")}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={isDark ? colors.textMuted : "#9ca3af"}
                        style={styles.customTimeIcon}
                      />
                      <Text
                        style={[
                          styles.customTimeValueText,
                          customEndTime
                            ? { color: isDark ? colors.text : "#111" }
                            : {
                                color: isDark ? colors.textMuted : "#9ca3af",
                              },
                        ]}
                      >
                        {customEndTime || "Tap to input end time"}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={isDark ? colors.textMuted : "#9ca3af"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Text
                style={[
                  styles.customTimeHint,
                  { color: isDark ? colors.textMuted : "#9ca3af" },
                ]}
              >
                Use 12-hour format only. Example: 1:30 PM to 3:00 PM
              </Text>

              <TouchableOpacity
                style={[
                  styles.customAddBtn,
                  { backgroundColor: isDark ? "white" : "#111" },
                ]}
                onPress={addCustomSlotTemplate}
                disabled={submittingCustomSchedule}
              >
                {submittingCustomSchedule ? (
                  <ActivityIndicator
                    size="small"
                    color={isDark ? "#111" : "white"}
                  />
                ) : (
                  <>
                    <Ionicons
                      name="add-circle-outline"
                      size={16}
                      color={isDark ? "#111" : "white"}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "700",
                        color: isDark ? "#111" : "white",
                      }}
                    >
                      Add Scheduled
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Select Chips */}
            {/* <View
              style={{
                height: 56,
                backgroundColor: isDark ? colors.surface : "white",
                borderBottomWidth: 1,
                borderBottomColor: isDark ? colors.border : "#f3f4f6",
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  gap: 8,
                  alignItems: "center",
                  paddingVertical: 1,
                }}
              >
                {[
                  {
                    l: "Weekdays AM1",
                    type: "am1",
                    fn: (d: Date) => d.getDay() !== 0 && d.getDay() !== 6,
                  },
                  {
                    l: "Weekdays AM2",
                    type: "am2",
                    fn: (d: Date) => d.getDay() !== 0 && d.getDay() !== 6,
                  },
                  {
                    l: "Weekdays PM1",
                    type: "pm1",
                    fn: (d: Date) => d.getDay() !== 0 && d.getDay() !== 6,
                  },
                  {
                    l: "Weekdays PM2",
                    type: "pm2",
                    fn: (d: Date) => d.getDay() !== 0 && d.getDay() !== 6,
                  },
                  { l: "Clear All", type: "clear", fn: () => true },
                ].map((opt, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isDark ? colors.card : "white",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                      opt.type === "clear" && [
                        styles.chipClear,
                        {
                          borderColor: isDark ? "#b91c1c" : "#fecaca",
                          backgroundColor: isDark ? "#7f1d1d" : "#fff5f5",
                        },
                      ],
                    ]}
                    onPress={() =>
                      opt.type === "clear"
                        ? setSelectedDateSlots({})
                        : selectAllDates(opt.type, opt.fn)
                    }
                  >
                    {opt.type !== "clear" && (
                      <View
                        style={[
                          styles.chipDot,
                          {
                            backgroundColor: slotConfig[opt.type]?.color,
                          },
                        ]}
                      />
                    )}
                    <Text
                      style={[
                        styles.chipText,
                        { color: isDark ? colors.text : "#333" },
                        opt.type === "clear" && {
                          color: isDark ? "#fca5a5" : "#ef4444",
                        },
                      ]}
                    >
                      {opt.l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View> */}

            {/* Date List */}
            <FlatList
              data={getNextDays(60)}
              keyExtractor={(item: Date) => formatDateKey(item)}
              renderItem={renderDateRow}
              contentContainerStyle={{ paddingBottom: 20, paddingTop: 8 }}
            />

            {/* Bottom Footer */}
            <View
              style={[
                styles.modalFooter,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderTopColor: isDark ? colors.border : "#f3f4f6",
                },
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.footerCount,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  {getTotalSelectedSlots()} time slots
                </Text>
                <Text
                  style={[
                    styles.footerSub,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  {Object.keys(selectedDateSlots).length} dates selected
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.confirmBtn,
                  { backgroundColor: isDark ? "white" : "#111" },
                  getTotalSelectedSlots() === 0 && { opacity: 0.4 },
                ]}
                onPress={addTimeSlots}
                disabled={submitting || getTotalSelectedSlots() === 0}
              >
                {submitting ? (
                  <ActivityIndicator
                    color={isDark ? "black" : "white"}
                    size="small"
                  />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={isDark ? "#111" : "white"}
                    />
                    <Text
                      style={[
                        styles.confirmBtnText,
                        { color: isDark ? "#111" : "white" },
                      ]}
                    >
                      Confirm Slots
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <BlockingLoader
        visible={submitting || submittingCustomSchedule}
        isDark={isDark}
        surfaceColor={isDark ? colors.surface : "white"}
        borderColor={isDark ? colors.cardBorder : "#e5e7eb"}
        textColor={isDark ? colors.text : "#111"}
        message="Please wait, we are saving your schedule. Please do not close this app."
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#111" },
  headerSub: { fontSize: 13, color: "#9ca3af", marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    gap: 6,
  },
  addBtnText: { color: "white", fontWeight: "700", fontSize: 13 },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
    backgroundColor: "white",
  },
  statBox: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  statNum: { fontSize: 24, fontWeight: "900", color: "#111" },
  statLabel: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600",
    marginTop: 2,
  },

  // Filter
  filterContainer: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
  },
  filterInput: { flex: 1, fontSize: 14, color: "#111" },

  // Date Groups
  dateGroup: { marginBottom: 16 },
  dateGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  dateGroupTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: "#111" },
  dateGroupCount: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },

  // Slot Cards
  slotCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    gap: 12,
  },
  slotBooked: { backgroundColor: "#fafafa", borderColor: "#e5e7eb" },
  slotIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  slotInfo: { flex: 1 },
  slotLabel: { fontSize: 14, fontWeight: "700", color: "#111" },
  slotTime: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  bookedBadge: {
    backgroundColor: "#111",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bookedBadgeText: { color: "white", fontSize: 9, fontWeight: "bold" },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty
  emptyContainer: { alignItems: "center", paddingTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  emptySub: { fontSize: 13, color: "#9ca3af", marginTop: 4 },

  // Date Row Styles (replaces old grid)
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },
  dateRowSelected: { borderColor: "#111", backgroundColor: "#fafafa" },
  dateRowActive: { borderColor: "#111", borderWidth: 2 },
  dateRowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  dateCalendarCard: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    overflow: "hidden",
  },
  dateCalendarTop: {
    width: "100%",
    paddingTop: 2,
    paddingBottom: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dateCalendarMonth: {
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  dateCalendarDay: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#111",
    lineHeight: 19,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  dateRowDayWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateRowDay: { fontSize: 14, fontWeight: "700", color: "#111" },
  todayBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  dateRowHint: { fontSize: 11, color: "#d1d5db", marginTop: 2 },
  slotChipMini: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },

  slotSelectionBox: {
    backgroundColor: "white",
    borderRadius: 14,
    marginTop: 4,
    padding: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  slotToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
    gap: 12,
  },
  slotToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  slotToggleLabel: { fontSize: 13, fontWeight: "700", color: "#111" },
  slotToggleTime: { fontSize: 11, color: "#9ca3af", marginTop: 1 },
  slotToggleDisabled: {
    opacity: 0.55,
  },
  slotExpiredBadge: {
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  slotExpiredText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: "#f9fafb" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  modalSubtitle: { fontSize: 12, color: "#9ca3af" },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },

  // Legend
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    gap: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "48%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#fafafa",
    borderRadius: 10,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, fontWeight: "700", color: "#111" },
  legendTime: { fontSize: 9, color: "#9ca3af" },

  customBuilder: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  customBuilderTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  customBuilderSub: {
    fontSize: 11,
    marginTop: 2,
  },
  customTimeRow: {
    flexDirection: "row",
    gap: 8,
  },
  customTimeField: {
    flex: 1,
  },
  customTimeLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 5,
  },
  customDateTrigger: {
    height: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  customDateTriggerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  customCalendarWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  customTimeInputWrap: {
    height: 42,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  customTimePickerPressable: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
  },
  customTimeIcon: {
    marginRight: 6,
  },
  customTimeValueText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  customTimeHint: {
    fontSize: 10,
    marginTop: 6,
    marginBottom: 2,
  },
  customAddBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
  },

  // Quick select
  quickSelectRow: {
    paddingVertical: 10,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
    gap: 6,
  },
  chipClear: { borderColor: "#fecaca", backgroundColor: "#fff5f5" },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipText: { fontSize: 12, fontWeight: "700", color: "#333" },

  // Footer
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 30,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  footerCount: { fontSize: 16, fontWeight: "800", color: "#111" },
  footerSub: { fontSize: 11, color: "#9ca3af" },
  confirmBtn: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    gap: 8,
  },
  confirmBtnText: { color: "white", fontWeight: "700", fontSize: 14 },
});
