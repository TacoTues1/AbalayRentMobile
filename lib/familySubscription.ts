import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

export const FREE_FAMILY_SLOT_COUNT = 1;
export const FAMILY_SLOT_PRICE_PHP = 50;
export const MAX_FAMILY_SLOT_COUNT = 4;

const MAX_EXTRA_FAMILY_SLOT_COUNT = Math.max(
  0,
  MAX_FAMILY_SLOT_COUNT - FREE_FAMILY_SLOT_COUNT,
);

const ACTIVE_OCCUPANCY_STATUSES = [
  "active",
  "pending_end",
  "approved",
  "signed",
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

const CONFIRMED_FAMILY_SLOT_PURCHASES_KEY = "confirmed_family_slot_purchases";

export type FamilySubscriptionState = {
  occupancy: any | null;
  isFamilyMember: boolean;
  paidExtra: number;
  total: number;
  used: number;
  available: number;
  max: number;
  history: {
    id: string;
    slots: number;
    amount: number;
    paidAt: string | null;
    status: string;
  }[];
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const isMissingSchemaError = (error: any) => {
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
};

const hasPaidStatus = (row: any) => {
  const status = String(
    row?.status || row?.payment_status || row?.state || "",
  ).toLowerCase();

  if (!status) return row?.is_paid !== false;
  return PAID_STATUS_VALUES.includes(status);
};

const fetchRowsByUserColumn = async (tableName: string, userId: string) => {
  const rows: any[] = [];
  const seenRows = new Set<string>();

  const appendRows = (nextRows: any[]) => {
    for (const row of nextRows) {
      const rowKey = String(
        row?.id ||
          row?.payment_id ||
          row?.payment_reference ||
          row?.reference_id ||
          JSON.stringify(row),
      );

      if (seenRows.has(rowKey)) continue;
      seenRows.add(rowKey);
      rows.push(row);
    }
  };

  for (const userColumn of USER_COLUMN_CANDIDATES) {
    const orderedResponse = await supabase
      .from(tableName)
      .select("*")
      .eq(userColumn, userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!orderedResponse.error) {
      appendRows(orderedResponse.data || []);
      continue;
    }

    const fallbackResponse = await supabase
      .from(tableName)
      .select("*")
      .eq(userColumn, userId)
      .limit(200);

    if (!fallbackResponse.error) {
      appendRows(fallbackResponse.data || []);
      continue;
    }

    const relevantError = fallbackResponse.error || orderedResponse.error;
    if (!isMissingSchemaError(relevantError)) {
      console.log(
        `fetchRowsByUserColumn ${tableName}.${userColumn} failed`,
        relevantError,
      );
    }
  }

  return rows;
};

const loadPaidSlotData = async (ownerUserId: string) => {
  const subscriptionRowsByTable = await Promise.all(
    SUBSCRIPTION_TABLE_CANDIDATES.map((tableName) =>
      fetchRowsByUserColumn(tableName, ownerUserId),
    ),
  );

  const paymentRowsByTable = await Promise.all(
    SUBSCRIPTION_PAYMENT_TABLE_CANDIDATES.map((tableName) =>
      fetchRowsByUserColumn(tableName, ownerUserId),
    ),
  );

  const subscriptionRows = subscriptionRowsByTable.flat();
  const paymentRows = paymentRowsByTable.flat();

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

    if (totalSlotsCandidate > maxTotalSlots) maxTotalSlots = totalSlotsCandidate;

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
  const paidHistory: FamilySubscriptionState["history"] = [];

  for (const row of paymentRows) {
    if (!hasPaidStatus(row)) continue;

    const slotQty = Math.max(
      toNumber(row?.slots),
      toNumber(row?.slot_count),
      toNumber(row?.quantity),
      toNumber(row?.additional_slots),
    );
    const amount = Math.max(
      toNumber(row?.amount),
      toNumber(row?.amount_paid),
      toNumber(row?.total_amount),
    );
    const inferredSlots =
      slotQty > 0
        ? slotQty
        : amount > 0
          ? Math.floor(amount / FAMILY_SLOT_PRICE_PHP)
          : 0;

    if (inferredSlots > 0) extraFromPayments += inferredSlots;

    paidHistory.push({
      id: String(
        row?.id || row?.payment_id || row?.reference_id || Math.random(),
      ),
      slots: Math.max(1, inferredSlots || 1),
      amount: amount || FAMILY_SLOT_PRICE_PHP,
      paidAt: row?.paid_at || row?.updated_at || row?.created_at || null,
      status: String(row?.status || row?.payment_status || "paid"),
    });
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

  return {
    paidExtra,
    history: paidHistory,
  };
};

const loadLocalPaidSlotData = async (ownerUserId: string) => {
  try {
    const raw = await AsyncStorage.getItem(
      CONFIRMED_FAMILY_SLOT_PURCHASES_KEY,
    );
    const purchases = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(purchases)) {
      return { paidExtra: 0, history: [] };
    }

    const ownerPurchases = purchases.filter(
      (purchase: any) =>
        String(purchase?.ownerUserId || "") === String(ownerUserId),
    );

    const paidExtra = normalizePaidExtraSlotCount(
      ownerPurchases.reduce(
        (sum: number, purchase: any) =>
          sum + Math.max(0, Math.floor(Number(purchase?.slots) || 0)),
        0,
      ),
    );

    return {
      paidExtra,
      history: ownerPurchases.map((purchase: any) => ({
        id: String(
          purchase?.receiptId ||
            purchase?.paymentId ||
            purchase?.checkoutSessionId ||
            purchase?.createdAt ||
            Math.random(),
        ),
        slots: Math.max(1, Math.floor(Number(purchase?.slots) || 1)),
        amount: Math.max(
          FAMILY_SLOT_PRICE_PHP,
          Number(purchase?.amount) || FAMILY_SLOT_PRICE_PHP,
        ),
        paidAt: purchase?.createdAt || null,
        status: "paid",
      })),
    };
  } catch {
    return { paidExtra: 0, history: [] };
  }
};

const loadMergedPaidSlotData = async (ownerUserId: string) => {
  const [remoteData, localData] = await Promise.all([
    loadPaidSlotData(ownerUserId),
    loadLocalPaidSlotData(ownerUserId),
  ]);
  const seenHistory = new Set<string>();
  const history = [...remoteData.history, ...localData.history].filter(
    (item) => {
      const key = String(item.id || "");
      if (seenHistory.has(key)) return false;
      seenHistory.add(key);
      return true;
    },
  );

  return {
    paidExtra: normalizePaidExtraSlotCount(
      Math.max(remoteData.paidExtra, localData.paidExtra),
    ),
    history,
  };
};

const loadPrimaryTenantOccupancy = async (userId: string) => {
  const { data, error } = await supabase
    .from("tenant_occupancies")
    .select("*, property:properties(*)")
    .eq("tenant_id", userId)
    .in("status", ACTIVE_OCCUPANCY_STATUSES)
    .order("start_date", { ascending: false });

  if (error) throw error;

  const validOccupancies = (data || []).filter(
    (occ: any) => occ?.property && !occ?.property?.is_deleted,
  );
  const activeGroup = validOccupancies.filter(
    (occ: any) => occ.status === "active" || occ.status === "pending_end",
  );
  const signedGroup = validOccupancies.filter(
    (occ: any) => occ.status === "approved" || occ.status === "signed",
  );

  return activeGroup[0] || signedGroup[0] || null;
};

export const loadFamilySubscriptionForUser = async (
  userId: string,
): Promise<FamilySubscriptionState> => {
  const emptyState: FamilySubscriptionState = {
    occupancy: null,
    isFamilyMember: false,
    paidExtra: 0,
    total: FREE_FAMILY_SLOT_COUNT,
    used: 0,
    available: FREE_FAMILY_SLOT_COUNT,
    max: MAX_FAMILY_SLOT_COUNT,
    history: [],
  };

  if (!userId) return emptyState;

  const { data: familyLink } = await supabase
    .from("family_members")
    .select("id, parent_occupancy_id, member_id")
    .eq("member_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (familyLink?.parent_occupancy_id) {
    const { data: parentOccupancy } = await supabase
      .from("tenant_occupancies")
      .select("*, property:properties(*)")
      .eq("id", familyLink.parent_occupancy_id)
      .maybeSingle();

    const ownerUserId = String(parentOccupancy?.tenant_id || "");
    const used = await loadUsedFamilySlots(familyLink.parent_occupancy_id);
    const paidData = ownerUserId
      ? await loadMergedPaidSlotData(ownerUserId)
      : { paidExtra: 0, history: [] };
    const total = getTotalFamilySlotCount(paidData.paidExtra);

    return {
      occupancy: parentOccupancy || null,
      isFamilyMember: true,
      paidExtra: paidData.paidExtra,
      total,
      used,
      available: Math.max(0, total - used),
      max: MAX_FAMILY_SLOT_COUNT,
      history: paidData.history,
    };
  }

  const paidData = await loadMergedPaidSlotData(userId);
  const total = getTotalFamilySlotCount(paidData.paidExtra);
  let occupancy = null;
  try {
    occupancy = await loadPrimaryTenantOccupancy(userId);
  } catch (error) {
    console.log("loadFamilySubscriptionForUser occupancy lookup failed", error);
  }

  if (!occupancy?.id) {
    return {
      ...emptyState,
      paidExtra: paidData.paidExtra,
      total,
      available: total,
      history: paidData.history,
    };
  }

  const used = await loadUsedFamilySlots(occupancy.id);

  return {
    occupancy,
    isFamilyMember: false,
    paidExtra: paidData.paidExtra,
    total,
    used,
    available: Math.max(0, total - used),
    max: MAX_FAMILY_SLOT_COUNT,
    history: paidData.history,
  };
};

const loadUsedFamilySlots = async (occupancyId: string) => {
  const { count, error } = await supabase
    .from("family_members")
    .select("id", { count: "exact", head: true })
    .eq("parent_occupancy_id", occupancyId);

  if (error) {
    console.log("loadUsedFamilySlots failed", error);
    return 0;
  }

  return count || 0;
};
