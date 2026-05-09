import { supabase } from "./supabase";

export const FREE_PROPERTY_SLOT_COUNT = 3;
export const PROPERTY_SLOT_PRICE_PHP = 50;
export const MAX_PROPERTY_SLOT_COUNT = 10;

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://abalay-rent.me";

export type LandlordSubscriptionState = {
  paidExtra: number;
  total: number;
  used: number;
  available: number;
  max: number;
  type: string;
  history: {
    id: string;
    slots: number;
    amount: number;
    paidAt: string | null;
    status: string;
  }[];
};

export const loadLandlordSubscriptionForUser = async (
  userId: string,
): Promise<LandlordSubscriptionState> => {
  const emptyState: LandlordSubscriptionState = {
    paidExtra: 0,
    total: FREE_PROPERTY_SLOT_COUNT,
    used: 0,
    available: FREE_PROPERTY_SLOT_COUNT,
    max: MAX_PROPERTY_SLOT_COUNT,
    type: "free",
    history: [],
  };

  if (!userId) return emptyState;

  try {
    // Fetch subscription record
    const { data: subscription } = await supabase
      .from("landlord_subscriptions")
      .select("*")
      .eq("landlord_id", userId)
      .maybeSingle();

    // Fetch property count (used slots)
    const { count: propertyCount } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("landlord", userId)
      .eq("is_deleted", false);

    // Fetch payment history
    const { data: payments } = await supabase
      .from("landlord_slot_payments")
      .select("*")
      .eq("landlord_id", userId)
      .order("created_at", { ascending: false });

    const usedSlots = propertyCount || 0;
    const paidSlots = subscription?.paid_slots || 0;
    const totalSlots = Math.min(
      MAX_PROPERTY_SLOT_COUNT,
      Math.max(subscription?.total_slots || FREE_PROPERTY_SLOT_COUNT, usedSlots),
    );
    const availableSlots = Math.max(0, totalSlots - usedSlots);

    const history = (payments || [])
      .filter((p: any) => p.status === "paid")
      .map((p: any) => ({
        id: p.id,
        slots: 1,
        amount: parseFloat(p.amount) || PROPERTY_SLOT_PRICE_PHP,
        paidAt: p.paid_at || p.created_at || null,
        status: p.status,
      }));

    return {
      paidExtra: paidSlots,
      total: totalSlots,
      used: usedSlots,
      available: availableSlots,
      max: MAX_PROPERTY_SLOT_COUNT,
      type: paidSlots > 0 ? "paid" : "free",
      history,
    };
  } catch (error) {
    console.warn("loadLandlordSubscriptionForUser error:", error);
    return emptyState;
  }
};

export const buyPropertySlot = async (
  landlordId: string,
): Promise<{ checkoutUrl?: string; error?: string }> => {
  try {
    const baseUrl = API_URL.replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/api/payments/landlord-slot-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landlord_id: landlordId }),
    });
    const data = await res.json();
    if (data.checkoutUrl) {
      return { checkoutUrl: data.checkoutUrl };
    }
    return { error: data.error || "Failed to create checkout" };
  } catch (error: any) {
    return { error: error.message || "Failed to create checkout session" };
  }
};
