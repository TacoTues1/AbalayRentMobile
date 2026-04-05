import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const FREE_FAMILY_SLOT_COUNT = 1;
const FAMILY_SLOT_PRICE_PHP = 50;
const MAX_FAMILY_SLOT_COUNT = 4;
const MAX_EXTRA_FAMILY_SLOT_COUNT = Math.max(
  0,
  MAX_FAMILY_SLOT_COUNT - FREE_FAMILY_SLOT_COUNT,
);
const SUBSCRIPTION_TABLE_CANDIDATES = [
  "subscribtion",
  "subscriptions",
  "subscription",
];
const SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES = [
  "subscribtion_payments",
  "subscription_payments",
  "subscribtion_payment",
  "subscription_payment",
];
const USER_COLUMN_CANDIDATES = [
  "user_id",
  "tenant_id",
  "landlord_id",
  "owner_id",
  "payer_id",
  "mother_id",
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
  "captured",
  "chargeable",
];
const PAYMONGO_CHECKOUT_METHODS = [
  "gcash",
  "paymaya",
  "card",
  "grab_pay",
  "dob",
  "qrph",
] as const;
const PENDING_FAMILY_SLOT_CHECKOUT_KEY = "pending_family_slot_checkout";
const CONFIRMED_FAMILY_SLOT_PURCHASES_KEY = "confirmed_family_slot_purchases";
const PAYMENT_REFERENCE_COLUMN_CANDIDATES = [
  "payment_id",
  "paymongo_payment_id",
  "reference_id",
  "transaction_id",
  "payment_reference",
];

const normalizePaidExtraSlotCount = (value: unknown) =>
  Math.min(
    MAX_EXTRA_FAMILY_SLOT_COUNT,
    Math.max(0, Math.floor(Number(value) || 0)),
  );

const getTotalFamilySlotCount = (paidExtra: unknown) =>
  Math.min(
    MAX_FAMILY_SLOT_COUNT,
    FREE_FAMILY_SLOT_COUNT + normalizePaidExtraSlotCount(paidExtra),
  );

function SkeletonBlock({
  width = "100%",
  height,
  borderRadius = 10,
  backgroundColor,
  style,
}: {
  width?: number | string;
  height: number;
  borderRadius?: number;
  backgroundColor: string;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor,
          opacity,
        },
        style,
      ]}
    />
  );
}

type SessionUser = {
  id: string;
};

const statuses = ["active", "pending_end", "approved", "signed"] as const;

const getApiBaseUrl = () => {
  const raw = (process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (!raw) return "";

  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (Platform.OS === "android" && normalized.includes("localhost")) {
    return normalized.replace("localhost", "10.0.2.2");
  }

  return normalized;
};

const resolveCheckoutSessionId = (payload: any) => {
  const candidates = [
    payload?.checkoutSessionId,
    payload?.checkout_session_id,
    payload?.sessionId,
    payload?.session_id,
    payload?.data?.checkoutSessionId,
    payload?.data?.checkout_session_id,
    payload?.data?.sessionId,
    payload?.data?.session_id,
    payload?.data?.id,
    payload?.id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }

  return "";
};

const resolvePaymongoPaymentId = (payload: any) => {
  const candidates = [
    payload?.paymentId,
    payload?.payment_id,
    payload?.paymongo_payment_id,
    payload?.data?.paymentId,
    payload?.data?.payment_id,
    payload?.data?.payment?.id,
    payload?.payment?.id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }

  return "";
};

const extractIdentifiersFromUrl = (url: string) => {
  const raw = String(url || "").trim();
  if (!raw) {
    return { checkoutSessionId: "", paymentId: "" };
  }

  const clean = raw.replace(/#.*$/, "");
  const queryIndex = clean.indexOf("?");
  const query = queryIndex >= 0 ? clean.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);

  const sessionCandidates = [
    params.get("sessionId"),
    params.get("session_id"),
    params.get("checkoutSessionId"),
    params.get("checkout_session_id"),
    params.get("checkout_id"),
  ];

  const paymentCandidates = [
    params.get("paymentId"),
    params.get("payment_id"),
    params.get("paymongo_payment_id"),
    params.get("reference_id"),
  ];

  const resolvedSession =
    sessionCandidates.map((v) => String(v || "").trim()).find(Boolean) || "";
  let resolvedPayment =
    paymentCandidates.map((v) => String(v || "").trim()).find(Boolean) || "";

  if (!resolvedPayment) {
    const inlinePayId = raw.match(/pay_[A-Za-z0-9]+/);
    if (inlinePayId?.[0]) {
      resolvedPayment = inlinePayId[0];
    }
  }

  return { checkoutSessionId: resolvedSession, paymentId: resolvedPayment };
};

const getQueryParam = (url: string, key: string) => {
  const raw = String(url || "").trim();
  if (!raw) return "";

  const clean = raw.replace(/#.*$/, "");
  const queryIndex = clean.indexOf("?");
  const query = queryIndex >= 0 ? clean.slice(queryIndex + 1) : "";
  const params = new URLSearchParams(query);
  return String(params.get(key) || "").trim();
};

const extractEdgeFunctionErrorMessage = async (error: any) => {
  const fallback = String(
    error?.message || "Edge Function returned a non-2xx status code",
  ).trim();
  const context = error?.context;
  if (!context) return fallback;

  try {
    const response =
      typeof context?.clone === "function" ? context.clone() : context;
    const body = await response.json();
    const detailed = String(
      body?.error || body?.message || body?.details || "",
    ).trim();
    if (detailed) return detailed;
  } catch {
    // Try plain text fallback next.
  }

  try {
    const response =
      typeof context?.clone === "function" ? context.clone() : context;
    const text = String(await response.text()).trim();
    if (text) return text;
  } catch {
    // Ignore parsing failures and use the generic message.
  }

  return fallback;
};

export default function AddFamilyPage() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [occupancy, setOccupancy] = useState<any>(null);
  const [isFamilyMember, setIsFamilyMember] = useState(false);

  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);
  const [familyMembersReady, setFamilyMembersReady] = useState(false);

  const [familySearchQuery, setFamilySearchQuery] = useState("");
  const [familySearchResults, setFamilySearchResults] = useState<any[]>([]);
  const [familySearching, setFamilySearching] = useState(false);
  const [familySearchResolvedQuery, setFamilySearchResolvedQuery] =
    useState("");
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [payingSlots, setPayingSlots] = useState(false);
  const [verifyingSlotPayment, setVerifyingSlotPayment] = useState(false);
  const [pendingSlotCheckout, setPendingSlotCheckout] = useState<{
    ownerUserId: string;
    slots: number;
    amount: number;
    checkoutSessionId?: string;
    paymentId?: string;
    createdAt?: string;
  } | null>(null);
  const [familySlotSummary, setFamilySlotSummary] = useState({
    paidExtra: 0,
    total: FREE_FAMILY_SLOT_COUNT,
    remaining: FREE_FAMILY_SLOT_COUNT,
  });
  const [restoredPendingCheckout, setRestoredPendingCheckout] = useState(false);
  const [recoveredPendingCheckout, setRecoveredPendingCheckout] =
    useState(false);
  const verifyingCheckoutRef = useRef(false);
  const familySearchRequestRef = useRef(0);
  const latestFamilySearchQueryRef = useRef("");

  const familySlotsFull = familyMembers.length >= familySlotSummary.total;
  const maxFamilySlotsReached =
    familySlotSummary.total >= MAX_FAMILY_SLOT_COUNT;
  const isAddFamilySectionLoading =
    loadingFamily || loadingSlots || !familyMembersReady;
  const isRemainingLoading = loadingSlots || !familyMembersReady;
  const isSlotPaymentBusy = payingSlots || verifyingSlotPayment;
  const showSlotPaymentOverlay = verifyingSlotPayment;
  const normalizedFamilySearchQuery = familySearchQuery.trim();
  const showFamilySearchDropdown =
    !familySlotsFull &&
    normalizedFamilySearchQuery.length >= 2 &&
    (familySearching ||
      familySearchResults.length > 0 ||
      familySearchResolvedQuery === normalizedFamilySearchQuery);
  const slotPaymentStatusTitle = verifyingSlotPayment
    ? "Verifying the payment"
    : "Opening secure checkout";
  const slotPaymentStatusDescription = verifyingSlotPayment
    ? "Please wait while we confirm your PayMongo payment and update your extra family slot."
    : "PayMongo is opening for your extra family slot purchase. Complete the payment there and we'll continue automatically.";
  const skeletonColor = isDark ? "rgba(148, 163, 184, 0.22)" : "#e5e7eb";

  const renderMemberSkeletonRows = (count = 3) => (
    <View style={styles.memberList}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={`member-skeleton-${index}`}
          style={[
            styles.memberRow,
            {
              backgroundColor: isDark ? colors.surface : "#ffffff",
              borderColor: isDark ? colors.border : "#e5e7eb",
            },
          ]}
        >
          <SkeletonBlock
            width={36}
            height={36}
            borderRadius={18}
            backgroundColor={skeletonColor}
          />
          <View style={{ flex: 1 }}>
            <SkeletonBlock
              width="58%"
              height={13}
              borderRadius={7}
              backgroundColor={skeletonColor}
            />
            <SkeletonBlock
              width="42%"
              height={11}
              borderRadius={6}
              backgroundColor={skeletonColor}
              style={{ marginTop: 8 }}
            />
          </View>
          <SkeletonBlock
            width={30}
            height={30}
            borderRadius={15}
            backgroundColor={skeletonColor}
          />
        </View>
      ))}
    </View>
  );

  const getMemberId = useCallback((member: any) => {
    return member?.member_id || member?.id || "";
  }, []);

  const getDisplayName = useCallback((member: any) => {
    const profile = member?.member_profile || member;
    const firstName = profile?.first_name || "";
    const lastName = profile?.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || "Unnamed user";
  }, []);

  const getDisplayEmail = useCallback((member: any) => {
    const profile = member?.member_profile || member;
    return profile?.email || "No email";
  }, []);

  const isMissingSchemaError = useCallback((error: any) => {
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
  }, []);

  const toNumber = useCallback((value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const getOwnerCheckoutName = useCallback(async (ownerUserId: string) => {
    const normalizedOwnerUserId = String(ownerUserId || "").trim();
    if (!normalizedOwnerUserId) return "Owner";

    try {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", normalizedOwnerUserId)
        .maybeSingle();

      const ownerName =
        `${ownerProfile?.first_name || ""} ${ownerProfile?.last_name || ""}`.trim();
      if (ownerName) return ownerName;
    } catch (error) {
      console.log("Failed to resolve family-slot checkout name:", error);
    }

    return "Owner";
  }, []);

  const hasPaidStatus = useCallback((row: any) => {
    const status = String(
      row?.status || row?.payment_status || row?.state || "",
    ).toLowerCase();
    if (!status) return row?.is_paid !== false;
    return PAID_STATUS_VALUES.includes(status);
  }, []);

  const getPlanOwnerId = useCallback(
    (currentOccupancy?: any) => {
      return (
        String(currentOccupancy?.tenant_id || "") ||
        String(sessionUser?.id || "") ||
        ""
      );
    },
    [sessionUser?.id],
  );

  const fetchRowsByUserColumn = useCallback(
    async (tableName: string, userId: string) => {
      for (const userColumn of USER_COLUMN_CANDIDATES) {
        const orderedResponse = await supabase
          .from(tableName)
          .select("*")
          .eq(userColumn, userId)
          .order("created_at", { ascending: false })
          .limit(200);

        if (!orderedResponse.error) {
          return orderedResponse.data || [];
        }

        const fallbackResponse = await supabase
          .from(tableName)
          .select("*")
          .eq(userColumn, userId)
          .limit(200);

        if (!fallbackResponse.error) {
          return fallbackResponse.data || [];
        }

        const relevantError = fallbackResponse.error || orderedResponse.error;
        if (!isMissingSchemaError(relevantError)) {
          console.log(
            `fetchRowsByUserColumn ${tableName}.${userColumn} failed`,
            relevantError,
          );
        }
      }

      return [];
    },
    [isMissingSchemaError],
  );

  const getConfirmedFamilySlotReceiptId = useCallback(
    (checkout: {
      ownerUserId: string;
      slots: number;
      checkoutSessionId?: string;
      paymentId?: string;
      createdAt?: string;
    }) => {
      const preferred = String(
        checkout.paymentId || checkout.checkoutSessionId || "",
      ).trim();
      if (preferred) return preferred;

      return [
        checkout.ownerUserId,
        Math.max(0, Math.floor(Number(checkout.slots) || 0)),
        String(checkout.createdAt || "").trim(),
      ].join(":");
    },
    [],
  );

  const readConfirmedFamilySlotPurchases = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(
        CONFIRMED_FAMILY_SLOT_PURCHASES_KEY,
      );
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const persistConfirmedFamilySlotPurchase = useCallback(
    async (checkout: {
      ownerUserId: string;
      slots: number;
      amount?: number;
      checkoutSessionId?: string;
      paymentId?: string;
      createdAt?: string;
    }) => {
      const purchases = await readConfirmedFamilySlotPurchases();
      const receiptId = getConfirmedFamilySlotReceiptId(checkout);
      const alreadyExists = purchases.some(
        (purchase: any) => String(purchase?.receiptId || "") === receiptId,
      );

      if (!alreadyExists) {
        purchases.push({
          receiptId,
          ownerUserId: String(checkout.ownerUserId || ""),
          slots: Math.max(0, Math.floor(Number(checkout.slots) || 0)),
          amount: Math.max(0, Number(checkout.amount) || 0),
          createdAt: checkout.createdAt || new Date().toISOString(),
        });

        try {
          await AsyncStorage.setItem(
            CONFIRMED_FAMILY_SLOT_PURCHASES_KEY,
            JSON.stringify(purchases.slice(-100)),
          );
        } catch {
          // Keep UI moving even if local persistence fails.
        }
      }

      return purchases
        .filter(
          (purchase: any) =>
            String(purchase?.ownerUserId || "") ===
            String(checkout.ownerUserId || ""),
        )
        .reduce(
          (sum: number, purchase: any) =>
            sum + Math.max(0, Math.floor(Number(purchase?.slots) || 0)),
          0,
        );
    },
    [getConfirmedFamilySlotReceiptId, readConfirmedFamilySlotPurchases],
  );

  const loadFamilySlotSummary = useCallback(
    async (ownerUserId: string, memberCount: number) => {
      if (!ownerUserId) {
        setFamilySlotSummary({
          paidExtra: 0,
          total: FREE_FAMILY_SLOT_COUNT,
          remaining: Math.max(0, FREE_FAMILY_SLOT_COUNT - memberCount),
        });
        return {
          paidExtra: 0,
          total: FREE_FAMILY_SLOT_COUNT,
          remaining: Math.max(0, FREE_FAMILY_SLOT_COUNT - memberCount),
        };
      }

      setLoadingSlots(true);
      try {
        const subscriptionRowsByTable = await Promise.all(
          SUBSCRIPTION_TABLE_CANDIDATES.map((tableName) =>
            fetchRowsByUserColumn(tableName, ownerUserId),
          ),
        );

        const subscriptionPaymentRowsByTable = await Promise.all(
          SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES.map((tableName) =>
            fetchRowsByUserColumn(tableName, ownerUserId),
          ),
        );

        const subscriptionRows = subscriptionRowsByTable.flat();
        const paymentRows = subscriptionPaymentRowsByTable.flat();

        let maxTotalSlots = 0;
        let extraFromSubscriptions = 0;
        for (const row of subscriptionRows) {
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

          extraFromSubscriptions += Math.max(
            0,
            Math.max(
              toNumber(row?.paid_slots),
              toNumber(row?._paid_slots),
              toNumber(row?.additional_slots),
              toNumber(row?.extra_slots),
              toNumber(row?.slots),
              toNumber(row?.slot_count),
              toNumber(row?.quantity),
            ),
          );
        }

        let extraFromPayments = 0;
        for (const row of paymentRows) {
          if (!hasPaidStatus(row)) continue;
          const slotQty = Math.max(
            toNumber(row?.slots),
            toNumber(row?.slot_count),
            toNumber(row?.quantity),
            toNumber(row?.additional_slots),
          );

          if (slotQty > 0) {
            extraFromPayments += slotQty;
            continue;
          }

          const amount = Math.max(
            toNumber(row?.amount),
            toNumber(row?.amount_paid),
            toNumber(row?.total_amount),
          );
          if (amount > 0) {
            extraFromPayments += Math.floor(amount / FAMILY_SLOT_PRICE_PHP);
          }
        }

        const paidExtra = normalizePaidExtraSlotCount(
          Math.max(
            maxTotalSlots > 0
              ? Math.max(0, maxTotalSlots - FREE_FAMILY_SLOT_COUNT)
              : extraFromSubscriptions,
            extraFromPayments,
            0,
          ),
        );
        const totalSlots = getTotalFamilySlotCount(paidExtra);
        let next = {
          paidExtra,
          total: totalSlots,
          remaining: Math.max(0, totalSlots - memberCount),
        };

        setFamilySlotSummary((prev) => {
          const mergedPaidExtra = normalizePaidExtraSlotCount(
            Math.max(prev.paidExtra, next.paidExtra),
          );
          const mergedTotal = getTotalFamilySlotCount(mergedPaidExtra);
          next = {
            paidExtra: mergedPaidExtra,
            total: mergedTotal,
            remaining: Math.max(0, mergedTotal - memberCount),
          };
          return next;
        });
        return next;
      } finally {
        setLoadingSlots(false);
      }
    },
    [fetchRowsByUserColumn, hasPaidStatus, toNumber],
  );

  const applyFamilySlotPaidExtraTotal = useCallback(
    (paidExtraTotal: number, memberCount = familyMembers.length) => {
      const normalizedPaidExtra = normalizePaidExtraSlotCount(paidExtraTotal);
      setFamilySlotSummary((prev) => {
        const nextPaidExtra = normalizePaidExtraSlotCount(
          Math.max(prev.paidExtra, normalizedPaidExtra),
        );
        const nextTotal = getTotalFamilySlotCount(nextPaidExtra);
        return {
          paidExtra: nextPaidExtra,
          total: nextTotal,
          remaining: Math.max(0, nextTotal - memberCount),
        };
      });
    },
    [familyMembers.length],
  );

  const persistPendingCheckout = useCallback(
    async (
      checkout: {
        ownerUserId: string;
        slots: number;
        amount: number;
        checkoutSessionId?: string;
        paymentId?: string;
        createdAt?: string;
      } | null,
    ) => {
      setPendingSlotCheckout(checkout);
      try {
        if (!checkout) {
          setRecoveredPendingCheckout(false);
          await AsyncStorage.removeItem(PENDING_FAMILY_SLOT_CHECKOUT_KEY);
          return;
        }

        await AsyncStorage.setItem(
          PENDING_FAMILY_SLOT_CHECKOUT_KEY,
          JSON.stringify(checkout),
        );
      } catch {
        // Non-blocking persistence only.
      }
    },
    [],
  );

  const recordFamilySlotPurchase = useCallback(
    async (
      ownerUserId: string,
      slotsBought: number,
      amountPaid: number,
      checkoutSessionId?: string,
      paymentId?: string,
    ) => {
      const now = new Date().toISOString();
      let paymentStored = false;
      let planStored = false;
      let effectivePaidExtra = normalizePaidExtraSlotCount(
        familySlotSummary.paidExtra,
      );
      let appliedSlots = Math.max(
        0,
        Math.min(
          Math.max(1, Math.floor(slotsBought)),
          MAX_EXTRA_FAMILY_SLOT_COUNT - effectivePaidExtra,
        ),
      );
      const paymentReference =
        String(paymentId || checkoutSessionId || "").trim() ||
        `family_slot_${ownerUserId}_${Date.now()}`;

      if (checkoutSessionId || paymentId) {
        const matchTargets = [
          {
            columns: ["checkout_session_id", "session_id"],
            value: String(checkoutSessionId || "").trim(),
          },
          {
            columns: PAYMENT_REFERENCE_COLUMN_CANDIDATES,
            value: String(paymentId || "").trim(),
          },
        ].filter((target) => !!target.value);

        let foundExistingPayment = false;
        let ownerLinkedPayment = false;
        for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
          for (const target of matchTargets) {
            for (const column of target.columns) {
              try {
                const { data, error } = await supabase
                  .from(tableName)
                  .select("*")
                  .eq(column, target.value)
                  .limit(5);

                if (!error && Array.isArray(data) && data.length > 0) {
                  foundExistingPayment = true;
                  if (
                    data.some((row: any) =>
                      USER_COLUMN_CANDIDATES.some(
                        (userColumn) =>
                          String(row?.[userColumn] || "") === ownerUserId,
                      ),
                    )
                  ) {
                    ownerLinkedPayment = true;
                  }
                  break;
                }
              } catch {
                // Best effort de-duplication only.
              }

              if (foundExistingPayment) break;
            }

            if (foundExistingPayment) break;
          }

          if (foundExistingPayment) break;
        }

        if (foundExistingPayment && !ownerLinkedPayment) {
          for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
            let updated = false;
            for (const target of matchTargets) {
              for (const matchColumn of target.columns) {
                for (const userColumn of USER_COLUMN_CANDIDATES) {
                  const { error } = await supabase
                    .from(tableName)
                    .update({ [userColumn]: ownerUserId })
                    .eq(matchColumn, target.value);

                  if (!error) {
                    ownerLinkedPayment = true;
                    updated = true;
                    break;
                  }

                  if (!isMissingSchemaError(error)) {
                    console.log(
                      `recordFamilySlotPurchase owner-link update failed on ${tableName}:`,
                      error,
                    );
                  }
                }

                if (updated) break;
              }

              if (updated) break;
            }

            if (updated) break;
          }
        }

        if (foundExistingPayment && ownerLinkedPayment) {
          paymentStored = true;
        }
      }

      // Primary path: write to the exact schema used by website.
      let canonicalSubscriptionId: string | null = null;
      try {
        const { data: existingSubscription, error: existingSubscriptionError } =
          await supabase
            .from("subscriptions")
            .select("id, total_slots, paid_slots")
            .eq("tenant_id", ownerUserId)
            .eq("plan_type", "family_slot_plan")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!existingSubscriptionError) {
          const existingPaidSlots = normalizePaidExtraSlotCount(
            Math.max(
              toNumber(existingSubscription?.paid_slots),
              Math.max(
                0,
                toNumber(existingSubscription?.total_slots) -
                  FREE_FAMILY_SLOT_COUNT,
              ),
              familySlotSummary.paidExtra,
            ),
          );
          effectivePaidExtra = existingPaidSlots;
          appliedSlots = Math.max(
            0,
            Math.min(
              Math.max(1, Math.floor(slotsBought)),
              MAX_EXTRA_FAMILY_SLOT_COUNT - existingPaidSlots,
            ),
          );
          const nextPaidSlots = normalizePaidExtraSlotCount(
            existingPaidSlots + appliedSlots,
          );
          const nextTotalSlots = getTotalFamilySlotCount(nextPaidSlots);

          if (existingSubscription?.id) {
            const { error: updateSubscriptionError } = await supabase
              .from("subscriptions")
              .update({
                total_slots: nextTotalSlots,
                paid_slots: nextPaidSlots,
                status: "active",
                updated_at: now,
              })
              .eq("id", existingSubscription.id);

            if (!updateSubscriptionError) {
              planStored = true;
              canonicalSubscriptionId = String(existingSubscription.id);
            }
          } else {
            const {
              data: insertedSubscription,
              error: insertSubscriptionError,
            } = await supabase
              .from("subscriptions")
              .insert({
                tenant_id: ownerUserId,
                plan_type: "family_slot_plan",
                total_slots: nextTotalSlots,
                paid_slots: nextPaidSlots,
                status: "active",
                created_at: now,
                updated_at: now,
              })
              .select("id")
              .single();

            if (!insertSubscriptionError) {
              planStored = true;
              canonicalSubscriptionId = String(insertedSubscription?.id || "");
            }
          }
        }
      } catch {
        // Fall through to compatibility path.
      }

      if (appliedSlots <= 0) {
        return true;
      }

      if (!paymentStored) {
        try {
          const {
            data: existingPaymentByRef,
            error: existingPaymentByRefError,
          } = await supabase
            .from("subscription_payments")
            .select("id")
            .eq("payment_reference", paymentReference)
            .limit(1)
            .maybeSingle();

          if (!existingPaymentByRefError && existingPaymentByRef?.id) {
            paymentStored = true;
          } else {
            const { error: insertCanonicalPaymentError } = await supabase
              .from("subscription_payments")
              .insert({
                subscription_id: canonicalSubscriptionId,
                tenant_id: ownerUserId,
                occupancy_id: occupancy?.id || null,
                amount: amountPaid,
                currency: "PHP",
                payment_method: "qrph",
                payment_reference: paymentReference,
                status: "paid",
                paid_at: now,
                created_at: now,
              });

            if (!insertCanonicalPaymentError) {
              paymentStored = true;
            }
          }
        } catch {
          // Fall through to compatibility path.
        }
      }

      const basePaymentPayloadVariants = [
        {
          slots: appliedSlots,
          amount: amountPaid,
          status: "paid",
          payment_method: "qrph",
          provider: "paymongo",
          checkout_session_id: checkoutSessionId || paymentReference,
          created_at: now,
          paid_at: now,
        },
        {
          slot_count: appliedSlots,
          amount_paid: amountPaid,
          payment_status: "paid",
          payment_method: "qrph",
          provider: "paymongo",
          session_id: checkoutSessionId || paymentReference,
          created_at: now,
          paid_at: now,
        },
      ];

      const paymentPayloadVariants = USER_COLUMN_CANDIDATES.flatMap(
        (userColumn) =>
          basePaymentPayloadVariants.map((payload) => ({
            ...payload,
            [userColumn]: ownerUserId,
          })),
      );

      if (!paymentStored) {
        for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
          for (const payload of paymentPayloadVariants) {
            const { error } = await supabase.from(tableName).insert(payload);
            if (!error) {
              paymentStored = true;
              break;
            }
            if (!isMissingSchemaError(error)) {
              console.log(
                `recordFamilySlotPurchase failed on ${tableName}:`,
                error,
              );
            }
          }

          if (paymentStored) {
            break;
          }
        }
      }

      const baseSubscriptionPayloadVariants = [
        {
          plan_name: "family_slot_plan",
          total_slots: getTotalFamilySlotCount(
            effectivePaidExtra + appliedSlots,
          ),
          additional_slots: normalizePaidExtraSlotCount(
            effectivePaidExtra + appliedSlots,
          ),
          paid_slots: normalizePaidExtraSlotCount(
            effectivePaidExtra + appliedSlots,
          ),
          status: "active",
          created_at: now,
          updated_at: now,
        },
        {
          plan_type: "family_slot_plan",
          total_slots: getTotalFamilySlotCount(
            effectivePaidExtra + appliedSlots,
          ),
          slot_count: normalizePaidExtraSlotCount(
            effectivePaidExtra + appliedSlots,
          ),
          _paid_slots: normalizePaidExtraSlotCount(
            effectivePaidExtra + appliedSlots,
          ),
          status: "active",
          created_at: now,
          updated_at: now,
        },
      ];

      const subscriptionPayloadVariants = USER_COLUMN_CANDIDATES.flatMap(
        (userColumn) =>
          baseSubscriptionPayloadVariants.map((payload) => ({
            ...payload,
            [userColumn]: ownerUserId,
          })),
      );

      for (const tableName of SUBSCRIPTION_TABLE_CANDIDATES) {
        for (const payload of subscriptionPayloadVariants) {
          const { error: upsertError } = await supabase
            .from(tableName)
            .upsert(payload);
          if (!upsertError) {
            planStored = true;
            break;
          }

          const { error: insertError } = await supabase
            .from(tableName)
            .insert(payload);
          if (!insertError) {
            planStored = true;
            break;
          }

          if (
            !isMissingSchemaError(upsertError) &&
            !isMissingSchemaError(insertError)
          ) {
            console.log(
              `recordFamilySlotPurchase failed on ${tableName}:`,
              upsertError || insertError,
            );
          }
        }

        if (planStored) {
          break;
        }
      }

      if (!paymentStored && !planStored) {
        console.log(
          "recordFamilySlotPurchase: no compatible subscription/payment table shape was writable. Using local confirmed-slot fallback.",
        );
      }

      return paymentStored || planStored;
    },
    [
      familySlotSummary.paidExtra,
      isMissingSchemaError,
      occupancy?.id,
      toNumber,
    ],
  );

  const hasPaidRowForPendingCheckout = useCallback(
    async (checkout: {
      ownerUserId: string;
      slots: number;
      amount: number;
      checkoutSessionId?: string;
      paymentId?: string;
      createdAt?: string;
    }) => {
      if (!checkout?.ownerUserId) return false;

      const sessionId = String(checkout.checkoutSessionId || "").trim();
      const paymentId = String(checkout.paymentId || "").trim();
      const startedAtMs = checkout.createdAt
        ? new Date(checkout.createdAt).getTime()
        : 0;
      const sinceMs = Number.isFinite(startedAtMs)
        ? Math.max(0, startedAtMs - 5 * 60 * 1000)
        : 0;

      for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
        const rows = await fetchRowsByUserColumn(
          tableName,
          checkout.ownerUserId,
        );
        if (!Array.isArray(rows) || rows.length === 0) continue;

        for (const row of rows) {
          if (!hasPaidStatus(row)) continue;

          const rowSession = String(
            row?.checkout_session_id || row?.session_id || "",
          ).trim();
          if (sessionId && rowSession && rowSession === sessionId) {
            return true;
          }

          if (paymentId) {
            const rowPaymentRef = String(
              row?.payment_id ||
                row?.paymongo_payment_id ||
                row?.reference_id ||
                row?.transaction_id ||
                row?.payment_reference ||
                "",
            ).trim();
            if (rowPaymentRef && rowPaymentRef === paymentId) {
              return true;
            }
          }

          const rowTime = new Date(
            row?.paid_at || row?.created_at || row?.updated_at || 0,
          ).getTime();
          if (sinceMs > 0 && Number.isFinite(rowTime) && rowTime < sinceMs) {
            continue;
          }

          const slotQty = Math.max(
            toNumber(row?.slots),
            toNumber(row?.slot_count),
            toNumber(row?.quantity),
            toNumber(row?.additional_slots),
          );
          if (slotQty > 0 && slotQty >= checkout.slots) {
            return true;
          }

          const amount = Math.max(
            toNumber(row?.amount),
            toNumber(row?.amount_paid),
            toNumber(row?.total_amount),
          );
          if (amount > 0 && amount >= checkout.amount) {
            return true;
          }
        }
      }

      return false;
    },
    [fetchRowsByUserColumn, hasPaidStatus, toNumber],
  );

  const notifyFamilySlotPurchaseSuccess = useCallback(
    async (checkout: {
      ownerUserId: string;
      slots: number;
      amount: number;
      checkoutSessionId?: string;
      paymentId?: string;
      createdAt?: string;
    }) => {
      if (!checkout?.ownerUserId || checkout.slots <= 0) return;

      if (checkout.checkoutSessionId) {
        try {
          const { data: recentNotifs } = await supabase
            .from("notifications")
            .select("id, data")
            .eq("recipient", checkout.ownerUserId)
            .eq("type", "family_slot_purchase_success")
            .order("created_at", { ascending: false })
            .limit(15);

          const alreadyNotified = (recentNotifs || []).some((row: any) => {
            const existingSession = String(
              row?.data?.checkout_session_id || "",
            ).trim();
            return (
              existingSession &&
              existingSession === String(checkout.checkoutSessionId).trim()
            );
          });

          if (alreadyNotified) return;
        } catch {
          // Continue and send notification when de-duplication lookup fails.
        }
      }

      const amountLabel = `PHP ${Math.max(0, Number(checkout.amount) || 0)}`;
      const slotsLabel = `${checkout.slots} family slot${checkout.slots > 1 ? "s" : ""}`;
      const message = `Your purchase of ${slotsLabel} (${amountLabel}) was successful.`;

      await createNotification(
        checkout.ownerUserId,
        "family_slot_purchase_success",
        message,
        {
          actor: checkout.ownerUserId,
          link: "/(tabs)/add-family",
          data: {
            slots: checkout.slots,
            amount: checkout.amount,
            checkout_session_id: checkout.checkoutSessionId || null,
            payment_id: checkout.paymentId || null,
            provider: "paymongo",
          },
        },
      );

      const API_URL = getApiBaseUrl();
      if (!API_URL) return;

      try {
        const [{ data: ownerProfile }, { data: ownerEmailRpc }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select("first_name, last_name, phone")
              .eq("id", checkout.ownerUserId)
              .maybeSingle(),
            supabase.rpc("get_user_email", { user_id: checkout.ownerUserId }),
          ]);

        const ownerEmail =
          typeof ownerEmailRpc === "string"
            ? ownerEmailRpc
            : String(ownerEmailRpc?.email || "");
        const ownerPhone = String(ownerProfile?.phone || "");
        const ownerName =
          `${ownerProfile?.first_name || ""} ${ownerProfile?.last_name || ""}`.trim() ||
          "Tenant";

        const notifyTypes = [
          "family_slot_purchase_success",
          "payment_confirmed",
        ];
        for (const notifyType of notifyTypes) {
          const notifyRes = await fetch(`${API_URL}/api/notify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: notifyType,
              recordId:
                checkout.checkoutSessionId ||
                `family-slot-${checkout.ownerUserId}-${Date.now()}`,
              actorId: checkout.ownerUserId,
              ownerId: checkout.ownerUserId,
              tenantId: checkout.ownerUserId,
              recipientId: checkout.ownerUserId,
              ownerName,
              tenantName: ownerName,
              ownerEmail,
              tenantEmail: ownerEmail,
              ownerPhone,
              tenantPhone: ownerPhone,
              paymentMethod: "paymongo",
              provider: "paymongo",
              slots: checkout.slots,
              amount: checkout.amount,
              paymentId: checkout.paymentId || null,
              channel: "family_slot",
              message,
            }),
          });

          if (notifyRes.ok) break;
        }
      } catch (notifyErr) {
        console.log("Family slot email/sms notify failed:", notifyErr);
      }
    },
    [],
  );

  const processFamilySlotPaymentOnServer = useCallback(
    async (
      checkout: {
        ownerUserId: string;
        slots: number;
        amount: number;
        checkoutSessionId?: string;
        paymentId?: string;
        createdAt?: string;
      } | null,
    ) => {
      if (!checkout?.ownerUserId || checkout.slots <= 0) return false;

      const checkoutSessionId = String(checkout.checkoutSessionId || "").trim();
      const paymentId = String(checkout.paymentId || "").trim();
      const sharedPayload = {
        sessionId: checkoutSessionId || null,
        checkoutSessionId: checkoutSessionId || null,
        checkout_session_id: checkoutSessionId || null,
        paymentId: paymentId || null,
        payment_id: paymentId || null,
        paymentReference: paymentId || checkoutSessionId || null,
        payment_reference: paymentId || checkoutSessionId || null,
        type: "family_slot_subscription",
        ownerId: checkout.ownerUserId,
        ownerUserId: checkout.ownerUserId,
        userId: checkout.ownerUserId,
        tenantId: checkout.ownerUserId,
        occupancyId: occupancy?.id || null,
        slots: checkout.slots,
        amount: checkout.amount,
        planType: "family_slot_plan",
        channel: "family_slot",
        paymentMethod: "paymongo",
        provider: "paymongo",
      };

      try {
        const { data, error } = await supabase.functions.invoke(
          "paymongo-family-slot-verify",
          {
            body: sharedPayload,
          },
        );

        if (!error && data?.success && data?.paid) {
          return true;
        }

        if (error) {
          const message = await extractEdgeFunctionErrorMessage(error);
          console.log("paymongo-family-slot-verify failed:", message);
        }
      } catch {
        // Function not deployed or temporarily unavailable.
      }

      return false;
    },
    [occupancy?.id],
  );

  const verifyFamilySlotCheckout = useCallback(
    async (
      checkout: {
        ownerUserId: string;
        slots: number;
        amount: number;
        checkoutSessionId?: string;
        paymentId?: string;
        createdAt?: string;
      } | null,
      silent = false,
      options?: {
        maxAttempts?: number;
        delayMs?: number;
      },
    ) => {
      if (!checkout?.ownerUserId || checkout?.slots <= 0) return false;
      if (verifyingCheckoutRef.current) return false;

      const checkoutSessionId = String(checkout.checkoutSessionId || "").trim();
      const paymentId = String(checkout.paymentId || "").trim();
      const maxAttempts = Math.max(
        1,
        Math.floor(options?.maxAttempts ?? (silent ? 3 : 20)),
      );
      const delayMs = Math.max(
        250,
        Math.floor(options?.delayMs ?? (silent ? 800 : 1500)),
      );
      const shouldShowVerifyingState = !silent;

      verifyingCheckoutRef.current = true;
      if (shouldShowVerifyingState) {
        setVerifyingSlotPayment(true);
      }
      try {
        const completePendingCheckout = async (
          message: string,
          options?: {
            requireLocalRecord?: boolean;
          },
        ) => {
          if (options?.requireLocalRecord) {
            const stored = await recordFamilySlotPurchase(
              checkout.ownerUserId,
              checkout.slots,
              checkout.amount,
              checkoutSessionId || undefined,
              paymentId || undefined,
            );

            if (!stored) {
              return false;
            }
          }

          await persistConfirmedFamilySlotPurchase({
            ownerUserId: checkout.ownerUserId,
            slots: checkout.slots,
            amount: checkout.amount,
            checkoutSessionId: checkoutSessionId || undefined,
            paymentId: paymentId || undefined,
            createdAt: checkout.createdAt,
          });
          await persistPendingCheckout(null);

          try {
            await loadFamilySlotSummary(
              checkout.ownerUserId,
              familyMembers.length,
            );
          } catch (summaryError) {
            if (options?.requireLocalRecord) {
              applyFamilySlotPaidExtraTotal(
                familySlotSummary.paidExtra + checkout.slots,
                familyMembers.length,
              );
            }
            console.log(
              "Family slot summary refresh failed after payment:",
              summaryError,
            );
          }

          void (async () => {
            try {
              await notifyFamilySlotPurchaseSuccess(checkout);
            } catch (notifyError) {
              console.log(
                "Family slot success notification failed:",
                notifyError,
              );
            }
          })();

          if (!silent) {
            Alert.alert("Success", message);
          }

          return true;
        };

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const serverProcessed =
            await processFamilySlotPaymentOnServer(checkout);
          if (serverProcessed) {
            const completed = await completePendingCheckout(
              "Family slot purchase completed.",
              { requireLocalRecord: false },
            );
            if (completed) return true;
          }

          // Fallback: if backend already wrote payment rows, auto-complete immediately.
          if (checkoutSessionId || paymentId) {
            for (const tableName of SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES) {
              const fallbackTargets = [
                {
                  columns: ["checkout_session_id", "session_id"],
                  value: checkoutSessionId,
                },
                {
                  columns: PAYMENT_REFERENCE_COLUMN_CANDIDATES,
                  value: paymentId,
                },
              ].filter((target) => !!target.value);

              for (const target of fallbackTargets) {
                for (const matchColumn of target.columns) {
                  try {
                    const { data, error } = await supabase
                      .from(tableName)
                      .select("*")
                      .eq(matchColumn, target.value)
                      .limit(3);

                    if (
                      !error &&
                      Array.isArray(data) &&
                      data.some(hasPaidStatus)
                    ) {
                      const completed = await completePendingCheckout(
                        "Family slot purchase completed.",
                        { requireLocalRecord: false },
                      );
                      if (completed) return true;
                    }
                  } catch {
                    // Continue fallback attempts.
                  }
                }
              }
            }
          }

          const matchedPaidRow = await hasPaidRowForPendingCheckout(checkout);
          if (matchedPaidRow) {
            // Payment row is already present for this owner; finalize without re-inserting.
            const completed = await completePendingCheckout(
              "Payment confirmed. Slots updated.",
              { requireLocalRecord: false },
            );
            if (completed) return true;
          }

          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }

        return false;
      } finally {
        verifyingCheckoutRef.current = false;
        if (shouldShowVerifyingState) {
          setVerifyingSlotPayment(false);
        }
      }
    },
    [
      applyFamilySlotPaidExtraTotal,
      familySlotSummary.paidExtra,
      familyMembers.length,
      loadFamilySlotSummary,
      persistPendingCheckout,
      persistConfirmedFamilySlotPurchase,
      processFamilySlotPaymentOnServer,
      recordFamilySlotPurchase,
      hasPaidRowForPendingCheckout,
      hasPaidStatus,
      notifyFamilySlotPurchaseSuccess,
    ],
  );

  const buyFamilySlots = useCallback(
    async (slotsToBuy: number) => {
      const ownerUserId = getPlanOwnerId(occupancy);
      if (!ownerUserId) return false;

      const remainingPurchasableSlots = Math.max(
        0,
        MAX_FAMILY_SLOT_COUNT - familySlotSummary.total,
      );
      if (remainingPurchasableSlots <= 0) {
        Alert.alert(
          "Maximum reached",
          `You can only have up to ${MAX_FAMILY_SLOT_COUNT} family slots.`,
        );
        return false;
      }

      const normalizedSlots = Math.min(
        remainingPurchasableSlots,
        Math.max(1, Math.floor(slotsToBuy)),
      );
      const amount = normalizedSlots * FAMILY_SLOT_PRICE_PHP;

      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Buy Family Slots",
          `Buy ${normalizedSlots} slot${normalizedSlots > 1 ? "s" : ""} for PHP ${amount}?`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Yes", onPress: () => resolve(true) },
          ],
        );
      });

      if (!confirmed) return false;

      setPayingSlots(true);
      setVerifyingSlotPayment(false);
      try {
        const ownerCheckoutName = await getOwnerCheckoutName(ownerUserId);
        const paymongoReturnUrl = Linking.createURL("add-family");
        const successRedirectUrl = Linking.createURL("add-family", {
          queryParams: {
            paymongo_status: "success",
            channel: "family_slot",
          },
        });
        const cancelRedirectUrl = Linking.createURL("add-family", {
          queryParams: {
            paymongo_status: "cancel",
            channel: "family_slot",
          },
        });

        // Match the main bill-payment PayMongo checkout configuration so
        // the family-slot flow opens the same test-mode checkout options.
        const { data, error } = await supabase.functions.invoke(
          "paymongo-family-slot-create",
          {
            body: {
              amount,
              description: "Family Slot Subscription",
              ownerName: ownerCheckoutName,
              owner_name: ownerCheckoutName,
              remarks: `${ownerCheckoutName} bought ${normalizedSlots} family slot(s)`,
              allowedMethods: [...PAYMONGO_CHECKOUT_METHODS],
              successUrl: successRedirectUrl,
              success_url: successRedirectUrl,
              cancelUrl: cancelRedirectUrl,
              cancel_url: cancelRedirectUrl,
              redirectUrl: successRedirectUrl,
              redirect_url: successRedirectUrl,
              returnUrl: successRedirectUrl,
              return_url: successRedirectUrl,
              metadata: {
                type: "family_slot_subscription",
                ownerId: ownerUserId,
                ownerUserId: ownerUserId,
                ownerName: ownerCheckoutName,
                owner_name: ownerCheckoutName,
                userId: ownerUserId,
                tenantId: ownerUserId,
                slots: normalizedSlots,
                amount,
                currentTotalSlots: familySlotSummary.total,
                maxTotalSlots: MAX_FAMILY_SLOT_COUNT,
                planType: "family_slot_plan",
                occupancyId: occupancy?.id || null,
                channel: "family_slot",
                provider: "paymongo",
                successUrl: successRedirectUrl,
                cancelUrl: cancelRedirectUrl,
              },
            },
          },
        );

        if (error || !data?.checkoutUrl) {
          const detailedError = error
            ? await extractEdgeFunctionErrorMessage(error)
            : "";
          throw new Error(
            detailedError || data?.error || "Failed to start checkout.",
          );
        }

        const checkoutSessionId = resolveCheckoutSessionId(data) || undefined;
        const initialPaymentId = resolvePaymongoPaymentId(data) || undefined;

        const checkoutPayload = {
          ownerUserId,
          slots: normalizedSlots,
          amount,
          checkoutSessionId,
          paymentId: initialPaymentId,
          createdAt: new Date().toISOString(),
        };

        // Persist first so we can recover verification even if app/browser closes mid-checkout.
        await persistPendingCheckout(checkoutPayload);

        let callbackSettled = false;
        let callbackTimeout: ReturnType<typeof setTimeout> | null = null;
        let callbackSubscription: { remove: () => void } | null = null;
        const cleanupCallbackListener = () => {
          if (callbackSubscription) {
            callbackSubscription.remove();
            callbackSubscription = null;
          }
          if (callbackTimeout) {
            clearTimeout(callbackTimeout);
            callbackTimeout = null;
          }
        };
        const callbackUrlPromise = new Promise<string | null>((resolve) => {
          const settle = (url: string | null) => {
            if (callbackSettled) return;
            callbackSettled = true;
            cleanupCallbackListener();
            resolve(url);
          };

          callbackSubscription = Linking.addEventListener("url", ({ url }) => {
            settle(url);
          });

          callbackTimeout = setTimeout(() => {
            settle(null);
          }, 180000);
        });

        const authResult = await WebBrowser.openAuthSessionAsync(
          data.checkoutUrl,
          paymongoReturnUrl,
        );
        const browserResultType = String(authResult.type || "").toLowerCase();
        const checkoutWasClosed =
          browserResultType === "cancel" || browserResultType === "dismiss";
        if (checkoutWasClosed) {
          cleanupCallbackListener();
        }
        if (browserResultType !== "cancel" && browserResultType !== "dismiss") {
          setVerifyingSlotPayment(true);
        }

        let callbackUrl =
          authResult.type === "success" && authResult.url
            ? String(authResult.url)
            : null;

        if (!callbackUrl && !checkoutWasClosed) {
          callbackUrl = await callbackUrlPromise;
        }

        if (!callbackUrl && !checkoutWasClosed) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            callbackUrl = initialUrl;
          }
        }

        const browserUrl = String(callbackUrl || "");
        const idsFromReturnUrl = extractIdentifiersFromUrl(browserUrl);
        const effectiveCheckoutPayload = {
          ...checkoutPayload,
          checkoutSessionId:
            idsFromReturnUrl.checkoutSessionId ||
            checkoutPayload.checkoutSessionId,
          paymentId: idsFromReturnUrl.paymentId || checkoutPayload.paymentId,
        };

        if (
          effectiveCheckoutPayload.checkoutSessionId !==
            checkoutPayload.checkoutSessionId ||
          effectiveCheckoutPayload.paymentId !== checkoutPayload.paymentId
        ) {
          await persistPendingCheckout(effectiveCheckoutPayload);
        }

        const callbackStatus = getQueryParam(browserUrl, "paymongo_status");
        const checkoutCanceled =
          callbackStatus === "cancel" ||
          browserResultType === "cancel" ||
          browserResultType === "dismiss";
        const returnedFromSuccessRedirect =
          callbackStatus === "success" || browserResultType === "success";

        const finalizeSuccessfulCheckout = async (message: string) => {
          setVerifyingSlotPayment(true);
          try {
            const serverProcessed = await processFamilySlotPaymentOnServer(
              effectiveCheckoutPayload,
            );
            if (!serverProcessed) {
              return false;
            }

            await persistConfirmedFamilySlotPurchase({
              ownerUserId,
              slots: normalizedSlots,
              amount,
              checkoutSessionId: effectiveCheckoutPayload.checkoutSessionId,
              paymentId: effectiveCheckoutPayload.paymentId,
              createdAt: effectiveCheckoutPayload.createdAt,
            });
            await persistPendingCheckout(null);

            try {
              await loadFamilySlotSummary(ownerUserId, familyMembers.length);
            } catch (summaryError) {
              applyFamilySlotPaidExtraTotal(
                familySlotSummary.paidExtra + normalizedSlots,
                familyMembers.length,
              );
              console.log(
                "Family slot summary refresh failed after success redirect:",
                summaryError,
              );
            }

            void (async () => {
              try {
                await notifyFamilySlotPurchaseSuccess(effectiveCheckoutPayload);
              } catch (notifyError) {
                console.log(
                  "Family slot success notification failed after success redirect:",
                  notifyError,
                );
              }
            })();

            Alert.alert("Success", message);
            return true;
          } finally {
            setVerifyingSlotPayment(false);
          }
        };

        if (returnedFromSuccessRedirect) {
          const finalizedFromRedirect = await finalizeSuccessfulCheckout(
            "Family slot purchase completed.",
          );
          if (finalizedFromRedirect) return true;
        }

        if (checkoutCanceled) {
          void verifyFamilySlotCheckout(effectiveCheckoutPayload, true, {
            maxAttempts: 2,
            delayMs: 500,
          });

          Alert.alert(
            "Checkout closed",
            "Payment page was closed. If you already paid, the app will still try to detect it in the background.",
          );
          return false;
        }

        const verified = await verifyFamilySlotCheckout(
          effectiveCheckoutPayload,
          false,
          returnedFromSuccessRedirect
            ? { maxAttempts: 12, delayMs: 700 }
            : undefined,
        );
        if (verified) return true;

        const confirmedManually = await new Promise<boolean>((resolve) => {
          Alert.alert("Confirm Payment", undefined, [
            {
              text: "Not yet",
              style: "cancel",
              onPress: () => resolve(false),
            },
            { text: "Confirm", onPress: () => resolve(true) },
          ]);
        });

        if (confirmedManually) {
          const finalizedManually = await finalizeSuccessfulCheckout(
            "Family slot purchase completed.",
          );
          if (!finalizedManually) {
            Alert.alert(
              "Payment Pending",
              "The payment looks completed, but the extra family slot could not be saved yet. Please try opening Add Family again in a moment.",
            );
            return false;
          }
          return true;
        }

        Alert.alert(
          "Payment Pending",
          "Payment is being verified. Once confirmed, your family slots will be added automatically.",
        );
        return false;
      } catch (error: any) {
        Alert.alert(
          "Payment Failed",
          error?.message || "Unable to process payment.",
        );
        return false;
      } finally {
        setPayingSlots(false);
        setVerifyingSlotPayment(false);
      }
    },
    [
      applyFamilySlotPaidExtraTotal,
      familySlotSummary.paidExtra,
      familySlotSummary.total,
      familyMembers.length,
      persistConfirmedFamilySlotPurchase,
      loadFamilySlotSummary,
      notifyFamilySlotPurchaseSuccess,
      persistPendingCheckout,
      processFamilySlotPaymentOnServer,
      verifyFamilySlotCheckout,
      getOwnerCheckoutName,
      getPlanOwnerId,
      occupancy,
    ],
  );

  useEffect(() => {
    let isMounted = true;

    const restorePendingCheckout = async () => {
      try {
        const raw = await AsyncStorage.getItem(
          PENDING_FAMILY_SLOT_CHECKOUT_KEY,
        );
        if (!raw || !isMounted) {
          setRestoredPendingCheckout(true);
          return;
        }

        const parsed = JSON.parse(raw);
        if (parsed && parsed.ownerUserId && Number(parsed.slots) > 0) {
          setRecoveredPendingCheckout(true);
          setPendingSlotCheckout({
            ownerUserId: String(parsed.ownerUserId),
            slots: Number(parsed.slots),
            amount:
              Number(parsed.amount) ||
              Number(parsed.slots) * FAMILY_SLOT_PRICE_PHP,
            checkoutSessionId: parsed.checkoutSessionId
              ? String(parsed.checkoutSessionId)
              : undefined,
            paymentId: parsed.paymentId ? String(parsed.paymentId) : undefined,
            createdAt: parsed.createdAt
              ? String(parsed.createdAt)
              : new Date().toISOString(),
          });
        }
      } catch {
        // Ignore bad persisted state.
      } finally {
        if (isMounted) {
          setRestoredPendingCheckout(true);
        }
      }
    };

    restorePendingCheckout();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadFamilyMembers = useCallback(async (currentOccupancy: any) => {
    setFamilyMembersReady(false);
    const occId = currentOccupancy?.is_family_member
      ? currentOccupancy?.parent_occupancy_id
      : currentOccupancy?.id;

    if (!occId) {
      setFamilyMembers([]);
      setFamilyMembersReady(true);
      return;
    }

    setLoadingFamily(true);
    try {
      const API_URL = getApiBaseUrl();
      if (API_URL) {
        const familyMembersUrl = `${API_URL}/api/family-members?occupancy_id=${occId}&_ts=${Date.now()}`;
        const response = await fetch(familyMembersUrl, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });

        if (response.ok) {
          const data = await response.json();
          const members = Array.isArray(data?.members) ? data.members : [];
          setFamilyMembers(members);
          return;
        }
      }

      const { data: links, error: linksError } = await supabase
        .from("family_members")
        .select("id, parent_occupancy_id, member_id, added_by, created_at")
        .eq("parent_occupancy_id", occId)
        .order("created_at", { ascending: false });

      if (linksError) {
        setFamilyMembers([]);
        return;
      }

      const normalizedLinks = Array.isArray(links) ? links : [];
      const memberIds = Array.from(
        new Set(
          normalizedLinks
            .map((link: any) => String(link?.member_id || ""))
            .filter(Boolean),
        ),
      );

      if (!memberIds.length) {
        setFamilyMembers([]);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, avatar_url")
        .in("id", memberIds);

      const profileMap = new Map(
        (profiles || []).map((p: any) => [String(p.id), p]),
      );

      setFamilyMembers(
        normalizedLinks.map((link: any) => ({
          ...link,
          member_profile: profileMap.get(String(link?.member_id || "")) || null,
        })),
      );
    } catch (error) {
      console.error("loadFamilyMembers error:", error);
      setFamilyMembers([]);
    } finally {
      setLoadingFamily(false);
      setFamilyMembersReady(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setSessionUser(null);
        setOccupancy(null);
        setFamilyMembersReady(true);
        return;
      }

      const user = { id: session.user.id };
      setSessionUser(user);

      const API_URL = getApiBaseUrl();
      if (API_URL) {
        try {
          const familyCheckUrl = `${API_URL}/api/family-members?member_id=${user.id}&_ts=${Date.now()}`;
          const fmResponse = await fetch(familyCheckUrl, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
              Pragma: "no-cache",
            },
          });

          if (fmResponse.ok) {
            const fmData = await fmResponse.json();
            if (fmData?.occupancy) {
              setIsFamilyMember(true);
              setOccupancy(fmData.occupancy);
              await loadFamilyMembers(fmData.occupancy);
              return;
            }
          }
        } catch (error) {
          console.error("family member check failed:", error);
        }
      }

      setIsFamilyMember(false);
      const { data: occupancies, error } = await supabase
        .from("tenant_occupancies")
        .select("*, property:properties(*)")
        .eq("tenant_id", user.id)
        .in("status", statuses)
        .order("start_date", { ascending: false });

      if (error) {
        console.error("Failed to fetch occupancy:", error);
        setOccupancy(null);
        return;
      }

      const validOccupancies = (occupancies || []).filter(
        (occ: any) => occ?.property && !occ?.property?.is_deleted,
      );

      const activeGroup = validOccupancies.filter(
        (occ: any) => occ.status === "active" || occ.status === "pending_end",
      );
      const signedGroup = validOccupancies.filter(
        (occ: any) => occ.status === "approved" || occ.status === "signed",
      );

      const selected = activeGroup[0] || signedGroup[0] || null;

      setOccupancy(selected);
      if (selected) {
        setFamilyMembersReady(false);
        await loadFamilyMembers(selected);
      } else {
        setFamilyMembers([]);
        setFamilyMembersReady(true);
      }
    } catch (error) {
      console.error("loadData error:", error);
      setOccupancy(null);
      setFamilyMembersReady(true);
    } finally {
      setLoading(false);
    }
  }, [loadFamilyMembers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const ownerUserId = getPlanOwnerId(occupancy);
    if (!ownerUserId || !familyMembersReady) return;
    loadFamilySlotSummary(ownerUserId, familyMembers.length);
  }, [
    familyMembers.length,
    familyMembersReady,
    getPlanOwnerId,
    loadFamilySlotSummary,
    occupancy,
  ]);

  const searchFamilyMembers = useCallback(
    async (query: string) => {
      const trimmedQuery = String(query || "").trim();
      latestFamilySearchQueryRef.current = trimmedQuery;

      if (!trimmedQuery || trimmedQuery.length < 2 || !sessionUser) {
        familySearchRequestRef.current += 1;
        setFamilySearching(false);
        setFamilySearchResults([]);
        setFamilySearchResolvedQuery("");
        return;
      }

      const requestId = familySearchRequestRef.current + 1;
      familySearchRequestRef.current = requestId;
      setFamilySearching(true);
      try {
        const API_URL = getApiBaseUrl();
        if (!API_URL) {
          if (
            requestId === familySearchRequestRef.current &&
            latestFamilySearchQueryRef.current === trimmedQuery
          ) {
            setFamilySearchResults([]);
            setFamilySearchResolvedQuery(trimmedQuery);
          }
          return;
        }

        const excludeIds = [
          sessionUser.id,
          ...familyMembers
            .map((member: any) => getMemberId(member))
            .filter(Boolean),
        ];

        const response = await fetch(`${API_URL}/api/family-members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "search",
            query: trimmedQuery,
            exclude_ids: excludeIds,
          }),
        });

        if (
          requestId !== familySearchRequestRef.current ||
          latestFamilySearchQueryRef.current !== trimmedQuery
        ) {
          return;
        }

        if (!response.ok) {
          setFamilySearchResults([]);
          setFamilySearchResolvedQuery(trimmedQuery);
          return;
        }

        const data = await response.json();
        setFamilySearchResults(
          Array.isArray(data?.results) ? data.results : [],
        );
        setFamilySearchResolvedQuery(trimmedQuery);
      } catch (error) {
        console.error("searchFamilyMembers error:", error);
        if (
          requestId === familySearchRequestRef.current &&
          latestFamilySearchQueryRef.current === trimmedQuery
        ) {
          setFamilySearchResults([]);
          setFamilySearchResolvedQuery(trimmedQuery);
        }
      } finally {
        if (
          requestId === familySearchRequestRef.current &&
          latestFamilySearchQueryRef.current === trimmedQuery
        ) {
          setFamilySearching(false);
        }
      }
    },
    [familyMembers, getMemberId, sessionUser],
  );

  useEffect(() => {
    if (!normalizedFamilySearchQuery) {
      latestFamilySearchQueryRef.current = "";
      familySearchRequestRef.current += 1;
      setFamilySearching(false);
      setFamilySearchResults([]);
      setFamilySearchResolvedQuery("");
      return;
    }

    const timer = setTimeout(() => {
      searchFamilyMembers(normalizedFamilySearchQuery);
    }, 350);

    return () => clearTimeout(timer);
  }, [normalizedFamilySearchQuery, searchFamilyMembers]);

  const ensureFamilyLink = useCallback(
    async (memberId: string) => {
      if (!occupancy || !sessionUser) return false;

      const parentOccupancyId = occupancy?.is_family_member
        ? occupancy?.parent_occupancy_id || occupancy?.id
        : occupancy?.id;
      const addedBy = occupancy?.tenant_id || sessionUser.id;
      const memberOccupancyId = parentOccupancyId;

      const isMissingColumnError = (error: any) => {
        const message = String(error?.message || "").toLowerCase();
        const details = String((error as any)?.details || "").toLowerCase();
        const code = String(error?.code || "").toUpperCase();
        return (
          code === "PGRST204" ||
          ((message.includes("column") || message.includes("schema cache")) &&
            (message.includes("does not exist") ||
              message.includes("could not find"))) ||
          details.includes("failed to parse")
        );
      };

      const isRlsError = (error: any) => {
        const code = String(error?.code || "").toUpperCase();
        const message = String(error?.message || "").toLowerCase();
        return code === "42501" || message.includes("row-level security");
      };

      const isDuplicateLinkError = (error: any) => {
        const code = String(error?.code || "").toUpperCase();
        const message = String(error?.message || "").toLowerCase();
        return (
          code === "23505" &&
          (message.includes("duplicate key") ||
            message.includes("unique constraint"))
        );
      };

      const canonicalPayload = {
        parent_occupancy_id: parentOccupancyId,
        member_id: memberId,
        member_occupancy_id: memberOccupancyId,
        added_by: addedBy,
        created_at: new Date().toISOString(),
      };

      const reactivateLinkColumns = async (rowId: string) => {
        try {
          await supabase
            .from("family_members")
            .update(canonicalPayload)
            .eq("id", rowId);
        } catch {
          // Best effort refresh for known schema columns.
        }
      };

      const tryUpsertLink = async () => {
        try {
          const { error } = await supabase
            .from("family_members")
            .upsert(canonicalPayload, {
              onConflict: "parent_occupancy_id,member_id",
            });

          if (!error) {
            return true;
          }

          if (isRlsError(error) || isMissingColumnError(error)) {
            return false;
          }

          if (!isDuplicateLinkError(error)) {
            console.error("ensureFamilyLink upsert error:", error);
          }
        } catch (upsertErr) {
          console.error("ensureFamilyLink upsert exception:", upsertErr);
        }

        return false;
      };

      const tryInsertPayloads = async () => {
        const payloads = [
          {
            parent_occupancy_id: parentOccupancyId,
            member_id: memberId,
            member_occupancy_id: memberOccupancyId,
            added_by: addedBy,
          },
          {
            parent_occupancy_id: parentOccupancyId,
            member_id: memberId,
            added_by: addedBy,
          },
          {
            parent_occupancy_id: parentOccupancyId,
            member_id: memberId,
            member_occupancy_id: memberOccupancyId,
          },
          {
            parent_occupancy_id: parentOccupancyId,
            member_id: memberId,
          },
        ];

        for (const payload of payloads) {
          try {
            const { data: rows, error } = await supabase
              .from("family_members")
              .insert(payload)
              .select("id")
              .limit(1);

            if (!error && rows && rows.length > 0) {
              return rows[0]?.id || null;
            }

            if (error) {
              if (isRlsError(error)) {
                continue;
              }
              if (isDuplicateLinkError(error)) {
                try {
                  const { data: existing } = await supabase
                    .from("family_members")
                    .select("id")
                    .eq("parent_occupancy_id", parentOccupancyId)
                    .eq("member_id", memberId)
                    .limit(1)
                    .maybeSingle();
                  if (existing?.id) {
                    return String(existing.id);
                  }
                } catch {
                  // If read is blocked by RLS, duplicate still means row already exists.
                }
                continue;
              }
              const ignoreColumnError = isMissingColumnError(error);
              if (!ignoreColumnError) {
                // Keep trying other shapes, but preserve logs for non-column issues.
                console.error("ensureFamilyLink insert error:", error);
              }
            }
          } catch (insertErr) {
            console.error("ensureFamilyLink insert exception:", insertErr);
          }
        }

        return null;
      };

      const findExistingRows = async () => {
        const columns = ["member_id"];
        const found: any[] = [];

        for (const column of columns) {
          try {
            const { data, error } = await supabase
              .from("family_members")
              .select("id, created_at")
              .eq(column, memberId)
              .eq("parent_occupancy_id", parentOccupancyId)
              .order("created_at", { ascending: false })
              .limit(5);

            if (error) {
              if (isRlsError(error)) {
                continue;
              }
              const ignoreColumnError = isMissingColumnError(error);
              if (!ignoreColumnError) {
                console.error("ensureFamilyLink existing-row error:", error);
              }
              continue;
            }

            if (Array.isArray(data) && data.length > 0) {
              found.push(...data);
            }
          } catch (rowErr) {
            console.error("ensureFamilyLink existing-row exception:", rowErr);
          }
        }

        const byId = new Map<string, any>();
        for (const row of found) {
          if (row?.id && !byId.has(String(row.id))) {
            byId.set(String(row.id), row);
          }
        }

        return Array.from(byId.values()).sort((a: any, b: any) => {
          const aTime = new Date(a?.created_at || 0).getTime();
          const bTime = new Date(b?.created_at || 0).getTime();
          return bTime - aTime;
        });
      };

      const relinkExistingRow = async (rowId: string) => {
        const updatePayloads = [
          {
            parent_occupancy_id: parentOccupancyId,
            member_occupancy_id: memberOccupancyId,
            added_by: addedBy,
          },
          { parent_occupancy_id: parentOccupancyId, added_by: addedBy },
          { parent_occupancy_id: parentOccupancyId },
        ];

        for (const payload of updatePayloads) {
          try {
            const { error } = await supabase
              .from("family_members")
              .update(payload)
              .eq("id", rowId);

            if (!error) {
              return true;
            }

            if (isRlsError(error)) {
              continue;
            }

            const ignoreColumnError = isMissingColumnError(error);
            if (!ignoreColumnError) {
              console.error("ensureFamilyLink relink error:", error);
            }
          } catch (relinkErr) {
            console.error("ensureFamilyLink relink exception:", relinkErr);
          }
        }

        return false;
      };

      try {
        const upserted = await tryUpsertLink();
        if (upserted) {
          return true;
        }

        const insertedId = await tryInsertPayloads();
        if (insertedId) {
          await reactivateLinkColumns(insertedId);
          return true;
        }

        const existingRows = await findExistingRows();
        if (!existingRows || existingRows.length === 0) {
          return false;
        }

        const existingId = existingRows[0]?.id;
        if (!existingId) return false;

        const relinked = await relinkExistingRow(existingId);
        if (!relinked) {
          return false;
        }

        await reactivateLinkColumns(existingId);
        return true;
      } catch (fallbackError) {
        console.error("ensureFamilyLink fallback error:", fallbackError);
        return false;
      }
    },
    [occupancy, sessionUser],
  );

  const addFamilyMember = useCallback(
    async (memberId: string) => {
      if (!occupancy || !sessionUser) return;
      if (isFamilyMember) {
        Alert.alert("Not allowed", "Only the primary tenant can add members.");
        return;
      }
      if (familySlotsFull) {
        Alert.alert(
          "Limit reached",
          maxFamilySlotsReached
            ? `You already reached the maximum of ${MAX_FAMILY_SLOT_COUNT} family slots.`
            : `Your plan allows up to ${familySlotSummary.total} family member slot${familySlotSummary.total > 1 ? "s" : ""}. Buy extra slots to continue.`,
        );
        return;
      }

      setAddingMember(memberId);
      try {
        const API_URL = getApiBaseUrl();
        const parentOccupancyId = occupancy?.is_family_member
          ? occupancy?.parent_occupancy_id || occupancy?.id
          : occupancy?.id;
        const motherId = occupancy?.tenant_id || sessionUser.id;
        const addedBy = motherId;
        const memberOccupancyId = parentOccupancyId;
        let apiReportedSuccess = false;
        let apiErrorMessage = "Failed to add family member.";

        // Purge any existing soft-deleted references in the database
        // before the API call to guarantee a fresh insertion with a new created_at.
        if (parentOccupancyId && memberId) {
          try {
            await supabase
              .from("family_members")
              .delete()
              .eq("parent_occupancy_id", parentOccupancyId)
              .eq("member_id", memberId);
          } catch (e) {}
        }

        const isProbablyActiveLink = (row: any) => {
          const status = String(
            row?.status || row?.member_status || "",
          ).toLowerCase();
          if (["removed", "inactive", "left", "deleted"].includes(status)) {
            return false;
          }
          if (row?.is_active === false || row?.active === false) {
            return false;
          }
          if (row?.removed_at || row?.deleted_at || row?.left_at) {
            return false;
          }
          return true;
        };

        const verifyFamilyLink = async () => {
          const expectedParentId = String(parentOccupancyId || "");
          if (!expectedParentId) return false;

          if (API_URL) {
            try {
              const verifyRes = await fetch(
                `${API_URL}/api/family-members?member_id=${encodeURIComponent(memberId)}&_ts=${Date.now()}`,
                {
                  cache: "no-store",
                  headers: {
                    "Cache-Control": "no-cache",
                    Pragma: "no-cache",
                  },
                },
              );

              if (verifyRes.ok) {
                const verifyData = await verifyRes.json().catch(() => null);
                const records = Array.isArray(verifyData)
                  ? verifyData
                  : [
                      verifyData,
                      verifyData?.data,
                      verifyData?.result,
                      verifyData?.member,
                      verifyData?.family_member,
                    ].filter(Boolean);

                const apiParentId = records
                  .map(
                    (r: any) =>
                      r?.parent_occupancy_id ||
                      r?.parentOccupancyId ||
                      r?.member_occupancy_id ||
                      r?.memberOccupancyId ||
                      r?.occupancy_id ||
                      r?.occupancyId ||
                      r?.occupancy?.id ||
                      null,
                  )
                  .find(Boolean);

                if (apiParentId && String(apiParentId) === expectedParentId) {
                  return true;
                }
              }
            } catch (verifyApiErr) {
              console.error("addFamilyMember verify API error:", verifyApiErr);
            }
          }

          const columns = ["member_id"];
          const rows: any[] = [];
          for (const column of columns) {
            try {
              const { data, error } = await supabase
                .from("family_members")
                .select("*")
                .eq(column, memberId)
                .order("created_at", { ascending: false })
                .limit(10);

              if (error) {
                const message = String(error?.message || "").toLowerCase();
                const details = String(
                  (error as any)?.details || "",
                ).toLowerCase();
                const code = String(error?.code || "").toUpperCase();
                const ignoreColumnError =
                  code === "PGRST204" ||
                  ((message.includes("column") ||
                    message.includes("schema cache")) &&
                    (message.includes("does not exist") ||
                      message.includes("could not find"))) ||
                  details.includes("failed to parse");
                if (!ignoreColumnError) {
                  console.error("addFamilyMember verify DB error:", error);
                }
                continue;
              }

              if (Array.isArray(data)) {
                rows.push(...data);
              }
            } catch (verifyDbErr) {
              console.error(
                "addFamilyMember verify DB exception:",
                verifyDbErr,
              );
            }
          }

          return rows.some((row: any) => {
            const rowParentId =
              row?.parent_occupancy_id ||
              row?.parentOccupancyId ||
              row?.member_occupancy_id ||
              row?.memberOccupancyId ||
              row?.occupancy_id ||
              row?.occupancyId ||
              null;
            return (
              rowParentId &&
              String(rowParentId) === expectedParentId &&
              isProbablyActiveLink(row)
            );
          });
        };

        let recovered = false;
        if (API_URL) {
          const response = await fetch(`${API_URL}/api/family-members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "add",
              parent_occupancy_id: parentOccupancyId,
              member_id: memberId,
              mother_id: motherId,
              added_by: addedBy,
              member_occupancy_id: memberOccupancyId,
            }),
          });

          const data = await response.json().catch(() => null);
          apiErrorMessage = data?.error || apiErrorMessage;

          apiReportedSuccess = response.ok && Boolean(data?.success);
          const linkVisible = apiReportedSuccess
            ? await verifyFamilyLink()
            : false;

          if (!apiReportedSuccess || !linkVisible) {
            recovered = await ensureFamilyLink(memberId);
            if (!recovered) {
              const normalizedApiError = String(
                data?.error || "",
              ).toLowerCase();
              const rlsBlocked =
                normalizedApiError.includes("row-level security") ||
                normalizedApiError.includes("42501");
              Alert.alert(
                "Error",
                rlsBlocked
                  ? "Family member write is blocked by Supabase RLS policy. Run supabase/fix_family_members_rls.sql, then try again."
                  : data?.error || "Failed to add family member.",
              );
              return;
            }
          }
        } else {
          recovered = await ensureFamilyLink(memberId);
          if (!recovered) {
            Alert.alert("Error", "Failed to add family member.");
            return;
          }
        }

        if (apiReportedSuccess) {
          const ensured = await ensureFamilyLink(memberId);
          if (!ensured) {
            console.warn(
              "addFamilyMember: API succeeded but direct DB ensure failed.",
            );
          }
        } else if (!recovered) {
          Alert.alert("Error", apiErrorMessage);
          return;
        }

        const verified = await verifyFamilyLink();
        if (!verified) {
          Alert.alert(
            "Error",
            "Could not confirm that the family member was linked. Please try again.",
          );
          return;
        }

        Alert.alert("Success", "Family member added successfully.");
        setFamilySearchQuery("");
        setFamilySearchResults([]);
        await loadFamilyMembers(occupancy);
      } catch (error) {
        console.error("addFamilyMember error:", error);
        Alert.alert("Error", "Failed to add family member.");
      } finally {
        setAddingMember(null);
      }
    },
    [
      familySlotsFull,
      familySlotSummary.total,
      ensureFamilyLink,
      isFamilyMember,
      loadFamilyMembers,
      maxFamilySlotsReached,
      occupancy,
      sessionUser,
    ],
  );

  useEffect(() => {
    if (
      !restoredPendingCheckout ||
      !recoveredPendingCheckout ||
      !pendingSlotCheckout
    ) {
      return;
    }

    verifyFamilySlotCheckout(pendingSlotCheckout, true, {
      maxAttempts: 4,
      delayMs: 800,
    });
  }, [
    pendingSlotCheckout,
    recoveredPendingCheckout,
    restoredPendingCheckout,
    verifyFamilySlotCheckout,
  ]);

  useEffect(() => {
    if (
      !restoredPendingCheckout ||
      !recoveredPendingCheckout ||
      !pendingSlotCheckout
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      verifyFamilySlotCheckout(pendingSlotCheckout, true, {
        maxAttempts: 4,
        delayMs: 800,
      });
    }, 12000);

    return () => clearInterval(intervalId);
  }, [
    pendingSlotCheckout,
    recoveredPendingCheckout,
    restoredPendingCheckout,
    verifyFamilySlotCheckout,
  ]);

  const removeFamilyMember = useCallback(
    async (familyMemberId: string) => {
      if (!occupancy || !sessionUser || isFamilyMember) return;

      setRemovingMember(familyMemberId);
      try {
        const API_URL = getApiBaseUrl();

        // 1. Direct DB deletion to ensure hard removal
        const parentOccId = occupancy?.is_family_member
          ? occupancy?.parent_occupancy_id || occupancy?.id
          : occupancy?.id;

        if (parentOccId) {
          try {
            if (String(familyMemberId).includes("-")) {
              await supabase
                .from("family_members")
                .delete()
                .eq("parent_occupancy_id", parentOccId)
                .eq("member_id", familyMemberId);
            } else {
              await supabase
                .from("family_members")
                .delete()
                .eq("parent_occupancy_id", parentOccId)
                .eq("id", familyMemberId);
            }
          } catch (deleteErr) {
            console.error("Direct db delete error:", deleteErr);
          }
        }

        // 2. Call API to notify backend as well
        if (API_URL) {
          const motherId = occupancy?.tenant_id || sessionUser.id;
          const response = await fetch(`${API_URL}/api/family-members`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              family_member_id: familyMemberId,
              mother_id: motherId,
            }),
          });
          await response.json().catch(() => null);
        }

        Alert.alert("Removed", "Family member removed completely.");
        await loadFamilyMembers(occupancy);
      } catch (error) {
        console.error("removeFamilyMember error:", error);
        Alert.alert("Error", "Failed to remove member.");
      } finally {
        setRemovingMember(null);
      }
    },
    [isFamilyMember, loadFamilyMembers, occupancy, sessionUser],
  );

  // const primaryLabel = useMemo(() => {
  //   if (isFamilyMember) {
  //     const first = occupancy?.tenant?.first_name || "";
  //     const last = occupancy?.tenant?.last_name || "";
  //     return `${first} ${last}`.trim() || "Primary Tenant";
  //   }
  //   return "You (Primary Tenant)";
  // }, [isFamilyMember, occupancy]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? colors.background : "#f3f4f6" },
        ]}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? colors.card : "white",
                borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                marginTop: 35,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <View style={styles.headerBackButton}>
                <Ionicons
                  name="arrow-back"
                  size={20}
                  color={isDark ? colors.text : "#111827"}
                />
              </View>
              <Text
                style={[
                  styles.headerTitle,
                  { color: isDark ? colors.text : "#111827" },
                ]}
              >
                Add Family
              </Text>
              <View style={styles.headerBackButton} />
            </View>

            <SkeletonBlock
              width="34%"
              height={12}
              borderRadius={6}
              backgroundColor={skeletonColor}
              style={styles.skeletonCenteredLine}
            />

            <View
              style={[
                styles.planInfoBox,
                {
                  backgroundColor: isDark ? colors.surface : "#f9fafb",
                  borderColor: isDark ? colors.border : "#e5e7eb",
                },
              ]}
            >
              <View style={styles.planInfoHeader}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: isDark ? colors.text : "#111827",
                  }}
                >
                  Family Member Slots
                </Text>
                <SkeletonBlock
                  width={82}
                  height={14}
                  borderRadius={7}
                  backgroundColor={skeletonColor}
                />
              </View>

              <SkeletonBlock
                width="56%"
                height={12}
                borderRadius={6}
                backgroundColor={skeletonColor}
                style={{ marginTop: 12 }}
              />
              <SkeletonBlock
                width="100%"
                height={34}
                borderRadius={8}
                backgroundColor={skeletonColor}
                style={{ marginTop: 10 }}
              />
            </View>

            <View style={styles.searchArea}>
              <View
                style={[
                  styles.searchBox,
                  {
                    backgroundColor: isDark ? colors.surface : "#f9fafb",
                    borderColor: isDark ? colors.border : "#e5e7eb",
                  },
                ]}
              >
                <SkeletonBlock
                  width="100%"
                  height={18}
                  borderRadius={9}
                  backgroundColor={skeletonColor}
                  style={{ marginVertical: 11 }}
                />
              </View>
            </View>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? colors.card : "white",
                borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: isDark ? colors.text : "#111827" },
                ]}
              >
                Current Members
              </Text>
              <Ionicons
                name="refresh"
                size={16}
                color={isDark ? colors.textMuted : "#6b7280"}
              />
            </View>

            {renderMemberSkeletonRows()}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!sessionUser) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f8fafc" },
        ]}
      >
        <Text
          style={[
            styles.emptyTitle,
            { color: isDark ? colors.text : "#111827" },
          ]}
        >
          You are not logged in.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/login")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!occupancy) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f8fafc" },
        ]}
      >
        <Ionicons name="home-outline" size={42} color="#9ca3af" />
        <Text
          style={[
            styles.emptyTitle,
            { color: isDark ? colors.text : "#111827" },
          ]}
        >
          No active property found.
        </Text>
        <Text
          style={[
            styles.emptySubtitle,
            { color: isDark ? colors.textMuted : "#6b7280" },
          ]}
        >
          Family members can only be managed when you have an active occupancy.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f3f4f6" },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
              marginTop: 35,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBackButton}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={isDark ? colors.text : "#111827"}
              />
            </TouchableOpacity>
            <Text
              style={[
                styles.headerTitle,
                { color: isDark ? colors.text : "#111827" },
              ]}
            >
              Add Family
            </Text>
            <View style={styles.headerBackButton} />
          </View>

          {isAddFamilySectionLoading ? (
            <SkeletonBlock
              width="34%"
              height={12}
              borderRadius={6}
              backgroundColor={skeletonColor}
              style={styles.skeletonCenteredLine}
            />
          ) : (
            <Text
              style={[
                styles.centeredSubtitle,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              {familyMembers.length}/{familySlotSummary.total} slots used
            </Text>
          )}

          <View
            style={[
              styles.planInfoBox,
              {
                backgroundColor: isDark ? colors.surface : "#f9fafb",
                borderColor: isDark ? colors.border : "#e5e7eb",
              },
            ]}
          >
            <View style={styles.planInfoHeader}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "800",
                  color: isDark ? colors.text : "#111827",
                }}
              >
                Family Member Slots
              </Text>
              {isRemainingLoading ? (
                <SkeletonBlock
                  width={82}
                  height={14}
                  borderRadius={7}
                  backgroundColor={skeletonColor}
                />
              ) : (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: isDark ? colors.textMuted : "#6b7280",
                  }}
                >
                  Remaining: {familySlotSummary.remaining}
                </Text>
              )}
            </View>
            {!isFamilyMember &&
              (isRemainingLoading ? (
                <SkeletonBlock
                  width="100%"
                  height={34}
                  borderRadius={8}
                  backgroundColor={skeletonColor}
                  style={{ marginTop: 10 }}
                />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.buySlotButton,
                    maxFamilySlotsReached && styles.buySlotButtonLoading,
                  ]}
                  onPress={() => buyFamilySlots(1)}
                  disabled={isSlotPaymentBusy || maxFamilySlotsReached}
                >
                  {isSlotPaymentBusy ? (
                    <View style={styles.buySlotButtonLoadingContent}>
                      <ActivityIndicator size="small" color="white" />
                      <Text style={styles.buySlotButtonText}>
                        {verifyingSlotPayment
                          ? "Verifying the payment"
                          : "Opening checkout..."}
                      </Text>
                    </View>
                  ) : maxFamilySlotsReached ? (
                    <Text style={styles.buySlotButtonText}>
                      Maximum slots reached
                    </Text>
                  ) : (
                    <Text style={styles.buySlotButtonText}>
                      Buy family Slot
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
          </View>

          {/* <View style={styles.primaryRow}>
            <View style={styles.primaryAvatar}>
              <Ionicons name="person" size={16} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.primaryName,
                  { color: isDark ? colors.text : "#111827" },
                ]}
              >
                {primaryLabel}
              </Text>
              <Text
                style={[
                  styles.primaryTag,
                  { color: isDark ? colors.textMuted : "#6b7280" },
                ]}
              >
                Primary tenant
              </Text>
            </View>
          </View> */}

          {isFamilyMember && (
            <View
              style={[
                styles.notice,
                {
                  backgroundColor: isDark ? "rgba(180,83,9,0.14)" : "#fffbeb",
                  borderColor: isDark ? "rgba(180,83,9,0.3)" : "#fde68a",
                },
              ]}
            >
              <Text
                style={{
                  color: isDark ? "#fbbf24" : "#92400e",
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                You are a family member. Only the primary tenant can add or
                remove members.
              </Text>
            </View>
          )}

          {!isFamilyMember && (
            <>
              {isAddFamilySectionLoading ? (
                <View style={styles.searchArea}>
                  <View
                    style={[
                      styles.searchBox,
                      {
                        backgroundColor: isDark ? colors.surface : "#f9fafb",
                        borderColor: isDark ? colors.border : "#e5e7eb",
                      },
                    ]}
                  >
                    <SkeletonBlock
                      width="100%"
                      height={18}
                      borderRadius={9}
                      backgroundColor={skeletonColor}
                      style={{ marginVertical: 11 }}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.searchArea}>
                  <View
                    style={[
                      styles.searchBox,
                      {
                        backgroundColor: isDark ? colors.surface : "#f9fafb",
                        borderColor: isDark ? colors.border : "#e5e7eb",
                      },
                    ]}
                  >
                    <Ionicons
                      name="search-outline"
                      size={18}
                      color={isDark ? colors.textMuted : "#9ca3af"}
                    />
                    <TextInput
                      style={[
                        styles.searchInput,
                        { color: isDark ? colors.text : "#111827" },
                      ]}
                      placeholder="Search by name, email, or phone"
                      placeholderTextColor={
                        isDark ? colors.textMuted : "#9ca3af"
                      }
                      value={familySearchQuery}
                      onChangeText={setFamilySearchQuery}
                      editable={!familySlotsFull}
                      autoCorrect={false}
                      autoCapitalize="none"
                    />
                    {!!familySearchQuery && (
                      <TouchableOpacity
                        onPress={() => setFamilySearchQuery("")}
                      >
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color="#9ca3af"
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {showFamilySearchDropdown ? (
                    <View
                      style={[
                        styles.searchDropdown,
                        {
                          backgroundColor: isDark ? colors.card : "#ffffff",
                          borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                        },
                      ]}
                    >
                      {familySearching ? (
                        <View style={styles.searchDropdownStatus}>
                          <ActivityIndicator
                            size="small"
                            color={isDark ? colors.text : "#111827"}
                          />
                          <Text
                            style={[
                              styles.inlineText,
                              {
                                color: isDark ? colors.textMuted : "#6b7280",
                              },
                            ]}
                          >
                            Searching users...
                          </Text>
                        </View>
                      ) : familySearchResults.length > 0 ? (
                        <View style={styles.resultList}>
                          {familySearchResults.map((user: any) => {
                            const searchResultUserId =
                              user?.id ||
                              user?.member_id ||
                              user?.user_id ||
                              user?.profile_id ||
                              "";

                            if (!searchResultUserId) return null;

                            return (
                              <View
                                key={searchResultUserId}
                                style={[
                                  styles.resultItem,
                                  {
                                    backgroundColor: isDark
                                      ? colors.surface
                                      : "#ffffff",
                                    borderColor: isDark
                                      ? colors.border
                                      : "#e5e7eb",
                                  },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.resultAvatar,
                                    {
                                      backgroundColor: isDark
                                        ? colors.border
                                        : "#e5e7eb",
                                    },
                                  ]}
                                >
                                  {user?.avatar_url ? (
                                    <Image
                                      source={{ uri: user.avatar_url }}
                                      style={styles.resultImage}
                                    />
                                  ) : (
                                    <Text
                                      style={[
                                        styles.resultInitials,
                                        {
                                          color: isDark
                                            ? colors.text
                                            : "#374151",
                                        },
                                      ]}
                                    >
                                      {`${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`}
                                    </Text>
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      styles.resultName,
                                      {
                                        color: isDark ? colors.text : "#111827",
                                      },
                                    ]}
                                  >
                                    {`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.resultEmail,
                                      {
                                        color: isDark
                                          ? colors.textMuted
                                          : "#6b7280",
                                      },
                                    ]}
                                  >
                                    {user?.email || "No email"}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  onPress={() =>
                                    addFamilyMember(searchResultUserId)
                                  }
                                  disabled={
                                    addingMember === searchResultUserId ||
                                    familySlotsFull
                                  }
                                  style={[
                                    styles.addButton,
                                    (addingMember === searchResultUserId ||
                                      familySlotsFull) &&
                                      styles.addButtonDisabled,
                                  ]}
                                >
                                  {addingMember === searchResultUserId ? (
                                    <ActivityIndicator
                                      size="small"
                                      color="white"
                                    />
                                  ) : (
                                    <Text style={styles.addButtonText}>
                                      Add
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.emptySearchText,
                            {
                              color: isDark ? colors.textMuted : "#6b7280",
                            },
                          ]}
                        >
                          No users found.
                        </Text>
                      )}
                    </View>
                  ) : null}
                </View>
              )}

              {!isAddFamilySectionLoading && familySlotsFull && (
                <Text style={styles.slotWarning}>
                  {verifyingSlotPayment
                    ? "Payment detected. Finalizing and updating your slots..."
                    : maxFamilySlotsReached
                      ? `Maximum of ${MAX_FAMILY_SLOT_COUNT} family slots reached.`
                      : "Family member limit reached. Buy extra slots to add more."}
                </Text>
              )}
            </>
          )}
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#e5e7eb",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                { color: isDark ? colors.text : "#111827" },
              ]}
            >
              Current Members
            </Text>
            <TouchableOpacity onPress={() => loadFamilyMembers(occupancy)}>
              <Ionicons
                name="refresh"
                size={16}
                color={isDark ? colors.textMuted : "#6b7280"}
              />
            </TouchableOpacity>
          </View>

          {loadingFamily ? (
            renderMemberSkeletonRows()
          ) : familyMembers.length === 0 ? (
            <Text style={styles.emptySearchText}>No family members yet.</Text>
          ) : (
            <View style={styles.memberList}>
              {familyMembers.map((member: any) => {
                const profile = member?.member_profile || member;
                const rowId = member?.id;
                return (
                  <View
                    key={rowId || getMemberId(member)}
                    style={styles.memberRow}
                  >
                    <View style={styles.resultAvatar}>
                      {profile?.avatar_url ? (
                        <Image
                          source={{ uri: profile.avatar_url }}
                          style={styles.resultImage}
                        />
                      ) : (
                        <Text style={styles.resultInitials}>
                          {`${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName}>
                        {getDisplayName(member)}
                      </Text>
                      <Text style={styles.resultEmail}>
                        {getDisplayEmail(member)}
                      </Text>
                    </View>
                    {!isFamilyMember && !!rowId && (
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            "Remove family member",
                            "Are you sure you want to remove this member?",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Remove",
                                style: "destructive",
                                onPress: () => removeFamilyMember(rowId),
                              },
                            ],
                          );
                        }}
                        disabled={removingMember === rowId}
                        style={styles.removeButton}
                      >
                        {removingMember === rowId ? (
                          <ActivityIndicator size="small" color="#ef4444" />
                        ) : (
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color="#ef4444"
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      {showSlotPaymentOverlay ? (
        <View style={styles.slotPaymentOverlay}>
          <View
            style={[
              styles.slotPaymentOverlayCard,
              {
                backgroundColor: isDark ? colors.card : "#ffffff",
                borderColor: isDark ? colors.cardBorder : "#d1d5db",
              },
            ]}
          >
            <ActivityIndicator
              size="large"
              color={isDark ? colors.text : "#111827"}
            />
            <Text
              style={[
                styles.slotPaymentOverlayTitle,
                { color: isDark ? colors.text : "#111827" },
              ]}
            >
              {slotPaymentStatusTitle}
            </Text>
            <Text
              style={[
                styles.slotPaymentOverlayDescription,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              {slotPaymentStatusDescription}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 120,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
  },
  skeletonCenteredLine: {
    alignSelf: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  centeredSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  primaryAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#374151",
  },
  primaryName: {
    fontSize: 14,
    fontWeight: "800",
  },
  primaryTag: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
  },
  notice: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  searchArea: {
    position: "relative",
    zIndex: 20,
  },
  searchBox: {
    marginTop: 0,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 8,
    fontSize: 14,
  },
  searchDropdown: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    maxHeight: 260,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  searchDropdownStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  slotWarning: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
  },
  planInfoBox: {
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  planInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  buySlotButton: {
    marginTop: 10,
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buySlotButtonLoading: {
    backgroundColor: "#9ca3af",
  },
  buySlotButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },
  buySlotButtonLoadingContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingInline: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineText: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  resultList: {
    gap: 8,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    gap: 10,
    backgroundColor: "#ffffff",
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
  },
  resultImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  resultInitials: {
    fontSize: 11,
    fontWeight: "800",
    color: "#374151",
  },
  resultName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  resultEmail: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 1,
  },
  addButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 52,
    alignItems: "center",
  },
  addButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  addButtonText: {
    color: "white",
    fontWeight: "800",
    fontSize: 12,
  },
  emptySearchText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  memberList: {
    marginTop: 10,
    gap: 8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    gap: 10,
    backgroundColor: "#ffffff",
  },
  removeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  slotPaymentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  slotPaymentOverlayCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  slotPaymentOverlayTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  slotPaymentOverlayDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
  },
});
