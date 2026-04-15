import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

const CHART_MONTH_COUNT = 6;

const monthShortLabel = (date: Date) =>
  date.toLocaleString("en-US", { month: "short" });

const monthKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

const getPaymentAmount = (payment: any) => {
  const rawAmount =
    payment?.amount_paid ??
    payment?.amount ??
    payment?.total_amount ??
    payment?.paid_amount ??
    0;
  const parsed = Number(rawAmount);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getPaymentDate = (payment: any) =>
  payment?.paid_at || payment?.created_at || payment?.updated_at || null;

type UserRole = "tenant" | "landlord";

export default function PaymentHistory() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [role, setRole] = useState<UserRole>("tenant");

  const loadHistory = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        const normalizedRole =
          String(profile?.role || "tenant").toLowerCase() === "landlord"
            ? "landlord"
            : "tenant";
        setRole(normalizedRole);

        const runHistoryQuery = async (
          field: "landlord" | "landlord_id" | "tenant" | "tenant_id",
        ) => {
          return await supabase
            .from("payments")
            .select(
              "*, properties(title), tenant:profiles!payments_tenant_fkey(first_name, last_name)",
            )
            .order("paid_at", { ascending: false })
            .eq(field, session.user.id);
        };

        let data: any[] | null = null;
        let error: any = null;

        if (normalizedRole === "landlord") {
          const primary = await runHistoryQuery("landlord");
          data = primary.data;
          error = primary.error;

          if (error) {
            const fallback = await runHistoryQuery("landlord_id");
            data = fallback.data;
            error = fallback.error;
          }
        } else {
          const primary = await runHistoryQuery("tenant");
          data = primary.data;
          error = primary.error;

          if (error) {
            const fallback = await runHistoryQuery("tenant_id");
            data = fallback.data;
            error = fallback.error;
          }
        }

        if (error) {
          console.log("Payment history load error:", error);
        }

        setPayments(data || []);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const totalPaid = useMemo(() => {
    return payments.reduce(
      (sum, payment) => sum + getPaymentAmount(payment),
      0,
    );
  }, [payments]);

  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    return payments.reduce((sum, payment) => {
      const paidDate = getPaymentDate(payment);
      if (!paidDate) return sum;
      const date = new Date(paidDate);
      if (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      ) {
        return sum + getPaymentAmount(payment);
      }
      return sum;
    }, 0);
  }, [payments]);

  const averagePayment = useMemo(() => {
    if (!payments.length) return 0;
    return totalPaid / payments.length;
  }, [payments, totalPaid]);

  const monthlySeries = useMemo(() => {
    const now = new Date();
    const months = [] as Array<{ key: string; label: string; total: number }>;

    for (let i = CHART_MONTH_COUNT - 1; i >= 0; i -= 1) {
      const pointDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: monthKey(pointDate),
        label: monthShortLabel(pointDate),
        total: 0,
      });
    }

    payments.forEach((payment) => {
      const paidDate = getPaymentDate(payment);
      if (!paidDate) return;
      const date = new Date(paidDate);
      const key = monthKey(date);
      const target = months.find((month) => month.key === key);
      if (!target) return;
      target.total += getPaymentAmount(payment);
    });

    return months;
  }, [payments]);

  const maxMonthlyValue = useMemo(() => {
    const max = Math.max(...monthlySeries.map((m) => m.total), 0);
    return max <= 0 ? 1 : max;
  }, [monthlySeries]);

  const renderItem = ({ item }: { item: any }) => {
    const amount = getPaymentAmount(item);
    const paidDate = getPaymentDate(item);
    const payerName =
      `${item?.tenant?.first_name || ""} ${item?.tenant?.last_name || ""}`.trim() ||
      "Tenant";
    const statusLabel = String(item?.status || "paid")
      .replace(/_/g, " ")
      .toUpperCase();
    const methodLabel = String(item?.payment_method || item?.method || "N/A")
      .replace(/_/g, " ")
      .toUpperCase();

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderColor: isDark ? colors.cardBorder : "#f1f5f9",
          },
        ]}
      >
        <View style={styles.row}>
          <Text
            style={[
              styles.propTitle,
              { color: isDark ? colors.text : "#0f172a" },
            ]}
          >
            {item?.properties?.title || "Unknown Property"}
          </Text>
          <Text style={[styles.amount, { color: "#166534" }]}>
            ₱{amount.toLocaleString()}
          </Text>
        </View>
        <View style={styles.row}>
          <Text
            style={[
              styles.meta,
              { color: isDark ? colors.textMuted : "#475569" },
            ]}
          >
            {role === "landlord" ? `Paid by ${payerName}` : "Payment recorded"}
          </Text>
          <Text
            style={[
              styles.date,
              { color: isDark ? colors.textMuted : "#64748b" },
            ]}
          >
            {paidDate ? new Date(paidDate).toLocaleDateString() : "-"}
          </Text>
        </View>
        <View
          style={[
            styles.footer,
            { borderTopColor: isDark ? colors.cardBorder : "#f1f5f9" },
          ]}
        >
          <View
            style={[
              styles.pill,
              { backgroundColor: isDark ? colors.surface : "#f1f5f9" },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                { color: isDark ? colors.text : "#334155" },
              ]}
            >
              {methodLabel}
            </Text>
          </View>
          <Text style={[styles.status, { color: "#166534" }]}>
            {statusLabel}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f8fafc" },
        ]}
      >
        <ActivityIndicator color={isDark ? colors.text : "#111"} />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f8fafc" },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderBottomColor: isDark ? colors.cardBorder : "#e2e8f0",
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 10 }}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={isDark ? colors.text : "#111"}
          />
        </TouchableOpacity>
        <View>
          <Text
            style={[styles.title, { color: isDark ? colors.text : "#0f172a" }]}
          >
            Payment History
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: isDark ? colors.textMuted : "#64748b" },
            ]}
          >
            All completed payments and trends
          </Text>
        </View>
      </View>

      <FlatList
        data={payments}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHistory(true)}
            tintColor={isDark ? colors.text : "#111"}
          />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: isDark ? colors.textMuted : "#64748b" },
                  ]}
                >
                  Total Completed
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: isDark ? colors.text : "#0f172a" },
                  ]}
                >
                  ₱{totalPaid.toLocaleString()}
                </Text>
              </View>
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: isDark ? colors.textMuted : "#64748b" },
                  ]}
                >
                  This Month
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: isDark ? colors.text : "#0f172a" },
                  ]}
                >
                  ₱{thisMonthTotal.toLocaleString()}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.kpiRow,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: isDark ? colors.textMuted : "#64748b" },
                  ]}
                >
                  Transactions
                </Text>
                <Text
                  style={[
                    styles.kpiValue,
                    { color: isDark ? colors.text : "#0f172a" },
                  ]}
                >
                  {payments.length}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.kpiLabel,
                    { color: isDark ? colors.textMuted : "#64748b" },
                  ]}
                >
                  Average Payment
                </Text>
                <Text
                  style={[
                    styles.kpiValue,
                    { color: isDark ? colors.text : "#0f172a" },
                  ]}
                >
                  ₱
                  {averagePayment.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.chartCard,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                },
              ]}
            >
              <Text
                style={[
                  styles.chartTitle,
                  { color: isDark ? colors.text : "#0f172a" },
                ]}
              >
                Last 6 Months
              </Text>
              <View style={styles.chartArea}>
                {monthlySeries.map((month) => {
                  const pct = (month.total / maxMonthlyValue) * 100;
                  const barHeight = month.total > 0 ? Math.max(pct, 8) : 4;
                  return (
                    <View key={month.key} style={styles.barSlot}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${barHeight}%`,
                            backgroundColor: isDark ? colors.accent : "#2563eb",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.barLabel,
                          { color: isDark ? colors.textMuted : "#64748b" },
                        ]}
                      >
                        {month.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text
            style={[
              styles.emptyText,
              { color: isDark ? colors.textMuted : "#64748b" },
            ]}
          >
            No payment history found.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  listContent: { padding: 14, paddingBottom: 32 },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  summaryValue: { fontSize: 20, fontWeight: "800" },
  kpiRow: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    marginBottom: 10,
  },
  kpiLabel: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  chartCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  chartTitle: { fontSize: 14, fontWeight: "800", marginBottom: 10 },
  chartArea: {
    height: 150,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  barSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  bar: {
    width: "60%",
    borderRadius: 999,
    minHeight: 4,
  },
  barLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
  },
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  propTitle: { fontWeight: "700", fontSize: 15, flex: 1, marginRight: 10 },
  amount: { fontWeight: "800", fontSize: 15 },
  meta: { fontSize: 13 },
  date: { fontSize: 12 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  pillText: { fontSize: 10, fontWeight: "700" },
  status: { fontSize: 10, fontWeight: "800" },
  emptyText: { textAlign: "center", marginTop: 48, fontWeight: "600" },
});
