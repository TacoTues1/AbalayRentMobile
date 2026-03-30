import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createNotification } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/theme';

export default function MaintenanceScreen() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [occupiedProperty, setOccupiedProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Search & Filter
  const [searchId, setSearchId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Active Selections
  const [requestToSchedule, setRequestToSchedule] = useState<any>(null);
  const [requestToComplete, setRequestToComplete] = useState<any>(null);
  const [requestForFeedback, setRequestForFeedback] = useState<any>(null);
  const [requestToCancel, setRequestToCancel] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);

  // Inputs
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [repairmanName, setRepairmanName] = useState('');
  const [maintenanceCost, setMaintenanceCost] = useState('');
  const [deductFromDeposit, setDeductFromDeposit] = useState(true);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [responseText, setResponseText] = useState('');

  // Create Request Form
  const [formData, setFormData] = useState({
    property_id: '',
    title: '',
    description: '',
    priority: 'normal'
  });
  const [proofFiles, setProofFiles] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploading, setUploading] = useState(false);

  const statusColors: any = {
    pending: '#FEF3C7',
    scheduled: '#DBEAFE',
    in_progress: '#FFEDD5',
    completed: '#DCFCE7',
    closed: '#F3F4F6',
    cancelled: '#FEE2E2'
  };

  const statusTextColors: any = {
    pending: '#92400E',
    scheduled: '#1E40AF',
    in_progress: '#9A3412',
    completed: '#166534',
    closed: '#1F2937',
    cancelled: '#991B1B'
  };

  const priorityStyles: any = {
    high: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
    normal: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
    low: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' }
  };

  async function loadRequestsWithProfile(sess: any, prof: any) {
    try {
      let query = supabase
        .from('maintenance_requests')
        .select('*, properties(title, landlord), tenant_profile:profiles!maintenance_requests_tenant_fkey(first_name, last_name)')
        .order('created_at', { ascending: false });

      if (prof.role === 'tenant') {
        let tenantIds = [sess.user.id];

        // Find if this tenant has an active occupancy
        const { data: myOcc } = await supabase
          .from('tenant_occupancies')
          .select('id')
          .eq('tenant_id', sess.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (myOcc) {
          // This is the primary tenant. Get family members.
          const { data: fms } = await supabase
            .from('family_members')
            .select('member_id')
            .eq('parent_occupancy_id', myOcc.id);
          if (fms) {
            tenantIds = [...tenantIds, ...fms.map(f => f.member_id)];
          }
        } else {
          // Check if family member via API to load their own requests
          try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
            const urlPrefix = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
            if (urlPrefix) {
              const res = await fetch(`${urlPrefix}/api/family-members?member_id=${sess.user.id}`);
              if (res.ok) {
                const fmData = await res.json();
                if (fmData && fmData.occupancy) {
                  tenantIds = [sess.user.id]; // Family member only sees their own requests right now
                }
              }
            }
          } catch (err) { }
        }

        query = query.in('tenant', tenantIds);
      } else if (prof.role === 'landlord') {
        const { data: myProps } = await supabase.from('properties').select('id').eq('landlord', sess.user.id);
        if (myProps && myProps.length > 0) {
          query = query.in('property_id', myProps.map((p: any) => p.id));
        } else {
          setRequests([]);
          return;
        }
      }

      const { data, error } = await query;
      if (error) {
        console.log('Load requests error:', error);
      } else if (data && data.length > 0) {
        // Resolve family members via API lookup to show tags
        const tenantIdsInRequests = [...new Set(data.map(r => r.tenant))];
        let fmMap = {};
        try {
          const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
          const urlPrefix = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
          if (urlPrefix) {
            const res = await fetch(`${urlPrefix}/api/family-members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'lookup_members', member_ids: tenantIdsInRequests })
            });
            if (res.ok) {
              const fData = await res.json();
              fmMap = fData.membersMap || {};
            }
          }
        } catch (err) { }

        const enrichedRequests = data.map((req: any) => ({
          ...req,
          is_family_member: !!(fmMap as any)[req.tenant],
          primary_tenant_name: (fmMap as any)[req.tenant] ? `${(fmMap as any)[req.tenant].first_name} ${(fmMap as any)[req.tenant].last_name}` : null
        }));
        setRequests(enrichedRequests);
      } else {
        setRequests([]);
      }
    } catch (e) {
      console.log('Load requests exception:', e);
    }
  }

  async function loadPropertiesWithProfile(sess: any, prof: any) {
    try {
      if (prof.role === 'tenant') {
        const { data: occupancy } = await supabase
          .from('tenant_occupancies')
          .select('property_id, property:properties(id, title)')
          .eq('tenant_id', sess.user.id)
          .eq('status', 'active')
          .maybeSingle();

        let prop = null;
        if (occupancy && occupancy.property) {
          prop = Array.isArray(occupancy.property) ? occupancy.property[0] : occupancy.property;
        } else {
          // Check if user is family member
          try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
            const urlPrefix = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
            if (urlPrefix) {
              const res = await fetch(`${urlPrefix}/api/family-members?member_id=${sess.user.id}`);
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
          setFormData(prev => ({ ...prev, property_id: prop.id }));
        } else {
          // Fallback: check accepted applications
          const { data: acceptedApps } = await supabase
            .from('applications')
            .select('property_id, property:properties(id, title)')
            .eq('tenant', sess.user.id)
            .eq('status', 'accepted');

          const approvedProperties = acceptedApps?.map((app: any) => app.property).filter(Boolean) || [];
          setProperties(approvedProperties);
          setOccupiedProperty(null);
        }
      } else if (prof.role === 'landlord') {
        const { data } = await supabase.from('properties').select('id, title').eq('landlord', sess.user.id);
        setProperties(data || []);
      }
    } catch (e) {
      console.log('Load properties error:', e);
    }
  }

  async function initData() {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession) {
        router.replace('/');
        return;
      }

      setSession(currentSession);

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentSession.user.id)
        .single();

      if (!profileData) {
        console.log('No profile found');
        return;
      }

      setProfile(profileData);

      // Load requests
      await loadRequestsWithProfile(currentSession, profileData);

      // Load properties
      await loadPropertiesWithProfile(currentSession, profileData);

    } catch (e) {
      console.log('Init error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    initData();
  }, []);

  // For pull-to-refresh
  async function loadRequests() {
    if (!session || !profile) return;
    await loadRequestsWithProfile(session, profile);
    setRefreshing(false);
  }

  // --- ACTIONS ---

  async function updateRequestStatus(requestId: string, newStatus: string) {
    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: newStatus,
        resolved_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', requestId);

    if (!error) {
      Alert.alert('Success', `Status updated to ${newStatus.replace('_', ' ')}`);
      loadRequests();

      // Send notification to tenant
      const request = requests.find(r => r.id === requestId);
      if (request && request.tenant) {
        try {
          await createNotification(
            request.tenant,
            'maintenance',
            `Maintenance "${request.title}" status updated to ${newStatus.replace('_', ' ')}.`,
            { actor: session.user.id, link: '/maintenance' }
          );
        } catch (e) { console.log('Notification error:', e); }
      }
    } else {
      Alert.alert('Error', 'Failed to update status');
    }
  }

  // Cancel flow
  function promptCancel(request: any) {
    setRequestToCancel(request);
    setShowCancelModal(true);
  }

  async function confirmCancel() {
    if (!requestToCancel) return;
    await updateRequestStatus(requestToCancel.id, 'cancelled');
    setShowCancelModal(false);
    setRequestToCancel(null);
  }

  // Start Work flow
  function openStartWorkModal(request: any) {
    setRequestToSchedule(request);
    // Default to tomorrow at 9 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setScheduleDate(tomorrow);
    setRepairmanName('');
    setShowScheduleModal(true);
  }

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(scheduleDate);
      newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setScheduleDate(newDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(scheduleDate);
      newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setScheduleDate(newDate);
    }
  };

  async function confirmStartWork() {
    if (!requestToSchedule) {
      Alert.alert('Error', 'No request selected');
      return;
    }

    const { error } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'in_progress',
        scheduled_date: scheduleDate.toISOString(),
        repairman_name: repairmanName.trim() || null
      })
      .eq('id', requestToSchedule.id);

    if (!error) {
      Alert.alert('Success', 'Work started!');

      // Notify tenant
      if (requestToSchedule.tenant) {
        const formattedDate = scheduleDate.toLocaleString();
        const repairmanInfo = repairmanName.trim() ? ` Assigned repairman: ${repairmanName.trim()}.` : '';
        try {
          await createNotification(
            requestToSchedule.tenant,
            'maintenance',
            `Work on "${requestToSchedule.title}" is scheduled to start on ${formattedDate}.${repairmanInfo}`,
            { actor: session.user.id, link: '/maintenance' }
          );
        } catch (e) { console.log('Notification error:', e); }
      }

      setShowScheduleModal(false);
      setRequestToSchedule(null);
      loadRequests();
    } else {
      Alert.alert('Error', 'Failed to update request');
    }
  }

  // Complete with cost flow
  function openCostModal(request: any) {
    setRequestToComplete(request);
    setMaintenanceCost('');
    setDeductFromDeposit(true);
    setShowCostModal(true);
  }

  async function completeWithCost() {
    if (!requestToComplete) return;
    const cost = parseFloat(maintenanceCost) || 0;

    const { error: updateError } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'completed',
        resolved_at: new Date().toISOString(),
        maintenance_cost: cost,
        cost_deducted_from_deposit: deductFromDeposit && cost > 0
      })
      .eq('id', requestToComplete.id);

    if (updateError) {
      Alert.alert('Error', 'Failed to complete');
      return;
    }

    // Deduct from security deposit if applicable
    if (deductFromDeposit && cost > 0 && requestToComplete.tenant) {
      const { data: occupancy } = await supabase
        .from('tenant_occupancies')
        .select('id, security_deposit, security_deposit_used')
        .eq('tenant_id', requestToComplete.tenant)
        .eq('status', 'active')
        .maybeSingle();

      if (occupancy) {
        const newUsed = (occupancy.security_deposit_used || 0) + cost;
        await supabase.from('tenant_occupancies').update({ security_deposit_used: newUsed }).eq('id', occupancy.id);

        // Notify tenant about deduction
        try {
          await createNotification(
            requestToComplete.tenant,
            'maintenance',
            `₱${cost.toLocaleString()} has been deducted from your security deposit for maintenance: "${requestToComplete.title}"`,
            { actor: session.user.id, link: '/maintenance' }
          );
        } catch (e) { console.log('Notification error:', e); }
      }
    }

    // Notify tenant about completion
    if (requestToComplete.tenant) {
      const costMessage = cost > 0
        ? ` Maintenance cost: ₱${cost.toLocaleString()}${deductFromDeposit ? ' (deducted from security deposit)' : ''}.`
        : '';
      try {
        await createNotification(
          requestToComplete.tenant,
          'maintenance',
          `Maintenance "${requestToComplete.title}" has been completed.${costMessage}`,
          { actor: session.user.id, link: '/maintenance' }
        );
      } catch (e) { console.log('Notification error:', e); }
    }

    Alert.alert('Success', 'Maintenance completed');
    setShowCostModal(false);
    setRequestToComplete(null);
    loadRequests();
  }

  // Reply flow (landlord)
  async function addResponse(requestId: string) {
    if (!responseText.trim()) return;
    await updateRequestStatus(requestId, 'in_progress');

    const request = requests.find(r => r.id === requestId);
    if (request && request.tenant) {
      try {
        await createNotification(
          request.tenant,
          'maintenance',
          `Landlord responded to "${request.title}": ${responseText}`,
          { actor: session.user.id, link: '/maintenance' }
        );
      } catch (e) { console.log('Notification error:', e); }
    }

    setResponseText('');
    setSelectedRequest(null);
    Alert.alert('Success', 'Response sent to tenant!');
  }

  // Feedback flow (tenant)
  function openFeedbackModal(request: any) {
    setRequestForFeedback(request);
    setFeedbackText('');
    setShowFeedbackModal(true);
  }

  async function submitFeedback() {
    if (!requestForFeedback) return;
    setSubmittingFeedback(true);

    const { error } = await supabase
      .from('maintenance_requests')
      .update({ feedback: feedbackText })
      .eq('id', requestForFeedback.id);

    if (!error) {
      Alert.alert('Success', 'Feedback submitted! Thank you.');
      loadRequests();
      setShowFeedbackModal(false);
      setRequestForFeedback(null);
    } else {
      Alert.alert('Error', 'Failed to submit feedback');
    }
    setSubmittingFeedback(false);
  }

  // --- FILE UPLOAD ---

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      if (proofFiles.length + result.assets.length > 10) {
        Alert.alert('Limit Reached', 'Max 10 files allowed');
        return;
      }
      setProofFiles([...proofFiles, ...result.assets]);
    }
  };

  const removeFile = (index: number) => {
    setProofFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadProofFiles = async () => {
    const uploadPromises = proofFiles.map(async (asset) => {
      const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('maintenance-uploads')
        .upload(filePath, decode(asset.base64!), { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('maintenance-uploads').getPublicUrl(filePath);
      return data.publicUrl;
    });

    return Promise.all(uploadPromises);
  };

  const handleSubmitRequest = async () => {
    if (proofFiles.length === 0) {
      Alert.alert('Required', 'Please attach at least one photo or video as proof.');
      return;
    }
    if (!formData.title || !formData.description) {
      Alert.alert('Required', 'Please fill in title and description.');
      return;
    }

    setUploading(true);
    try {
      const attachmentUrls = await uploadProofFiles();

      const { data: insertData, error } = await supabase.from('maintenance_requests').insert({
        ...formData,
        tenant: session.user.id,
        status: 'pending',
        attachment_urls: attachmentUrls
      }).select('*, properties(title, landlord)');

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
          } catch (e) { console.log('Notification error:', e); }
        }
      }

      Alert.alert('Success', 'Request submitted!');
      setShowCreateModal(false);
      setFormData({ property_id: occupiedProperty?.id || '', title: '', description: '', priority: 'normal' });
      setProofFiles([]);
      loadRequests();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
  };

  // --- FILTER ---
  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    const matchesSearch = searchId === '' || req.id.toLowerCase().includes(searchId.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // --- RENDER CARD ---
  const renderItem = ({ item }: { item: any }) => {
    const pStyle = priorityStyles[item.priority] || priorityStyles.normal;

    return (
      <View style={[styles.card, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
        {/* Header Strip */}
        <View style={[styles.cardHeaderStrip, { backgroundColor: isDark ? colors.surface : '#f9fafb', borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.idBadgeWrap}>
              <Text style={[styles.idLabel, { color: isDark ? colors.textMuted : '#9ca3af' }]}>ID:</Text>
              <Text style={[styles.idBadge, { color: isDark ? colors.text : '#111' }]}>{item.id.substring(0, 8).toUpperCase()}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] || '#f3f4f6' }]}>
              <Text style={[styles.statusText, { color: statusTextColors[item.status] || '#1f2937' }]}>
                {item.status?.replace('_', ' ')}
              </Text>
            </View>
          </View>
          <Text style={[styles.dateText, { color: isDark ? colors.textMuted : '#9ca3af' }]}>
            {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.cardBody}>
          {/* Title & Info */}
          <Text style={[styles.cardTitle, { color: isDark ? colors.text : '#111' }]}>{item.title}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="home-outline" size={14} color="#9ca3af" />
              <Text style={styles.metaText}>{item.properties?.title}</Text>
            </View>
            {profile?.role === 'landlord' && item.tenant_profile && (
              <View style={[styles.metaItem, { flexWrap: 'wrap', maxWidth: '80%' }]}>
                <Ionicons name="person-outline" size={14} color="#9ca3af" />
                <Text style={styles.metaText} numberOfLines={2}>
                  {item.tenant_profile.first_name} {item.tenant_profile.last_name}
                </Text>
                {item.is_family_member && (
                  <View style={{ backgroundColor: '#f3e8ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4, marginTop: 2 }}>
                    <Text style={{ fontSize: 9, color: '#7e22ce', fontWeight: 'bold' }}>FAMILY OF {item.primary_tenant_name?.toUpperCase()}</Text>
                  </View>
                )}
              </View>
            )}
            {profile?.role === 'tenant' && session?.user?.id !== item.tenant && item.tenant_profile && (
              <View style={[styles.metaItem, { flexWrap: 'wrap', maxWidth: '80%' }]}>
                <Ionicons name="people-outline" size={14} color="#3b82f6" />
                <Text style={[styles.metaText, { color: '#3b82f6' }]} numberOfLines={1}>
                  By {item.tenant_profile.first_name} (Family)
                </Text>
              </View>
            )}
            <View style={[styles.priorityBadge, { backgroundColor: pStyle.bg, borderColor: pStyle.border }]}>
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
                  <Text style={styles.repairmanTagText}>Repairman: {item.repairman_name}</Text>
                </View>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.descriptionBox}>
            <Text style={styles.description}>{item.description}</Text>
          </View>

          {/* Maintenance Cost Display */}
          {item.maintenance_cost > 0 && (
            <View style={styles.costTag}>
              <Ionicons name="cash-outline" size={14} color="#166534" />
              <Text style={styles.costTagText}>
                Cost: ₱{Number(item.maintenance_cost).toLocaleString()}
                {item.cost_deducted_from_deposit ? ' (Deducted from deposit)' : ''}
              </Text>
            </View>
          )}

          {/* Attachments */}
          {(() => {
            let urls = item.attachment_urls;
            if (typeof urls === 'string') {
              try { urls = JSON.parse(urls); } catch (e) { urls = []; }
            }
            if (!Array.isArray(urls) || urls.length === 0) return null;
            return (
              <View style={styles.attachmentsSection}>
                <Text style={styles.attachmentsLabel}>Proof ({urls.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {urls.map((url: string, idx: number) => (
                    <Image
                      key={idx}
                      source={{ uri: url }}
                      style={styles.proofImage}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              </View>
            );
          })()}

          {/* Feedback Display */}
          {item.feedback && (
            <View style={styles.feedbackDisplay}>
              <Text style={styles.feedbackLabel}>TENANT FEEDBACK</Text>
              <Text style={styles.feedbackText}>"{item.feedback}"</Text>
            </View>
          )}

          {/* --- TENANT ACTIONS --- */}
          {profile?.role === 'tenant' && (
            <View style={styles.actionRow}>
              {/* Cancel button (visible when not completed/closed/cancelled and no scheduled date) */}
              {!['completed', 'closed', 'cancelled'].includes(item.status) && !item.scheduled_date && (
                <TouchableOpacity onPress={() => promptCancel(item)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel Request</Text>
                </TouchableOpacity>
              )}
              {/* Feedback button (visible when closed and no feedback given) */}
              {item.status === 'closed' && !item.feedback && (
                <TouchableOpacity onPress={() => openFeedbackModal(item)} style={styles.feedbackBtn}>
                  <Ionicons name="chatbox-ellipses-outline" size={14} color="#111" />
                  <Text style={styles.feedbackBtnText}>Leave Feedback</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* --- LANDLORD ACTIONS --- */}
          {profile?.role === 'landlord' && item.status !== 'closed' && (
            <View style={styles.actionRow}>
              {item.status === 'pending' && (
                <TouchableOpacity onPress={() => updateRequestStatus(item.id, 'scheduled')} style={[styles.actionBtn, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={[styles.actionBtnText, { color: '#1E40AF' }]}>Mark Scheduled</Text>
                </TouchableOpacity>
              )}
              {item.status === 'scheduled' && (
                <TouchableOpacity onPress={() => openStartWorkModal(item)} style={[styles.actionBtn, { backgroundColor: '#FFEDD5' }]}>
                  <Text style={[styles.actionBtnText, { color: '#9A3412' }]}>Start Working</Text>
                </TouchableOpacity>
              )}
              {item.status === 'in_progress' && (
                <TouchableOpacity onPress={() => openCostModal(item)} style={[styles.actionBtn, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[styles.actionBtnText, { color: '#166534' }]}>Mark Completed</Text>
                </TouchableOpacity>
              )}
              {(item.status === 'completed' || item.status === 'resolved') && (
                <TouchableOpacity onPress={() => updateRequestStatus(item.id, 'closed')} style={[styles.actionBtn, { backgroundColor: '#F3F4F6' }]}>
                  <Text style={[styles.actionBtnText, { color: '#374151' }]}>Archive/Close</Text>
                </TouchableOpacity>
              )}
              {!['completed', 'closed', 'cancelled'].includes(item.status) && (
                <TouchableOpacity onPress={() => promptCancel(item)} style={[styles.actionBtn, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.actionBtnText, { color: '#991B1B' }]}>Cancel/Reject</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setSelectedRequest(selectedRequest === item.id ? null : item.id)}
                style={styles.replyBtn}
              >
                <Ionicons name={selectedRequest === item.id ? "close-outline" : "chatbubble-outline"} size={14} color="#374151" />
                <Text style={styles.replyBtnText}>{selectedRequest === item.id ? 'Cancel' : 'Reply'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Reply Input (Landlord) */}
          {profile?.role === 'landlord' && selectedRequest === item.id && (
            <View style={styles.replySection}>
              <TextInput
                style={styles.replyInput}
                value={responseText}
                onChangeText={setResponseText}
                placeholder="Say something to tenant..."
                placeholderTextColor="#c4c4c4"
              />
              <TouchableOpacity onPress={() => addResponse(item.id)} style={styles.replySendBtn}>
                <Text style={styles.replySendText}>Send</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // --- MAIN RENDER ---
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : '#f9fafb' }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.surface : 'white', borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: isDark ? colors.text : '#111' }]}>{profile?.role === 'landlord' ? 'Maintenance Board' : 'My Requests'}</Text>
          <Text style={[styles.headerSubtitle, { color: isDark ? colors.textMuted : '#6b7280' }]}>
            {profile?.role === 'landlord'
              ? 'Manage and track requests from your properties.'
              : 'Report issues and track resolution status.'}
          </Text>
        </View>
        {profile?.role === 'tenant' && (
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.createBtn}>
            <Ionicons name="add" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={[styles.filterContainer, { backgroundColor: isDark ? colors.background : '#f9fafb' }]}>
        <View style={[styles.searchBox, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
          <Ionicons name="search" size={16} color={isDark ? colors.textMuted : '#9ca3af'} />
          <TextInput
            placeholder="Search by Request ID..."
            placeholderTextColor={isDark ? colors.textMuted : '#c4c4c4'}
            value={searchId}
            onChangeText={setSearchId}
            style={[styles.searchInput, { color: isDark ? colors.text : '#111' }]}
          />
          {searchId.length > 0 && (
            <TouchableOpacity onPress={() => setSearchId('')}>
              <Ionicons name="close-circle" size={18} color={isDark ? colors.textMuted : '#ccc'} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
          {['all', 'pending', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled'].map(status => (
            <TouchableOpacity
              key={status}
              onPress={() => setStatusFilter(status)}
              style={[styles.filterChip, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }, statusFilter === status && [styles.filterChipActive, { backgroundColor: isDark ? 'white' : '#111' }]]}
            >
              <Text style={[styles.filterChipText, { color: isDark ? colors.textMuted : '#6b7280' }, statusFilter === status && [styles.filterChipTextActive, { color: isDark ? '#111' : 'white' }]]}>
                {status === 'all' ? 'ALL' : status.replace('_', ' ').toUpperCase()}
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
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 130 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="construct-outline" size={40} color="#d1d5db" />
              </View>
              <Text style={styles.emptyTitle}>No requests found</Text>
              <Text style={styles.emptySubtitle}>
                {profile?.role === 'tenant'
                  ? 'Tap + to submit a new maintenance request.'
                  : 'No maintenance requests from your tenants yet.'}
              </Text>
            </View>
          }
        />
      )}

      {/* =================== CREATE REQUEST MODAL =================== */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: isDark ? colors.background : '#f9fafb' }]}>
          <View style={[styles.modalHeader, { backgroundColor: isDark ? colors.surface : 'white', borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.text : '#111' }]}>New Maintenance Request</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.modalClose}>
              <Ionicons name="close" size={20} color={isDark ? colors.textMuted : '#666'} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {properties.length === 0 ? (
              <View style={styles.noPropertyBox}>
                <Ionicons name="alert-circle-outline" size={40} color="#854d0e" />
                <Text style={styles.noPropertyTitle}>No Active Lease</Text>
                <Text style={styles.noPropertySub}>You can only submit requests for properties you are currently renting.</Text>
              </View>
            ) : (
              <>
                {/* Property */}
                <Text style={[styles.label, { color: isDark ? colors.textMuted : '#6b7280' }]}>PROPERTY</Text>
                <View style={[styles.inputDisabled, { backgroundColor: isDark ? colors.card : '#f9fafb', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                  <Ionicons name="home-outline" size={16} color={isDark ? colors.textMuted : '#9ca3af'} />
                  <Text style={[styles.inputDisabledText, { color: isDark ? colors.text : '#374151' }]}>{occupiedProperty?.title || properties[0]?.title || 'No Property'}</Text>
                </View>

                {/* Title */}
                <Text style={[styles.label, { color: isDark ? colors.textMuted : '#6b7280' }]}>ISSUE TITLE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e5e7eb', color: isDark ? colors.text : '#111' }]}
                  placeholder="e.g. Leaking faucet in kitchen"
                  placeholderTextColor={isDark ? colors.textMuted : '#c4c4c4'}
                  value={formData.title}
                  onChangeText={t => setFormData({ ...formData, title: t })}
                />

                {/* Priority */}
                <Text style={styles.label}>PRIORITY</Text>
                <View style={styles.priorityRow}>
                  {[{ key: 'low', label: 'Low', sub: 'Cosmetic' }, { key: 'normal', label: 'Normal', sub: 'Functional' }, { key: 'high', label: 'High', sub: 'Urgent' }].map(p => (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => setFormData({ ...formData, priority: p.key })}
                      style={[styles.priorityChip, formData.priority === p.key && styles.priorityChipActive]}
                    >
                      <Text style={[styles.priorityChipText, formData.priority === p.key && { color: 'white' }]}>{p.label}</Text>
                      <Text style={[styles.priorityChipSub, formData.priority === p.key && { color: 'rgba(255,255,255,0.6)' }]}>{p.sub}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Description */}
                <Text style={styles.label}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="Describe the issue in detail..."
                  placeholderTextColor="#c4c4c4"
                  value={formData.description}
                  onChangeText={t => setFormData({ ...formData, description: t })}
                />

                {/* Photos */}
                <Text style={styles.label}>
                  PROOF (PHOTOS/VIDEOS) <Text style={{ color: '#ef4444' }}>*Required</Text>
                  <Text style={{ color: '#9ca3af' }}> ({proofFiles.length}/10)</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                  <TouchableOpacity onPress={pickImages} style={styles.addPhotoBtn}>
                    <Ionicons name="camera" size={24} color="#666" />
                    <Text style={styles.addPhotoText}>Add</Text>
                  </TouchableOpacity>
                  {proofFiles.map((asset, i) => (
                    <View key={i} style={styles.previewWrap}>
                      <Image source={{ uri: asset.uri }} style={styles.previewImage} />
                      <TouchableOpacity onPress={() => removeFile(i)} style={styles.removeFileBtn}>
                        <Ionicons name="close" size={12} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
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

      {/* =================== CANCEL CONFIRM MODAL =================== */}
      <Modal visible={showCancelModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.surface : 'white' }]}>
            <View style={styles.modalCardIcon}>
              <Ionicons name="warning-outline" size={28} color="#ef4444" />
            </View>
            <Text style={[styles.modalCardTitle, { color: isDark ? colors.text : '#111' }]}>Cancel Maintenance Request?</Text>
            <Text style={[styles.modalCardSub, { color: isDark ? colors.textMuted : '#6b7280' }]}>
              Are you sure you want to cancel: "{requestToCancel?.title}"?
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCancelModal(false)} style={[styles.secondaryBtn, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e5e7eb' }]}>
                <Text style={[styles.secondaryBtnText, { color: isDark ? colors.text : '#374151' }]}>No, Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmCancel} style={[styles.primaryBtnSmall, { backgroundColor: '#ef4444' }]}>
                <Text style={styles.primaryBtnText}>Yes, Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================== SCHEDULE / START WORK MODAL =================== */}
      <Modal visible={showScheduleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.surface : 'white' }]}>
            <Text style={[styles.modalCardTitle, { color: isDark ? colors.text : '#111' }]}>Set Start Date & Assign Repairman</Text>

            <Text style={styles.label}>START DATE</Text>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.datePickerBtn}>
              <Ionicons name="calendar-outline" size={18} color="#111" />
              <Text style={styles.datePickerText}>
                {scheduleDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>

            <Text style={styles.label}>START TIME</Text>
            <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.datePickerBtn}>
              <Ionicons name="time-outline" size={18} color="#111" />
              <Text style={styles.datePickerText}>
                {scheduleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={scheduleDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={onDateChange}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={scheduleDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onTimeChange}
              />
            )}

            <Text style={styles.label}>REPAIRMAN NAME (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor="#c4c4c4"
              value={repairmanName}
              onChangeText={setRepairmanName}
            />
            <Text style={styles.helperText}>Tenant will see this name on their maintenance request.</Text>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowScheduleModal(false)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmStartWork} style={styles.primaryBtnSmall}>
                <Text style={styles.primaryBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* =================== COST / COMPLETE MODAL =================== */}
      <Modal visible={showCostModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={styles.completeIcon}>
                <Ionicons name="checkmark" size={22} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCardTitle}>Complete Maintenance</Text>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>{requestToComplete?.title}</Text>
              </View>
            </View>

            <Text style={styles.label}>MAINTENANCE COST / EXPENSE (₱)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor="#c4c4c4"
              value={maintenanceCost}
              onChangeText={setMaintenanceCost}
            />
            <Text style={styles.helperText}>Leave as 0 if there's no cost to the tenant.</Text>

            {parseFloat(maintenanceCost) > 0 && (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setDeductFromDeposit(!deductFromDeposit)}
              >
                <Ionicons name={deductFromDeposit ? 'checkbox' : 'square-outline'} size={22} color={deductFromDeposit ? '#d97706' : '#9ca3af'} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkboxLabel}>Deduct from Security Deposit</Text>
                  <Text style={styles.checkboxSub}>This amount will be deducted from the tenant's security deposit.</Text>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setShowCostModal(false); setRequestToComplete(null); }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={completeWithCost} style={[styles.primaryBtnSmall, { backgroundColor: '#16a34a' }]}>
                <Text style={styles.primaryBtnText}>Complete</Text>
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
              style={[styles.input, { height: 100, textAlignVertical: 'top', marginTop: 12 }]}
              multiline
              placeholder="Describe your experience..."
              placeholderTextColor="#c4c4c4"
              value={feedbackText}
              onChangeText={setFeedbackText}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowFeedbackModal(false)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitFeedback}
                disabled={submittingFeedback}
                style={[styles.primaryBtnSmall, submittingFeedback && { opacity: 0.5 }]}
              >
                <Text style={styles.primaryBtnText}>{submittingFeedback ? 'Submitting...' : 'Submit Feedback'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#111', textTransform: 'uppercase' },
  headerSubtitle: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  createBtn: {
    backgroundColor: '#111', width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center'
  },

  // Filters
  filterContainer: {
    padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6',
    paddingHorizontal: 12, borderRadius: 10, height: 40, gap: 8, marginBottom: 10
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f3f4f6'
  },
  filterChipActive: { backgroundColor: '#111' },
  filterChipText: { fontSize: 10, fontWeight: '700', color: '#6b7280' },
  filterChipTextActive: { color: 'white' },

  // Loading & Empty
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: '#9ca3af' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

  // Card
  card: {
    backgroundColor: 'white', borderRadius: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1
  },
  cardHeaderStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 14, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
    flexWrap: 'wrap', gap: 8
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  idBadgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  idLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
  idBadge: { fontFamily: 'monospace', fontSize: 10, fontWeight: '700', backgroundColor: '#e5e7eb', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, color: '#111' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateText: { fontSize: 10, fontWeight: '600', color: '#9ca3af' },

  cardBody: { padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#111', marginBottom: 8 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#6b7280' },

  priorityBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1
  },
  priorityText: { fontSize: 9, fontWeight: '800' },

  infoTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  scheduleTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff7ed', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fed7aa'
  },
  scheduleTagText: { fontSize: 11, fontWeight: '700', color: '#c2410c' },
  repairmanTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe'
  },
  repairmanTagText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },

  costTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 10
  },
  costTagText: { fontSize: 11, fontWeight: '700', color: '#166534' },

  descriptionBox: {
    backgroundColor: '#fafafa', borderRadius: 12, padding: 14, borderWidth: 1,
    borderColor: '#f3f4f6', marginBottom: 10
  },
  description: { fontSize: 13, color: '#374151', lineHeight: 20 },

  attachmentsSection: { marginBottom: 10 },
  attachmentsLabel: { fontSize: 10, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 },
  proofImage: { width: 100, height: 100, borderRadius: 10, marginRight: 10, backgroundColor: '#eee' },

  feedbackDisplay: {
    marginTop: 8, padding: 12, backgroundColor: '#fefce8', borderRadius: 10, borderWidth: 1, borderColor: '#fef08a'
  },
  feedbackLabel: { fontSize: 9, fontWeight: '800', color: '#854d0e', marginBottom: 4, textTransform: 'uppercase' },
  feedbackText: { fontSize: 13, color: '#374151', fontStyle: 'italic' },

  // Actions
  actionRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6'
  },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { fontSize: 11, fontWeight: '700' },

  cancelBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#fecaca', backgroundColor: 'white'
  },
  cancelBtnText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },

  feedbackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#fef9c3',
  },
  feedbackBtnText: { fontSize: 11, fontWeight: '700', color: '#111' },

  replyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#e5e7eb'
  },
  replyBtnText: { fontSize: 11, fontWeight: '700', color: '#374151' },

  replySection: {
    flexDirection: 'row', gap: 8, marginTop: 12, padding: 12,
    backgroundColor: '#fafafa', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6'
  },
  replyInput: {
    flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#111', backgroundColor: 'white'
  },
  replySendBtn: {
    backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center'
  },
  replySendText: { color: 'white', fontSize: 12, fontWeight: '700' },

  // Modals — Shared
  modalContainer: { flex: 1, backgroundColor: 'white' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6'
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111' },
  modalClose: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center'
  },
  modalBody: { padding: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: 'white', borderRadius: 20, padding: 24 },
  modalCardIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#fef2f2',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16
  },
  completeIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#dcfce7',
    alignItems: 'center', justifyContent: 'center'
  },
  modalCardTitle: { fontSize: 17, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: 6 },
  modalCardSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },

  // Form Elements
  label: { fontSize: 10, fontWeight: '800', color: '#6b7280', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: '#111', backgroundColor: 'white'
  },
  inputDisabled: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, backgroundColor: '#fafafa'
  },
  inputDisabledText: { fontSize: 14, fontWeight: '600', color: '#111' },
  helperText: { fontSize: 10, color: '#9ca3af', marginTop: 4 },

  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#fafafa'
  },
  datePickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111' },

  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityChip: {
    flex: 1, padding: 12, borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 12, alignItems: 'center'
  },
  priorityChipActive: { backgroundColor: '#111', borderColor: '#111' },
  priorityChipText: { fontSize: 13, fontWeight: '700', color: '#111' },
  priorityChipSub: { fontSize: 9, color: '#9ca3af', marginTop: 2 },

  addPhotoBtn: {
    width: 80, height: 80, borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10, gap: 2
  },
  addPhotoText: { fontSize: 10, color: '#666', fontWeight: '600' },
  previewWrap: { position: 'relative', marginRight: 10 },
  previewImage: { width: 80, height: 80, borderRadius: 12 },
  removeFileBtn: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center'
  },

  noPropertyBox: {
    padding: 30, alignItems: 'center', backgroundColor: '#fefce8', borderRadius: 16,
    borderWidth: 1, borderColor: '#fef08a'
  },
  noPropertyTitle: { fontSize: 16, fontWeight: '800', color: '#854d0e', marginTop: 12, marginBottom: 6 },
  noPropertySub: { fontSize: 13, color: '#a16207', textAlign: 'center', lineHeight: 20 },

  checkboxRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12,
    padding: 12, backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: '#fef3c7'
  },
  checkboxLabel: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  checkboxSub: { fontSize: 10, color: '#b45309', marginTop: 2 },

  // Buttons
  primaryBtn: {
    backgroundColor: '#111', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24
  },
  primaryBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  primaryBtnSmall: {
    flex: 1, padding: 14, backgroundColor: '#111', borderRadius: 12, alignItems: 'center'
  },
  secondaryBtn: {
    flex: 1, padding: 14, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, alignItems: 'center'
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 14, color: '#374151' },
});