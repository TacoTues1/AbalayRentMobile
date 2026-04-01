import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { decode } from "base64-arraybuffer";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRealtime } from "../../hooks/useRealtime";
import { createNotification } from "../../lib/notifications";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const isVideoUrl = (url: string) => /\.(mp4|mov|webm)(\?.*)?$/i.test(url);

export default function MaintenanceScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
  const syncInFlightRef = useRef(false);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [occupiedProperty, setOccupiedProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // ImageViewer
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null);

  // Search & Filter
  const [searchId, setSearchId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Active Selections
  const [requestToSchedule, setRequestToSchedule] = useState<any>(null);
  const [requestToEdit, setRequestToEdit] = useState<any>(null);
  const [requestToComplete, setRequestToComplete] = useState<any>(null);
  const [requestForFeedback, setRequestForFeedback] = useState<any>(null);
  const [requestToCancel, setRequestToCancel] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);

  // Inputs
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [repairmanName, setRepairmanName] = useState("");
  const [maintenanceCost, setMaintenanceCost] = useState("");
  const [deductFromDeposit, setDeductFromDeposit] = useState(true);
  const [showCostMethodMenu, setShowCostMethodMenu] = useState(false);
  const [depositContext, setDepositContext] = useState<{
    occupancyId: string | null;
    billingTenantId: string | null;
    available: number;
    hasDeposit: boolean;
  }>({
    occupancyId: null,
    billingTenantId: null,
    available: 0,
    hasDeposit: false,
  });
  const [loadingDepositInfo, setLoadingDepositInfo] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [responseText, setResponseText] = useState("");

  // Create Request Form
  const [formData, setFormData] = useState({
    property_id: "",
    title: "",
    description: "",
    priority: "normal",
  });
  const [proofFiles, setProofFiles] = useState<ImagePicker.ImagePickerAsset[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: "",
    description: "",
    priority: "normal",
  });
  const [editExistingProofUrls, setEditExistingProofUrls] = useState<string[]>(
    [],
  );
  const [editNewProofFiles, setEditNewProofFiles] = useState<
    ImagePicker.ImagePickerAsset[]
  >([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const statusColors: any = {
    pending: "#FEF3C7",
    scheduled: "#DBEAFE",
    in_progress: "#FFEDD5",
    completed: "#DCFCE7",
    closed: "#F3F4F6",
    cancelled: "#FEE2E2",
  };

  const statusTextColors: any = {
    pending: "#92400E",
    scheduled: "#1E40AF",
    in_progress: "#9A3412",
    completed: "#166534",
    closed: "#1F2937",
    cancelled: "#991B1B",
  };

  const priorityStyles: any = {
    high: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
    normal: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
    low: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  };

  async function loadRequestsWithProfile(sess: any, prof: any) {
    try {
      let query = supabase
        .from("maintenance_requests")
        .select(
          "*, properties(title, landlord), tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, last_name)",
        )
        .order("created_at", { ascending: false });

      if (prof.role === "tenant") {
        let tenantIds = [sess.user.id];

        // Find if this tenant has an active occupancy
        const { data: myOcc } = await supabase
          .from("tenant_occupancies")
          .select("id")
          .eq("tenant_id", sess.user.id)
          .eq("status", "active")
          .maybeSingle();

        if (myOcc) {
          // This is the primary tenant. Get family members.
          const { data: fms } = await supabase
            .from("family_members")
            .select("member_id")
            .eq("parent_occupancy_id", myOcc.id);
          if (fms) {
            tenantIds = [...tenantIds, ...fms.map((f) => f.member_id)];
          }
        } else {
          // Check if family member via API to load their own requests
          try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
            const urlPrefix = API_URL.endsWith("/")
              ? API_URL.slice(0, -1)
              : API_URL;
            if (urlPrefix) {
              const res = await fetch(
                `${urlPrefix}/api/family-members?member_id=${sess.user.id}`,
              );
              if (res.ok) {
                const fmData = await res.json();
                if (fmData && fmData.occupancy) {
                  tenantIds = [sess.user.id]; // Family member only sees their own requests right now
                }
              }
            }
          } catch (err) {}
        }

        query = query.in("tenant", tenantIds);
      } else if (prof.role === "landlord") {
        const { data: myProps } = await supabase
          .from("properties")
          .select("id")
          .eq("landlord", sess.user.id);
        if (myProps && myProps.length > 0) {
          query = query.in(
            "property_id",
            myProps.map((p: any) => p.id),
          );
        } else {
          setRequests([]);
          return;
        }
      }

      const { data, error } = await query;
      if (error) {
        console.log("Load requests error:", error);
      } else if (data && data.length > 0) {
        // Resolve family members via API lookup to show tags
        const tenantIdsInRequests = [...new Set(data.map((r) => r.tenant))];
        let fmMap = {};
        try {
          const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
          const urlPrefix = API_URL.endsWith("/")
            ? API_URL.slice(0, -1)
            : API_URL;
          if (urlPrefix) {
            const res = await fetch(`${urlPrefix}/api/family-members`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "lookup_members",
                member_ids: tenantIdsInRequests,
              }),
            });
            if (res.ok) {
              const fData = await res.json();
              fmMap = fData.membersMap || {};
            }
          }
        } catch (err) {}

        const enrichedRequests = data.map((req: any) => ({
          ...req,
          is_family_member: !!(fmMap as any)[req.tenant],
          primary_tenant_name: (fmMap as any)[req.tenant]
            ? `${(fmMap as any)[req.tenant].first_name} ${(fmMap as any)[req.tenant].last_name}`
            : null,
        }));

        // Auto transition scheduled to in_progress if time past
        const now = new Date();
        const finalRequests = enrichedRequests.map((req: any) => {
          if (
            req.status === "scheduled" &&
            req.scheduled_date &&
            new Date(req.scheduled_date) <= now
          ) {
            req.status = "in_progress";
            supabase
              .from("maintenance_requests")
              .update({ status: "in_progress" })
              .eq("id", req.id)
              .then(() => console.log("Auto transitioned", req.id));
          }
          return req;
        });

        setRequests(finalRequests);
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.log("Load requests exception:", e);
    }
  }

  async function loadPropertiesWithProfile(sess: any, prof: any) {
    try {
      if (prof.role === "tenant") {
        const { data: occupancy } = await supabase
          .from("tenant_occupancies")
          .select("property_id, property:properties(id, title)")
          .eq("tenant_id", sess.user.id)
          .eq("status", "active")
          .maybeSingle();

        let prop = null;
        if (occupancy && occupancy.property) {
          prop = Array.isArray(occupancy.property)
            ? occupancy.property[0]
            : occupancy.property;
        } else {
          // Check if user is family member
          try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
            const urlPrefix = API_URL.endsWith("/")
              ? API_URL.slice(0, -1)
              : API_URL;
            if (urlPrefix) {
              const res = await fetch(
                `${urlPrefix}/api/family-members?member_id=${sess.user.id}`,
              );
              if (res.ok) {
                const fmData = await res.json();
                if (fmData && fmData.occupancy && fmData.occupancy.property) {
                  prop = fmData.occupancy.property;
                }
              }
            }
          } catch (err) {
            console.error("Failed to load family member property", err);
          }
        }

        if (prop) {
          setOccupiedProperty(prop);
          setProperties([prop]);
          setFormData((prev) => ({ ...prev, property_id: prop.id }));
        } else {
          // Fallback: check accepted applications
          const { data: acceptedApps } = await supabase
            .from("applications")
            .select("property_id, property:properties(id, title)")
            .eq("tenant", sess.user.id)
            .eq("status", "accepted");

          const approvedProperties =
            acceptedApps?.map((app: any) => app.property).filter(Boolean) || [];
          setProperties(approvedProperties);
          setOccupiedProperty(null);
        }
      } else if (prof.role === "landlord") {
        const { data } = await supabase
          .from("properties")
          .select("id, title")
          .eq("landlord", sess.user.id);
        setProperties(data || []);
      }
    } catch (e) {
      console.log("Load properties error:", e);
    }
  }

  async function initData() {
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession) {
        router.replace("/");
        return;
      }

      setSession(currentSession);

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentSession.user.id)
        .single();

      if (!profileData) {
        console.log("No profile found");
        return;
      }

      setProfile(profileData);

      // Load requests
      await loadRequestsWithProfile(currentSession, profileData);

      // Load properties
      await loadPropertiesWithProfile(currentSession, profileData);
    } catch (e) {
      console.log("Init error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    initData();
  }, []);

  const refreshRequestsRealtimeSafe = useCallback(async () => {
    if (!session || !profile) return;
    if (syncInFlightRef.current) return;

    syncInFlightRef.current = true;
    try {
      await loadRequestsWithProfile(session, profile);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [session, profile]);

  useRealtime(
    ["maintenance_requests"],
    () => {
      refreshRequestsRealtimeSafe();
    },
    !!session && !!profile,
  );

  useFocusEffect(
    useCallback(() => {
      refreshRequestsRealtimeSafe();
      return () => {};
    }, [refreshRequestsRealtimeSafe]),
  );

  // Polling fallback for unstable realtime/network conditions.
  useEffect(() => {
    if (!session || !profile) return;

    const intervalId = setInterval(() => {
      refreshRequestsRealtimeSafe();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [session, profile, refreshRequestsRealtimeSafe]);

  const parsedMaintenanceCost = parseFloat(maintenanceCost) || 0;
  const canDeductFromDeposit =
    depositContext.hasDeposit &&
    parsedMaintenanceCost > 0 &&
    depositContext.available >= parsedMaintenanceCost;
  const depositShortfall = Math.max(
    0,
    parsedMaintenanceCost - depositContext.available,
  );
  const maintenanceActionText =
    parsedMaintenanceCost <= 0
      ? "No payment will be charged to the tenant."
      : canDeductFromDeposit && deductFromDeposit
        ? "This will be deducted from security deposit."
        : "This will be sent as a payment cost request to the tenant.";
  const selectedCostMethodLabel = deductFromDeposit
    ? "Deduct from Security Deposit"
    : "Send as Payment Cost";

  useEffect(() => {
    if (deductFromDeposit && !canDeductFromDeposit) {
      setDeductFromDeposit(false);
    }
  }, [canDeductFromDeposit, deductFromDeposit]);

  useEffect(() => {
    if (!canDeductFromDeposit) {
      setShowCostMethodMenu(false);
    }
  }, [canDeductFromDeposit]);

  const normalizeStatus = (value: any) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const actorRole = normalizeStatus(profile?.role);
  const isActorLandlord = actorRole === "landlord";

  const isPendingLikeStatus = (value: any) =>
    normalizeStatus(value).includes("pending");

  const canTenantEditRequest = (request: any) =>
    isPendingLikeStatus(request?.status) && !request?.scheduled_date;

  const parseProofUrls = (urls: any) => {
    if (typeof urls === "string") {
      try {
        const parsed = JSON.parse(urls);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }

    return Array.isArray(urls) ? urls.filter(Boolean) : [];
  };

  // For pull-to-refresh
  async function loadRequests() {
    if (!session || !profile) {
      setRefreshing(false);
      return;
    }
    await refreshRequestsRealtimeSafe();
    setRefreshing(false);
  }

  // --- ACTIONS ---

  const sendBackendNotification = async (
    type: string,
    recordId: string,
    actorId: string,
  ) => {
    if (!API_URL) return;
    try {
      await fetch(`${API_URL}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, recordId, actorId }),
      });
    } catch (e) {
      console.log("Backend notify error:", e);
    }
  };

  async function updateRequestStatus(requestId: string, newStatus: string) {
    const { error } = await supabase
      .from("maintenance_requests")
      .update({
        status: newStatus,
        resolved_at:
          newStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", requestId);

    if (!error) {
      Alert.alert(
        "Success",
        `Status updated to ${newStatus.replace("_", " ")}`,
      );
      loadRequests();

      if (session?.user?.id) {
        await sendBackendNotification(
          "maintenance",
          requestId,
          session.user.id,
        );
      }

      // Send notification to tenant
      const request = requests.find((r) => r.id === requestId);
      if (isActorLandlord && request && request.tenant) {
        try {
          await createNotification(
            request.tenant,
            "maintenance",
            `Maintenance "${request.title}" status updated to ${newStatus.replace("_", " ")}.`,
            { actor: session.user.id, link: "/maintenance" },
          );
        } catch (e) {
          console.log("Notification error:", e);
        }
      }
    } else {
      Alert.alert("Error", "Failed to update status");
    }
  }

  function promptTenantMarkDone(request: any) {
    Alert.alert(
      "Mark as Done?",
      "Only continue if the repair is already finished. This will update the request status to completed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Done",
          style: "destructive",
          onPress: () => markDoneByTenant(request),
        },
      ],
    );
  }

  async function markDoneByTenant(request: any) {
    const { error } = await supabase
      .from("maintenance_requests")
      .update({
        status: "completed",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (error) {
      Alert.alert("Error", "Failed to mark request as done");
      return;
    }

    if (session?.user?.id) {
      await sendBackendNotification("maintenance", request.id, session.user.id);
    }

    Alert.alert("Success", "Request marked as done.");
    loadRequests();
  }

  // Cancel flow
  function promptCancel(request: any) {
    setRequestToCancel(request);
    setShowCancelModal(true);
  }

  async function confirmCancel() {
    if (!requestToCancel) return;
    await updateRequestStatus(requestToCancel.id, "cancelled");
    setShowCancelModal(false);
    setRequestToCancel(null);
  }

  // Start Work / Edit flow
  function openStartWorkModal(request: any) {
    setRequestToSchedule(request);

    if (request.scheduled_date) {
      setScheduleDate(new Date(request.scheduled_date));
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      setScheduleDate(tomorrow);
    }
    setRepairmanName(request.repairman_name || "");
    setShowScheduleModal(true);
  }

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      const newDate = new Date(scheduleDate);
      newDate.setFullYear(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );
      setScheduleDate(newDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS !== "ios") {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const newDate = new Date(scheduleDate);
      newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setScheduleDate(newDate);
    }
  };

  async function confirmStartWork() {
    if (!requestToSchedule) {
      Alert.alert("Error", "No request selected");
      return;
    }

    const isUpdate =
      requestToSchedule.status === "scheduled" ||
      requestToSchedule.status === "in_progress";
    const newStatus = isUpdate ? requestToSchedule.status : "scheduled";

    const { error } = await supabase
      .from("maintenance_requests")
      .update({
        status: newStatus,
        scheduled_date: scheduleDate.toISOString(),
        repairman_name: repairmanName.trim() || null,
      })
      .eq("id", requestToSchedule.id);

    if (!error) {
      Alert.alert(
        "Success",
        isUpdate ? "Schedule updated!" : "Request scheduled!",
      );

      // Notify tenant
      if (requestToSchedule.tenant && isActorLandlord) {
        const formattedDate = scheduleDate.toLocaleString();
        const repairmanInfo = repairmanName.trim()
          ? ` Assigned repairman: ${repairmanName.trim()}.`
          : "";
        const actionWord = isUpdate ? "updated to" : "scheduled to start on";
        try {
          await createNotification(
            requestToSchedule.tenant,
            "maintenance",
            `Work on "${requestToSchedule.title}" is ${actionWord} ${formattedDate}.${repairmanInfo}`,
            { actor: session.user.id, link: "/maintenance" },
          );
        } catch (e) {
          console.log("Notification error:", e);
        }
      }

      setShowScheduleModal(false);
      setRequestToSchedule(null);
      loadRequests();

      if (session?.user?.id) {
        await sendBackendNotification(
          "maintenance",
          requestToSchedule.id,
          session.user.id,
        );
      }
    } else {
      Alert.alert("Error", "Failed to update request");
    }
  }

  // Complete with cost flow
  async function resolveOccupancyForMaintenanceTenant(request: any) {
    const tenantId = request?.tenant;
    const propertyId = request?.property_id;
    if (!tenantId && !propertyId) return null;

    const activeStatuses = ["active", "pending_end"];

    // Priority: resolve using active occupancy of the property.
    // This correctly maps family-member requests to the primary tenant occupancy.
    if (propertyId) {
      let propertyQuery = supabase
        .from("tenant_occupancies")
        .select(
          "id, tenant_id, property_id, security_deposit, security_deposit_used, status",
        )
        .eq("property_id", propertyId)
        .in("status", activeStatuses)
        .order("start_date", { ascending: false })
        .limit(1);

      if (session?.user?.id) {
        propertyQuery = propertyQuery.eq("landlord_id", session.user.id);
      }

      const { data: propertyOccupancy } = await propertyQuery.maybeSingle();
      if (propertyOccupancy) return propertyOccupancy;
    }

    if (!tenantId) return null;

    let directQuery = supabase
      .from("tenant_occupancies")
      .select(
        "id, tenant_id, property_id, security_deposit, security_deposit_used, status",
      )
      .eq("tenant_id", tenantId)
      .in("status", activeStatuses)
      .order("start_date", { ascending: false })
      .limit(1);

    if (propertyId) {
      directQuery = directQuery.eq("property_id", propertyId);
    }

    const { data: directOccupancy } = await directQuery.maybeSingle();
    if (directOccupancy) return directOccupancy;

    const { data: fallbackDirect } = await supabase
      .from("tenant_occupancies")
      .select(
        "id, tenant_id, property_id, security_deposit, security_deposit_used, status",
      )
      .eq("tenant_id", tenantId)
      .in("status", activeStatuses)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackDirect) return fallbackDirect;

    const { data: familyLinks } = await supabase
      .from("family_members")
      .select("parent_occupancy_id")
      .eq("member_id", tenantId);

    const parentIds = (familyLinks || [])
      .map((f: any) => f.parent_occupancy_id)
      .filter(Boolean);

    if (parentIds.length === 0) return null;

    const { data: parentOccupancies } = await supabase
      .from("tenant_occupancies")
      .select(
        "id, tenant_id, property_id, security_deposit, security_deposit_used, status",
      )
      .in("id", parentIds)
      .in("status", activeStatuses)
      .order("start_date", { ascending: false });

    if (!parentOccupancies || parentOccupancies.length === 0) return null;

    if (propertyId) {
      const byProperty = parentOccupancies.find(
        (occ: any) => occ.property_id === propertyId,
      );
      if (byProperty) return byProperty;
    }

    return parentOccupancies[0] || null;
  }

  async function openCostModal(request: any) {
    setRequestToComplete(request);
    setMaintenanceCost(
      request?.maintenance_cost ? String(request.maintenance_cost) : "",
    );
    setDeductFromDeposit(true);
    setShowCostMethodMenu(false);
    setDepositContext({
      occupancyId: null,
      billingTenantId: request?.tenant || null,
      available: 0,
      hasDeposit: false,
    });
    setLoadingDepositInfo(true);
    setShowCostModal(true);

    try {
      if (!request?.tenant) {
        setDeductFromDeposit(false);
        return;
      }

      const occupancy = await resolveOccupancyForMaintenanceTenant(request);
      const available = Math.max(
        0,
        Number(occupancy?.security_deposit || 0) -
          Number(occupancy?.security_deposit_used || 0),
      );

      setDepositContext({
        occupancyId: occupancy?.id || null,
        billingTenantId: occupancy?.tenant_id || request?.tenant || null,
        available,
        hasDeposit: available > 0,
      });

      if (available <= 0) {
        setDeductFromDeposit(false);
      }
    } catch (e) {
      console.log("Failed to load security deposit context:", e);
      setDeductFromDeposit(false);
    } finally {
      setLoadingDepositInfo(false);
    }
  }

  async function completeWithCost() {
    if (!requestToComplete) return;
    const cost = parseFloat(maintenanceCost) || 0;
    const recipientTenantId =
      depositContext.billingTenantId || requestToComplete.tenant;

    if (!recipientTenantId) {
      Alert.alert("Error", "Unable to determine the tenant recipient.");
      return;
    }

    if (cost < 0) {
      Alert.alert("Error", "Cost cannot be negative.");
      return;
    }

    const shouldDeductFromDeposit =
      deductFromDeposit && cost > 0 && canDeductFromDeposit;
    const shouldSendBill = cost > 0 && !shouldDeductFromDeposit;

    if (deductFromDeposit && cost > 0 && !shouldDeductFromDeposit) {
      Alert.alert(
        "Deposit Not Available",
        "Security deposit cannot cover this maintenance cost. Please continue using payment cost.",
      );
      return;
    }

    const currentStatus =
      requestToComplete.status === "resolved" ? "resolved" : "completed";

    const { error: updateError } = await supabase
      .from("maintenance_requests")
      .update({
        status: currentStatus,
        resolved_at: requestToComplete.resolved_at || new Date().toISOString(),
        maintenance_cost: cost,
        cost_deducted_from_deposit: shouldDeductFromDeposit,
      })
      .eq("id", requestToComplete.id);

    if (updateError) {
      Alert.alert("Error", "Failed to log maintenance cost");
      return;
    }

    if (shouldDeductFromDeposit && cost > 0 && depositContext.occupancyId) {
      const { data: occupancy } = await supabase
        .from("tenant_occupancies")
        .select("id, security_deposit_used")
        .eq("id", depositContext.occupancyId)
        .maybeSingle();

      if (occupancy) {
        const newUsed = Number(occupancy.security_deposit_used || 0) + cost;
        await supabase
          .from("tenant_occupancies")
          .update({ security_deposit_used: newUsed })
          .eq("id", occupancy.id);

        if (isActorLandlord) {
          try {
            await createNotification(
              recipientTenantId,
              "maintenance",
              `₱${cost.toLocaleString()} has been deducted from your security deposit for maintenance: "${requestToComplete.title}"`,
              {
                actor: session.user.id,
                link: "/maintenance",
                email: true,
                sms: true,
              },
            );
          } catch (e) {
            console.log("Notification error:", e);
          }
        }
      }
    } else if (shouldSendBill) {
      const billDueDate = new Date();
      billDueDate.setDate(billDueDate.getDate() + 7);

      const { data: billRow, error: billError } = await supabase
        .from("payment_requests")
        .insert({
          landlord: session.user.id,
          tenant: recipientTenantId,
          property_id: requestToComplete.property_id,
          occupancy_id: depositContext.occupancyId,
          rent_amount: 0,
          water_bill: 0,
          electrical_bill: 0,
          wifi_bill: 0,
          other_bills: cost,
          bills_description: `Maintenance cost for "${requestToComplete.title}"`,
          due_date: billDueDate.toISOString(),
          status: "pending",
        })
        .select("id")
        .single();

      if (billError) {
        Alert.alert(
          "Error",
          "Cost logged, but failed to create payment request.",
        );
        return;
      }

      if (isActorLandlord) {
        try {
          await createNotification(
            recipientTenantId,
            "payment_request",
            `Maintenance cost bill created: ₱${cost.toLocaleString()} for "${requestToComplete.title}".`,
            {
              actor: session.user.id,
              link: "/payments",
              email: true,
              sms: true,
            },
          );
        } catch (e) {
          console.log("Notification error:", e);
        }
      }
      if (billRow?.id && session?.user?.id) {
        await sendBackendNotification(
          "payment_request",
          String(billRow.id),
          session.user.id,
        );
      }

      const { error: closeAfterBillError } = await supabase
        .from("maintenance_requests")
        .update({ status: "closed" })
        .eq("id", requestToComplete.id);

      if (closeAfterBillError) {
        Alert.alert(
          "Error",
          "Bill was sent, but failed to close the maintenance request.",
        );
        return;
      }
    }

    if (recipientTenantId) {
      const costMessage =
        cost > 0
          ? ` Maintenance cost: ₱${cost.toLocaleString()}${shouldDeductFromDeposit ? " (deducted from security deposit)" : " (sent as payment request)"}.`
          : "";
      if (isActorLandlord) {
        try {
          await createNotification(
            recipientTenantId,
            "maintenance",
            `Maintenance "${requestToComplete.title}" cost was logged.${costMessage}`,
            {
              actor: session.user.id,
              link: "/maintenance",
              email: true,
              sms: true,
            },
          );
        } catch (e) {
          console.log("Notification error:", e);
        }
      }
      if (session?.user?.id) {
        await sendBackendNotification(
          "maintenance",
          requestToComplete.id,
          session.user.id,
        );
      }
    }

    Alert.alert(
      "Success",
      shouldSendBill
        ? "Maintenance cost logged, bill sent, and request closed."
        : "Maintenance cost logged.",
    );
    setShowCostModal(false);
    setRequestToComplete(null);
    setShowCostMethodMenu(false);
    loadRequests();
  }

  // Reply flow (landlord)
  async function addResponse(requestId: string) {
    if (!responseText.trim()) return;
    await updateRequestStatus(requestId, "in_progress");

    const request = requests.find((r) => r.id === requestId);
    if (isActorLandlord && request && request.tenant) {
      try {
        await createNotification(
          request.tenant,
          "maintenance",
          `Landlord responded to "${request.title}": ${responseText}`,
          { actor: session.user.id, link: "/maintenance" },
        );
      } catch (e) {
        console.log("Notification error:", e);
      }
    }

    setResponseText("");
    setSelectedRequest(null);
    Alert.alert("Success", "Response sent to tenant!");
  }

  // Feedback flow (tenant)
  function openFeedbackModal(request: any) {
    setRequestForFeedback(request);
    setFeedbackText("");
    setShowFeedbackModal(true);
  }

  async function submitFeedback() {
    if (!requestForFeedback) return;
    const cleanedFeedback = feedbackText.trim();
    if (!cleanedFeedback) {
      Alert.alert("Required", "Please enter your feedback before submitting.");
      return;
    }

    setSubmittingFeedback(true);
    try {
      const requestId = requestForFeedback.id;
      const { error } = await supabase
        .from("maintenance_requests")
        .update({ feedback: cleanedFeedback })
        .eq("id", requestId);

      if (error) {
        Alert.alert("Error", error.message || "Failed to submit feedback");
        return;
      }

      // Update local list immediately so the feedback appears without waiting.
      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, feedback: cleanedFeedback } : req,
        ),
      );

      Alert.alert("Success", "Feedback submitted! Thank you.");
      setShowFeedbackModal(false);
      setRequestForFeedback(null);
      setFeedbackText("");
      await loadRequests();
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function openEditModal(request: any) {
    if (!canTenantEditRequest(request)) {
      Alert.alert(
        "Not Allowed",
        "Only pending maintenance requests can be edited.",
      );
      return;
    }

    setRequestToEdit(request);
    setEditFormData({
      title: request?.title || "",
      description: request?.description || "",
      priority: request?.priority || "normal",
    });
    setEditExistingProofUrls(parseProofUrls(request?.attachment_urls));
    setEditNewProofFiles([]);
    setShowEditModal(true);
  }

  const pickEditProofFiles = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      const totalAfterAdd =
        editExistingProofUrls.length +
        editNewProofFiles.length +
        result.assets.length;
      if (totalAfterAdd > 10) {
        Alert.alert("Limit Reached", "Max 10 files allowed");
        return;
      }

      setEditNewProofFiles((prev) => [...prev, ...result.assets]);
    }
  };

  const removeExistingEditFile = (index: number) => {
    setEditExistingProofUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewEditFile = (index: number) => {
    setEditNewProofFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadEditProofFiles = async (
    files: ImagePicker.ImagePickerAsset[],
  ) => {
    if (!session?.user?.id) {
      throw new Error("User session is missing.");
    }

    const uploadPromises = files.map(async (asset) => {
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const isVideo =
        asset.type === "video" || fileExt === "mp4" || fileExt === "mov";
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;
      const contentType = isVideo ? `video/${fileExt}` : `image/${fileExt}`;

      let fileBody: any;
      if (asset.base64) {
        fileBody = decode(asset.base64);
      } else {
        const res = await fetch(asset.uri);
        fileBody = await res.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from("maintenance-uploads")
        .upload(filePath, fileBody, { contentType });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("maintenance-uploads")
        .getPublicUrl(filePath);
      return data.publicUrl;
    });

    return Promise.all(uploadPromises);
  };

  async function handleSaveEditedRequest() {
    if (!requestToEdit) return;

    const title = editFormData.title.trim();
    const description = editFormData.description.trim();

    if (!title || !description) {
      Alert.alert("Required", "Please fill in title and description.");
      return;
    }

    const totalProofCount =
      editExistingProofUrls.length + editNewProofFiles.length;
    if (totalProofCount === 0) {
      Alert.alert(
        "Required",
        "Please attach at least one photo or video as proof.",
      );
      return;
    }

    setSavingEdit(true);
    try {
      const { data: latestRequest, error: latestRequestError } = await supabase
        .from("maintenance_requests")
        .select("status, scheduled_date")
        .eq("id", requestToEdit.id)
        .maybeSingle();

      if (latestRequestError) throw latestRequestError;

      if (!canTenantEditRequest(latestRequest)) {
        Alert.alert(
          "Not Allowed",
          "This request is no longer pending and cannot be edited.",
        );
        setShowEditModal(false);
        setRequestToEdit(null);
        await loadRequests();
        return;
      }

      const uploadedNewUrls =
        editNewProofFiles.length > 0
          ? await uploadEditProofFiles(editNewProofFiles)
          : [];

      const finalAttachmentUrls = [
        ...editExistingProofUrls,
        ...uploadedNewUrls,
      ];

      const { error } = await supabase
        .from("maintenance_requests")
        .update({
          title,
          description,
          priority: editFormData.priority,
          attachment_urls: finalAttachmentUrls,
        })
        .eq("id", requestToEdit.id);

      if (error) throw error;

      Alert.alert("Success", "Request details updated.");
      setShowEditModal(false);
      setRequestToEdit(null);
      setEditNewProofFiles([]);
      setEditExistingProofUrls([]);
      await loadRequests();
    } catch (e: any) {
      Alert.alert(
        "Error",
        e?.message || "Failed to update maintenance request details.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  // --- FILE UPLOAD ---

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      if (proofFiles.length + result.assets.length > 10) {
        Alert.alert("Limit Reached", "Max 10 files allowed");
        return;
      }
      setProofFiles([...proofFiles, ...result.assets]);
    }
  };

  const removeFile = (index: number) => {
    setProofFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadProofFiles = async () => {
    const uploadPromises = proofFiles.map(async (asset) => {
      const fileExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const isVideo =
        asset.type === "video" || fileExt === "mp4" || fileExt === "mov";
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;
      const contentType = isVideo ? `video/${fileExt}` : `image/${fileExt}`;

      let fileBody: any;
      if (asset.base64) {
        fileBody = decode(asset.base64);
      } else {
        const res = await fetch(asset.uri);
        fileBody = await res.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from("maintenance-uploads")
        .upload(filePath, fileBody, { contentType });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("maintenance-uploads")
        .getPublicUrl(filePath);
      return data.publicUrl;
    });

    return Promise.all(uploadPromises);
  };

  const handleSubmitRequest = async () => {
    if (proofFiles.length === 0) {
      Alert.alert(
        "Required",
        "Please attach at least one photo or video as proof.",
      );
      return;
    }
    if (!formData.title || !formData.description) {
      Alert.alert("Required", "Please fill in title and description.");
      return;
    }

    setUploading(true);
    try {
      const attachmentUrls = await uploadProofFiles();

      const { data: insertData, error } = await supabase
        .from("maintenance_requests")
        .insert({
          ...formData,
          tenant: session.user.id,
          status: "pending",
          attachment_urls: attachmentUrls,
        })
        .select("*, properties(title, landlord)");

      if (error) throw error;

      if (insertData && insertData[0]) {
        const property = insertData[0].properties;

        // Send notification to landlord
        if (property && property.landlord) {
          try {
            // RLS prevents tenant from sending notifications
            // await createNotification(
            //   property.landlord,
            //   'maintenance',
            //   `${profile.first_name} ${profile.last_name} submitted a new maintenance request: "${formData.title}"`,
            //   { actor: session.user.id, link: '/maintenance' }
            // );
          } catch (e) {
            console.log("Notification error:", e);
          }
        }
      }

      Alert.alert("Success", "Request submitted!");
      setShowCreateModal(false);
      setFormData({
        property_id: occupiedProperty?.id || "",
        title: "",
        description: "",
        priority: "normal",
      });
      setProofFiles([]);
      loadRequests();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setUploading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
  };

  // --- FILTER ---
  const filteredRequests = requests.filter((req) => {
    const matchesStatus =
      statusFilter === "all" || normalizeStatus(req.status) === statusFilter;
    const matchesSearch =
      searchId === "" || req.id.toLowerCase().includes(searchId.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // --- RENDER CARD ---
  const renderItem = ({ item }: { item: any }) => {
    const itemStatus = normalizeStatus(item.status);
    const normalizedFeedback = String(item.feedback || "").trim();
    const hasFeedback = normalizedFeedback.length > 0;
    const pStyle = priorityStyles[item.priority] || priorityStyles.normal;

    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.card : "white",
            borderColor: isDark ? colors.cardBorder : "#f3f4f6",
          },
        ]}
      >
        {/* Header Strip */}
        <View
          style={[
            styles.cardHeaderStrip,
            {
              backgroundColor: isDark ? colors.surface : "#f9fafb",
              borderBottomColor: isDark ? colors.border : "#f3f4f6",
            },
          ]}
        >
          <View style={styles.cardHeaderLeft}>
            <View style={styles.idBadgeWrap}>
              <Text
                style={[
                  styles.idLabel,
                  { color: isDark ? colors.textMuted : "#9ca3af" },
                ]}
              >
                ID:
              </Text>
              <Text
                style={[
                  styles.idBadge,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                {item.id.substring(0, 8).toUpperCase()}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColors[itemStatus] || "#f3f4f6" },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: statusTextColors[itemStatus] || "#1f2937" },
                ]}
              >
                {itemStatus.replace("_", " ")}
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.dateText,
              { color: isDark ? colors.textMuted : "#9ca3af" },
            ]}
          >
            {new Date(item.created_at).toLocaleDateString()} at{" "}
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>

        <View style={styles.cardBody}>
          {/* Title & Info */}
          <Text
            style={[styles.cardTitle, { color: isDark ? colors.text : "#111" }]}
          >
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="home-outline" size={14} color="#9ca3af" />
              <Text style={styles.metaText}>{item.properties?.title}</Text>
            </View>
            {profile?.role === "landlord" && item.tenant_profile && (
              <View
                style={[styles.metaItem, { flexWrap: "wrap", maxWidth: "80%" }]}
              >
                <Ionicons name="person-outline" size={14} color="#9ca3af" />
                <Text style={styles.metaText} numberOfLines={2}>
                  {item.tenant_profile.first_name}{" "}
                  {item.tenant_profile.last_name}
                </Text>
                {item.is_family_member && (
                  <View
                    style={{
                      backgroundColor: "#f3e8ff",
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      marginLeft: 4,
                      marginTop: 2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        color: "#7e22ce",
                        fontWeight: "bold",
                      }}
                    >
                      FAMILY OF {item.primary_tenant_name?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {profile?.role === "tenant" &&
              session?.user?.id !== item.tenant &&
              item.tenant_profile && (
                <View
                  style={[
                    styles.metaItem,
                    { flexWrap: "wrap", maxWidth: "80%" },
                  ]}
                >
                  <Ionicons name="people-outline" size={14} color="#3b82f6" />
                  <Text
                    style={[styles.metaText, { color: "#3b82f6" }]}
                    numberOfLines={1}
                  >
                    By {item.tenant_profile.first_name} (Family)
                  </Text>
                </View>
              )}
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: pStyle.bg, borderColor: pStyle.border },
              ]}
            >
              <Text style={[styles.priorityText, { color: pStyle.text }]}>
                {item.priority?.toUpperCase()} PRIORITY
              </Text>
            </View>
          </View>

          {/* Scheduled Date & Repairman */}
          {item.scheduled_date && (
            <View style={styles.infoTagsRow}>
              <View style={styles.scheduleTag}>
                <Ionicons name="calendar-outline" size={14} color="#c2410c" />
                <Text style={styles.scheduleTagText}>
                  Work starts: {new Date(item.scheduled_date).toLocaleString()}
                </Text>
              </View>
              {item.repairman_name && (
                <View style={styles.repairmanTag}>
                  <Ionicons name="person-outline" size={14} color="#1d4ed8" />
                  <Text style={styles.repairmanTagText}>
                    Repairman: {item.repairman_name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.descriptionBox}>
            <Text style={styles.description}>{item.description}</Text>
          </View>

          {/* Maintenance Cost Display */}
          {/* {item.maintenance_cost > 0 && (
            <View style={styles.costTag}>
              <Ionicons name="cash-outline" size={14} color="#166534" />
              <Text style={styles.costTagText}>
                Cost: ₱{Number(item.maintenance_cost).toLocaleString()}
                {item.cost_deducted_from_deposit
                  ? " (Deducted from deposit)"
                  : ""}
              </Text>
            </View>
          )} */}

          {/* Attachments */}
          {(() => {
            let urls = item.attachment_urls;
            if (typeof urls === "string") {
              try {
                urls = JSON.parse(urls);
              } catch (e) {
                urls = [];
              }
            }
            if (!Array.isArray(urls) || urls.length === 0) return null;
            return (
              <View style={styles.attachmentsSection}>
                <Text style={styles.attachmentsLabel}>
                  Proof ({urls.length})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {urls.map((url: string, idx: number) => {
                    const isVid = isVideoUrl(url);
                    return (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setSelectedProofUrl(url)}
                      >
                        {isVid ? (
                          <View
                            style={[
                              styles.proofImage,
                              {
                                backgroundColor: "#111",
                                justifyContent: "center",
                                alignItems: "center",
                              },
                            ]}
                          >
                            <Ionicons name="videocam" size={28} color="#fff" />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: url }}
                            style={styles.proofImage}
                            resizeMode="cover"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })()}

          {/* --- TENANT ACTIONS --- */}
          {profile?.role === "tenant" && (
            <View style={styles.actionRow}>
              {canTenantEditRequest(item) && (
                <TouchableOpacity
                  onPress={() => openEditModal(item)}
                  style={[styles.actionBtn, { backgroundColor: "#DBEAFE" }]}
                >
                  <Text style={[styles.actionBtnText, { color: "#1E40AF" }]}>
                    Edit Details
                  </Text>
                </TouchableOpacity>
              )}
              {itemStatus === "in_progress" && (
                <TouchableOpacity
                  onPress={() => promptTenantMarkDone(item)}
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: "#DCFCE7",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-done-outline"
                    size={14}
                    color="#166534"
                  />
                  <Text style={[styles.actionBtnText, { color: "#166534" }]}>
                    Mark Done
                  </Text>
                </TouchableOpacity>
              )}
              {/* Cancel button (visible when not completed/closed/cancelled and no scheduled date) */}
              {(itemStatus === "in_progress" ||
                (!["completed", "closed", "cancelled"].includes(itemStatus) &&
                  !item.scheduled_date)) && (
                <TouchableOpacity
                  onPress={() => promptCancel(item)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancel Request</Text>
                </TouchableOpacity>
              )}
              {/* Feedback button (visible when completed and no feedback given) */}
              {itemStatus === "completed" && !hasFeedback && (
                <TouchableOpacity
                  onPress={() => openFeedbackModal(item)}
                  style={styles.feedbackBtn}
                >
                  <Ionicons
                    name="chatbox-ellipses-outline"
                    size={14}
                    color="#111"
                  />
                  <Text style={styles.feedbackBtnText}>Leave Feedback</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* --- LANDLORD ACTIONS --- */}
          {profile?.role === "landlord" && itemStatus !== "closed" && (
            <View style={styles.actionRow}>
              {itemStatus === "pending" && (
                <TouchableOpacity
                  onPress={() => openStartWorkModal(item)}
                  style={[styles.actionBtn, { backgroundColor: "#DBEAFE" }]}
                >
                  <Text style={[styles.actionBtnText, { color: "#1E40AF" }]}>
                    Mark Scheduled
                  </Text>
                </TouchableOpacity>
              )}
              {itemStatus === "scheduled" && (
                <TouchableOpacity
                  onPress={() => openStartWorkModal(item)}
                  style={[styles.actionBtn, { backgroundColor: "#FEF3C7" }]}
                >
                  <Text style={[styles.actionBtnText, { color: "#92400E" }]}>
                    Edit Details
                  </Text>
                </TouchableOpacity>
              )}
              {itemStatus === "completed" && (
                <>
                  <TouchableOpacity
                    onPress={() => openCostModal(item)}
                    style={[styles.actionBtn, { backgroundColor: "#DCFCE7" }]}
                  >
                    <Text style={[styles.actionBtnText, { color: "#166534" }]}>
                      Log Maintenance Cost
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updateRequestStatus(item.id, "closed")}
                    style={[styles.actionBtn, { backgroundColor: "#F3F4F6" }]}
                  >
                    <Text style={[styles.actionBtnText, { color: "#374151" }]}>
                      Archive/Close
                    </Text>
                  </TouchableOpacity>
                </>
              )}
              {!["completed", "closed", "cancelled"].includes(itemStatus) && (
                <TouchableOpacity
                  onPress={() => promptCancel(item)}
                  style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                >
                  <Text style={[styles.actionBtnText, { color: "#991B1B" }]}>
                    {itemStatus === "pending" ? "Reject" : "Cancel"}
                  </Text>
                </TouchableOpacity>
              )}
              {itemStatus !== "in_progress" && (
                <TouchableOpacity
                  onPress={() =>
                    setSelectedRequest(
                      selectedRequest === item.id ? null : item.id,
                    )
                  }
                  style={styles.replyBtn}
                >
                  <Ionicons
                    name={
                      selectedRequest === item.id
                        ? "close-outline"
                        : "chatbubble-outline"
                    }
                    size={14}
                    color="#374151"
                  />
                  <Text style={styles.replyBtnText}>
                    {selectedRequest === item.id ? "Cancel" : "Reply"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Reply Input (Landlord) */}
          {profile?.role === "landlord" &&
            itemStatus !== "in_progress" &&
            selectedRequest === item.id && (
              <View style={styles.replySection}>
                <TextInput
                  style={styles.replyInput}
                  value={responseText}
                  onChangeText={setResponseText}
                  placeholder="Say something to tenant..."
                  placeholderTextColor="#c4c4c4"
                />
                <TouchableOpacity
                  onPress={() => addResponse(item.id)}
                  style={styles.replySendBtn}
                >
                  <Text style={styles.replySendText}>Send</Text>
                </TouchableOpacity>
              </View>
            )}

          {/* Feedback Display */}
          {hasFeedback && (
            <View style={styles.feedbackDisplay}>
              <Text style={styles.feedbackLabel}>TENANT FEEDBACK</Text>
              <Text style={styles.feedbackText}>"{normalizedFeedback}"</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // --- MAIN RENDER ---
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
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.headerTitle,
              { color: isDark ? colors.text : "#111" },
            ]}
          >
            {profile?.role === "landlord" ? "Maintenance Board" : "My Requests"}
          </Text>
          <Text
            style={[
              styles.headerSubtitle,
              { color: isDark ? colors.textMuted : "#6b7280" },
            ]}
          >
            {profile?.role === "landlord"
              ? "Manage and track requests from your properties."
              : "Report issues and track resolution status."}
          </Text>
        </View>
        {profile?.role === "tenant" && (
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            style={styles.createBtn}
          >
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View
        style={[
          styles.filterContainer,
          { backgroundColor: isDark ? colors.background : "#f9fafb" },
        ]}
      >
        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: isDark ? colors.card : "white",
              borderColor: isDark ? colors.cardBorder : "#f3f4f6",
            },
          ]}
        >
          <Ionicons
            name="search"
            size={16}
            color={isDark ? colors.textMuted : "#9ca3af"}
          />
          <TextInput
            placeholder="Search by Request ID..."
            placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
            value={searchId}
            onChangeText={setSearchId}
            style={[
              styles.searchInput,
              { color: isDark ? colors.text : "#111" },
            ]}
          />
          {searchId.length > 0 && (
            <TouchableOpacity onPress={() => setSearchId("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={isDark ? colors.textMuted : "#ccc"}
              />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        >
          {[
            "all",
            "pending",
            "scheduled",
            "in_progress",
            "completed",
            "closed",
            "cancelled",
          ].map((status) => (
            <TouchableOpacity
              key={status}
              onPress={() => setStatusFilter(status)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                },
                statusFilter === status && [
                  styles.filterChipActive,
                  { backgroundColor: isDark ? "white" : "#111" },
                ],
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isDark ? colors.textMuted : "#6b7280" },
                  statusFilter === status && [
                    styles.filterChipTextActive,
                    { color: isDark ? "#111" : "white" },
                  ],
                ]}
              >
                {status === "all"
                  ? "ALL"
                  : status.replace("_", " ").toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Loading maintenance list...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 130 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="construct-outline" size={40} color="#d1d5db" />
              </View>
              <Text style={styles.emptyTitle}>No requests found</Text>
              <Text style={styles.emptySubtitle}>
                {profile?.role === "tenant"
                  ? "Tap + to submit a new maintenance request."
                  : "No maintenance requests from your tenants yet."}
              </Text>
            </View>
          }
        />
      )}

      {/* =================== CREATE REQUEST MODAL =================== */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[
            styles.modalContainer,
            { backgroundColor: isDark ? colors.background : "#f9fafb" },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderBottomColor: isDark ? colors.border : "#f3f4f6",
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              New Maintenance Request
            </Text>
            <TouchableOpacity
              onPress={() => setShowCreateModal(false)}
              style={styles.modalClose}
            >
              <Ionicons
                name="close"
                size={20}
                color={isDark ? colors.textMuted : "#666"}
              />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {properties.length === 0 ? (
              <View style={styles.noPropertyBox}>
                <Ionicons
                  name="alert-circle-outline"
                  size={40}
                  color="#854d0e"
                />
                <Text style={styles.noPropertyTitle}>No Active Lease</Text>
                <Text style={styles.noPropertySub}>
                  You can only submit requests for properties you are currently
                  renting.
                </Text>
              </View>
            ) : (
              <>
                {/* Property */}
                <Text
                  style={[
                    styles.label,
                    { color: isDark ? colors.textMuted : "#6b7280" },
                  ]}
                >
                  PROPERTY
                </Text>
                <View
                  style={[
                    styles.inputDisabled,
                    {
                      backgroundColor: isDark ? colors.card : "#f9fafb",
                      borderColor: isDark ? colors.cardBorder : "#f3f4f6",
                    },
                  ]}
                >
                  <Ionicons
                    name="home-outline"
                    size={16}
                    color={isDark ? colors.textMuted : "#9ca3af"}
                  />
                  <Text
                    style={[
                      styles.inputDisabledText,
                      { color: isDark ? colors.text : "#374151" },
                    ]}
                  >
                    {occupiedProperty?.title ||
                      properties[0]?.title ||
                      "No Property"}
                  </Text>
                </View>

                {/* Title */}
                <Text
                  style={[
                    styles.label,
                    { color: isDark ? colors.textMuted : "#6b7280" },
                  ]}
                >
                  ISSUE TITLE
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? colors.card : "white",
                      borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      color: isDark ? colors.text : "#111",
                    },
                  ]}
                  placeholder="e.g. Leaking faucet in kitchen"
                  placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
                  value={formData.title}
                  onChangeText={(t) => setFormData({ ...formData, title: t })}
                />

                {/* Priority */}
                <Text style={styles.label}>PRIORITY</Text>
                <View style={styles.priorityRow}>
                  {[
                    { key: "low", label: "Low", sub: "Cosmetic" },
                    { key: "normal", label: "Normal", sub: "Functional" },
                    { key: "high", label: "High", sub: "Urgent" },
                  ].map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() =>
                        setFormData({ ...formData, priority: p.key })
                      }
                      style={[
                        styles.priorityChip,
                        formData.priority === p.key &&
                          styles.priorityChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityChipText,
                          formData.priority === p.key && { color: "white" },
                        ]}
                      >
                        {p.label}
                      </Text>
                      <Text
                        style={[
                          styles.priorityChipSub,
                          formData.priority === p.key && {
                            color: "rgba(255,255,255,0.6)",
                          },
                        ]}
                      >
                        {p.sub}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Description */}
                <Text style={styles.label}>DESCRIPTION</Text>
                <TextInput
                  style={[
                    styles.input,
                    { height: 100, textAlignVertical: "top" },
                  ]}
                  multiline
                  placeholder="Describe the issue in detail..."
                  placeholderTextColor="#c4c4c4"
                  value={formData.description}
                  onChangeText={(t) =>
                    setFormData({ ...formData, description: t })
                  }
                />

                {/* Photos */}
                <Text style={styles.label}>
                  PROOF (PHOTOS/VIDEOS){" "}
                  <Text style={{ color: "#ef4444" }}>*Required</Text>
                  <Text style={{ color: "#9ca3af" }}>
                    {" "}
                    ({proofFiles.length}/10)
                  </Text>
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 20 }}
                >
                  <TouchableOpacity
                    onPress={pickImages}
                    style={styles.addPhotoBtn}
                  >
                    <Ionicons name="camera" size={24} color="#666" />
                    <Text style={styles.addPhotoText}>Add</Text>
                  </TouchableOpacity>
                  {proofFiles.map((asset, i) => {
                    const isVid =
                      asset.type === "video" || isVideoUrl(asset.uri);
                    return (
                      <View key={i} style={styles.previewWrap}>
                        {isVid ? (
                          <View
                            style={[
                              styles.previewImage,
                              {
                                backgroundColor: "#111",
                                justifyContent: "center",
                                alignItems: "center",
                              },
                            ]}
                          >
                            <Ionicons name="videocam" size={24} color="#fff" />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: asset.uri }}
                            style={styles.previewImage}
                          />
                        )}
                        <TouchableOpacity
                          onPress={() => removeFile(i)}
                          style={styles.removeFileBtn}
                        >
                          <Ionicons name="close" size={12} color="white" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>

                {/* Submit */}
                <TouchableOpacity
                  onPress={handleSubmitRequest}
                  disabled={uploading}
                  style={[styles.primaryBtn, uploading && { opacity: 0.5 }]}
                >
                  {uploading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Submit Request</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* =================== EDIT REQUEST MODAL =================== */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[
            styles.modalContainer,
            { backgroundColor: isDark ? colors.background : "#f9fafb" },
          ]}
        >
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderBottomColor: isDark ? colors.border : "#f3f4f6",
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Edit Maintenance Request
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowEditModal(false);
                setRequestToEdit(null);
                setEditNewProofFiles([]);
                setEditExistingProofUrls([]);
              }}
              style={styles.modalClose}
            >
              <Ionicons
                name="close"
                size={20}
                color={isDark ? colors.textMuted : "#666"}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            <Text
              style={[
                styles.helperText,
                { color: isDark ? colors.textMuted : "#9ca3af", marginTop: 0 },
              ]}
            >
              You can edit only title, description, priority, and proof files
              while status is pending.
            </Text>

            <Text
              style={[
                styles.label,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              ISSUE TITLE
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  color: isDark ? colors.text : "#111",
                },
              ]}
              placeholder="e.g. Leaking faucet in kitchen"
              placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
              value={editFormData.title}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, title: t })
              }
            />

            <Text style={styles.label}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              {[
                { key: "low", label: "Low", sub: "Cosmetic" },
                { key: "normal", label: "Normal", sub: "Functional" },
                { key: "high", label: "High", sub: "Urgent" },
              ].map((p) => (
                <TouchableOpacity
                  key={p.key}
                  onPress={() =>
                    setEditFormData({ ...editFormData, priority: p.key })
                  }
                  style={[
                    styles.priorityChip,
                    editFormData.priority === p.key &&
                      styles.priorityChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityChipText,
                      editFormData.priority === p.key && { color: "white" },
                    ]}
                  >
                    {p.label}
                  </Text>
                  <Text
                    style={[
                      styles.priorityChipSub,
                      editFormData.priority === p.key && {
                        color: "rgba(255,255,255,0.6)",
                      },
                    ]}
                  >
                    {p.sub}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: "top" }]}
              multiline
              placeholder="Describe the issue in detail..."
              placeholderTextColor="#c4c4c4"
              value={editFormData.description}
              onChangeText={(t) =>
                setEditFormData({ ...editFormData, description: t })
              }
            />

            <Text style={styles.label}>
              PROOF (PHOTOS/VIDEOS){" "}
              <Text style={{ color: "#ef4444" }}>*Required</Text>
              <Text style={{ color: "#9ca3af" }}>
                {" "}
                ({editExistingProofUrls.length + editNewProofFiles.length}/10)
              </Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 20 }}
            >
              <TouchableOpacity
                onPress={pickEditProofFiles}
                style={styles.addPhotoBtn}
              >
                <Ionicons name="camera" size={24} color="#666" />
                <Text style={styles.addPhotoText}>Add</Text>
              </TouchableOpacity>

              {editExistingProofUrls.map((url, i) => {
                const isVid = isVideoUrl(url);
                return (
                  <View key={`existing-${i}`} style={styles.previewWrap}>
                    {isVid ? (
                      <View
                        style={[
                          styles.previewImage,
                          {
                            backgroundColor: "#111",
                            justifyContent: "center",
                            alignItems: "center",
                          },
                        ]}
                      >
                        <Ionicons name="videocam" size={24} color="#fff" />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: url }}
                        style={styles.previewImage}
                      />
                    )}
                    <TouchableOpacity
                      onPress={() => removeExistingEditFile(i)}
                      style={styles.removeFileBtn}
                    >
                      <Ionicons name="close" size={12} color="white" />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {editNewProofFiles.map((asset, i) => {
                const isVid = asset.type === "video" || isVideoUrl(asset.uri);
                return (
                  <View key={`new-${i}`} style={styles.previewWrap}>
                    {isVid ? (
                      <View
                        style={[
                          styles.previewImage,
                          {
                            backgroundColor: "#111",
                            justifyContent: "center",
                            alignItems: "center",
                          },
                        ]}
                      >
                        <Ionicons name="videocam" size={24} color="#fff" />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: asset.uri }}
                        style={styles.previewImage}
                      />
                    )}
                    <TouchableOpacity
                      onPress={() => removeNewEditFile(i)}
                      style={styles.removeFileBtn}
                    >
                      <Ionicons name="close" size={12} color="white" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={handleSaveEditedRequest}
              disabled={savingEdit}
              style={[styles.primaryBtn, savingEdit && { opacity: 0.5 }]}
            >
              {savingEdit ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* =================== CANCEL CONFIRM MODAL =================== */}
      <Modal visible={showCancelModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <View style={styles.modalCardIcon}>
              <Ionicons name="warning-outline" size={28} color="#ef4444" />
            </View>
            <Text
              style={[
                styles.modalCardTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Cancel Maintenance Request?
            </Text>
            <Text
              style={[
                styles.modalCardSub,
                { color: isDark ? colors.textMuted : "#6b7280" },
              ]}
            >
              Are you sure you want to cancel: "{requestToCancel?.title}"?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                style={[
                  styles.secondaryBtn,
                  {
                    backgroundColor: isDark ? colors.card : "white",
                    borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.secondaryBtnText,
                    { color: isDark ? colors.text : "#374151" },
                  ]}
                >
                  No, Keep
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmCancel}
                style={[styles.primaryBtnSmall, { backgroundColor: "#ef4444" }]}
              >
                <Text style={styles.primaryBtnText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================== SCHEDULE / START WORK MODAL =================== */}
      <Modal visible={showScheduleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDark ? colors.surface : "white" },
            ]}
          >
            <Text
              style={[
                styles.modalCardTitle,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              Set Schedule & Assign Repairman
            </Text>

            <Text style={styles.label}>START DATE</Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === "android") {
                  DateTimePickerAndroid.open({
                    value: scheduleDate,
                    mode: "date",
                    minimumDate: new Date(),
                    onChange: onDateChange,
                  });
                } else {
                  setShowDatePicker(true);
                }
              }}
              style={styles.datePickerBtn}
            >
              <Ionicons
                name="calendar-outline"
                size={18}
                color={isDark ? colors.text : "#111"}
              />
              <Text
                style={[
                  styles.datePickerText,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                {scheduleDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>

            <Text style={styles.label}>START TIME</Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS === "android") {
                  DateTimePickerAndroid.open({
                    value: scheduleDate,
                    mode: "time",
                    onChange: onTimeChange,
                  });
                } else {
                  setShowTimePicker(true);
                }
              }}
              style={styles.datePickerBtn}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={isDark ? colors.text : "#111"}
              />
              <Text
                style={[
                  styles.datePickerText,
                  { color: isDark ? colors.text : "#111" },
                ]}
              >
                {scheduleDate.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>

            {Platform.OS === "ios" && (
              <Modal visible={showDatePicker} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                  <View
                    style={[
                      styles.modalCard,
                      {
                        backgroundColor: isDark ? colors.surface : "white",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalCardTitle,
                        { color: isDark ? colors.text : "#111" },
                      ]}
                    >
                      Select Start Date
                    </Text>
                    <DateTimePicker
                      value={scheduleDate}
                      mode="date"
                      display="inline"
                      themeVariant={isDark ? "dark" : "light"}
                      minimumDate={new Date()}
                      onChange={(e, d) => onDateChange(e, d)}
                      style={{ width: "100%", minHeight: 320 }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={[
                        styles.primaryBtnSmall,
                        { width: "100%", alignItems: "center", marginTop: 10 },
                      ]}
                    >
                      <Text style={styles.primaryBtnText}>Confirm Date</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

            {Platform.OS === "ios" && (
              <Modal visible={showTimePicker} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                  <View
                    style={[
                      styles.modalCard,
                      {
                        backgroundColor: isDark ? colors.surface : "white",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalCardTitle,
                        { color: isDark ? colors.text : "#111" },
                      ]}
                    >
                      Select Start Time
                    </Text>
                    <DateTimePicker
                      value={scheduleDate}
                      mode="time"
                      display="spinner"
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(e, d) => onTimeChange(e, d)}
                      style={{ width: "100%" }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowTimePicker(false)}
                      style={[
                        styles.primaryBtnSmall,
                        { width: "100%", alignItems: "center", marginTop: 10 },
                      ]}
                    >
                      <Text style={styles.primaryBtnText}>Confirm Time</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

            <Text style={styles.label}>REPAIRMAN NAME (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor="#c4c4c4"
              value={repairmanName}
              onChangeText={setRepairmanName}
            />
            <Text style={styles.helperText}>
              Tenant will see this name on their maintenance request.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowScheduleModal(false)}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmStartWork}
                style={styles.primaryBtnSmall}
              >
                <Text style={styles.primaryBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================== COST / COMPLETE MODAL =================== */}
      <Modal visible={showCostModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? colors.surface : "white",
                borderWidth: 1,
                borderColor: isDark ? colors.border : "#e5e7eb",
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <View style={styles.completeIcon}>
                <Ionicons name="cash-outline" size={22} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.modalCardTitle,
                    { textAlign: "left", color: isDark ? colors.text : "#111" },
                  ]}
                >
                  Log Maintenance Cost
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? colors.textMuted : "#9ca3af",
                  }}
                >
                  {requestToComplete?.title}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.costSummaryCard,
                {
                  backgroundColor: isDark ? colors.card : "#f8fafc",
                  borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                },
              ]}
            >
              <Text
                style={[
                  styles.costSummaryLabel,
                  { color: isDark ? colors.textMuted : "#64748b" },
                ]}
              >
                Current Cost Preview
              </Text>
              <Text
                style={[
                  styles.costSummaryAmount,
                  { color: isDark ? colors.text : "#0f172a" },
                ]}
              >
                ₱{parsedMaintenanceCost.toLocaleString()}
              </Text>
            </View>

            <Text style={styles.label}>MAINTENANCE COST / EXPENSE (₱)</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.card : "white",
                  borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                  color: isDark ? colors.text : "#111",
                },
              ]}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
              value={maintenanceCost}
              onChangeText={setMaintenanceCost}
            />
            <Text
              style={[
                styles.helperText,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
            >
              Leave as 0 if there's no cost to the tenant.
            </Text>

            <View
              style={[
                styles.actionSummaryCard,
                {
                  backgroundColor: isDark ? colors.card : "#f8fafc",
                  borderColor: isDark ? colors.cardBorder : "#e2e8f0",
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#0284c7"
              />
              <Text
                style={[
                  styles.actionSummaryText,
                  { color: isDark ? colors.text : "#0f172a" },
                ]}
              >
                {maintenanceActionText}
              </Text>
            </View>

            {loadingDepositInfo && (
              <Text
                style={[
                  styles.helperText,
                  { color: isDark ? colors.textMuted : "#9ca3af" },
                ]}
              >
                Checking security deposit availability...
              </Text>
            )}

            {parsedMaintenanceCost > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text
                  style={[
                    styles.label,
                    {
                      marginTop: 0,
                      color: isDark ? colors.textMuted : "#6b7280",
                    },
                  ]}
                >
                  CHARGE METHOD
                </Text>
                <TouchableOpacity
                  disabled={!canDeductFromDeposit}
                  onPress={() => setShowCostMethodMenu((prev) => !prev)}
                  style={[
                    styles.costMethodDropdownTrigger,
                    {
                      backgroundColor: isDark ? colors.card : "white",
                      borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                    },
                    !canDeductFromDeposit &&
                      styles.costMethodDropdownTriggerDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.costMethodDropdownText,
                      { color: isDark ? colors.text : "#111" },
                      !canDeductFromDeposit &&
                        styles.costMethodDropdownTextDisabled,
                    ]}
                  >
                    {selectedCostMethodLabel}
                  </Text>
                  <Ionicons
                    name={showCostMethodMenu ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={!canDeductFromDeposit ? "#9ca3af" : "#6b7280"}
                  />
                </TouchableOpacity>

                {showCostMethodMenu && canDeductFromDeposit && (
                  <View
                    style={[
                      styles.costMethodDropdownMenu,
                      {
                        backgroundColor: isDark ? colors.card : "white",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setDeductFromDeposit(true);
                        setShowCostMethodMenu(false);
                      }}
                      style={[
                        styles.costMethodOption,
                        deductFromDeposit && styles.costMethodOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.costMethodOptionText,
                          deductFromDeposit &&
                            styles.costMethodOptionTextActive,
                        ]}
                      >
                        Deduct from Security Deposit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setDeductFromDeposit(false);
                        setShowCostMethodMenu(false);
                      }}
                      style={[
                        styles.costMethodOption,
                        !deductFromDeposit && styles.costMethodOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.costMethodOptionText,
                          !deductFromDeposit &&
                            styles.costMethodOptionTextActive,
                        ]}
                      >
                        Send as Payment Cost
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {parsedMaintenanceCost > 0 &&
              !canDeductFromDeposit &&
              !loadingDepositInfo && (
                <View
                  style={[
                    styles.checkboxRow,
                    { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color="#b91c1c"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.checkboxLabel, { color: "#b91c1c" }]}>
                      Deposit deduction not available
                    </Text>
                    <Text style={styles.checkboxSub}>
                      Tenant has no security deposit or available deposit cannot
                      cover this cost. Charge method is disabled and set to
                      payment cost.
                    </Text>
                    {depositContext.hasDeposit && depositShortfall > 0 && (
                      <Text style={[styles.checkboxSub, { color: "#991b1b" }]}>
                        Short by: ₱{depositShortfall.toLocaleString()}
                      </Text>
                    )}
                  </View>
                </View>
              )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setShowCostModal(false);
                  setRequestToComplete(null);
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={completeWithCost}
                style={[styles.primaryBtnSmall, { backgroundColor: "#16a34a" }]}
              >
                <Text style={styles.primaryBtnText}>
                  {parsedMaintenanceCost > 0 &&
                  (!canDeductFromDeposit || !deductFromDeposit)
                    ? "Save & Send Bill"
                    : "Save Cost"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================== FEEDBACK MODAL =================== */}
      <Modal visible={showFeedbackModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalCardTitle}>Maintenance Feedback</Text>
            <Text style={styles.modalCardSub}>
              How was the resolution for "{requestForFeedback?.title}"?
            </Text>

            <TextInput
              style={[
                styles.input,
                { height: 100, textAlignVertical: "top", marginTop: 12 },
              ]}
              multiline
              placeholder="Describe your experience..."
              placeholderTextColor="#c4c4c4"
              value={feedbackText}
              onChangeText={setFeedbackText}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowFeedbackModal(false)}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitFeedback}
                disabled={submittingFeedback}
                style={[
                  styles.primaryBtnSmall,
                  submittingFeedback && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* =================== PROOF IMAGE MODAL =================== */}
      <Modal
        visible={!!selectedProofUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedProofUrl(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.9)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            style={{
              position: "absolute",
              top: 40,
              right: 20,
              zIndex: 10,
              padding: 10,
            }}
            onPress={() => setSelectedProofUrl(null)}
          >
            <Ionicons name="close-circle" size={36} color="white" />
          </TouchableOpacity>
          {selectedProofUrl &&
            (isVideoUrl(selectedProofUrl) ? (
              <Video
                source={{ uri: selectedProofUrl }}
                style={{ width: "100%", height: "80%" }}
                resizeMode={ResizeMode.CONTAIN}
                useNativeControls
                shouldPlay
              />
            ) : (
              <Image
                source={{ uri: selectedProofUrl }}
                style={{ width: "100%", height: "80%" }}
                resizeMode="contain"
              />
            ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },

  // Header
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
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111",
    textTransform: "uppercase",
  },
  headerSubtitle: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  createBtn: {
    backgroundColor: "#111",
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  // Filters
  filterContainer: {
    padding: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
  },
  filterChipActive: { backgroundColor: "#111" },
  filterChipText: { fontSize: 10, fontWeight: "700", color: "#6b7280" },
  filterChipTextActive: { color: "white" },

  // Loading & Empty
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: { fontSize: 13, color: "#9ca3af" },
  emptyState: { alignItems: "center", marginTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },

  // Card
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#fafafa",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexWrap: "wrap",
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  idBadgeWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  idLabel: { fontSize: 10, fontWeight: "700", color: "#9ca3af" },
  idBadge: {
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    color: "#111",
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateText: { fontSize: 10, fontWeight: "600", color: "#9ca3af" },

  cardBody: { padding: 16 },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111",
    marginBottom: 8,
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: "#6b7280" },

  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  priorityText: { fontSize: 9, fontWeight: "800" },

  infoTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  scheduleTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff7ed",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  scheduleTagText: { fontSize: 11, fontWeight: "700", color: "#c2410c" },
  repairmanTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  repairmanTagText: { fontSize: 11, fontWeight: "700", color: "#1d4ed8" },

  costTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    marginBottom: 10,
  },
  costTagText: { fontSize: 11, fontWeight: "700", color: "#166534" },

  descriptionBox: {
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    marginBottom: 10,
  },
  description: { fontSize: 13, color: "#374151", lineHeight: 20 },

  attachmentsSection: { marginBottom: 10 },
  attachmentsLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#9ca3af",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  proofImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: "#eee",
  },

  feedbackDisplay: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#fefce8",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fef08a",
  },
  feedbackLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#854d0e",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  feedbackText: { fontSize: 13, color: "#374151", fontStyle: "italic" },

  // Actions
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { fontSize: 11, fontWeight: "700" },

  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "white",
  },
  cancelBtnText: { fontSize: 11, fontWeight: "700", color: "#ef4444" },

  feedbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fef9c3",
  },
  feedbackBtnText: { fontSize: 11, fontWeight: "700", color: "#111" },

  replyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  replyBtnText: { fontSize: 11, fontWeight: "700", color: "#374151" },

  replySection: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fafafa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: "#111",
    backgroundColor: "white",
  },
  replySendBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  replySendText: { color: "white", fontSize: 12, fontWeight: "700" },

  // Modals — Shared
  modalContainer: { flex: 1, backgroundColor: "white" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: { padding: 20 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { backgroundColor: "white", borderRadius: 20, padding: 24 },
  modalCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  completeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111",
    textAlign: "center",
    marginBottom: 6,
  },
  modalCardSub: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 16,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },

  // Form Elements
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6b7280",
    marginBottom: 6,
    marginTop: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111",
    backgroundColor: "white",
  },
  inputDisabled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fafafa",
  },
  inputDisabledText: { fontSize: 14, fontWeight: "600", color: "#111" },
  helperText: { fontSize: 10, color: "#9ca3af", marginTop: 4 },

  datePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#fafafa",
  },
  datePickerText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111" },

  priorityRow: { flexDirection: "row", gap: 8 },
  priorityChip: {
    flex: 1,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    alignItems: "center",
  },
  priorityChipActive: { backgroundColor: "#111", borderColor: "#111" },
  priorityChipText: { fontSize: 13, fontWeight: "700", color: "#111" },
  priorityChipSub: { fontSize: 9, color: "#9ca3af", marginTop: 2 },

  addPhotoBtn: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    gap: 2,
  },
  addPhotoText: { fontSize: 10, color: "#666", fontWeight: "600" },
  previewWrap: { position: "relative", marginRight: 10 },
  previewImage: { width: 80, height: 80, borderRadius: 12 },
  removeFileBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },

  noPropertyBox: {
    padding: 30,
    alignItems: "center",
    backgroundColor: "#fefce8",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fef08a",
  },
  noPropertyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#854d0e",
    marginTop: 12,
    marginBottom: 6,
  },
  noPropertySub: {
    fontSize: 13,
    color: "#a16207",
    textAlign: "center",
    lineHeight: 20,
  },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fef3c7",
  },
  checkboxLabel: { fontSize: 13, fontWeight: "700", color: "#92400e" },
  checkboxSub: { fontSize: 10, color: "#b45309", marginTop: 2 },
  costMethodDropdownTrigger: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  costMethodDropdownTriggerDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  costMethodDropdownText: {
    fontSize: 13,
    fontWeight: "700",
  },
  costMethodDropdownTextDisabled: {
    color: "#9ca3af",
  },
  costMethodDropdownMenu: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 8,
    overflow: "hidden",
  },
  costMethodOption: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  costMethodOptionActive: {
    backgroundColor: "#ecfdf5",
  },
  costMethodOptionText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  costMethodOptionTextActive: {
    color: "#166534",
    fontWeight: "800",
  },
  costSummaryCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  costSummaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  costSummaryAmount: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  actionSummaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  actionSummaryText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: "#111",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
  },
  primaryBtnText: { color: "white", fontWeight: "700", fontSize: 14 },
  primaryBtnSmall: {
    flex: 1,
    padding: 14,
    backgroundColor: "#111",
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtn: {
    flex: 1,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtnText: { fontWeight: "700", fontSize: 14, color: "#374151" },
});
