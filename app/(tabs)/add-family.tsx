import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const FAMILY_MEMBER_LIMIT = 4;

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

export default function AddFamilyPage() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [occupancy, setOccupancy] = useState<any>(null);
  const [isFamilyMember, setIsFamilyMember] = useState(false);

  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [loadingFamily, setLoadingFamily] = useState(false);

  const [familySearchQuery, setFamilySearchQuery] = useState("");
  const [familySearchResults, setFamilySearchResults] = useState<any[]>([]);
  const [familySearching, setFamilySearching] = useState(false);
  const [addingMember, setAddingMember] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const familySlotsFull = familyMembers.length >= FAMILY_MEMBER_LIMIT;

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

  const loadFamilyMembers = useCallback(async (currentOccupancy: any) => {
    const occId = currentOccupancy?.is_family_member
      ? currentOccupancy?.parent_occupancy_id
      : currentOccupancy?.id;

    if (!occId) {
      setFamilyMembers([]);
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
        await loadFamilyMembers(selected);
      } else {
        setFamilyMembers([]);
      }
    } catch (error) {
      console.error("loadData error:", error);
      setOccupancy(null);
    } finally {
      setLoading(false);
    }
  }, [loadFamilyMembers]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const searchFamilyMembers = useCallback(
    async (query: string) => {
      if (!query || query.trim().length < 2 || !sessionUser) {
        setFamilySearchResults([]);
        return;
      }

      setFamilySearching(true);
      try {
        const API_URL = getApiBaseUrl();
        if (!API_URL) {
          setFamilySearchResults([]);
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
            query: query.trim(),
            exclude_ids: excludeIds,
          }),
        });

        if (!response.ok) {
          setFamilySearchResults([]);
          return;
        }

        const data = await response.json();
        setFamilySearchResults(
          Array.isArray(data?.results) ? data.results : [],
        );
      } catch (error) {
        console.error("searchFamilyMembers error:", error);
        setFamilySearchResults([]);
      } finally {
        setFamilySearching(false);
      }
    },
    [familyMembers, getMemberId, sessionUser],
  );

  useEffect(() => {
    if (!familySearchQuery.trim()) {
      setFamilySearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchFamilyMembers(familySearchQuery);
    }, 350);

    return () => clearTimeout(timer);
  }, [familySearchQuery, searchFamilyMembers]);

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
          `You can only add up to ${FAMILY_MEMBER_LIMIT} family members.`,
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

        // Force a direct DB ensure after API success so the family_members link
        // is persisted/relinked even when the API response looks successful.
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
      ensureFamilyLink,
      isFamilyMember,
      loadFamilyMembers,
      occupancy,
      sessionUser,
    ],
  );

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

  const primaryLabel = useMemo(() => {
    if (isFamilyMember) {
      const first = occupancy?.tenant?.first_name || "";
      const last = occupancy?.tenant?.last_name || "";
      return `${first} ${last}`.trim() || "Primary Tenant";
    }
    return "You (Primary Tenant)";
  }, [isFamilyMember, occupancy]);

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: isDark ? colors.background : "#f8fafc" },
        ]}
      >
        <ActivityIndicator size="large" color="#111827" />
        <Text
          style={[
            styles.loadingText,
            { color: isDark ? colors.text : "#111827" },
          ]}
        >
          Loading family page...
        </Text>
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

          <Text
            style={[
              styles.centeredSubtitle,
              { color: isDark ? colors.textMuted : "#6b7280" },
            ]}
          >
            {familyMembers.length}/{FAMILY_MEMBER_LIMIT} slots used
          </Text>

          <View style={styles.primaryRow}>
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
          </View>

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
                  placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
                  value={familySearchQuery}
                  onChangeText={setFamilySearchQuery}
                  editable={!familySlotsFull}
                />
                {!!familySearchQuery && (
                  <TouchableOpacity onPress={() => setFamilySearchQuery("")}>
                    <Ionicons name="close-circle" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>

              {familySlotsFull && (
                <Text style={styles.slotWarning}>
                  Family member limit reached.
                </Text>
              )}

              {familySearching ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.inlineText}>Searching users...</Text>
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
                      <View key={searchResultUserId} style={styles.resultItem}>
                        <View style={styles.resultAvatar}>
                          {user?.avatar_url ? (
                            <Image
                              source={{ uri: user.avatar_url }}
                              style={styles.resultImage}
                            />
                          ) : (
                            <Text style={styles.resultInitials}>
                              {`${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName}>
                            {`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
                          </Text>
                          <Text style={styles.resultEmail}>
                            {user?.email || "No email"}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => addFamilyMember(searchResultUserId)}
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
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Text style={styles.addButtonText}>Add</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : familySearchQuery.trim().length >= 2 ? (
                <Text style={styles.emptySearchText}>No users found.</Text>
              ) : null}
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
            <ActivityIndicator
              size="small"
              color="#111827"
              style={{ marginVertical: 8 }}
            />
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
  searchBox: {
    marginTop: 12,
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
  slotWarning: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: "#92400e",
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
    marginTop: 10,
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
    marginTop: 12,
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
