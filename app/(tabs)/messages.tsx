import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const CHAT_MESSAGES_PAGE_SIZE = 20;
const MESSAGES_LOADING_SKELETON_COUNT = 6;
const FAMILY_MEMBER_SELECT_ATTEMPTS = [
  { memberColumn: "member_id", occupancyColumn: "parent_occupancy_id" },
  { memberColumn: "family_member_id", occupancyColumn: "parent_occupancy_id" },
  { memberColumn: "user_id", occupancyColumn: "parent_occupancy_id" },
  { memberColumn: "profile_id", occupancyColumn: "parent_occupancy_id" },
  { memberColumn: "member_id", occupancyColumn: "occupancy_id" },
  { memberColumn: "family_member_id", occupancyColumn: "occupancy_id" },
  { memberColumn: "user_id", occupancyColumn: "occupancy_id" },
  { memberColumn: "profile_id", occupancyColumn: "occupancy_id" },
  { memberColumn: "member_id", occupancyColumn: "member_occupancy_id" },
  { memberColumn: "family_member_id", occupancyColumn: "member_occupancy_id" },
  { memberColumn: "user_id", occupancyColumn: "member_occupancy_id" },
  { memberColumn: "profile_id", occupancyColumn: "member_occupancy_id" },
];

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

export default function Messages() {
  const navigation = useNavigation<any>();
  const { isDark, colors } = useTheme();
  const skeletonColor = isDark ? "rgba(148, 163, 184, 0.22)" : "#e5e7eb";
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [allowedRecipientIds, setAllowedRecipientIds] = useState<string[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [groupSenderProfiles, setGroupSenderProfiles] = useState<
    Record<string, any>
  >({});
  const [familyPrimaryNameByMember, setFamilyPrimaryNameByMember] = useState<
    Record<string, string>
  >({});
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showAddChatModal, setShowAddChatModal] = useState(false);
  const [addChatCandidates, setAddChatCandidates] = useState<any[]>([]);
  const [creatingDirectChat, setCreatingDirectChat] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [groupCandidates, setGroupCandidates] = useState<any[]>([]);
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<
    string[]
  >([]);
  const [showAddGroupMembersModal, setShowAddGroupMembersModal] =
    useState(false);
  const [groupMemberCandidates, setGroupMemberCandidates] = useState<any[]>([]);
  const [selectedGroupAddMemberIds, setSelectedGroupAddMemberIds] = useState<
    string[]
  >([]);
  const [loadingGroupMemberCandidates, setLoadingGroupMemberCandidates] =
    useState(false);
  const [groupMemberCandidatesError, setGroupMemberCandidatesError] =
    useState("");
  const [addingGroupMembers, setAddingGroupMembers] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showRenameGroupModal, setShowRenameGroupModal] = useState(false);
  const [renameGroupName, setRenameGroupName] = useState("");
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [showConversationSettingsModal, setShowConversationSettingsModal] =
    useState(false);
  const flatListRef = useRef<FlatList>(null);
  const messagePaginationLockRef = useRef(false);
  const latestMessagesRef = useRef<any[]>([]);
  const shouldAutoScrollRef = useRef(false);
  const inboxRefreshLockRef = useRef(false);
  const addMembersLoadRequestRef = useRef(0);
  const keyboardScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Shared files panel
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [sharedMedia, setSharedMedia] = useState<any[]>([]);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedConv ? { display: "none" } : undefined,
    });

    return () => {
      navigation.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation, selectedConv]);

  const requestAutoScrollToBottom = (animated: boolean = true) => {
    shouldAutoScrollRef.current = true;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  };

  const scheduleScrollToBottom = useCallback(
    (animated: boolean = true, delayMs: number = 90) => {
      if (keyboardScrollTimerRef.current) {
        clearTimeout(keyboardScrollTimerRef.current);
      }
      keyboardScrollTimerRef.current = setTimeout(() => {
        requestAutoScrollToBottom(animated);
      }, delayMs);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (keyboardScrollTimerRef.current) {
        clearTimeout(keyboardScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (data.session) {
        setSession(data.session);
        await loadProfile(data.session.user.id);
      } else {
        setSession(null);
        setProfile(null);
        setConversations([]);
      }
    };

    void bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      if (nextSession) {
        setSession(nextSession);
        void loadProfile(nextSession.user.id);
      } else {
        setSession(null);
        setProfile(null);
        setConversations([]);
        setSelectedConv(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    if (data) {
      loadConversations(userId, data.role);
    }
  };

  const buildAllowedRecipientIds = async (userId: string, role: string) => {
    const normalizedRole = String(role || "").toLowerCase();
    const allowed = new Set<string>();

    if (normalizedRole === "tenant") {
      const { data: directOccupancies } = await supabase
        .from("tenant_occupancies")
        .select("landlord_id")
        .eq("tenant_id", userId)
        .in("status", ["active", "pending_end"]);

      (directOccupancies || []).forEach((occ: any) => {
        if (occ.landlord_id) allowed.add(occ.landlord_id);
      });

      try {
        const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
        const urlPrefix = API_URL.endsWith("/")
          ? API_URL.slice(0, -1)
          : API_URL;
        if (urlPrefix) {
          const res = await fetch(
            `${urlPrefix}/api/family-members?member_id=${userId}`,
          );
          if (res.ok) {
            const fmData = await res.json();
            const familyLandlordId = fmData?.occupancy?.landlord_id;
            if (familyLandlordId) allowed.add(familyLandlordId);
          }
        }
      } catch (err) {}
    } else if (normalizedRole === "landlord") {
      const { data: occupancies } = await supabase
        .from("tenant_occupancies")
        .select("tenant_id")
        .eq("landlord_id", userId)
        .in("status", ["active", "pending_end"]);

      (occupancies || []).forEach((occ: any) => {
        if (occ.tenant_id) allowed.add(occ.tenant_id);
      });

      // Landlords can also chat with other landlords.
      const { data: landlords } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "landlord")
        .neq("id", userId);

      (landlords || []).forEach((l: any) => {
        if (l.id) allowed.add(l.id);
      });
    }

    return Array.from(allowed);
  };

  const getApiBaseUrl = () => {
    const raw = process.env.EXPO_PUBLIC_API_URL || "";
    return raw.endsWith("/") ? raw.slice(0, -1) : raw;
  };

  const isLegacyGroupConversation = (conversation: any) =>
    conversation?.kind === "group" &&
    String(conversation?.groupStorage || "") === "legacy";

  const isGroupLikeConversationRow = (row: any) => {
    if (!row) return false;
    if (row.is_group === true) return true;

    const kind = String(
      row.conversation_type || row.type || row.chat_type || "",
    )
      .trim()
      .toLowerCase();

    return kind === "group" || kind === "gc";
  };

  const resolveFamilyLinksForMembers = async (memberIds: string[]) => {
    const normalizedIds = Array.from(
      new Set(memberIds.map((id) => String(id || "").trim()).filter(Boolean)),
    );
    if (!normalizedIds.length) return [];

    for (const shape of FAMILY_MEMBER_SELECT_ATTEMPTS) {
      const selectColumns = `${shape.memberColumn}, ${shape.occupancyColumn}`;
      const { data, error } = await supabase
        .from("family_members")
        .select(selectColumns)
        .in(shape.memberColumn, normalizedIds);

      if (error) continue;

      return (data || [])
        .map((row: any) => ({
          memberId: String(row?.[shape.memberColumn] || ""),
          occupancyId: String(row?.[shape.occupancyColumn] || ""),
        }))
        .filter((row: any) => row.memberId && row.occupancyId);
    }

    return [];
  };

  const resolveFamilyPrimaryNameMap = async (memberIds: string[]) => {
    const links = await resolveFamilyLinksForMembers(memberIds);
    if (!links.length) return {} as Record<string, string>;

    const occupancyIds = Array.from(
      new Set(links.map((l: any) => l.occupancyId).filter(Boolean)),
    );

    const { data: occupancies } = await supabase
      .from("tenant_occupancies")
      .select("id, tenant_id")
      .in("id", occupancyIds);

    const occupancyTenantMap: Record<string, string> = {};
    (occupancies || []).forEach((row: any) => {
      if (row?.id && row?.tenant_id) {
        occupancyTenantMap[String(row.id)] = String(row.tenant_id);
      }
    });

    const tenantIds = Array.from(
      new Set(Object.values(occupancyTenantMap).filter(Boolean)),
    );
    if (!tenantIds.length) return {} as Record<string, string>;

    const { data: tenantProfiles } = await supabase
      .from("profiles")
      .select("id, first_name")
      .in("id", tenantIds);

    const tenantNameMap: Record<string, string> = {};
    (tenantProfiles || []).forEach((row: any) => {
      if (row?.id && row?.first_name) {
        tenantNameMap[String(row.id)] = String(row.first_name);
      }
    });

    const result: Record<string, string> = {};
    links.forEach((link: any) => {
      const primaryTenantId = occupancyTenantMap[link.occupancyId];
      const firstName = primaryTenantId
        ? tenantNameMap[primaryTenantId]
        : undefined;
      if (firstName) {
        result[link.memberId] = firstName;
      }
    });

    if (Object.keys(result).length) {
      return result;
    }

    const apiBase = getApiBaseUrl();
    if (!apiBase) return result;

    for (const memberId of memberIds) {
      try {
        const res = await fetch(
          `${apiBase}/api/family-members?member_id=${encodeURIComponent(memberId)}`,
        );
        if (!res.ok) continue;
        const fmData = await res.json();
        const primaryName =
          fmData?.occupancy?.tenant_profile?.first_name ||
          fmData?.occupancy?.tenant?.first_name ||
          fmData?.occupancy?.primary_tenant?.first_name ||
          "";
        if (primaryName) {
          result[String(memberId)] = String(primaryName);
        }
      } catch {
        // Ignore fallback failures.
      }
    }

    return result;
  };

  const loadGroupCandidates = async (userId: string) => {
    const { data: occupancies } = await supabase
      .from("tenant_occupancies")
      .select("id, tenant_id")
      .eq("landlord_id", userId)
      .in("status", ["active", "pending_end"]);

    const occupancyRows = occupancies || [];
    const occupancyIds = occupancyRows
      .map((row: any) => String(row?.id || ""))
      .filter(Boolean);
    const tenantIdByOccupancyId: Record<string, string> = {};
    occupancyRows.forEach((row: any) => {
      const occupancyId = String(row?.id || "");
      const tenantId = String(row?.tenant_id || "");
      if (occupancyId && tenantId) {
        tenantIdByOccupancyId[occupancyId] = tenantId;
      }
    });

    const candidateIds = Array.from(
      new Set(
        occupancyRows
          .map((row: any) => String(row?.tenant_id || ""))
          .filter((id) => id && id !== userId),
      ),
    );

    if (!candidateIds.length) {
      setGroupCandidates([]);
      return [] as any[];
    }

    const hasFamilyByTenantId: Record<string, boolean> = {};
    if (occupancyIds.length) {
      for (const shape of FAMILY_MEMBER_SELECT_ATTEMPTS) {
        const selectColumns = `${shape.memberColumn}, ${shape.occupancyColumn}`;
        const { data, error } = await supabase
          .from("family_members")
          .select(selectColumns)
          .in(shape.occupancyColumn, occupancyIds);

        if (error) continue;

        (data || []).forEach((row: any) => {
          const occupancyId = String(row?.[shape.occupancyColumn] || "");
          const tenantId = tenantIdByOccupancyId[occupancyId];
          if (!tenantId) return;
          const memberId = String(row?.[shape.memberColumn] || "");
          if (!memberId || memberId !== tenantId) {
            hasFamilyByTenantId[tenantId] = true;
          }
        });
        break;
      }
    }

    const { data: candidateProfiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url, role")
      .in("id", candidateIds);

    const sortedCandidates = (candidateProfiles || [])
      .filter((p: any) => String(p?.role || "").toLowerCase() !== "landlord")
      .map((p: any) => {
        const id = String(p?.id || "");
        const hasFamilyMember = !!hasFamilyByTenantId[id];
        const primaryTenantFirstName = String(p?.first_name || "").trim();
        return {
          ...p,
          hasFamilyMember,
          familyLabel: hasFamilyMember
            ? primaryTenantFirstName
              ? `has family member (under ${primaryTenantFirstName})`
              : "has family member"
            : "",
        };
      })
      .sort((a: any, b: any) => {
        const aName = `${a.first_name || ""} ${a.last_name || ""}`.trim();
        const bName = `${b.first_name || ""} ${b.last_name || ""}`.trim();
        return aName.localeCompare(bName);
      });

    setGroupCandidates(sortedCandidates);
    return sortedCandidates;
  };

  const loadConversations = async (userId: string, role: string) => {
    setLoading(true);
    try {
      const normalizedRole = String(role || "").toLowerCase();
      const allowedIds = await buildAllowedRecipientIds(userId, role);
      setAllowedRecipientIds(allowedIds);
      const allowedSet = new Set(allowedIds);

      const { data: allConversations } = await supabase
        .from("conversations")
        .select("*, property:properties(title, address)")
        .or(`landlord_id.eq.${userId},tenant_id.eq.${userId}`);

      let existingDirectConversations = allConversations || [];

      if (normalizedRole === "tenant") {
        for (const landlordId of allowedSet) {
          const exists = existingDirectConversations.find(
            (c) => c.landlord_id === landlordId && c.tenant_id === userId,
          );
          if (!exists) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({ landlord_id: landlordId, tenant_id: userId })
              .select("*, property:properties(title, address)")
              .single();
            if (newConv) existingDirectConversations.push(newConv);
          }
        }
      } else if (normalizedRole === "landlord") {
        const { data: occupancies } = await supabase
          .from("tenant_occupancies")
          .select("tenant_id")
          .eq("landlord_id", userId)
          .in("status", ["active", "pending_end"]);

        if (occupancies) {
          for (const occ of occupancies) {
            const exists = existingDirectConversations.find(
              (c) =>
                c.landlord_id === userId &&
                c.tenant_id === String(occ.tenant_id || ""),
            );
            if (!exists && occ?.tenant_id) {
              const { data: newConv } = await supabase
                .from("conversations")
                .insert({ landlord_id: userId, tenant_id: occ.tenant_id })
                .select("*, property:properties(title, address)")
                .single();
              if (newConv) existingDirectConversations.push(newConv);
            }
          }
        }
      }

      existingDirectConversations = existingDirectConversations.filter(
        (conv: any) => {
          const isLandlord = conv.landlord_id === userId;
          const isTenant = conv.tenant_id === userId;
          if (!isLandlord && !isTenant) return false;
          if (isLandlord && conv.hidden_by_landlord) return false;
          if (isTenant && conv.hidden_by_tenant) return false;

          const otherUserId = isLandlord ? conv.tenant_id : conv.landlord_id;
          if (!allowedSet.has(otherUserId)) return false;
          return true;
        },
      );

      const directParticipantIds = new Set<string>();
      existingDirectConversations.forEach((conv: any) => {
        directParticipantIds.add(conv.landlord_id);
        directParticipantIds.add(conv.tenant_id);
      });

      const { data: directProfiles } = directParticipantIds.size
        ? await supabase
            .from("profiles")
            .select("id, first_name, last_name, avatar_url")
            .in("id", Array.from(directParticipantIds))
        : { data: [] as any[] };

      const directProfileMap: any = {};
      (directProfiles || []).forEach((p: any) => {
        directProfileMap[p.id] = p;
      });

      const directConversationIds = existingDirectConversations
        .map((conv: any) => conv.id)
        .filter(Boolean);
      const { data: directMessageRows } = directConversationIds.length
        ? await supabase
            .from("messages")
            .select("*")
            .in("conversation_id", directConversationIds)
            .order("created_at", { ascending: false })
        : { data: [] as any[] };

      const directLastMessageMap: Record<string, any> = {};
      (directMessageRows || []).forEach((row: any) => {
        if (!directLastMessageMap[row.conversation_id]) {
          directLastMessageMap[row.conversation_id] = row;
        }
      });

      const directThreads = existingDirectConversations
        .filter((conv: any) => !isGroupLikeConversationRow(conv))
        .map((conv: any) => {
          const isLandlord = conv.landlord_id === userId;
          const otherUserId = isLandlord ? conv.tenant_id : conv.landlord_id;
          return {
            ...conv,
            kind: "direct",
            otherUser: directProfileMap[otherUserId],
            propertyTitle: conv.property?.title || "",
            lastMessage: directLastMessageMap[conv.id] || null,
          };
        });

      const { data: visibleGroupRows, error: visibleGroupsError } =
        await supabase.from("group_conversations").select("*");

      if (visibleGroupsError) {
        console.log(
          "group_conversations visible query error:",
          visibleGroupsError,
        );
      }

      const { data: myMembershipRows, error: membershipError } = await supabase
        .from("group_conversation_members")
        .select("group_conversation_id, user_id, role")
        .eq("user_id", userId);

      if (membershipError) {
        console.log(
          "group_conversation_members membership query error:",
          membershipError,
        );
      }

      const shouldUseMembershipRpcFallback =
        !!membershipError || !(myMembershipRows || []).length;

      const { data: myMembershipRowsFromRpc, error: membershipRpcError } =
        shouldUseMembershipRpcFallback
          ? await supabase.rpc("my_group_memberships", {
              p_user_id: userId,
            })
          : { data: null as any, error: null as any };

      if (membershipRpcError) {
        console.log("my_group_memberships rpc error:", membershipRpcError);
      }

      const effectiveMembershipRows =
        shouldUseMembershipRpcFallback && (myMembershipRowsFromRpc || []).length
          ? (myMembershipRowsFromRpc || []).map((row: any) => ({
              group_conversation_id: row?.group_conversation_id,
              user_id: userId,
              role: row?.role || "member",
            }))
          : myMembershipRows || [];

      const idsFromVisibleRows = (visibleGroupRows || [])
        .map((row: any) => String(row?.id || ""))
        .filter(Boolean);
      const idsFromMembership = (effectiveMembershipRows || [])
        .map((row: any) => String(row?.group_conversation_id || ""))
        .filter(Boolean);

      const groupConversationIds = Array.from(
        new Set([...idsFromVisibleRows, ...idsFromMembership]),
      );

      const myRoleByGroupId: Record<string, string> = {};
      (effectiveMembershipRows || []).forEach((row: any) => {
        const groupId = String(row?.group_conversation_id || "");
        if (groupId) {
          myRoleByGroupId[groupId] = String(row?.role || "member");
        }
      });

      let groupThreads: any[] = [];

      if (groupConversationIds.length) {
        const visibleById: Record<string, any> = {};
        (visibleGroupRows || []).forEach((row: any) => {
          if (row?.id) {
            visibleById[String(row.id)] = row;
          }
        });

        const missingGroupIds = groupConversationIds.filter(
          (id) => !visibleById[id],
        );

        if (missingGroupIds.length) {
          const { data: missingGroupRows, error: missingGroupsError } =
            await supabase
              .from("group_conversations")
              .select("*")
              .in("id", missingGroupIds);

          if (missingGroupsError) {
            console.log(
              "group_conversations lookup by ids error:",
              missingGroupsError,
            );
          }

          (missingGroupRows || []).forEach((row: any) => {
            if (row?.id) {
              visibleById[String(row.id)] = row;
            }
          });
        }

        const groupRows = groupConversationIds.map((id) => {
          const row = visibleById[id];
          if (row) return row;
          return {
            id,
            name: "Group Chat",
            avatar_url: null,
            created_by: null,
            created_at: null,
            updated_at: null,
          };
        });

        const { data: groupMemberRows, error: membersError } = await supabase
          .from("group_conversation_members")
          .select("group_conversation_id, user_id, role")
          .in("group_conversation_id", groupConversationIds);

        if (membersError) {
          console.log(
            "group_conversation_members list query error:",
            membersError,
          );
        }

        const groupMembers =
          (groupMemberRows && groupMemberRows.length
            ? groupMemberRows
            : effectiveMembershipRows) || [];

        groupMembers.forEach((member: any) => {
          const groupId = String(member?.group_conversation_id || "");
          if (!groupId) return;
          if (
            String(member?.user_id || "") === String(userId) &&
            !myRoleByGroupId[groupId]
          ) {
            myRoleByGroupId[groupId] = String(member?.role || "member");
          }
        });

        const groupMemberIds = Array.from(
          new Set(
            groupMembers
              .map((m: any) => String(m?.user_id || ""))
              .filter(Boolean),
          ),
        );

        const { data: groupMemberProfiles, error: memberProfilesError } =
          groupMemberIds.length
            ? await supabase
                .from("profiles")
                .select("id, first_name, last_name, avatar_url")
                .in("id", groupMemberIds)
            : { data: [] as any[], error: null as any };

        if (memberProfilesError) {
          console.log("group member profile query error:", memberProfilesError);
        }

        const groupProfileMap: Record<string, any> = {};
        (groupMemberProfiles || []).forEach((p: any) => {
          if (p?.id) groupProfileMap[String(p.id)] = p;
        });

        const { data: groupMessageRows, error: groupMessagesError } =
          await supabase
            .from("group_messages")
            .select("*")
            .in("group_conversation_id", groupConversationIds)
            .order("created_at", { ascending: false });

        if (groupMessagesError) {
          console.log("group_messages list query error:", groupMessagesError);
        }

        const groupLastMessageMap: Record<string, any> = {};
        (groupMessageRows || []).forEach((msg: any) => {
          if (!groupLastMessageMap[msg.group_conversation_id]) {
            groupLastMessageMap[msg.group_conversation_id] = msg;
          }
        });

        const membersByGroupId: Record<string, any[]> = {};
        groupMembers.forEach((member: any) => {
          const groupId = String(member?.group_conversation_id || "");
          if (!groupId) return;
          if (!membersByGroupId[groupId]) membersByGroupId[groupId] = [];
          membersByGroupId[groupId].push({
            ...member,
            profile: groupProfileMap[String(member?.user_id || "")],
          });
        });

        groupThreads = groupRows.map((group: any) => {
          const groupId = String(group?.id || "");
          const myRole = myRoleByGroupId[groupId] || "member";
          return {
            ...group,
            kind: "group",
            groupName: group.name || "Group Chat",
            groupAvatarUrl: group.avatar_url,
            myRole,
            canRename: myRole === "admin" || group.created_by === userId,
            canLeave: true,
            members: membersByGroupId[groupId] || [],
            lastMessage: groupLastMessageMap[groupId] || null,
          };
        });
      }

      // Legacy/web fallback: some deployments store group threads via
      // conversation_members + conversations instead of group_* tables.
      let legacyGroupThreads: any[] = [];
      const { data: legacyMembershipRows, error: legacyMembershipError } =
        await supabase
          .from("conversation_members")
          .select("conversation_id, user_id, role")
          .eq("user_id", userId);

      if (legacyMembershipError) {
        console.log(
          "conversation_members membership query error:",
          legacyMembershipError,
        );
      }

      const legacyConversationIds = Array.from(
        new Set(
          (legacyMembershipRows || [])
            .map((row: any) => String(row?.conversation_id || ""))
            .filter(Boolean),
        ),
      );

      if (legacyConversationIds.length) {
        const {
          data: legacyConversationsRows,
          error: legacyConversationsError,
        } = await supabase
          .from("conversations")
          .select("*")
          .in("id", legacyConversationIds);

        if (legacyConversationsError) {
          console.log(
            "legacy conversations lookup error:",
            legacyConversationsError,
          );
        }

        const { data: legacyAllMembersRows, error: legacyAllMembersError } =
          await supabase
            .from("conversation_members")
            .select("conversation_id, user_id, role")
            .in("conversation_id", legacyConversationIds);

        if (legacyAllMembersError) {
          console.log(
            "conversation_members list query error:",
            legacyAllMembersError,
          );
        }

        const membersByConversationId: Record<string, any[]> = {};
        (legacyAllMembersRows || []).forEach((row: any) => {
          const convId = String(row?.conversation_id || "");
          if (!convId) return;
          if (!membersByConversationId[convId]) {
            membersByConversationId[convId] = [];
          }
          membersByConversationId[convId].push(row);
        });

        const legacyGroupConversationRows = (
          legacyConversationsRows || []
        ).filter((row: any) => {
          if (isGroupLikeConversationRow(row)) return true;
          const convId = String(row?.id || "");
          const memberCount = (membersByConversationId[convId] || []).length;
          return memberCount > 2;
        });

        const legacyGroupIds = legacyGroupConversationRows
          .map((row: any) => String(row?.id || ""))
          .filter(Boolean);

        if (legacyGroupIds.length) {
          const legacyMemberIds = Array.from(
            new Set(
              legacyGroupIds
                .flatMap((convId: string) =>
                  (membersByConversationId[convId] || []).map((row: any) =>
                    String(row?.user_id || ""),
                  ),
                )
                .filter(Boolean),
            ),
          );

          const { data: legacyMemberProfiles, error: legacyProfilesError } =
            legacyMemberIds.length
              ? await supabase
                  .from("profiles")
                  .select("id, first_name, last_name, avatar_url")
                  .in("id", legacyMemberIds)
              : { data: [] as any[], error: null as any };

          if (legacyProfilesError) {
            console.log(
              "legacy member profile query error:",
              legacyProfilesError,
            );
          }

          const legacyProfileMap: Record<string, any> = {};
          (legacyMemberProfiles || []).forEach((row: any) => {
            if (row?.id) {
              legacyProfileMap[String(row.id)] = row;
            }
          });

          const { data: legacyMessageRows, error: legacyMessagesError } =
            await supabase
              .from("messages")
              .select("*")
              .in("conversation_id", legacyGroupIds)
              .order("created_at", { ascending: false });

          if (legacyMessagesError) {
            console.log(
              "legacy group message query error:",
              legacyMessagesError,
            );
          }

          const legacyLastMessageMap: Record<string, any> = {};
          (legacyMessageRows || []).forEach((row: any) => {
            const convId = String(row?.conversation_id || "");
            if (convId && !legacyLastMessageMap[convId]) {
              legacyLastMessageMap[convId] = row;
            }
          });

          legacyGroupThreads = legacyGroupConversationRows.map((row: any) => {
            const convId = String(row?.id || "");
            const members = (membersByConversationId[convId] || []).map(
              (member: any) => ({
                ...member,
                profile: legacyProfileMap[String(member?.user_id || "")],
              }),
            );

            return {
              ...row,
              kind: "group",
              groupStorage: "legacy",
              groupName:
                row?.name || row?.group_name || row?.title || "Group Chat",
              groupAvatarUrl: row?.avatar_url || null,
              myRole:
                String(
                  (legacyMembershipRows || []).find(
                    (m: any) => String(m?.conversation_id || "") === convId,
                  )?.role || "member",
                ) || "member",
              canRename: false,
              canLeave: true,
              members,
              lastMessage: legacyLastMessageMap[convId] || null,
              updated_at: row?.updated_at,
              created_at: row?.created_at,
            };
          });
        }
      }

      const merged = [...directThreads, ...groupThreads, ...legacyGroupThreads]
        .reduce((acc: any[], thread: any) => {
          const key = `${thread.kind || "direct"}:${thread.id}`;
          if (acc.some((x) => `${x.kind || "direct"}:${x.id}` === key)) {
            return acc;
          }
          return [...acc, thread];
        }, [])
        .sort((a, b) => {
          const aTime =
            a.lastMessage?.created_at || a.updated_at || a.created_at;
          const bTime =
            b.lastMessage?.created_at || b.updated_at || b.created_at;
          return (
            new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime()
          );
        });

      setConversations(merged);
      return merged;
    } finally {
      setLoading(false);
    }
  };

  const refreshConversationsAndSelect = async (
    conversationId?: string,
    conversationKind?: "direct" | "group",
  ) => {
    if (!session?.user?.id || !profile?.role) return;
    const refreshed = await loadConversations(session.user.id, profile.role);
    if (!conversationId || !conversationKind || !Array.isArray(refreshed))
      return;
    const match = refreshed.find(
      (conv: any) =>
        conv.id === conversationId && conv.kind === conversationKind,
    );
    if (match) {
      setSelectedConv(match);
    }
  };

  const refreshInboxConversations = useCallback(async () => {
    if (!session?.user?.id || !profile?.role) return;
    if (inboxRefreshLockRef.current) return;
    inboxRefreshLockRef.current = true;
    try {
      await loadConversations(session.user.id, profile.role);
    } finally {
      inboxRefreshLockRef.current = false;
    }
  }, [session?.user?.id, profile?.role]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      void refreshInboxConversations();
    });

    return unsubscribe;
  }, [navigation, refreshInboxConversations]);

  useEffect(() => {
    if (!session?.user?.id || !profile?.role) return;

    const userId = session.user.id;
    const channel = supabase
      .channel(`messages-inbox-sync-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `landlord_id=eq.${userId}`,
        },
        () => {
          void refreshInboxConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `tenant_id=eq.${userId}`,
        },
        () => {
          void refreshInboxConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_conversation_members",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshInboxConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_conversations",
        },
        () => {
          void refreshInboxConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, profile?.role, refreshInboxConversations]);

  // Mark all direct messages in a conversation as read for the current user
  const markDirectAsRead = async (convId: string) => {
    if (!session?.user?.id) return;
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("conversation_id", convId)
      .eq("receiver_id", session.user.id)
      .eq("read", false);
  };

  const markGroupAsRead = async (groupId: string, incomingRows?: any[]) => {
    if (!session?.user?.id) return;

    let rows = incomingRows || [];

    if (!rows.length) {
      const { data } = await supabase
        .from("group_messages")
        .select("id, sender_id")
        .eq("group_conversation_id", groupId)
        .order("created_at", { ascending: false })
        .limit(80);
      rows = data || [];
    }

    const unreadRows = rows.filter(
      (row: any) => String(row?.sender_id || "") !== String(session.user.id),
    );

    if (!unreadRows.length) return;

    const payload = unreadRows.map((row: any) => ({
      group_message_id: row.id,
      user_id: session.user.id,
      read_at: new Date().toISOString(),
    }));

    await supabase
      .from("group_message_reads")
      .upsert(payload, { onConflict: "group_message_id,user_id" });
  };

  useEffect(() => {
    if (!selectedConv?.id) return;

    let isMounted = true;

    const applyGroupSenderMetadata = async (conversation: any) => {
      const memberRows = conversation?.members || [];
      const senderMap: Record<string, any> = {};
      memberRows.forEach((member: any) => {
        if (member?.user_id && member?.profile) {
          senderMap[String(member.user_id)] = member.profile;
        }
      });
      if (isMounted) {
        setGroupSenderProfiles(senderMap);
      }

      const memberIds = memberRows
        .map((member: any) => String(member?.user_id || ""))
        .filter(Boolean);
      const familyMap = await resolveFamilyPrimaryNameMap(memberIds);
      if (isMounted) {
        setFamilyPrimaryNameByMember(familyMap);
      }
    };

    const initializeConversation = async () => {
      setMessages([]);
      setHasMoreMessages(true);

      if (selectedConv.kind === "group") {
        await applyGroupSenderMetadata(selectedConv);
      } else {
        setGroupSenderProfiles({});
        setFamilyPrimaryNameByMember({});
      }

      await loadMessages(selectedConv);
      if (
        selectedConv.kind === "group" &&
        !isLegacyGroupConversation(selectedConv)
      ) {
        await markGroupAsRead(selectedConv.id);
      } else if (selectedConv.kind === "direct") {
        await markDirectAsRead(selectedConv.id);
      }
    };

    void initializeConversation();

    const channel =
      selectedConv.kind === "group" && !isLegacyGroupConversation(selectedConv)
        ? supabase
            .channel(`group-chat-${selectedConv.id}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "group_messages",
                filter: `group_conversation_id=eq.${selectedConv.id}`,
              },
              (payload) => {
                const incoming = payload.new;
                setMessages((prev) => {
                  if (prev.some((msg) => msg.id === incoming.id)) {
                    return prev;
                  }
                  return [...prev, incoming];
                });
                requestAutoScrollToBottom(true);
                void markGroupAsRead(selectedConv.id, [incoming]);
              },
            )
            .subscribe()
        : supabase
            .channel(`chat-${selectedConv.id}`)
            .on(
              "postgres_changes",
              {
                event: "INSERT",
                schema: "public",
                table: "messages",
                filter: `conversation_id=eq.${selectedConv.id}`,
              },
              (payload) => {
                const incoming = payload.new;
                setMessages((prev) => {
                  if (prev.some((msg) => msg.id === incoming.id)) {
                    return prev;
                  }
                  return [...prev, incoming];
                });
                requestAutoScrollToBottom(true);
                if (selectedConv.kind === "direct") {
                  void markDirectAsRead(selectedConv.id);
                }
              },
            )
            .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedConv?.id, selectedConv?.kind]);

  useEffect(() => {
    if (!selectedConv?.id) return;

    const keyboardShowSub = Keyboard.addListener("keyboardDidShow", () => {
      scheduleScrollToBottom(true, Platform.OS === "ios" ? 120 : 80);
    });

    return () => {
      keyboardShowSub.remove();
    };
  }, [selectedConv?.id, scheduleScrollToBottom]);

  useEffect(() => {
    if (!selectedConv) return;
    if (selectedConv.kind !== "direct") return;
    const otherId = selectedConv?.otherUser?.id;
    if (otherId && !allowedRecipientIds.includes(otherId)) {
      setSelectedConv(null);
    }
  }, [allowedRecipientIds, selectedConv]);

  useEffect(() => {
    if (!selectedConv) {
      setShowConversationSettingsModal(false);
    }
  }, [selectedConv]);

  const loadMessages = async (
    conversation: any,
    loadOlder: boolean = false,
  ) => {
    const convId = conversation?.id;
    if (!convId) return;
    if (messagePaginationLockRef.current) return;

    const isGroup =
      conversation?.kind === "group" &&
      !isLegacyGroupConversation(conversation);
    const tableName = isGroup ? "group_messages" : "messages";
    const conversationKey = isGroup
      ? "group_conversation_id"
      : "conversation_id";

    if (loadOlder) {
      if (loadingMoreMessages || !hasMoreMessages) return;
      const oldestMessage = latestMessagesRef.current[0];
      if (!oldestMessage?.created_at) {
        setHasMoreMessages(false);
        return;
      }
      setLoadingMoreMessages(true);
    }

    messagePaginationLockRef.current = true;

    try {
      if (loadOlder) {
        const oldestMessage = latestMessagesRef.current[0];
        const { data } = await supabase
          .from(tableName)
          .select("*")
          .eq(conversationKey, convId)
          .lt("created_at", oldestMessage.created_at)
          .order("created_at", { ascending: false })
          .limit(CHAT_MESSAGES_PAGE_SIZE);

        const olderRows = (data || []).reverse();

        setMessages((prev) => {
          const existingIds = new Set(prev.map((msg) => msg.id));
          const dedupedOlderRows = olderRows.filter(
            (row) => !existingIds.has(row.id),
          );
          return [...dedupedOlderRows, ...prev];
        });
        setHasMoreMessages((data || []).length === CHAT_MESSAGES_PAGE_SIZE);
      } else {
        const { data } = await supabase
          .from(tableName)
          .select("*")
          .eq(conversationKey, convId)
          .order("created_at", { ascending: false })
          .limit(CHAT_MESSAGES_PAGE_SIZE);

        const initialRows = (data || []).reverse();
        setMessages(initialRows);
        setHasMoreMessages((data || []).length === CHAT_MESSAGES_PAGE_SIZE);
        requestAutoScrollToBottom(false);
      }
    } finally {
      if (loadOlder) {
        setLoadingMoreMessages(false);
      }
      messagePaginationLockRef.current = false;
    }
  };

  const handleChatScroll = (event: any) => {
    if (!selectedConv?.id) return;
    const offsetY = event?.nativeEvent?.contentOffset?.y ?? 0;
    if (offsetY <= 80) {
      loadMessages(selectedConv, true);
    }
  };

  const sendMessage = async (
    fileUrl?: string,
    fileType?: string,
    fileName?: string,
  ) => {
    const currentText = text;
    const trimmedText = currentText.trim();
    if (!trimmedText && !fileUrl) return;
    if (!selectedConv?.id || !session?.user?.id) {
      Alert.alert("Error", "No conversation or session found.");
      return;
    }

    const activeConversation = selectedConv;
    const isGroupConversation = activeConversation.kind === "group";
    const isLegacyGroup =
      isGroupConversation && isLegacyGroupConversation(activeConversation);

    let directReceiverId: string | null = null;
    if (!isGroupConversation) {
      directReceiverId = activeConversation.otherUser?.id || null;
      if (
        !directReceiverId ||
        !allowedRecipientIds.includes(directReceiverId)
      ) {
        Alert.alert(
          "Not Allowed",
          "You can only message allowed landlord/tenant connections.",
        );
        return;
      }
    }

    setSending(true);

    const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage: any = {
      id: optimisticId,
      sender_id: session.user.id,
      message: trimmedText || "",
      file_url: fileUrl || null,
      file_type: fileUrl ? fileType || "image" : null,
      file_name: fileName || null,
      created_at: new Date().toISOString(),
      read: false,
      ...(isGroupConversation
        ? isLegacyGroup
          ? {
              conversation_id: activeConversation.id,
              receiver_id: null,
            }
          : { group_conversation_id: activeConversation.id }
        : {
            conversation_id: activeConversation.id,
            receiver_id: directReceiverId,
          }),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setText("");
    scheduleScrollToBottom(true, 30);

    try {
      let error: any = null;
      let insertedRow: any = null;

      if (isGroupConversation) {
        if (isLegacyGroup) {
          const msg: any = {
            conversation_id: activeConversation.id,
            sender_id: session.user.id,
            receiver_id: null,
            message: trimmedText || "",
            file_url: fileUrl || null,
            file_type: fileUrl ? fileType || "image" : null,
          };
          if (fileName) msg.file_name = fileName;

          const { data: insertedLegacyRow, error: legacyGroupError } =
            await supabase.from("messages").insert(msg).select("*").single();
          error = legacyGroupError;
          insertedRow = insertedLegacyRow;

          if (!legacyGroupError) {
            await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeConversation.id);
          }
        } else {
          const msg: any = {
            group_conversation_id: activeConversation.id,
            sender_id: session.user.id,
            message: trimmedText || "",
            file_url: fileUrl || null,
            file_type: fileUrl ? fileType || "image" : null,
          };
          if (fileName) msg.file_name = fileName;

          const { data: insertedGroupRow, error: groupError } = await supabase
            .from("group_messages")
            .insert(msg)
            .select("*")
            .single();
          error = groupError;
          insertedRow = insertedGroupRow;

          if (!groupError) {
            await supabase
              .from("group_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeConversation.id);
          }
        }
      } else {
        const msg: any = {
          conversation_id: activeConversation.id,
          sender_id: session.user.id,
          receiver_id: directReceiverId,
          message: trimmedText || "",
          file_url: fileUrl || null,
          file_type: fileUrl ? fileType || "image" : null,
        };
        if (fileName) msg.file_name = fileName;

        const { data: insertedDirectRow, error: directError } = await supabase
          .from("messages")
          .insert(msg)
          .select("*")
          .single();
        error = directError;
        insertedRow = insertedDirectRow;

        if (!directError) {
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", activeConversation.id);
        }
      }

      if (error) {
        console.error("Send message error:", error);
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
        setText(currentText); // Restore text on failure
        Alert.alert("Send Failed", error.message || "Could not send message.");
        setSending(false);
        return;
      }

      if (insertedRow?.id) {
        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (msg) => msg.id !== optimisticId,
          );
          if (withoutOptimistic.some((msg) => msg.id === insertedRow.id)) {
            return withoutOptimistic;
          }
          return [...withoutOptimistic, insertedRow];
        });
      } else {
        setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
        await loadMessages(activeConversation);
      }

      scheduleScrollToBottom(true, 30);

      void refreshConversationsAndSelect(
        activeConversation.id,
        activeConversation.kind,
      );
    } catch (err: any) {
      console.error("Send message exception:", err);
      setMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
      setText(currentText);
      Alert.alert("Error", "Something went wrong sending the message.");
    }
    setSending(false);
  };

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.5,
    });
    if (!res.canceled && res.assets[0]) {
      const file = res.assets[0];
      const ext = file.uri.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      await supabase.storage
        .from("chat-attachments")
        .upload(path, decode(file.base64!), { contentType: `image/${ext}` });
      const { data } = supabase.storage
        .from("chat-attachments")
        .getPublicUrl(path);
      sendMessage(data.publicUrl, "image");
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const file = res.assets[0];
        const fileUri = file.uri;
        const fileName = file.name || `file_${Date.now()}`;
        const fileSize = file.size || 0;

        if (fileSize > 10 * 1024 * 1024) {
          return Alert.alert("File Too Large", "Maximum file size is 10MB.");
        }

        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const path = `${session.user.id}/${Date.now()}_${fileName}`;
        const contentType = file.mimeType || "application/octet-stream";

        await supabase.storage
          .from("chat-attachments")
          .upload(path, decode(base64), { contentType });
        const { data } = supabase.storage
          .from("chat-attachments")
          .getPublicUrl(path);
        sendMessage(data.publicUrl, "file", fileName);
      }
    } catch (err) {
      console.error("File pick error:", err);
    }
  };

  const downloadFile = async (url: string, fileName?: string) => {
    try {
      const name = fileName || url.split("/").pop() || "download";
      const fileUri = FileSystem.documentDirectory + name;
      const { uri } = await FileSystem.downloadAsync(url, fileUri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Downloaded", `File saved to ${uri}`);
      }
    } catch (err) {
      console.error("Download error:", err);
      Alert.alert("Error", "Failed to download file.");
    }
  };

  const openAddChatModal = async () => {
    if (!allowedRecipientIds.length) {
      Alert.alert("No recipients", "No available users to chat with yet.");
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url")
      .in("id", allowedRecipientIds);

    const rows = (data || []).sort((a: any, b: any) => {
      const aName = `${a.first_name || ""} ${a.last_name || ""}`.trim();
      const bName = `${b.first_name || ""} ${b.last_name || ""}`.trim();
      return aName.localeCompare(bName);
    });

    setAddChatCandidates(rows);
    setShowAddChatModal(true);
  };

  const startDirectConversation = async (targetUser: any) => {
    if (!session?.user?.id || !profile?.role || !targetUser?.id) return;

    const actorId = session.user.id;
    const targetId = String(targetUser.id);
    const normalizedRole = String(profile.role || "").toLowerCase();

    setCreatingDirectChat(true);
    try {
      let existingConv: any = null;

      if (normalizedRole === "landlord") {
        const { data } = await supabase
          .from("conversations")
          .select("id, landlord_id, tenant_id")
          .or(
            `and(landlord_id.eq.${actorId},tenant_id.eq.${targetId}),and(landlord_id.eq.${targetId},tenant_id.eq.${actorId})`,
          )
          .limit(1)
          .maybeSingle();
        existingConv = data || null;
      } else {
        const { data } = await supabase
          .from("conversations")
          .select("id, landlord_id, tenant_id")
          .eq("landlord_id", targetId)
          .eq("tenant_id", actorId)
          .maybeSingle();
        existingConv = data || null;
      }

      let conversationId = existingConv?.id || null;

      if (existingConv?.id) {
        const updatePayload: any = {};
        if (existingConv.landlord_id === actorId) {
          updatePayload.hidden_by_landlord = false;
        }
        if (existingConv.tenant_id === actorId) {
          updatePayload.hidden_by_tenant = false;
        }
        if (Object.keys(updatePayload).length) {
          await supabase
            .from("conversations")
            .update(updatePayload)
            .eq("id", existingConv.id);
        }
      } else {
        const landlordId = normalizedRole === "landlord" ? actorId : targetId;
        const tenantId = normalizedRole === "landlord" ? targetId : actorId;
        const { data: newConv, error } = await supabase
          .from("conversations")
          .insert({ landlord_id: landlordId, tenant_id: tenantId })
          .select("id")
          .single();

        if (error) {
          throw error;
        }

        conversationId = newConv?.id || null;
      }

      setShowAddChatModal(false);
      if (conversationId) {
        await refreshConversationsAndSelect(conversationId, "direct");
      }
    } catch (error: any) {
      Alert.alert(
        "Unable to create chat",
        error?.message || "Please try again.",
      );
    } finally {
      setCreatingDirectChat(false);
    }
  };

  const openAddGroupModal = async () => {
    if (
      !session?.user?.id ||
      String(profile?.role || "").toLowerCase() !== "landlord"
    ) {
      Alert.alert("Not allowed", "Only landlords can create group chats.");
      return;
    }

    await loadGroupCandidates(session.user.id);
    setSelectedGroupMemberIds([]);
    setNewGroupName("");
    setShowAddGroupModal(true);
  };

  const closeAddGroupMembersModal = () => {
    addMembersLoadRequestRef.current += 1;
    setShowAddGroupMembersModal(false);
    setLoadingGroupMemberCandidates(false);
    setSelectedGroupAddMemberIds([]);
    setGroupMemberCandidatesError("");
  };

  const loadGroupMemberCandidatesForModal = async (
    conversationSnapshot: any,
  ) => {
    if (!session?.user?.id || !conversationSnapshot?.id) return;

    const requestId = ++addMembersLoadRequestRef.current;
    setLoadingGroupMemberCandidates(true);
    setGroupMemberCandidatesError("");

    try {
      const tenantCandidates = await loadGroupCandidates(session.user.id);

      const existingMemberIds = new Set(
        (conversationSnapshot.members || [])
          .map((member: any) => String(member?.user_id || ""))
          .filter(Boolean),
      );

      const availableCandidates = (tenantCandidates || [])
        .filter(
          (candidate: any) =>
            !existingMemberIds.has(String(candidate?.id || "")),
        )
        .sort((a: any, b: any) => {
          const aName = `${a?.first_name || ""} ${a?.last_name || ""}`
            .trim()
            .toLowerCase();
          const bName = `${b?.first_name || ""} ${b?.last_name || ""}`
            .trim()
            .toLowerCase();
          return aName.localeCompare(bName);
        });

      if (requestId !== addMembersLoadRequestRef.current) return;
      setGroupMemberCandidates(availableCandidates);
    } catch (error: any) {
      if (requestId !== addMembersLoadRequestRef.current) return;
      setGroupMemberCandidates([]);
      setGroupMemberCandidatesError(
        error?.message || "Unable to load members. Please try again.",
      );
    } finally {
      if (requestId === addMembersLoadRequestRef.current) {
        setLoadingGroupMemberCandidates(false);
      }
    }
  };

  const openAddMembersToGroupModal = () => {
    if (!session?.user?.id || !selectedConv || selectedConv.kind !== "group") {
      return;
    }
    if (String(profile?.role || "").toLowerCase() !== "landlord") {
      Alert.alert("Not allowed", "Only landlords can add group members.");
      return;
    }
    if (!selectedConv.canRename) {
      Alert.alert(
        "Not allowed",
        "Only the group admin can add members to this group chat.",
      );
      return;
    }

    const conversationSnapshot = selectedConv;
    setShowAddGroupMembersModal(true);
    setSelectedGroupAddMemberIds([]);
    setGroupMemberCandidates([]);
    void loadGroupMemberCandidatesForModal(conversationSnapshot);
  };

  const toggleGroupMemberToAdd = (memberId: string) => {
    setSelectedGroupAddMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  };

  const submitAddMembersToGroup = async () => {
    if (!session?.user?.id || !selectedConv || selectedConv.kind !== "group") {
      return;
    }
    if (!selectedGroupAddMemberIds.length) {
      Alert.alert("Select members", "Please choose at least one member.");
      return;
    }

    setAddingGroupMembers(true);
    try {
      const uniqueMemberIds = Array.from(
        new Set(
          selectedGroupAddMemberIds
            .map((id) => String(id || ""))
            .filter((id) => id && id !== session.user.id),
        ),
      );

      if (!uniqueMemberIds.length) {
        throw new Error("No valid members to add.");
      }

      const isLegacy = isLegacyGroupConversation(selectedConv);
      const rowsToUpsert = isLegacy
        ? uniqueMemberIds.map((id) => ({
            conversation_id: selectedConv.id,
            user_id: id,
            role: "member",
          }))
        : uniqueMemberIds.map((id) => ({
            group_conversation_id: selectedConv.id,
            user_id: id,
            role: "member",
          }));

      const { error } = isLegacy
        ? await supabase
            .from("conversation_members")
            .upsert(rowsToUpsert, { onConflict: "conversation_id,user_id" })
        : await supabase
            .from("group_conversation_members")
            .upsert(rowsToUpsert, {
              onConflict: "group_conversation_id,user_id",
            });

      if (error) {
        throw error;
      }

      closeAddGroupMembersModal();
      setSelectedGroupAddMemberIds([]);
      await refreshConversationsAndSelect(selectedConv.id, "group");
    } catch (error: any) {
      Alert.alert(
        "Unable to add members",
        error?.message || "Please try again.",
      );
    } finally {
      setAddingGroupMembers(false);
    }
  };

  const toggleGroupMember = (memberId: string) => {
    setSelectedGroupMemberIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  };

  const createGroupConversation = async () => {
    if (!session?.user?.id) return;
    if (!selectedGroupMemberIds.length) {
      Alert.alert("Select members", "Please choose at least one member.");
      return;
    }

    setCreatingGroup(true);
    try {
      const sanitizedName = newGroupName.trim() || "Group Chat";
      const { data: groupRow, error: groupError } = await supabase
        .from("group_conversations")
        .insert({ name: sanitizedName, created_by: session.user.id })
        .select("*")
        .single();

      if (groupError || !groupRow?.id) {
        throw groupError || new Error("Failed to create group.");
      }

      const uniqueMemberIds = Array.from(
        new Set(
          selectedGroupMemberIds
            .map((id) => String(id || ""))
            .filter((id) => id && id !== session.user.id),
        ),
      );

      const rowsToInsert = [
        {
          group_conversation_id: groupRow.id,
          user_id: session.user.id,
          role: "admin",
        },
        ...uniqueMemberIds.map((id) => ({
          group_conversation_id: groupRow.id,
          user_id: id,
          role: "member",
        })),
      ];

      const { error: membersError } = await supabase
        .from("group_conversation_members")
        .insert(rowsToInsert);

      if (membersError) {
        throw membersError;
      }

      setShowAddGroupModal(false);
      setSelectedGroupMemberIds([]);
      setNewGroupName("");
      await refreshConversationsAndSelect(String(groupRow.id), "group");
    } catch (error: any) {
      Alert.alert(
        "Unable to create group",
        error?.message || "Please try again.",
      );
    } finally {
      setCreatingGroup(false);
    }
  };

  const openRenameGroupModal = () => {
    if (!selectedConv?.id || selectedConv?.kind !== "group") return;
    if (!selectedConv?.canRename) {
      Alert.alert(
        "Not allowed",
        "Only the group admin can rename this group chat.",
      );
      return;
    }
    setRenameGroupName(selectedConv.groupName || selectedConv.name || "");
    setShowRenameGroupModal(true);
  };

  const openConversationSettings = () => {
    setShowConversationSettingsModal(true);
  };

  const closeConversationSettings = () => {
    setShowConversationSettingsModal(false);
  };

  const openSharedMediaFromSettings = () => {
    if (!selectedConv) return;
    setShowConversationSettingsModal(false);
    void loadSharedMedia(selectedConv);
  };

  const openRenameGroupFromSettings = () => {
    setShowConversationSettingsModal(false);
    openRenameGroupModal();
  };

  const leaveGroupFromSettings = () => {
    if (!selectedConv || selectedConv.kind !== "group") return;
    setShowConversationSettingsModal(false);
    void leaveGroupConversation(selectedConv);
  };

  const deleteGroupFromSettings = () => {
    if (!selectedConv || selectedConv.kind !== "group") return;
    setShowConversationSettingsModal(false);
    void deleteGroupConversation(selectedConv);
  };

  const deleteDirectFromSettings = () => {
    if (!selectedConv || selectedConv.kind !== "direct") return;
    setShowConversationSettingsModal(false);
    void deleteConversation(selectedConv);
  };

  const submitRenameGroup = async () => {
    if (!selectedConv?.id || selectedConv?.kind !== "group") return;
    const nextName = renameGroupName.trim();
    if (!nextName) {
      Alert.alert("Name required", "Please enter a group name.");
      return;
    }

    setRenamingGroup(true);
    try {
      const { error } = await supabase
        .from("group_conversations")
        .update({ name: nextName, updated_at: new Date().toISOString() })
        .eq("id", selectedConv.id);

      if (error) {
        throw error;
      }

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === selectedConv.id && conv.kind === "group"
            ? {
                ...conv,
                groupName: nextName,
                name: nextName,
              }
            : conv,
        ),
      );
      setSelectedConv((prev: any) =>
        prev?.id === selectedConv.id && prev?.kind === "group"
          ? {
              ...prev,
              groupName: nextName,
              name: nextName,
            }
          : prev,
      );
      setShowRenameGroupModal(false);
      await refreshConversationsAndSelect(selectedConv.id, "group");
    } catch (error: any) {
      Alert.alert("Rename failed", error?.message || "Please try again.");
    } finally {
      setRenamingGroup(false);
    }
  };

  const leaveGroupConversation = async (groupConv: any) => {
    if (!session?.user?.id || !groupConv?.id) return;

    Alert.alert(
      "Leave Group Chat",
      "Are you sure you want to leave this group?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            const { error } = isLegacyGroupConversation(groupConv)
              ? await supabase
                  .from("conversation_members")
                  .delete()
                  .eq("conversation_id", groupConv.id)
                  .eq("user_id", session.user.id)
              : await supabase
                  .from("group_conversation_members")
                  .delete()
                  .eq("group_conversation_id", groupConv.id)
                  .eq("user_id", session.user.id);

            if (error) {
              Alert.alert(
                "Unable to leave",
                error.message || "Please try again.",
              );
              return;
            }

            if (
              selectedConv?.id === groupConv.id &&
              selectedConv?.kind === "group"
            ) {
              setSelectedConv(null);
            }
            await loadConversations(session.user.id, profile?.role || "");
          },
        },
      ],
    );
  };

  const deleteGroupConversation = async (groupConv: any) => {
    if (!session?.user?.id || !groupConv?.id) return;

    Alert.alert(
      "Delete Group Chat",
      "Are you sure you want to delete this group chat? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (isLegacyGroupConversation(groupConv)) {
                await supabase
                  .from("messages")
                  .delete()
                  .eq("conversation_id", groupConv.id);

                await supabase
                  .from("conversation_members")
                  .delete()
                  .eq("conversation_id", groupConv.id);

                const { error: legacyDeleteError } = await supabase
                  .from("conversations")
                  .delete()
                  .eq("id", groupConv.id);

                if (legacyDeleteError) {
                  throw legacyDeleteError;
                }
              } else {
                const { data: groupMessageRows } = await supabase
                  .from("group_messages")
                  .select("id")
                  .eq("group_conversation_id", groupConv.id);

                const groupMessageIds = (groupMessageRows || [])
                  .map((row: any) => String(row?.id || ""))
                  .filter(Boolean);

                if (groupMessageIds.length) {
                  await supabase
                    .from("group_message_reads")
                    .delete()
                    .in("group_message_id", groupMessageIds);
                }

                await supabase
                  .from("group_messages")
                  .delete()
                  .eq("group_conversation_id", groupConv.id);

                await supabase
                  .from("group_conversation_members")
                  .delete()
                  .eq("group_conversation_id", groupConv.id);

                const { error: deleteError } = await supabase
                  .from("group_conversations")
                  .delete()
                  .eq("id", groupConv.id);

                if (deleteError) {
                  throw deleteError;
                }
              }

              if (
                selectedConv?.id === groupConv.id &&
                selectedConv?.kind === "group"
              ) {
                setSelectedConv(null);
              }
              await loadConversations(session.user.id, profile?.role || "");
            } catch (error: any) {
              Alert.alert(
                "Unable to delete group",
                error?.message || "Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const deleteConversation = async (conversation: any) => {
    if (!conversation?.id) return;

    if (conversation.kind === "group") {
      await leaveGroupConversation(conversation);
      return;
    }

    Alert.alert(
      "Delete Conversation",
      "Are you sure you want to delete this conversation? All messages will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("messages")
              .delete()
              .eq("conversation_id", conversation.id);
            await supabase
              .from("conversations")
              .delete()
              .eq("id", conversation.id);
            setConversations((prev) =>
              prev.filter(
                (c) =>
                  !(
                    c.id === conversation.id &&
                    String(c.kind || "direct") === "direct"
                  ),
              ),
            );
            if (selectedConv?.id === conversation.id) setSelectedConv(null);
          },
        },
      ],
    );
  };

  const loadSharedMedia = async (conversation: any) => {
    if (!conversation?.id) return;
    const tableName =
      conversation.kind === "group" && !isLegacyGroupConversation(conversation)
        ? "group_messages"
        : "messages";
    const conversationKey =
      conversation.kind === "group" && !isLegacyGroupConversation(conversation)
        ? "group_conversation_id"
        : "conversation_id";

    const { data } = await supabase
      .from(tableName)
      .select("*")
      .eq(conversationKey, conversation.id)
      .not("file_url", "is", null)
      .order("created_at", { ascending: false });
    setSharedMedia(data || []);
    setShowFilesPanel(true);
  };

  const getTimeAgo = (dateStr: string) => {
    if (!dateStr) return "";
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const getMessagePreview = (conv: any) => {
    if (!conv.lastMessage) {
      return conv.kind === "group" ? "No messages yet" : "Start a conversation";
    }
    const msg = conv.lastMessage;
    if (msg.file_url && msg.file_type?.startsWith("image")) return "📷 Photo";
    if (msg.file_url) return `📎 ${msg.file_name || "File"}`;
    if (conv.kind === "group") {
      const sender = (conv.members || []).find(
        (member: any) =>
          String(member?.user_id || "") === String(msg.sender_id || ""),
      )?.profile;
      const senderPrefix = sender?.first_name ? `${sender.first_name}: ` : "";
      return `${senderPrefix}${msg.message || ""}`;
    }
    return msg.message || "";
  };

  const renderAvatar = (
    user: any,
    size: number = 48,
    fallbackLabel?: string,
  ) => {
    if (user?.avatar_url) {
      return (
        <Image
          source={{ uri: user.avatar_url }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      );
    }
    return (
      <View
        style={[
          styles.avatarCircle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={[styles.avatarLetter, { fontSize: size * 0.4 }]}>
          {user?.first_name?.[0]?.toUpperCase() ||
            fallbackLabel?.[0]?.toUpperCase() ||
            "?"}
        </Text>
      </View>
    );
  };

  const renderConversationAvatar = (conversation: any, size: number = 48) => {
    if (conversation?.kind === "group") {
      if (conversation?.groupAvatarUrl) {
        return (
          <Image
            source={{ uri: conversation.groupAvatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        );
      }

      return (
        <View
          style={[
            styles.groupAvatarCircle,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Ionicons
            name="people"
            size={Math.max(16, size * 0.42)}
            color="white"
          />
        </View>
      );
    }

    return renderAvatar(conversation?.otherUser, size);
  };

  const renderConversationSkeletonCard = (cardKey: string) => (
    <View
      key={cardKey}
      style={[
        styles.convItem,
        {
          backgroundColor: isDark ? colors.surface : "white",
          borderBottomColor: isDark ? colors.border : "#f9fafb",
        },
      ]}
    >
      <SkeletonBlock
        width={52}
        height={52}
        borderRadius={26}
        backgroundColor={skeletonColor}
      />
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <SkeletonBlock
            width="56%"
            height={14}
            borderRadius={7}
            backgroundColor={skeletonColor}
          />
          <SkeletonBlock
            width={42}
            height={10}
            borderRadius={5}
            backgroundColor={skeletonColor}
          />
        </View>
        <SkeletonBlock
          width="40%"
          height={12}
          borderRadius={6}
          backgroundColor={skeletonColor}
          style={{ marginTop: 7 }}
        />
        <SkeletonBlock
          width="74%"
          height={12}
          borderRadius={6}
          backgroundColor={skeletonColor}
          style={{ marginTop: 8 }}
        />
      </View>
      <SkeletonBlock
        width={32}
        height={32}
        borderRadius={8}
        backgroundColor={skeletonColor}
      />
    </View>
  );

  // ===================== CHAT VIEW =====================
  if (selectedConv) {
    const normalizedProfileRole = String(profile?.role || "").toLowerCase();
    const isTenantGroupDetailsView =
      selectedConv.kind === "group" && normalizedProfileRole === "tenant";
    const isLandlordGroupDetailsView =
      selectedConv.kind === "group" && normalizedProfileRole === "landlord";
    const isGroupDetailsFullScreenView =
      isTenantGroupDetailsView || isLandlordGroupDetailsView;
    const groupDetailsMembers = isGroupDetailsFullScreenView
      ? [...(selectedConv.members || [])].sort((a: any, b: any) => {
          const aIsAdmin = String(a?.role || "").toLowerCase() === "admin";
          const bIsAdmin = String(b?.role || "").toLowerCase() === "admin";
          if (aIsAdmin !== bIsAdmin) return aIsAdmin ? -1 : 1;

          const aIsMe =
            String(a?.user_id || "") === String(session?.user?.id || "");
          const bIsMe =
            String(b?.user_id || "") === String(session?.user?.id || "");
          if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;

          const aName =
            `${a?.profile?.first_name || ""} ${a?.profile?.last_name || ""}`
              .trim()
              .toLowerCase();
          const bName =
            `${b?.profile?.first_name || ""} ${b?.profile?.last_name || ""}`
              .trim()
              .toLowerCase();
          return aName.localeCompare(bName);
        })
      : [];
    const groupCreatedDateLabel = selectedConv?.created_at
      ? new Date(selectedConv.created_at).toLocaleDateString("en-US")
      : "";

    return (
      <SafeAreaView
        style={[
          styles.chatContainer,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
        edges={["top"]}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          {/* Chat Header */}
          <View
            style={[
              styles.chatHeader,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderBottomColor: isDark ? colors.border : "#f3f4f6",
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => setSelectedConv(null)}
              style={[
                styles.chatBackBtn,
                { backgroundColor: isDark ? colors.card : "#f3f4f6" },
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={22}
                color={isDark ? colors.text : "#111"}
              />
            </TouchableOpacity>
            <View style={styles.chatHeaderUser}>
              {renderConversationAvatar(selectedConv, 38)}
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.chatHeaderName,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                  numberOfLines={1}
                >
                  {selectedConv.kind === "group"
                    ? selectedConv.groupName || "Group Chat"
                    : `${selectedConv.otherUser?.first_name || ""} ${selectedConv.otherUser?.last_name || ""}`.trim()}
                </Text>
                {selectedConv.kind === "group" ? (
                  <Text
                    style={[
                      styles.chatHeaderProp,
                      { color: isDark ? colors.textMuted : "#9ca3af" },
                    ]}
                    numberOfLines={1}
                  >
                    {(selectedConv.members || []).length} members
                  </Text>
                ) : (
                  !!selectedConv.propertyTitle && (
                    <Text
                      style={[
                        styles.chatHeaderProp,
                        { color: isDark ? colors.textMuted : "#9ca3af" },
                      ]}
                      numberOfLines={1}
                    >
                      {selectedConv.propertyTitle}
                    </Text>
                  )
                )}
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <TouchableOpacity
                onPress={openConversationSettings}
                style={[
                  styles.chatHeaderAction,
                  { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                ]}
              >
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color={isDark ? colors.textSecondary : "#666"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={handleChatScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => {
              if (shouldAutoScrollRef.current) {
                flatListRef.current?.scrollToEnd({ animated: true });
                shouldAutoScrollRef.current = false;
              }
            }}
            ListHeaderComponent={
              loadingMoreMessages ? (
                <View style={styles.olderLoadingWrap}>
                  <SkeletonBlock
                    width={148}
                    height={10}
                    borderRadius={5}
                    backgroundColor={skeletonColor}
                  />
                  <SkeletonBlock
                    width={96}
                    height={10}
                    borderRadius={5}
                    backgroundColor={skeletonColor}
                  />
                </View>
              ) : null
            }
            renderItem={({ item, index }) => {
              const isMe = item.sender_id === session.user.id;
              const isGroupConversation = selectedConv.kind === "group";
              const senderProfile = isGroupConversation
                ? groupSenderProfiles[String(item.sender_id || "")] ||
                  (String(item.sender_id || "") ===
                  String(session.user.id || "")
                    ? profile
                    : null)
                : selectedConv.otherUser;
              const senderDisplayName =
                `${senderProfile?.first_name || ""} ${senderProfile?.last_name || ""}`.trim() ||
                "Member";
              const senderFamilyPrimaryName =
                familyPrimaryNameByMember[String(item.sender_id || "")];
              const showDate =
                index === 0 ||
                new Date(item.created_at).toDateString() !==
                  new Date(messages[index - 1]?.created_at).toDateString();

              return (
                <>
                  {showDate && (
                    <View style={styles.dateSeparator}>
                      <View style={styles.dateLine} />
                      <Text style={styles.dateText}>
                        {new Date(item.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Text>
                      <View style={styles.dateLine} />
                    </View>
                  )}
                  <View
                    style={[
                      styles.msgRow,
                      isMe && { justifyContent: "flex-end" },
                    ]}
                  >
                    {!isMe && (
                      <View style={{ marginRight: 8 }}>
                        {renderAvatar(
                          senderProfile,
                          28,
                          isGroupConversation
                            ? selectedConv.groupName || "Group"
                            : undefined,
                        )}
                      </View>
                    )}
                    <View
                      style={[
                        styles.msgBubble,
                        isMe
                          ? styles.msgMe
                          : [
                              styles.msgOther,
                              isDark && {
                                backgroundColor: colors.card,
                                borderColor: colors.cardBorder,
                              },
                            ],
                      ]}
                    >
                      {!isMe && isGroupConversation && (
                        <View style={styles.groupSenderRow}>
                          <Text
                            style={[
                              styles.groupSenderName,
                              {
                                color: isDark
                                  ? colors.textSecondary
                                  : "#6b7280",
                              },
                            ]}
                          >
                            {senderDisplayName}
                          </Text>
                          {senderFamilyPrimaryName ? (
                            <Text
                              style={[
                                styles.groupSenderFamily,
                                {
                                  color: isDark ? colors.textMuted : "#9ca3af",
                                },
                              ]}
                            >
                              under ({senderFamilyPrimaryName})
                            </Text>
                          ) : null}
                        </View>
                      )}
                      {item.file_url && item.file_type?.startsWith("image") ? (
                        <TouchableOpacity
                          onPress={() =>
                            downloadFile(item.file_url, "photo.jpg")
                          }
                        >
                          <Image
                            source={{ uri: item.file_url }}
                            style={styles.msgImage}
                          />
                          <View style={styles.downloadOverlay}>
                            <Ionicons
                              name="download-outline"
                              size={16}
                              color="white"
                            />
                          </View>
                        </TouchableOpacity>
                      ) : item.file_url ? (
                        <TouchableOpacity
                          onPress={() =>
                            downloadFile(item.file_url, item.file_name)
                          }
                          style={styles.fileMsg}
                        >
                          <View style={styles.fileIconBox}>
                            <Ionicons
                              name="document-outline"
                              size={22}
                              color="#6366f1"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.fileName,
                                isMe && { color: "#e0e7ff" },
                                !isMe && isDark && { color: colors.text },
                              ]}
                              numberOfLines={1}
                            >
                              {item.file_name || "File"}
                            </Text>
                            <Text
                              style={[
                                styles.fileTap,
                                isMe && { color: "rgba(255,255,255,0.5)" },
                              ]}
                            >
                              Tap to download
                            </Text>
                          </View>
                          <Ionicons
                            name="download-outline"
                            size={18}
                            color={isMe ? "rgba(255,255,255,0.7)" : "#6366f1"}
                          />
                        </TouchableOpacity>
                      ) : (
                        <Text
                          style={[
                            styles.msgText,
                            isMe
                              ? styles.textMe
                              : [
                                  styles.textOther,
                                  isDark && { color: colors.text },
                                ],
                          ]}
                        >
                          {item.message}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.msgTime,
                          isMe ? styles.timeMe : styles.timeOther,
                        ]}
                      >
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                  </View>
                </>
              );
            }}
          />

          {/* Input Bar */}
          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderTopColor: isDark ? colors.border : "#f3f4f6",
              },
            ]}
          >
            <TouchableOpacity
              onPress={pickFile}
              style={[
                styles.inputAction,
                { backgroundColor: isDark ? colors.card : "#f3f4f6" },
              ]}
            >
              <Ionicons
                name="attach-outline"
                size={22}
                color={isDark ? colors.textSecondary : "#9ca3af"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={pickImage}
              style={[
                styles.inputAction,
                { backgroundColor: isDark ? colors.card : "#f3f4f6" },
              ]}
            >
              <Ionicons
                name="image-outline"
                size={22}
                color={isDark ? colors.textSecondary : "#9ca3af"}
              />
            </TouchableOpacity>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: isDark ? colors.card : "#f3f4f6",
                  color: isDark ? colors.text : "#111",
                },
              ]}
              value={text}
              onChangeText={setText}
              onFocus={() => scheduleScrollToBottom(true, 120)}
              placeholder="Type a message..."
              placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
              multiline
            />
            <TouchableOpacity
              onPress={() => sendMessage()}
              disabled={sending || !text.trim()}
              style={[
                styles.sendBtn,
                (!text.trim() || sending) && { opacity: 0.4 },
              ]}
            >
              {sending ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Shared Files Panel */}
        <Modal
          visible={showFilesPanel}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView
            style={[
              styles.filesPanelContainer,
              { backgroundColor: isDark ? colors.background : "white" },
            ]}
          >
            <View
              style={[
                styles.filesPanelHeader,
                { borderBottomColor: isDark ? colors.border : "#f3f4f6" },
              ]}
            >
              <Text
                style={[
                  styles.filesPanelTitle,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Shared Files & Photos
              </Text>
              <TouchableOpacity
                onPress={() => setShowFilesPanel(false)}
                style={[
                  styles.filesPanelClose,
                  { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                ]}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={isDark ? colors.textMuted : "#666"}
                />
              </TouchableOpacity>
            </View>

            {sharedMedia.length === 0 ? (
              <View style={styles.emptyFiles}>
                <View
                  style={[
                    styles.emptyFilesIcon,
                    { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                  ]}
                >
                  <Ionicons
                    name="folder-open-outline"
                    size={40}
                    color={isDark ? colors.textMuted : "#d1d5db"}
                  />
                </View>
                <Text
                  style={[
                    styles.emptyFilesTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  No shared files yet
                </Text>
                <Text
                  style={[
                    styles.emptyFilesSub,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  Photos and files shared in this conversation will appear here.
                </Text>
              </View>
            ) : (
              <FlatList
                data={sharedMedia}
                keyExtractor={(i) => i.id}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => downloadFile(item.file_url, item.file_name)}
                    style={[
                      styles.sharedFileItem,
                      { borderBottomColor: isDark ? colors.border : "#f9fafb" },
                    ]}
                  >
                    {item.file_type?.startsWith("image") ? (
                      <Image
                        source={{ uri: item.file_url }}
                        style={styles.sharedFileThumb}
                      />
                    ) : (
                      <View
                        style={[
                          styles.sharedFileThumb,
                          styles.sharedFileIcon,
                          isDark && {
                            backgroundColor: "rgba(99,102,241,0.15)",
                          },
                        ]}
                      >
                        <Ionicons
                          name="document-outline"
                          size={24}
                          color="#6366f1"
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.sharedFileName,
                          { color: isDark ? colors.text : "#111" },
                        ]}
                        numberOfLines={1}
                      >
                        {item.file_type?.startsWith("image")
                          ? "Photo"
                          : item.file_name || "File"}
                      </Text>
                      <Text
                        style={[
                          styles.sharedFileDate,
                          { color: isDark ? colors.textMuted : "#9ca3af" },
                        ]}
                      >
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.sharedFileDownload,
                        isDark && { backgroundColor: "rgba(99,102,241,0.15)" },
                      ]}
                    >
                      <Ionicons
                        name="download-outline"
                        size={18}
                        color="#6366f1"
                      />
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </SafeAreaView>
        </Modal>

        {isGroupDetailsFullScreenView ? (
          <Modal
            visible={showConversationSettingsModal}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={closeConversationSettings}
          >
            <SafeAreaView
              style={[
                styles.groupDetailsContainer,
                {
                  backgroundColor: isDark ? colors.background : "#f3f4f6",
                },
              ]}
              edges={["top"]}
            >
              <View
                style={[
                  styles.groupDetailsHeader,
                  {
                    backgroundColor: isDark ? colors.surface : "white",
                    borderBottomColor: isDark ? colors.border : "#111",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.groupDetailsHeaderTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Group Details
                </Text>
                <TouchableOpacity
                  onPress={closeConversationSettings}
                  style={[
                    styles.groupDetailsCloseBtn,
                    { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={isDark ? colors.textMuted : "#6b7280"}
                  />
                </TouchableOpacity>
              </View>

              <FlatList
                data={groupDetailsMembers}
                keyExtractor={(item, index) =>
                  `${String(item?.group_conversation_id || selectedConv.id)}-${String(item?.user_id || index)}`
                }
                contentContainerStyle={styles.groupDetailsContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                  <View style={styles.groupDetailsHeroWrap}>
                    <View style={styles.groupDetailsHeroIcon}>
                      <Ionicons name="people-outline" size={36} color="white" />
                    </View>
                    <View style={styles.groupDetailsNameRow}>
                      <Text
                        style={[
                          styles.groupDetailsName,
                          { color: isDark ? colors.text : "#111" },
                        ]}
                      >
                        {selectedConv.groupName || "Group Chat"}
                      </Text>
                      {isLandlordGroupDetailsView && selectedConv.canRename && (
                        <TouchableOpacity
                          onPress={openRenameGroupFromSettings}
                          style={[
                            styles.groupDetailsNameEditBtn,
                            {
                              backgroundColor: isDark
                                ? colors.card
                                : "rgba(148, 163, 184, 0.15)",
                            },
                          ]}
                        >
                          <Ionicons
                            name="create-outline"
                            size={14}
                            color={isDark ? colors.textMuted : "#94a3b8"}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                    {!!groupCreatedDateLabel && (
                      <Text
                        style={[
                          styles.groupDetailsCreated,
                          { color: isDark ? colors.textMuted : "#94a3b8" },
                        ]}
                      >
                        {`Created ${groupCreatedDateLabel}`}
                      </Text>
                    )}
                    <View style={styles.groupDetailsMembersHeaderRow}>
                      <Text
                        style={[
                          styles.groupDetailsSectionTitle,
                          {
                            color: isDark ? colors.textMuted : "#94a3b8",
                            marginTop: 26,
                            textAlign: "left",
                          },
                        ]}
                      >
                        MEMBERS ({groupDetailsMembers.length})
                      </Text>
                      {isLandlordGroupDetailsView && selectedConv.canRename && (
                        <TouchableOpacity
                          onPress={openAddMembersToGroupModal}
                          style={styles.groupDetailsAddBtn}
                        >
                          <Text
                            style={[
                              styles.groupDetailsAddBtnText,
                              { color: isDark ? colors.text : "#111" },
                            ]}
                          >
                            + Add
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                }
                renderItem={({ item }) => {
                  const memberProfile = item?.profile || {};
                  const isMe =
                    String(item?.user_id || "") ===
                    String(session?.user?.id || "");
                  const displayName =
                    `${memberProfile?.first_name || ""} ${memberProfile?.last_name || ""}`.trim() ||
                    "Member";
                  const familyPrimary =
                    familyPrimaryNameByMember[String(item?.user_id || "")];

                  return (
                    <View style={styles.groupDetailsMemberItem}>
                      {renderAvatar(memberProfile, 38, displayName)}
                      <View style={{ flex: 1 }}>
                        <View style={styles.groupDetailsMemberNameRow}>
                          <Text
                            style={[
                              styles.groupDetailsMemberName,
                              { color: isDark ? colors.text : "#111" },
                            ]}
                          >
                            {displayName}
                          </Text>
                          {isMe && (
                            <Text
                              style={[
                                styles.groupDetailsMemberTagYou,
                                {
                                  color: isDark ? colors.textMuted : "#9ca3af",
                                },
                              ]}
                            >
                              (You)
                            </Text>
                          )}
                          {!isMe && !!familyPrimary && (
                            <Text style={styles.groupDetailsMemberTagFamily}>
                              {`(under ${familyPrimary})`}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.groupDetailsMemberRole,
                            { color: isDark ? colors.textMuted : "#9ca3af" },
                          ]}
                        >
                          {String(item?.role || "member").toLowerCase()}
                        </Text>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text
                    style={[
                      styles.groupDetailsEmptyText,
                      { color: isDark ? colors.textMuted : "#9ca3af" },
                    ]}
                  >
                    No members found.
                  </Text>
                }
                ListFooterComponent={
                  <View style={styles.groupDetailsFooterSections}>
                    <Text
                      style={[
                        styles.groupDetailsSectionTitle,
                        {
                          color: isDark ? colors.textMuted : "#94a3b8",
                          marginTop: 18,
                        },
                      ]}
                    >
                      SHARED PHOTOS
                    </Text>
                    <Text
                      style={[
                        styles.groupDetailsSectionEmpty,
                        { color: isDark ? colors.textMuted : "#9ca3af" },
                      ]}
                    >
                      No photos shared yet.
                    </Text>

                    <Text
                      style={[
                        styles.groupDetailsSectionTitle,
                        {
                          color: isDark ? colors.textMuted : "#94a3b8",
                          marginTop: 18,
                        },
                      ]}
                    >
                      SHARED FILES
                    </Text>
                    <Text
                      style={[
                        styles.groupDetailsSectionEmpty,
                        { color: isDark ? colors.textMuted : "#9ca3af" },
                      ]}
                    >
                      No files shared yet.
                    </Text>

                    <Text
                      style={[
                        styles.groupDetailsSectionTitle,
                        {
                          color: isDark ? colors.textMuted : "#94a3b8",
                          marginTop: 18,
                        },
                      ]}
                    >
                      SETTINGS
                    </Text>

                    {isLandlordGroupDetailsView && selectedConv.canRename ? (
                      <TouchableOpacity
                        onPress={deleteGroupFromSettings}
                        style={styles.groupDetailsLeaveBtn}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#ef4444"
                        />
                        <Text style={styles.groupDetailsDeleteText}>
                          Delete Group Chat
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={leaveGroupFromSettings}
                        style={styles.groupDetailsLeaveBtn}
                      >
                        <Ionicons
                          name="exit-outline"
                          size={18}
                          color="#ef4444"
                        />
                        <Text style={styles.groupDetailsLeaveText}>
                          Leave Group Chat
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
            </SafeAreaView>
          </Modal>
        ) : selectedConv.kind === "direct" ? (
          <Modal
            visible={showConversationSettingsModal}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={closeConversationSettings}
          >
            <SafeAreaView
              style={[
                styles.directDetailsContainer,
                {
                  backgroundColor: isDark ? colors.background : "#f3f4f6",
                },
              ]}
              edges={["top"]}
            >
              <View
                style={[
                  styles.directDetailsHeader,
                  {
                    backgroundColor: isDark ? colors.surface : "white",
                    borderBottomColor: isDark ? colors.border : "#111",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.directDetailsHeaderTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Details
                </Text>
                <TouchableOpacity
                  onPress={closeConversationSettings}
                  style={[
                    styles.directDetailsCloseBtn,
                    { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={isDark ? colors.textMuted : "#6b7280"}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.directDetailsContent}>
                <Text
                  style={[
                    styles.directDetailsSectionTitle,
                    { color: isDark ? colors.textMuted : "#94a3b8" },
                  ]}
                >
                  SETTINGS
                </Text>
                <TouchableOpacity
                  onPress={deleteDirectFromSettings}
                  style={styles.directDetailsDeleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.directDetailsDeleteText}>
                    Delete Conversation
                  </Text>
                </TouchableOpacity>

                <Text
                  style={[
                    styles.directDetailsSectionTitle,
                    {
                      color: isDark ? colors.textMuted : "#94a3b8",
                      marginTop: 24,
                    },
                  ]}
                >
                  SHARED PHOTOS
                </Text>
                <Text
                  style={[
                    styles.directDetailsSectionEmpty,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  No photos shared yet.
                </Text>

                <Text
                  style={[
                    styles.directDetailsSectionTitle,
                    {
                      color: isDark ? colors.textMuted : "#94a3b8",
                      marginTop: 24,
                    },
                  ]}
                >
                  SHARED FILES
                </Text>
                <Text
                  style={[
                    styles.directDetailsSectionEmpty,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  No files shared yet.
                </Text>
              </View>
            </SafeAreaView>
          </Modal>
        ) : (
          <Modal
            visible={showConversationSettingsModal}
            transparent
            animationType="fade"
            onRequestClose={closeConversationSettings}
          >
            <View style={styles.modalBackdrop}>
              <Pressable
                style={styles.modalDismissArea}
                onPress={closeConversationSettings}
              />
              <View
                style={[
                  styles.modalCard,
                  { backgroundColor: isDark ? colors.surface : "white" },
                ]}
              >
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Conversation Settings
                </Text>

                <TouchableOpacity
                  onPress={openSharedMediaFromSettings}
                  style={[
                    styles.conversationSettingsItem,
                    {
                      borderBottomColor: isDark ? colors.border : "#f3f4f6",
                    },
                  ]}
                >
                  <Ionicons name="folder-outline" size={18} color="#2563eb" />
                  <Text
                    style={[
                      styles.conversationSettingsText,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    Shared files and photos
                  </Text>
                </TouchableOpacity>

                {selectedConv.kind === "group" && selectedConv.canRename && (
                  <TouchableOpacity
                    onPress={openRenameGroupFromSettings}
                    style={[
                      styles.conversationSettingsItem,
                      {
                        borderBottomColor: isDark ? colors.border : "#f3f4f6",
                      },
                    ]}
                  >
                    <Ionicons name="create-outline" size={18} color="#0891b2" />
                    <Text
                      style={[
                        styles.conversationSettingsText,
                        { color: isDark ? colors.text : "#111" },
                      ]}
                    >
                      Rename group chat
                    </Text>
                  </TouchableOpacity>
                )}

                {selectedConv.kind === "group" ? (
                  <TouchableOpacity
                    onPress={leaveGroupFromSettings}
                    style={styles.conversationSettingsItem}
                  >
                    <Ionicons name="exit-outline" size={18} color="#ef4444" />
                    <Text
                      style={[
                        styles.conversationSettingsText,
                        styles.conversationSettingsDanger,
                      ]}
                    >
                      Leave group chat
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={deleteDirectFromSettings}
                    style={styles.conversationSettingsItem}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text
                      style={[
                        styles.conversationSettingsText,
                        styles.conversationSettingsDanger,
                      ]}
                    >
                      Delete conversation
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Modal>
        )}

        <Modal
          visible={showAddGroupMembersModal}
          transparent
          animationType="fade"
          onRequestClose={closeAddGroupMembersModal}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalDismissArea}
              onPress={closeAddGroupMembersModal}
            />
            <View
              style={[
                styles.modalCard,
                { backgroundColor: isDark ? colors.surface : "white" },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Add Members
              </Text>
              <Text
                style={[
                  styles.modalSubtitle,
                  { color: isDark ? colors.textMuted : "#9ca3af" },
                ]}
              >
                Select tenants to add to this group chat.
              </Text>

              <FlatList
                data={groupMemberCandidates}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 280 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const picked = selectedGroupAddMemberIds.includes(
                    String(item.id),
                  );
                  return (
                    <TouchableOpacity
                      onPress={() => toggleGroupMemberToAdd(String(item.id))}
                      style={[
                        styles.modalListItem,
                        {
                          borderBottomColor: isDark ? colors.border : "#f3f4f6",
                        },
                      ]}
                    >
                      {renderAvatar(item, 36)}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.modalListItemName,
                            { color: isDark ? colors.text : "#111" },
                          ]}
                        >
                          {`${item.first_name || ""} ${item.last_name || ""}`.trim()}
                        </Text>
                        {!!item.familyLabel && (
                          <Text
                            style={[
                              styles.modalListItemSub,
                              { color: isDark ? colors.textMuted : "#9ca3af" },
                            ]}
                          >
                            {item.familyLabel}
                          </Text>
                        )}
                      </View>
                      <View
                        style={[
                          styles.modalCheckCircle,
                          picked && styles.modalCheckCircleActive,
                        ]}
                      >
                        {picked && (
                          <Ionicons name="checkmark" size={14} color="white" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  loadingGroupMemberCandidates ? (
                    <View style={styles.groupMembersLoadingWrap}>
                      <ActivityIndicator size="small" color="#2563eb" />
                      <Text
                        style={[
                          styles.modalEmptyText,
                          {
                            color: isDark ? colors.textMuted : "#9ca3af",
                            paddingVertical: 8,
                          },
                        ]}
                      >
                        Loading available members...
                      </Text>
                    </View>
                  ) : groupMemberCandidatesError ? (
                    <View style={styles.groupMembersLoadingWrap}>
                      <Text
                        style={[
                          styles.modalEmptyText,
                          {
                            color: "#ef4444",
                            paddingVertical: 6,
                          },
                        ]}
                      >
                        {groupMemberCandidatesError}
                      </Text>
                      <TouchableOpacity
                        onPress={openAddMembersToGroupModal}
                        style={styles.groupMembersRetryBtn}
                      >
                        <Text style={styles.groupMembersRetryBtnText}>
                          Retry
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.modalEmptyText,
                        { color: isDark ? colors.textMuted : "#9ca3af" },
                      ]}
                    >
                      No available members to add.
                    </Text>
                  )
                }
              />

              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  onPress={closeAddGroupMembersModal}
                  style={[
                    styles.modalActionGhost,
                    { borderColor: isDark ? colors.border : "#d1d5db" },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalActionGhostText,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitAddMembersToGroup}
                  disabled={addingGroupMembers}
                  style={[
                    styles.modalActionPrimary,
                    addingGroupMembers && { opacity: 0.6 },
                  ]}
                >
                  {addingGroupMembers ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.modalActionPrimaryText}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showRenameGroupModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowRenameGroupModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalDismissArea}
              onPress={() => setShowRenameGroupModal(false)}
            />
            <View
              style={[
                styles.modalCard,
                { backgroundColor: isDark ? colors.surface : "white" },
              ]}
            >
              <Text
                style={[
                  styles.modalTitle,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                Rename Group Chat
              </Text>
              <TextInput
                value={renameGroupName}
                onChangeText={setRenameGroupName}
                placeholder="Group chat name"
                placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
                style={[
                  styles.modalTextInput,
                  {
                    backgroundColor: isDark ? colors.card : "#f3f4f6",
                    color: isDark ? colors.text : "#111",
                  },
                ]}
              />
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  onPress={() => setShowRenameGroupModal(false)}
                  style={[
                    styles.modalActionGhost,
                    { borderColor: isDark ? colors.border : "#d1d5db" },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalActionGhostText,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submitRenameGroup}
                  disabled={renamingGroup}
                  style={[
                    styles.modalActionPrimary,
                    renamingGroup && { opacity: 0.6 },
                  ]}
                >
                  {renamingGroup ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.modalActionPrimaryText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ===================== CONVERSATION LIST VIEW =====================
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
      edges={["top"]}
    >
      {/* Page Header */}
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
            Messages
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            {profile?.role === "tenant"
              ? "Chat with your landlord"
              : "Chat with your tenants and fellow landlords"}
          </Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="chatbubbles" size={20} color="white" />
        </View>
      </View>

      <View
        style={[
          styles.inboxActionsRow,
          { borderBottomColor: isDark ? colors.border : "#f3f4f6" },
        ]}
      >
        <TouchableOpacity
          onPress={openAddChatModal}
          style={[
            styles.inboxActionBtn,
            {
              backgroundColor: isDark ? colors.surface : "white",
              borderColor: isDark ? colors.border : "#e5e7eb",
            },
          ]}
        >
          <Ionicons name="add-circle-outline" size={16} color="#2563eb" />
          <Text style={[styles.inboxActionBtnText, { color: "#2563eb" }]}>
            +add chat
          </Text>
        </TouchableOpacity>

        {String(profile?.role || "").toLowerCase() === "landlord" && (
          <TouchableOpacity
            onPress={openAddGroupModal}
            style={[
              styles.inboxActionBtn,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderColor: isDark ? colors.border : "#e5e7eb",
              },
            ]}
          >
            <Ionicons name="people-outline" size={16} color="#0891b2" />
            <Text style={[styles.inboxActionBtnText, { color: "#0891b2" }]}>
              +add group chat
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <FlatList
          data={Array.from(
            { length: MESSAGES_LOADING_SKELETON_COUNT },
            (_, index) => `messages-conversation-skeleton-${index}`,
          )}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingBottom: 130 }}
          renderItem={({ item }) => renderConversationSkeletonCard(item)}
          showsVerticalScrollIndicator={false}
        />
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: isDark ? colors.card : "#f3f4f6" },
            ]}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={48}
              color={isDark ? colors.textMuted : "#d1d5db"}
            />
          </View>
          <Text
            style={[
              styles.emptyTitle,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            {profile?.role === "tenant"
              ? "No Landlord Found"
              : "No Conversations Yet"}
          </Text>
          <Text
            style={[
              styles.emptySubtitle,
              { color: isDark ? colors.textSecondary : "#9ca3af" },
            ]}
          >
            {profile?.role === "tenant"
              ? "You don't have an active rental yet. Once you're assigned to a property, you can message your landlord here."
              : "Conversations with your tenants and fellow landlords will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(i) => `${i.kind || "direct"}-${i.id}`}
          contentContainerStyle={{ paddingBottom: 130 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedConv(item)}
              style={[
                styles.convItem,
                {
                  backgroundColor: isDark ? colors.surface : "white",
                  borderBottomColor: isDark ? colors.border : "#f9fafb",
                },
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.convAvatarWrap}>
                {renderConversationAvatar(item, 52)}
                {item.kind === "group" ? (
                  <View style={styles.groupTypeDot}>
                    <Ionicons name="people" size={8} color="white" />
                  </View>
                ) : (
                  <View style={styles.onlineDot} />
                )}
              </View>
              <View style={styles.convContent}>
                <View style={styles.convTopRow}>
                  <Text
                    style={[
                      styles.convName,
                      { color: isDark ? colors.text : "#111" },
                    ]}
                    numberOfLines={1}
                  >
                    {item.kind === "group"
                      ? item.groupName || "Group Chat"
                      : `${item.otherUser?.first_name || ""} ${item.otherUser?.last_name || ""}`.trim()}
                  </Text>
                  <Text style={styles.convTime}>
                    {getTimeAgo(
                      item.lastMessage?.created_at || item.updated_at,
                    )}
                  </Text>
                </View>
                {item.kind === "group" ? (
                  <View
                    style={[
                      styles.convPropertyTag,
                      isDark && { backgroundColor: "rgba(20,184,166,0.2)" },
                    ]}
                  >
                    <Ionicons name="people-outline" size={10} color="#0891b2" />
                    <Text
                      style={[styles.convPropertyText, { color: "#0891b2" }]}
                    >
                      {(item.members || []).length} members
                    </Text>
                  </View>
                ) : (
                  !!item.propertyTitle && (
                    <View
                      style={[
                        styles.convPropertyTag,
                        isDark && { backgroundColor: "rgba(99,102,241,0.15)" },
                      ]}
                    >
                      <Ionicons name="home-outline" size={10} color="#6366f1" />
                      <Text style={styles.convPropertyText}>
                        {item.propertyTitle}
                      </Text>
                    </View>
                  )
                )}
                <Text
                  style={[
                    styles.convPreview,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                  numberOfLines={1}
                >
                  {getMessagePreview(item)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() =>
                  item.kind === "group"
                    ? leaveGroupConversation(item)
                    : deleteConversation(item)
                }
                style={styles.convDeleteBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={
                    item.kind === "group" ? "exit-outline" : "trash-outline"
                  }
                  size={16}
                  color="#ef4444"
                />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal
        visible={showAddChatModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddChatModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => setShowAddChatModal(false)}
          />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Add Chat
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              Pick a user to start a direct message.
            </Text>

            <FlatList
              data={addChatCandidates}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => startDirectConversation(item)}
                  disabled={creatingDirectChat}
                  style={[
                    styles.modalListItem,
                    {
                      borderBottomColor: isDark ? colors.border : "#f3f4f6",
                    },
                  ]}
                >
                  {renderAvatar(item, 36)}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modalListItemName,
                        { color: isDark ? colors.text : "#111" },
                      ]}
                    >
                      {`${item.first_name || ""} ${item.last_name || ""}`.trim()}
                    </Text>
                  </View>
                  {creatingDirectChat ? (
                    <ActivityIndicator size="small" color="#2563eb" />
                  ) : (
                    <Ionicons
                      name="chatbubble-outline"
                      size={18}
                      color="#2563eb"
                    />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.modalEmptyText,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  No users found.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddGroupModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => setShowAddGroupModal(false)}
          />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Add Group Chat
            </Text>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group chat name"
              placeholderTextColor={isDark ? colors.textMuted : "#9ca3af"}
              style={[
                styles.modalTextInput,
                {
                  backgroundColor: isDark ? colors.card : "#f3f4f6",
                  color: isDark ? colors.text : "#111",
                },
              ]}
            />

            <Text
              style={[
                styles.modalSubtitle,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              Select tenants to include in this group.
            </Text>

            <FlatList
              data={groupCandidates}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 280 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const picked = selectedGroupMemberIds.includes(String(item.id));
                return (
                  <TouchableOpacity
                    onPress={() => toggleGroupMember(String(item.id))}
                    style={[
                      styles.modalListItem,
                      {
                        borderBottomColor: isDark ? colors.border : "#f3f4f6",
                      },
                    ]}
                  >
                    {renderAvatar(item, 36)}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modalListItemName,
                          { color: isDark ? colors.text : "#111" },
                        ]}
                      >
                        {`${item.first_name || ""} ${item.last_name || ""}`.trim()}
                      </Text>
                      {!!item.familyLabel && (
                        <Text
                          style={[
                            styles.modalListItemSub,
                            { color: isDark ? colors.textMuted : "#9ca3af" },
                          ]}
                        >
                          {item.familyLabel}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        styles.modalCheckCircle,
                        picked && styles.modalCheckCircleActive,
                      ]}
                    >
                      {picked && (
                        <Ionicons name="checkmark" size={14} color="white" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text
                  style={[
                    styles.modalEmptyText,
                    { color: isDark ? colors.textMuted : "#9ca3af" },
                  ]}
                >
                  No eligible tenants found.
                </Text>
              }
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                onPress={() => setShowAddGroupModal(false)}
                style={[
                  styles.modalActionGhost,
                  { borderColor: isDark ? colors.border : "#d1d5db" },
                ]}
              >
                <Text
                  style={[
                    styles.modalActionGhostText,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={createGroupConversation}
                disabled={creatingGroup}
                style={[
                  styles.modalActionPrimary,
                  creatingGroup && { opacity: 0.6 },
                ]}
              >
                {creatingGroup ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalActionPrimaryText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ===================== LIST VIEW =====================
  container: { flex: 1, backgroundColor: "#f9fafb" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: "#111" },
  headerSub: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  headerBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  inboxActionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  inboxActionBtn: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  inboxActionBtnText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "lowercase",
  },

  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 13, color: "#9ca3af" },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 22,
  },

  // Conversation Item
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
    gap: 14,
  },
  convAvatarWrap: { position: "relative" },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "white",
  },
  groupTypeDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#0891b2",
    borderWidth: 2,
    borderColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  convContent: { flex: 1 },
  convTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  convName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    flex: 1,
    marginRight: 8,
  },
  convTime: { fontSize: 11, color: "#c4c4c4", fontWeight: "500" },
  convPropertyTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  convPropertyText: { fontSize: 10, color: "#6366f1", fontWeight: "600" },
  convPreview: { fontSize: 13, color: "#9ca3af", marginTop: 4 },
  convDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },

  // Avatar
  avatarCircle: {
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "white", fontWeight: "800" },
  groupAvatarCircle: {
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },

  // ===================== CHAT VIEW =====================
  chatContainer: { flex: 1, backgroundColor: "#f9fafb" },

  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 10,
  },
  chatBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  chatHeaderUser: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatHeaderName: { fontSize: 16, fontWeight: "700", color: "#111" },
  chatHeaderProp: { fontSize: 11, color: "#9ca3af" },
  chatHeaderAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },

  // Messages
  messageList: { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 8 },
  olderLoadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  olderLoadingText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
  },
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 12,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  dateText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },

  msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6 },
  msgBubble: { maxWidth: "78%", borderRadius: 18, overflow: "hidden" },
  msgMe: {
    backgroundColor: "#111",
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  msgOther: {
    backgroundColor: "white",
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  msgText: { fontSize: 15, lineHeight: 21 },
  textMe: { color: "white" },
  textOther: { color: "#111" },
  groupSenderRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  groupSenderName: {
    fontSize: 11,
    fontWeight: "700",
  },
  groupSenderFamily: {
    fontSize: 10,
    fontWeight: "500",
  },
  msgTime: { fontSize: 10, marginTop: 4 },
  timeMe: { color: "rgba(255,255,255,0.45)", textAlign: "right" },
  timeOther: { color: "#c4c4c4" },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  modalDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalSubtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  modalTextInput: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  modalListItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  modalListItemName: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalListItemSub: {
    fontSize: 11,
    marginTop: 1,
  },
  modalEmptyText: {
    textAlign: "center",
    fontSize: 13,
    paddingVertical: 18,
  },
  modalCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  modalCheckCircleActive: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },
  modalActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  modalActionGhost: {
    minWidth: 84,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalActionGhostText: {
    fontSize: 13,
    fontWeight: "600",
  },
  modalActionPrimary: {
    minWidth: 92,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalActionPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "white",
  },
  conversationSettingsItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  conversationSettingsText: {
    fontSize: 14,
    fontWeight: "600",
  },
  conversationSettingsDanger: {
    color: "#ef4444",
  },

  // Direct Message Details
  directDetailsContainer: {
    flex: 1,
  },
  directDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  directDetailsHeaderTitle: {
    fontSize: 30,
    fontWeight: "800",
  },
  directDetailsCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  directDetailsContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  directDetailsSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
  directDetailsDeleteBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  directDetailsDeleteText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },
  directDetailsSectionEmpty: {
    marginTop: 8,
    fontSize: 13,
    fontStyle: "italic",
  },

  // Group Details (Tenant / Landlord)
  groupDetailsContainer: {
    flex: 1,
  },
  groupDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  groupDetailsHeaderTitle: {
    fontSize: 30,
    fontWeight: "800",
  },
  groupDetailsCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  groupDetailsContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  groupDetailsHeroWrap: {
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 6,
  },
  groupDetailsHeroIcon: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  groupDetailsName: {
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
  },
  groupDetailsNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  groupDetailsNameEditBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 3,
  },
  groupDetailsCreated: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
  },
  groupDetailsMembersHeaderRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupDetailsAddBtn: {
    marginTop: 24,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  groupDetailsAddBtnText: {
    fontSize: 18,
    fontWeight: "700",
  },
  groupDetailsMemberItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  groupDetailsMemberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  groupDetailsMemberName: {
    fontSize: 16,
    fontWeight: "700",
  },
  groupDetailsMemberTagYou: {
    fontSize: 16,
    fontWeight: "700",
  },
  groupDetailsMemberTagFamily: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563eb",
  },
  groupDetailsMemberRole: {
    marginTop: 1,
    fontSize: 12,
    textTransform: "lowercase",
  },
  groupDetailsEmptyText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 14,
  },
  groupDetailsFooterSections: {
    marginTop: 18,
    paddingBottom: 12,
  },
  groupDetailsSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.35,
  },
  groupDetailsSectionEmpty: {
    marginTop: 8,
    fontSize: 13,
    fontStyle: "italic",
  },
  groupDetailsLeaveBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  groupDetailsLeaveText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },
  groupDetailsDeleteText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "700",
  },
  groupMembersLoadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  groupMembersRetryBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  groupMembersRetryBtnText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },

  msgImage: { width: 200, height: 200, borderRadius: 12 },
  downloadOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  // File Message
  fileMsg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 200,
  },
  fileIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 13, fontWeight: "600", color: "#111" },
  fileTap: { fontSize: 10, color: "#9ca3af", marginTop: 1 },

  // Input Bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    gap: 6,
  },
  inputAction: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },

  // ===================== SHARED FILES PANEL =====================
  filesPanelContainer: { flex: 1, backgroundColor: "white" },
  filesPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  filesPanelTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  filesPanelClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyFiles: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyFilesIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyFilesTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  emptyFilesSub: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
  },

  sharedFileItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
  },
  sharedFileThumb: { width: 48, height: 48, borderRadius: 10 },
  sharedFileIcon: {
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  sharedFileName: { fontSize: 14, fontWeight: "600", color: "#111" },
  sharedFileDate: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  sharedFileDownload: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
});
