import { supabase } from "./supabase";

export const normalizeRole = (role?: string | null) =>
  (role || "tenant").toLowerCase();

export const getRouteForRole = (role?: string | null) =>
  normalizeRole(role) === "admin" ? "/admin" : "/(tabs)";

export async function getUserRouteById(userId: string) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    return getRouteForRole(data?.role);
  } catch (error) {
    console.warn("Failed to resolve user role, defaulting to tabs:", error);
    return "/(tabs)";
  }
}
