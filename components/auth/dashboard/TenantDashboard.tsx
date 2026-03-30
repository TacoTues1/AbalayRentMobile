import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import CalendarPicker from '../../../components/ui/CalendarPicker';
import { useRealtime } from '../../../hooks/useRealtime';
import { createNotification } from '../../../lib/notifications';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../lib/theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;

export default function TenantDashboard({ session, profile }: any) {
    const router = useRouter();
    const { isDark, colors } = useTheme();

    // --- STATE ---
    const [properties, setProperties] = useState<any[]>([]);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [guestFavorites, setGuestFavorites] = useState<any[]>([]);
    const [topRated, setTopRated] = useState<any[]>([]);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [comparisonList, setComparisonList] = useState<any[]>([]);
    const [occupancy, setOccupancy] = useState<any>(null);
    const [propertyStats, setPropertyStats] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // No-occupancy browse state
    const [noOccupancySearch, setNoOccupancySearch] = useState('');
    const [noOccupancyCityFilter, setNoOccupancyCityFilter] = useState<string | null>(null);
    const [noOccupancySortBy, setNoOccupancySortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'rating'>('newest');
    const [noOccupancyBedrooms, setNoOccupancyBedrooms] = useState<number | null>(null);
    const [noOccupancyMaxPrice, setNoOccupancyMaxPrice] = useState<number | null>(null);
    const [showBrowseFilterModal, setShowBrowseFilterModal] = useState(false);
    const [noOccupancyPriceRange, setNoOccupancyPriceRange] = useState({ min: '', max: '' });
    const [noOccupancyMinRating, setNoOccupancyMinRating] = useState(0);
    const [noOccupancyFilterFavorites, setNoOccupancyFilterFavorites] = useState(false);
    const [noOccupancySelectedAmenities, setNoOccupancySelectedAmenities] = useState<string[]>([]);

    const browseAvailableAmenities = [
        'Wifi', 'Air Condition', 'Washing Machine', 'Parking',
        'Hot Shower', 'Bathroom', 'Smoke Alarm', 'Veranda',
        'Fire Extinguisher', 'Outside Garden', 'Furnished',
        'Semi-Furnished', 'Pet Friendly', 'Kitchen', 'Smart TV'
    ];

    const browseClearFilters = () => {
        setNoOccupancySortBy('newest');
        setNoOccupancyBedrooms(null);
        setNoOccupancyMaxPrice(null);
        setNoOccupancyPriceRange({ min: '', max: '' });
        setNoOccupancyMinRating(0);
        setNoOccupancyFilterFavorites(false);
        setNoOccupancySelectedAmenities([]);
        setNoOccupancyCityFilter(null);
    };

    const browseToggleAmenity = (a: string) => {
        setNoOccupancySelectedAmenities(prev =>
            prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
        );
    };

    // Active Property State
    const [activePropertyImageIndex, setActivePropertyImageIndex] = useState(0);

    // Financials
    const [tenantBalance, setTenantBalance] = useState(0);
    const [pendingPayments, setPendingPayments] = useState<any[]>([]);
    const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
    const [nextPaymentDate, setNextPaymentDate] = useState<string>('Loading...');
    const [lastRentPeriod, setLastRentPeriod] = useState<string>('N/A');
    const [lastPayment, setLastPayment] = useState<any>(null);
    const [securityDepositPaid, setSecurityDepositPaid] = useState(false);
    const [securityDepositProcessing, setSecurityDepositProcessing] = useState(false);
    const [totalRentPaid, setTotalRentPaid] = useState(0);

    // Family State
    const [isFamilyMember, setIsFamilyMember] = useState(false);
    const [familyPaidBills, setFamilyPaidBills] = useState<any[]>([]);
    const [familyMembers, setFamilyMembers] = useState<any[]>([]);
    const [showFamilyModal, setShowFamilyModal] = useState(false);
    const [familySearchQuery, setFamilySearchQuery] = useState('');
    const [familySearchResults, setFamilySearchResults] = useState<any[]>([]);
    const [familySearching, setFamilySearching] = useState(false);
    const [addingMember, setAddingMember] = useState<string | null>(null);
    const [removingMember, setRemovingMember] = useState<string | null>(null);
    const [confirmRemoveMember, setConfirmRemoveMember] = useState<string | null>(null);
    const [loadingFamily, setLoadingFamily] = useState(false);

    // Renewals
    const [daysUntilContractEnd, setDaysUntilContractEnd] = useState<number | null>(null);
    const [canRenew, setCanRenew] = useState(false);
    const [showRenewalModal, setShowRenewalModal] = useState(false);
    const [renewalMeetingDate, setRenewalMeetingDate] = useState('');
    const [renewalRequested, setRenewalRequested] = useState(false);

    // Reviews & End Request
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [reviewTarget, setReviewTarget] = useState<any>(null);
    const [reviewRating, setReviewRating] = useState(5); // Internal ref
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);
    const [cleanlinessRating, setCleanlinessRating] = useState(5);
    const [communicationRating, setCommunicationRating] = useState(5);
    const [locationRating, setLocationRating] = useState(5);
    const [dontShowAgain, setDontShowAgain] = useState(false);

    const [endRequestModalVisible, setEndRequestModalVisible] = useState(false);
    const [endRequestDate, setEndRequestDate] = useState('');
    const [endRequestReason, setEndRequestReason] = useState('');
    const [submittingEndRequest, setSubmittingEndRequest] = useState(false);

    // Track if user already skipped the review modal this session
    const reviewSkippedThisSession = useRef(false);

    // --- INITIAL LOAD ---
    useEffect(() => {
        if (session) {
            loadInitialData();
        }
    }, [session, profile]);

    useRealtime(
        ['tenant_occupancies', 'payment_requests', 'payments', 'tenant_balances'],
        () => {
            console.log("Realtime update triggered reload for tenant dashboard");
            loadInitialData();
        },
        !!profile
    );

    useRealtime(
        ['properties'],
        () => {
            console.log("Property update triggered reload");
            loadPropertiesData();
        },
        !!profile
    );

    // Image Slider Effect
    useEffect(() => {
        if (occupancy?.property?.images?.length > 1) {
            const interval = setInterval(() => {
                setActivePropertyImageIndex(prev => (prev + 1) % occupancy.property.images.length);
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [occupancy]);

    // Financial Calc Effect
    useEffect(() => {
        if (occupancy) {
            calculateNextPayment(occupancy.id, occupancy);
        }
    }, [pendingPayments, occupancy]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadInitialData();
    }, []);

    async function loadInitialData() {
        try {
            await Promise.all([
                loadPropertiesData(),
                loadOccupancyData(),
                checkPendingReviews()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    // --- DATA FETCHING ---

    const loadPropertiesData = async () => {
        try {
            const { data: allProps } = await supabase
                .from('properties')
                .select('*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)')
                .eq('is_deleted', false);

            const { data: stats } = await supabase.from('property_stats').select('*');
            const statsMap: any = {};
            if (stats) stats.forEach((s: any) => { statsMap[s.property_id] = s; });
            setPropertyStats(statsMap);
            setProperties(allProps || []);

            // Stats Logic
            const favs = (allProps || []).filter((p: any) => (statsMap[p.id]?.favorite_count || 0) >= 1)
                .sort((a: any, b: any) => (statsMap[b.id]?.favorite_count || 0) - (statsMap[a.id]?.favorite_count || 0))
                .slice(0, 8);
            const rated = (allProps || []).filter((p: any) => (statsMap[p.id]?.review_count || 0) > 0)
                .sort((a: any, b: any) => (statsMap[b.id]?.avg_rating || 0) - (statsMap[a.id]?.avg_rating || 0))
                .slice(0, 8);

            setGuestFavorites(favs);
            setTopRated(rated);

            if (session?.user) {
                const { data: userFavs } = await supabase.from('favorites').select('property_id').eq('user_id', session.user.id);
                if (userFavs) setFavorites(userFavs.map((f: any) => f.property_id));
            }
        } catch (err) { console.error(err); }
    };

    const loadOccupancyData = async () => {
        try {
            if (!session?.user) {
                console.log("loadOccupancyData: No session user");
                return;
            }
            console.log("loadOccupancyData: Fetching for user:", session.user.id);

            // 1. Check if user is a family member via API (bypasses RLS)
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (API_URL) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 8000);
                    const fmRes = await fetch(`${API_URL}api/family-members?member_id=${session.user.id}`, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (fmRes.ok) {
                        const fmData = await fmRes.json();
                        if (fmData.occupancy) {
                            console.log("loadOccupancyData: User is a family member.");
                            setIsFamilyMember(true);
                            setOccupancy(fmData.occupancy);
                            setPendingPayments(fmData.pendingPayments || []);
                            setPaymentHistory(fmData.paymentHistory || []);
                            setTenantBalance(fmData.tenantBalance || 0);
                            setLastPayment(fmData.lastPaidBill || null);
                            setSecurityDepositPaid(fmData.securityDepositPaid || false);
                            if (fmData.allPaidBills) setFamilyPaidBills(fmData.allPaidBills);

                            if (fmData.occupancy.contract_end_date) {
                                const endDate = new Date(fmData.occupancy.contract_end_date);
                                const today = new Date();
                                const diffDays = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                setDaysUntilContractEnd(diffDays);
                            }
                            // Calculate financials
                            calculateNextPayment(fmData.occupancy.id, fmData.occupancy, fmData.pendingPayments || [], fmData.allPaidBills || []);
                            return; // Stop here for family members
                        }
                    }
                } catch (err) {
                    console.error('Family member check error:', err);
                }
            }

            // 2. Not a family member, proceed normally
            setIsFamilyMember(false);
            const { data: occs, error } = await supabase.from('tenant_occupancies')
                .select('*, property:properties(*), landlord:profiles!tenant_occupancies_landlord_id_fkey(*)')
                .eq('tenant_id', session.user.id)
                .in('status', ['active', 'pending_end', 'approved', 'signed'])
                .order('start_date', { ascending: false });

            if (error) {
                console.error("loadOccupancyData Error:", error);
                return;
            }

            console.log("Fetched occupancies:", occs?.length);
            if (occs && occs.length > 0) {
                occs.forEach((o, i) => console.log(`[${i}] Status: ${o.status}, Start: ${o.start_date}, Prop: ${o.property?.title}`));
            }

            // Filter out occupancies with missing or deleted properties
            const validOccs = occs?.filter((o: any) => o.property && !o.property.is_deleted) || [];

            // Prioritize Active/Pending_End -> Then Approved/Signed
            // Sort by start_date desc to get latest if multiple exist in same category
            const activeOrPending = validOccs.filter((o: any) => o.status === 'active' || o.status === 'pending_end');
            const signedOrApproved = validOccs.filter((o: any) => o.status === 'approved' || o.status === 'signed');

            // Pick the best candidate:
            // 1. Latest Active/Pending
            // 2. Latest Signed/Approved (if no active)
            let finalOcc = null;
            if (activeOrPending.length > 0) {
                finalOcc = activeOrPending.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
            } else if (signedOrApproved.length > 0) {
                finalOcc = signedOrApproved.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())[0];
            }

            const occ = finalOcc;

            console.log("Selected Occ:", occ?.id, occ?.status, occ?.property?.title);

            // Handle images possibly being a string
            if (occ && occ.property && typeof occ.property.images === 'string') {
                try {
                    occ.property.images = JSON.parse(occ.property.images);
                } catch (e) {
                    occ.property.images = [];
                }
            }

            setOccupancy(occ);

            if (occ) {
                // Contract End Logic
                if (occ.contract_end_date) {
                    console.log("Found contract end date:", occ.contract_end_date);
                    // Match website's INLINE JSX calculation (TenantDashboard.js line 1700-1702)
                    // Website does NOT use setHours normalization - raw date diff + Math.floor
                    const endDate = new Date(occ.contract_end_date);
                    const today = new Date();
                    const diffDays = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    console.log("Calculated days until end:", diffDays);
                    setDaysUntilContractEnd(diffDays);
                    setCanRenew(diffDays > 29 && !occ.renewal_requested);
                    setRenewalRequested(occ.renewal_requested || false);
                } else {
                    console.log("No contract end date found");
                }

                // Financials
                await loadFinancials(occ.id, occ);
                checkLastMonthDepositLogic(occ);
            }
        } catch (err) {
            console.error("loadOccupancyData Exception:", err);
        }
    };

    const loadFinancials = async (occupancyId: string, occData: any) => {
        // --- PENDING PAYMENTS ---
        // Load pending payments matching website logic (loadPendingPayments)
        const { data: pendingData } = await supabase.from('payment_requests')
            .select('*')
            .eq('tenant', session.user.id)
            .neq('status', 'paid')
            .neq('status', 'cancelled')
            .order('due_date', { ascending: true });

        // Filter to this occupancy or null (matching website logic)
        const pending = (pendingData || []).filter((b: any) =>
            b.occupancy_id === occupancyId || !b.occupancy_id
        );
        setPendingPayments(pending);

        // --- PAYMENT HISTORY ---
        // Fetch ALL paid bills for this tenant, then filter client-side
        // using website's smart filter (calculateNextPayment lines 474-485):
        // Include bills with matching occupancy_id OR null occupancy_id with matching property_id
        // Exclude bills belonging to a DIFFERENT occupancy
        const { data: allPaidBills } = await supabase.from('payment_requests')
            .select('*')
            .eq('tenant', session.user.id)
            .eq('status', 'paid')
            .order('due_date', { ascending: true });

        const occupancyHistory = (allPaidBills || []).filter((bill: any) => {
            // If bill has an occupancy_id that doesn't match current, EXCLUDE
            if (occupancyId && bill.occupancy_id && bill.occupancy_id !== occupancyId) return false;
            // Match by occupancy_id
            if (occupancyId && bill.occupancy_id === occupancyId) return true;
            // Match by property_id if bill has no occupancy_id (e.g. legacy/auto-created bills)
            if (occData.property_id && bill.property_id === occData.property_id && !bill.occupancy_id) return true;
            return false;
        });
        setPaymentHistory(occupancyHistory);

        // Total Paid Calculation
        const totalPaid = occupancyHistory.reduce((sum: number, p: any) => sum + (Number(p.rent_amount) || 0), 0);
        setTotalRentPaid(totalPaid);

        // Balance
        const { data: balance } = await supabase.from('tenant_balances')
            .select('amount')
            .eq('tenant_id', session.user.id)
            .eq('occupancy_id', occupancyId)
            .maybeSingle();
        setTenantBalance(balance?.amount || 0);

        // --- LAST PAYMENT ---
        // Match website query (loadTenantOccupancy lines 1061-1072):
        // Direct query with strict occupancy_id, rent_amount > 0, ordered by due_date DESC
        const { data: lastPaidBill } = await supabase.from('payment_requests')
            .select('*')
            .eq('tenant', session.user.id)
            .eq('occupancy_id', occupancyId)
            .eq('status', 'paid')
            .gt('rent_amount', 0)
            .order('due_date', { ascending: false })
            .limit(1)
            .maybeSingle();
        setLastPayment(lastPaidBill);

        // --- SECURITY DEPOSIT ---
        const { data: allBills } = await supabase.from('payment_requests')
            .select('*')
            .eq('tenant', session.user.id)
            .eq('occupancy_id', occupancyId)
            .neq('status', 'cancelled');

        const bills = allBills || [];
        const depositBills = bills.filter((h: any) => Number(h.security_deposit_amount) > 0);

        const paidBill = depositBills.find((b: any) => b.status === 'paid');
        const processingBill = depositBills.find((b: any) => b.status === 'pending_confirmation');

        setSecurityDepositProcessing(!!processingBill && !paidBill);
        setSecurityDepositPaid(!!paidBill);

        if (!paidBill && !processingBill) {
            const paidDep = occupancyHistory.some((h: any) => Number(h.security_deposit_amount) > 0);
            setSecurityDepositPaid(!!paidDep);
        }
    };

    // --- LOGIC: NEXT BILL & DEPOSIT ---

    const checkLastMonthDepositLogic = async (occupancy: any) => {
        if (!occupancy.contract_end_date) return;
        const endDate = new Date(occupancy.contract_end_date);
        const today = new Date();
        endDate.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
        // Use Math.floor to match website calculation
        const diffDays = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const renewalActive = occupancy.renewal_requested || occupancy.renewal_status === 'pending' || occupancy.renewal_status === 'approved';

        if (diffDays <= 28 && diffDays > 0 && !renewalActive) {
            const rentAmount = Number(occupancy.property?.price || 0);
            const depositUsed = Number(occupancy.security_deposit_used || 0);
            const availableDeposit = Number(occupancy.security_deposit || 0) - depositUsed;

            // Check existing bills last 45 days
            const windowStart = new Date(endDate);
            windowStart.setDate(windowStart.getDate() - 40);
            const { data: existingBills } = await supabase.from('payment_requests')
                .select('*')
                .eq('occupancy_id', occupancy.id)
                .gte('due_date', windowStart.toISOString().split('T')[0])
                .gt('rent_amount', 0);

            if (existingBills && existingBills.length > 0) return;

            if (availableDeposit >= rentAmount) {
                // Pay with deposit
                await supabase.from('payment_requests').insert({
                    tenant: session.user.id,
                    property_id: occupancy.property_id,
                    occupancy_id: occupancy.id,
                    rent_amount: rentAmount,
                    status: 'paid', description: 'Last Month Rent (Deposit)', due_date: new Date().toISOString()
                });
                await supabase.from('tenant_occupancies').update({ security_deposit_used: depositUsed + rentAmount }).eq('id', occupancy.id);
                createNotification(session.user.id, 'payment_paid', 'Last month rent paid via Security Deposit', { actor: session.user.id });
                Alert.alert('Info', 'Last month rent paid using Security Deposit.');
                loadFinancials(occupancy.id, occupancy);
            } else {
                // Emergency Bill
                if (availableDeposit > 0) {
                    await supabase.from('tenant_occupancies').update({ security_deposit_used: depositUsed + availableDeposit }).eq('id', occupancy.id);
                }
                const lack = rentAmount - availableDeposit;
                await supabase.from('payment_requests').insert({
                    tenant: session.user.id,
                    property_id: occupancy.property_id,
                    occupancy_id: occupancy.id,
                    rent_amount: lack, status: 'pending', description: 'Emergency Bill: Last Month Balance', due_date: new Date().toISOString()
                });
                Alert.alert('Notice', `Emergency Bill generated: ₱${lack.toLocaleString()}`);
                loadFinancials(occupancy.id, occupancy);
            }
        }
    };

    const calculateNextPayment = async (occupancyId: string, currentOccupancy: any, overridePending?: any[], overridePaid?: any[]) => {
        // ========== PORTED FROM WEBSITE calculateNextPayment ==========
        // This matches the website's full logic for accuracy

        // 1. Check for pending bills
        let allPendingBills = overridePending;
        if (!allPendingBills && !isFamilyMember) {
            const { data } = await supabase
                .from('payment_requests')
                .select('due_date, is_move_in_payment, is_renewal_payment, occupancy_id, property_id, status')
                .eq('tenant', session.user.id)
                .eq('status', 'pending')
                .gt('rent_amount', 0)
                .order('due_date', { ascending: true });
            allPendingBills = data || [];
        }

        let pendingBill: any = null;
        if (allPendingBills && allPendingBills.length > 0) {
            pendingBill = allPendingBills.find((bill: any) => {
                if (occupancyId && bill.occupancy_id === occupancyId) return true;
                if (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) return true;
                if (!bill.occupancy_id && currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id) return true;
                return false;
            });
            if (!pendingBill && allPendingBills.length > 0) {
                pendingBill = allPendingBills[0];
            }
        }

        // 2. Get ALL paid/confirming bills
        let allPaidBills = overridePaid || familyPaidBills;
        if ((!allPaidBills || allPaidBills.length === 0) && !isFamilyMember) {
            const { data } = await supabase
                .from('payment_requests')
                .select('due_date, rent_amount, advance_amount, is_renewal_payment, is_advance_payment, is_move_in_payment, property_id, occupancy_id, status')
                .eq('tenant', session.user.id)
                .in('status', ['paid', 'pending_confirmation'])
                .gt('rent_amount', 0)
                .order('due_date', { ascending: false });
            allPaidBills = data || [];
        }

        // Filter to only bills for this occupancy (STRICT filter like website)
        let filteredBills: any[] = [];
        if (allPaidBills && allPaidBills.length > 0) {
            filteredBills = allPaidBills.filter((bill: any) => {
                if (occupancyId && bill.occupancy_id && bill.occupancy_id !== occupancyId) return false;
                if (occupancyId && bill.occupancy_id === occupancyId) return true;
                if (currentOccupancy?.property_id && bill.property_id === currentOccupancy.property_id && !bill.occupancy_id) return true;
                return false;
            });
        }

        // Prioritize bills with advance_amount (like website)
        const lastBill = filteredBills?.find((bill: any) => bill.advance_amount > 0 && bill.is_renewal_payment) ||
            filteredBills?.find((bill: any) => bill.advance_amount > 0) ||
            filteredBills?.[0];

        // 3. CRITICAL: For newly assigned tenants with NO paid bills
        if (!lastBill) {
            if (pendingBill && pendingBill.due_date && pendingBill.is_renewal_payment !== true) {
                const formattedDate = new Date(pendingBill.due_date).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                });
                setNextPaymentDate(formattedDate);
                setLastRentPeriod("N/A");
                return;
            }
            // Fallback: use start_date
            if (currentOccupancy?.start_date) {
                const formattedDate = new Date(currentOccupancy.start_date).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                });
                setNextPaymentDate(formattedDate);
                setLastRentPeriod("N/A");
                return;
            }
        }

        const baseDateString = currentOccupancy?.start_date;

        if (baseDateString) {
            const startDate = new Date(baseDateString);
            let nextDue: Date;

            if (lastBill && lastBill.due_date) {
                const rentAmount = parseFloat(lastBill.rent_amount || 0);
                const advanceAmount = parseFloat(lastBill.advance_amount || 0);

                let monthsCovered = 1;
                if (rentAmount > 0 && advanceAmount > 0) {
                    monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
                }

                // Preserve day of month (matching website logic)
                nextDue = new Date(lastBill.due_date);
                if (isNaN(nextDue.getTime())) {
                    nextDue = new Date(startDate);
                } else {
                    const currentMonth = nextDue.getMonth();
                    const currentYear = nextDue.getFullYear();
                    const currentDay = nextDue.getDate();

                    const targetMonth = currentMonth + monthsCovered;
                    const targetYear = currentYear + Math.floor(targetMonth / 12);
                    let finalMonth = targetMonth % 12;
                    if (finalMonth < 0) finalMonth += 12;

                    nextDue.setFullYear(targetYear);
                    nextDue.setMonth(finalMonth);
                    nextDue.setDate(currentDay);
                }

                // Set calculated date
                if (nextDue && !isNaN(nextDue.getTime())) {
                    const formattedNextDue = nextDue.toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                    });

                    // Check contract end
                    if (currentOccupancy.contract_end_date && lastBill) {
                        const endDate = new Date(currentOccupancy.contract_end_date);
                        const isMoveInPayment = lastBill.is_move_in_payment === true;

                        let monthsCoveredByPayment = 1;
                        if (rentAmount > 0 && advanceAmount > 0) {
                            monthsCoveredByPayment = 1 + Math.floor(advanceAmount / rentAmount);
                        }

                        const paidPeriodEnd = new Date(lastBill.due_date);
                        paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCoveredByPayment);

                        // Move-in payments only cover first month, never show "All Paid"
                        if (isMoveInPayment) {
                            setNextPaymentDate(formattedNextDue);
                            const lastDate = new Date(lastBill.due_date);
                            setLastRentPeriod(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                            return;
                        }

                        if (paidPeriodEnd >= endDate) {
                            // Check for any remaining pending bills before declaring "All Paid"
                            if (pendingBill && pendingBill.due_date) {
                                setNextPaymentDate(new Date(pendingBill.due_date).toLocaleDateString('en-US', {
                                    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                                }));
                                setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                                return;
                            }
                            setNextPaymentDate("All Paid - Contract Ending");
                            setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                            return;
                        }
                    }

                    setNextPaymentDate(formattedNextDue);
                    if (lastBill) {
                        const lastDate = new Date(lastBill.due_date);
                        setLastRentPeriod(lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                    } else {
                        setLastRentPeriod("N/A");
                    }
                    return;
                }
            } else {
                // No lastBill found — check pending bills for newly assigned tenants
                if (pendingBill && pendingBill.due_date && pendingBill.is_renewal_payment !== true) {
                    setNextPaymentDate(new Date(pendingBill.due_date).toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
                    }));
                    setLastRentPeriod("N/A");
                    return;
                }
                nextDue = new Date(startDate);
            }

            // Contract end check for edge cases
            if (currentOccupancy.contract_end_date && lastBill) {
                const endDate = new Date(currentOccupancy.contract_end_date);
                if (nextDue! >= endDate) {
                    const rentAmount = parseFloat(lastBill.rent_amount || 0);
                    const advanceAmount = parseFloat(lastBill.advance_amount || 0);
                    let monthsCoveredByPayment = 1;
                    if (rentAmount > 0 && advanceAmount > 0) {
                        monthsCoveredByPayment = 1 + Math.floor(advanceAmount / rentAmount);
                    }
                    const paidPeriodEnd = new Date(lastBill.due_date);
                    paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCoveredByPayment);

                    if (paidPeriodEnd >= endDate) {
                        const today = new Date();
                        const daysDiff = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysDiff > 45) {
                            // Contract end far away — probably sync issue, show calculated date
                            setNextPaymentDate(nextDue!.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));
                            setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                            return;
                        }
                        setNextPaymentDate("All Paid - Contract Ending");
                        setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
                        return;
                    }
                }
            }

            // Fallback: use nextDue
            setNextPaymentDate(nextDue!.toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
            }));
            if (lastBill) {
                setLastRentPeriod(new Date(lastBill.due_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
            } else {
                setLastRentPeriod("N/A");
            }
        } else {
            // No start_date
            if (lastBill && lastBill.due_date) {
                const rentAmount = parseFloat(lastBill.rent_amount || 0);
                const advanceAmount = parseFloat(lastBill.advance_amount || 0);
                let monthsCovered = 1;
                if (rentAmount > 0 && advanceAmount > 0) {
                    monthsCovered = 1 + Math.floor(advanceAmount / rentAmount);
                }

                const d = new Date(lastBill.due_date);
                const currentMonth = d.getMonth();
                const currentYear = d.getFullYear();
                const currentDay = d.getDate();

                const targetMonth = currentMonth + monthsCovered;
                const targetYear = currentYear + Math.floor(targetMonth / 12);
                let finalMonth = targetMonth % 12;
                if (finalMonth < 0) finalMonth += 12;

                d.setFullYear(targetYear);
                d.setMonth(finalMonth);
                d.setDate(currentDay);

                if (currentOccupancy?.contract_end_date) {
                    const endDate = new Date(currentOccupancy.contract_end_date);
                    const paidPeriodEnd = new Date(lastBill.due_date);
                    paidPeriodEnd.setMonth(paidPeriodEnd.getMonth() + monthsCovered);
                    if (paidPeriodEnd >= endDate) {
                        setNextPaymentDate("All Paid - Contract Ending");
                        return;
                    }
                }

                setNextPaymentDate(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }));
            } else {
                setNextPaymentDate("N/A");
            }
        }
    };

    // --- FAMILY MEMBERS FUNCTIONS ---

    const loadFamilyMembers = async () => {
        if (!occupancy) return;
        const occId = occupancy.is_family_member ? occupancy.parent_occupancy_id : occupancy.id;
        if (!occId) return;

        setLoadingFamily(true);
        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (API_URL) {
                const res = await fetch(`${API_URL}api/family-members?occupancy_id=${occId}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.members) setFamilyMembers(data.members);
                }
            }
        } catch (err) {
            console.error('Failed to load family members:', err);
        }
        setLoadingFamily(false);
    };

    useEffect(() => {
        if (occupancy) {
            loadFamilyMembers();
        }
    }, [occupancy]);

    const searchFamilyMember = async (query: string) => {
        if (!query || query.trim().length < 2) {
            setFamilySearchResults([]);
            return;
        }
        setFamilySearching(true);
        try {
            const excludeIds = [session.user.id, ...familyMembers.map((m: any) => m.member_id)];
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (API_URL) {
                const res = await fetch(`${API_URL}api/family-members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'search', query: query.trim(), exclude_ids: excludeIds })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.results) setFamilySearchResults(data.results);
                }
            }
        } catch (err) {
            console.error('Family search error:', err);
        }
        setFamilySearching(false);
    };

    useEffect(() => {
        if (!familySearchQuery.trim()) {
            setFamilySearchResults([]);
            return;
        }
        const timer = setTimeout(() => searchFamilyMember(familySearchQuery), 400);
        return () => clearTimeout(timer);
    }, [familySearchQuery]);

    const addFamilyMember = async (memberId: string) => {
        if (!occupancy || isFamilyMember) return;
        setAddingMember(memberId);
        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (API_URL) {
                const res = await fetch(`${API_URL}api/family-members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'add',
                        parent_occupancy_id: occupancy.id,
                        member_id: memberId,
                        mother_id: session.user.id
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        Alert.alert('Success', 'Family member added successfully!');
                        setFamilySearchQuery('');
                        setFamilySearchResults([]);
                        loadFamilyMembers();
                    } else {
                        Alert.alert('Error', data.error || 'Failed to add family member');
                    }
                } else {
                    Alert.alert('Error', 'Failed to add family member. Server error.');
                }
            }
        } catch (err) {
            console.error('Add family member error:', err);
            Alert.alert('Error', 'Failed to add family member');
        }
        setAddingMember(null);
    };

    const removeFamilyMember = async (familyMemberId: string) => {
        if (!occupancy || isFamilyMember) return;
        setRemovingMember(familyMemberId);
        try {
            const API_URL = process.env.EXPO_PUBLIC_API_URL;
            if (API_URL) {
                const res = await fetch(`${API_URL}api/family-members`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        family_member_id: familyMemberId,
                        mother_id: session.user.id
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        Alert.alert('Success', 'Family member removed');
                        loadFamilyMembers();
                    } else {
                        Alert.alert('Error', data.error || 'Failed to remove family member');
                    }
                } else {
                    Alert.alert('Error', 'Failed to remove family member. Server error.');
                }
            }
        } catch (err) {
            console.error('Remove family member error:', err);
            Alert.alert('Error', 'Failed to remove family member');
        }
        setRemovingMember(null);
        setConfirmRemoveMember(null);
    };

    // --- ACTIONS ---

    const requestContractRenewal = async () => {
        if (isFamilyMember) return Alert.alert('Error', 'Only the primary tenant can renew the contract.');
        if (!renewalMeetingDate) return Alert.alert('Error', 'Select a date');
        const { error } = await supabase.from('tenant_occupancies').update({
            renewal_requested: true,
            renewal_requested_at: new Date().toISOString(),
            renewal_status: 'pending',
            renewal_meeting_date: renewalMeetingDate
        }).eq('id', occupancy.id);

        if (!error) {
            // Create Notification
            createNotification(occupancy.landlord_id, 'contract_renewal_request', `Tenant requested contract renewal. Proposed signing date: ${renewalMeetingDate}`, { actor: session.user.id, email: true, sms: true });

            Alert.alert('Sent', 'Renewal request sent.');
            setShowRenewalModal(false);
            loadOccupancyData();
        } else Alert.alert('Error', error.message);
    };

    const requestEndOccupancy = async () => {
        if (isFamilyMember) return Alert.alert('Error', 'Only the primary tenant can end the contract.');
        if (!occupancy || !endRequestDate || !endRequestReason) return Alert.alert('Error', 'Fill all fields');
        setSubmittingEndRequest(true);
        try {
            console.log('requestEndOccupancy: Updating occupancy', occupancy.id);
            const { data, error } = await supabase.from('tenant_occupancies').update({
                status: 'pending_end',
                end_requested_at: new Date().toISOString(),
                end_request_reason: endRequestReason.trim(),
                end_request_date: endRequestDate,
                end_request_status: 'pending'
            }).eq('id', occupancy.id).select();

            if (error) {
                console.error('requestEndOccupancy: Update error:', error);
                Alert.alert('Error', `Failed to submit: ${error.message}`);
                setSubmittingEndRequest(false);
                return;
            }

            console.log('requestEndOccupancy: Update success, data:', data);

            // Send notification to landlord
            try {
                const tenantName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
                await createNotification(
                    occupancy.landlord_id,
                    'end_occupancy_request',
                    `${tenantName || 'A tenant'} requested to end occupancy on ${endRequestDate}. Reason: ${endRequestReason.trim().substring(0, 50)}`,
                    { actor: session.user.id }
                );
                console.log('requestEndOccupancy: Notification sent to landlord', occupancy.landlord_id);
            } catch (notifErr) {
                console.error('requestEndOccupancy: Notification error:', notifErr);
                // Don't block the flow — the update already succeeded
            }

            Alert.alert('Sent', 'End request sent.');
            setEndRequestModalVisible(false);
            setEndRequestReason('');
            setEndRequestDate('');
            loadOccupancyData();
        } catch (err) {
            console.error('requestEndOccupancy: Unexpected error:', err);
            Alert.alert('Error', 'Something went wrong. Please try again.');
        }
        setSubmittingEndRequest(false);
    };

    const toggleFavorite = async (id: string) => {
        if (!session) return;
        if (favorites.includes(id)) {
            setFavorites(prev => prev.filter(f => f !== id));
            await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('property_id', id);
        } else {
            setFavorites(prev => [...prev, id]);
            await supabase.from('favorites').insert({ user_id: session.user.id, property_id: id });
        }
    };

    const toggleCompare = (prop: any) => {
        setComparisonList(prev => {
            if (prev.find((p: any) => p.id === prop.id)) return prev.filter((p: any) => p.id !== prop.id);
            if (prev.length >= 3) { Alert.alert('Limit', 'Max 3 properties'); return prev; }
            return [...prev, prop];
        });
    };

    const checkPendingReviews = async () => {
        if (!session?.user) return;
        // Don't show review modal again if user already skipped it this session
        if (reviewSkippedThisSession.current) return;
        try {
            const { data: ended } = await supabase.from('tenant_occupancies').select('*, property:properties(title, id, address, city)').eq('tenant_id', session.user.id).eq('status', 'ended');
            const { data: reviews } = await supabase.from('reviews').select('occupancy_id').eq('user_id', session.user.id);
            const reviewedIds = reviews?.map((r: any) => r.occupancy_id) || [];

            const dismissedStr = await AsyncStorage.getItem('dismissedReviews');
            const dismissedReviews = dismissedStr ? JSON.parse(dismissedStr) : [];
            const dismissedStrings = dismissedReviews.map((id: any) => String(id));

            const unreviewed = ended?.find((o: any) => !reviewedIds.includes(o.id) && !dismissedStrings.includes(String(o.property_id)));

            if (unreviewed) {
                setReviewTarget(unreviewed);
                setReviewModalVisible(true);
            }
        } catch (e) {
            console.error("Error checking pending reviews:", e);
        }
    };

    const submitReview = async () => {
        if (!reviewTarget) return;
        setSubmittingReview(true);
        const overallRating = Math.round((cleanlinessRating + communicationRating + locationRating) / 3);
        const { error } = await supabase.from('reviews').insert({
            property_id: reviewTarget.property_id, user_id: session.user.id, tenant_id: session.user.id, occupancy_id: reviewTarget.id,
            rating: overallRating, cleanliness_rating: cleanlinessRating, communication_rating: communicationRating, location_rating: locationRating,
            comment: reviewComment, created_at: new Date().toISOString()
        });
        setSubmittingReview(false);
        if (!error) { Alert.alert('Success', 'Review submitted'); setReviewModalVisible(false); checkPendingReviews(); }
    };

    const handleSkipReview = async () => {
        // Always mark as skipped for this session so it won't reappear on realtime updates
        reviewSkippedThisSession.current = true;

        if (dontShowAgain && reviewTarget) {
            try {
                const dismissedStr = await AsyncStorage.getItem('dismissedReviews');
                const dismissed = dismissedStr ? JSON.parse(dismissedStr) : [];
                // Ensure array of strings
                const dismissedStrings = dismissed.map((id: any) => String(id));
                const targetId = String(reviewTarget.property_id);

                if (!dismissedStrings.includes(targetId)) {
                    const newDismissed = [...dismissedStrings, targetId];
                    await AsyncStorage.setItem('dismissedReviews', JSON.stringify(newDismissed));
                    console.log("Saved dismissed review:", targetId, newDismissed);
                }
            } catch (e) {
                console.error("Failed to save dismissed review preference", e);
            }
        }
        setReviewModalVisible(false);
    };

    // --- RENDERS ---

    // Compute Top Rated & Most Favorite property IDs
    const statsArray = Object.values(propertyStats) as any[];
    const mostFavId = statsArray.filter((s: any) => (s.favorite_count || 0) > 0).sort((a: any, b: any) => b.favorite_count - a.favorite_count)[0]?.property_id || null;
    const topRatedId = statsArray.filter((s: any) => (s.review_count || 0) > 0).sort((a: any, b: any) => (b.avg_rating || 0) - (a.avg_rating || 0) || b.review_count - a.review_count)[0]?.property_id || null;

    const renderCard = (item: any) => {
        const isFav = favorites.includes(item.id);
        const isCompare = comparisonList.some(c => c.id === item.id);
        const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 };
        return (
            <TouchableOpacity key={item.id} style={[styles.card, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]} activeOpacity={0.9} onPress={() => router.push(`/properties/${item.id}` as any)}>
                <View style={styles.cardImageContainer}>
                    <Image source={{ uri: item.images?.[0] || 'https://via.placeholder.com/400' }} style={styles.cardImage} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.cardGradient} />
                    <View style={styles.cardHeader}>
                        <View style={[styles.badge, item.status === 'available' ? styles.badgeAvailable : styles.badgeOccupied]}>
                            <Text style={[styles.badgeText, item.status === 'available' ? styles.textDark : styles.textWhite]}>{item.status === 'available' ? 'Available' : 'Occupied'}</Text>
                        </View>
                        {stats.favorite_count >= 1 && <View style={[styles.badge, styles.badgeFav]}><Ionicons name="heart" size={10} color="white" /><Text style={[styles.badgeText, styles.textWhite, { marginLeft: 2 }]}>{stats.favorite_count}</Text></View>}
                        {topRatedId === item.id && (
                            <View style={[styles.badge, { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }]}>
                                <Ionicons name="trophy" size={10} color="#d97706" />
                                <Text style={[styles.badgeText, { color: '#d97706', marginLeft: 3 }]}>Top Rated</Text>
                            </View>
                        )}
                        {mostFavId === item.id && (
                            <View style={[styles.badge, { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' }]}>
                                <Ionicons name="heart" size={10} color="#e11d48" />
                                <Text style={[styles.badgeText, { color: '#e11d48', marginLeft: 3 }]}>Most Favorite</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.cardActions}>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id) }} style={styles.actionBtn}><Ionicons name={isFav ? "heart" : "heart-outline"} size={18} color={isFav ? "#ef4444" : "#666"} /></TouchableOpacity>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleCompare(item) }} style={[styles.actionBtn, { marginTop: 8 }, isCompare && styles.actionBtnActive]}><Ionicons name={isCompare ? "checkmark" : "add"} size={18} color={isCompare ? "white" : "#666"} /></TouchableOpacity>
                    </View>
                    <View style={styles.priceOverlay}><Text style={styles.priceText}>₱{Number(item.price).toLocaleString()}</Text><Text style={styles.priceSub}>/mo</Text></View>
                </View>
                <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: isDark ? colors.text : '#111' }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.cardLocation, { color: isDark ? colors.textMuted : '#9ca3af' }]}>{item.city}, Philippines</Text>
                    <View style={[styles.featureRow, { borderTopColor: isDark ? colors.border : '#f3f4f6' }]}>
                        <View style={styles.featureItem}><Ionicons name="bed-outline" size={14} color={isDark ? colors.textSecondary : '#666'} /><Text style={[styles.featureText, { color: isDark ? colors.textSecondary : '#666' }]}>{item.bedrooms}</Text></View>
                        <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#e5e7eb' }]} />
                        <View style={styles.featureItem}><Ionicons name="water-outline" size={14} color={isDark ? colors.textSecondary : '#666'} /><Text style={[styles.featureText, { color: isDark ? colors.textSecondary : '#666' }]}>{item.bathrooms}</Text></View>
                        <View style={[styles.divider, { backgroundColor: isDark ? colors.border : '#e5e7eb' }]} />
                        <View style={styles.featureItem}><Ionicons name="resize-outline" size={14} color={isDark ? colors.textSecondary : '#666'} /><Text style={[styles.featureText, { color: isDark ? colors.textSecondary : '#666' }]}>{item.area_sqft} sqm</Text></View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#f8fafc' }]}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 }}>
                    <ActivityIndicator size="large" color={isDark ? colors.text : '#111827'} />
                    <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '600', color: isDark ? colors.textSecondary : '#4b5563' }}>Loading your dashboard...</Text>
                    <Text style={{ marginTop: 6, fontSize: 12, color: isDark ? colors.textMuted : '#9ca3af' }}>Fetching property & payment data</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#f8fafc' }]}>
            <ScrollView contentContainerStyle={{ paddingBottom: 130 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

                {occupancy ? (
                    <View style={styles.dashboardContent}>
                        {/* Header */}
                        <View style={styles.headerRow}>
                            <View>
                                <Text style={[styles.headerTitle, { color: isDark ? colors.text : '#111' }]}>Your Active Property</Text>
                                <Text style={[styles.headerSubtitle, { color: isDark ? colors.textSecondary : '#666' }]}>Manage your lease & payments.</Text>
                            </View>
                        </View>

                        {/* 1. Main Property Card */}
                        <View style={[styles.activeCard, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#eee' }]}>
                            <View style={styles.activeImageContainer}>
                                <Image
                                    source={{ uri: occupancy.property?.images?.[activePropertyImageIndex] || 'https://via.placeholder.com/600' }}
                                    style={styles.activeImage}
                                />
                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.activeGradient} />

                                <View style={styles.activeBadge}>
                                    <View style={[styles.statusDot, occupancy.status === 'pending_end' ? { backgroundColor: '#f59e0b' } : { backgroundColor: '#10b981' }]} />
                                    <Text style={styles.activeBadgeText}>{occupancy.status === 'pending_end' ? 'Move-out Pending' : 'Active Lease'}</Text>
                                </View>

                                {/* Title Overlay */}
                                <View style={styles.activeInfoOverlay}>
                                    <Text style={styles.activeTitle} numberOfLines={1}>{occupancy.property?.title}</Text>
                                    <Text style={styles.activeAddress} numberOfLines={1}>{occupancy.property?.address}, {occupancy.property?.city}</Text>
                                </View>

                                {/* Slider Dots */}
                                {occupancy.property?.images?.length > 1 && (
                                    <View style={styles.sliderDots}>
                                        {occupancy.property.images.map((_: any, i: number) => (
                                            <View key={i} style={[styles.dot, i === activePropertyImageIndex && styles.dotActive]} />
                                        ))}
                                    </View>
                                )}
                            </View>

                            <View style={[styles.activeContent, { backgroundColor: isDark ? colors.card : 'white' }]}>
                                <View style={[styles.leaseRow, { borderBottomColor: isDark ? colors.border : '#f3f4f6' }]}>
                                    <View style={styles.leaseItem}>
                                        <Text style={[styles.leaseLabel, { color: isDark ? colors.textMuted : '#9ca3af' }]}>LEASE START</Text>
                                        <Text style={[styles.leaseValue, { color: isDark ? colors.text : '#111' }]}>{new Date(occupancy.start_date).toLocaleDateString()}</Text>
                                    </View>
                                    {occupancy.contract_end_date && (
                                        <View style={[styles.leaseItem, { alignItems: 'flex-end' }]}>
                                            <Text style={[styles.leaseLabel, { color: isDark ? colors.textMuted : '#9ca3af' }]}>LEASE END</Text>
                                            <Text style={[styles.leaseValue, { color: isDark ? colors.text : '#111' }]}>{new Date(occupancy.contract_end_date).toLocaleDateString()}</Text>
                                            {daysUntilContractEnd !== null && (
                                                <Text style={{ fontSize: 10, color: '#ea580c', fontWeight: 'bold', marginTop: 2 }}>
                                                    Ends in {daysUntilContractEnd} days
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.gridActions}
                                >
                                    <TouchableOpacity style={[styles.gridBtn, { backgroundColor: isDark ? colors.surface : '#f3f4f6' }]} onPress={() => router.push(`/properties/${occupancy.property?.id}` as any)}>
                                        <Text style={[styles.btnTextGray, { color: isDark ? colors.text : '#374151' }]}>View Details</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.gridBtn, occupancy.contract_url ? styles.btnBlack : { backgroundColor: isDark ? colors.surface : '#f3f4f6' }]}
                                        disabled={!occupancy.contract_url}
                                        onPress={() => occupancy.contract_url && Linking.openURL(occupancy.contract_url)}
                                    >
                                        <Ionicons name="document-text-outline" size={16} color={occupancy.contract_url ? "white" : (isDark ? colors.textMuted : "#999")} style={{ marginRight: 4 }} />
                                        <Text style={occupancy.contract_url ? styles.btnTextWhite : [styles.btnTextDisabled, { color: isDark ? colors.textMuted : '#9ca3af' }]}>
                                            {occupancy.contract_url ? "View Contract" : "Contract Pending"}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                                {!isFamilyMember && (
                                    <View style={[styles.gridActions, { marginTop: 8 }]}>
                                        {canRenew ? (
                                            <TouchableOpacity style={[styles.gridBtn, { borderWidth: 1, borderColor: isDark ? colors.cardBorder : '#e5e7eb', backgroundColor: isDark ? colors.surface : 'white' }]} onPress={() => setShowRenewalModal(true)}>
                                                <Ionicons name="refresh" size={16} color={isDark ? colors.text : 'black'} style={{ marginRight: 4 }} />
                                                <Text style={[styles.btnTextBlack, { color: isDark ? colors.text : '#111' }]}>Renew Contract</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View style={[styles.gridBtn, { backgroundColor: isDark ? colors.surface : '#f3f4f6' }]}><Text style={[styles.btnTextDisabled, { color: isDark ? colors.textMuted : '#9ca3af' }]}>Renew Unavailable</Text></View>
                                        )}
                                        <TouchableOpacity style={[styles.gridBtn, { borderWidth: 1, borderColor: isDark ? 'rgba(254,202,202,0.3)' : '#fecaca', backgroundColor: isDark ? 'rgba(254,242,242,0.08)' : '#fef2f2' }]} onPress={() => setEndRequestModalVisible(true)}>
                                            <Text style={styles.btnTextRed}>End Contract</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {occupancy.property?.terms_conditions ? (
                                    <TouchableOpacity
                                        style={[styles.gridBtn, { marginTop: 8, backgroundColor: isDark ? colors.surface : '#f3f4f6', borderWidth: 1, borderColor: isDark ? colors.cardBorder : '#e5e7eb', width: '100%' }]}
                                        onPress={() => {
                                            const terms = occupancy.property.terms_conditions;
                                            if (typeof terms === 'string' && terms.startsWith('http')) {
                                                Linking.openURL(terms);
                                            } else {
                                                setShowTermsModal(true);
                                            }
                                        }}
                                    >
                                        <Ionicons name="document-text-outline" size={16} color={isDark ? colors.textSecondary : '#333'} style={{ marginRight: 6 }} />
                                        <Text style={[styles.btnTextBlack, { color: isDark ? colors.text : '#111' }]}>View Property Terms</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </View>

                        {/* 2. Security Deposit */}
                        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                            <View style={styles.cardHeaderSmall}>
                                <View style={[styles.iconCircle, { backgroundColor: isDark ? colors.badge : '#f3f4f6' }]}><Ionicons name="lock-closed-outline" size={16} color={isDark ? colors.textSecondary : '#333'} /></View>
                                <Text style={[styles.cardTitleSmall, { color: isDark ? colors.text : '#111' }]}>Security Deposit</Text>
                            </View>
                            {securityDepositPaid ? (
                                <View>
                                    <View style={styles.rowBetween}>
                                        <Text style={[styles.textLabel, { color: isDark ? colors.textMuted : '#6b7280' }]}>Total Deposit</Text>
                                        <Text style={[styles.textValueBlack, { color: isDark ? colors.text : '#000' }]}>₱{Number(occupancy.security_deposit || 0).toLocaleString()}</Text>
                                    </View>
                                    <View style={styles.rowBetween}>
                                        <Text style={styles.textLabel}>Used</Text>
                                        <Text style={styles.textValueGray}>₱{Number(occupancy.security_deposit_used || 0).toLocaleString()}</Text>
                                    </View>
                                    <View style={[styles.rowBetween, styles.borderTop, { paddingTop: 8, marginTop: 4, borderTopColor: isDark ? colors.border : '#f3f4f6' }]}>
                                        <Text style={[styles.textLabelBold, { color: isDark ? colors.text : '#374151' }]}>Remaining Balance</Text>
                                        <Text style={[styles.textValueBig, { color: isDark ? colors.text : '#111' }]}>₱{Number((occupancy.security_deposit || 0) - (occupancy.security_deposit_used || 0)).toLocaleString()}</Text>
                                    </View>
                                    {daysUntilContractEnd !== null && daysUntilContractEnd <= 30 && (
                                        <View style={styles.tipBox}><Text style={styles.tipText}>💡 Deposit can be used for last month.</Text></View>
                                    )}
                                </View>
                            ) : securityDepositProcessing ? (
                                <View style={styles.centerBox}>
                                    <Ionicons name="hourglass-outline" size={24} color="#f59e0b" style={{ marginBottom: 4 }} />
                                    <Text style={[styles.textLabel, { color: '#f59e0b', fontWeight: 'bold' }]}>Deposit Payment Processing</Text>
                                    <Text style={styles.textValueGray}>Please wait for confirmation.</Text>
                                </View>
                            ) : (
                                <View style={styles.centerBox}>
                                    <Text style={styles.textLabel}>No security deposit paid yet</Text>
                                    <Text style={styles.textValueGray}>Required: ₱{Number(occupancy.security_deposit || 0).toLocaleString()}</Text>
                                </View>
                            )}
                        </View>

                        {/* Family Members Section */}
                        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                            <View style={[styles.rowBetween, { marginBottom: 12 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <View style={[styles.iconCircle, { backgroundColor: isDark ? colors.badge : '#f3f4f6' }]}>
                                        <Ionicons name="people-outline" size={16} color={isDark ? colors.textSecondary : '#374151'} />
                                    </View>
                                    <View>
                                        <Text style={[styles.cardTitleSmall, { color: isDark ? colors.text : '#111' }]}>Family Members</Text>
                                        <Text style={{ fontSize: 10, color: isDark ? colors.textMuted : '#6b7280' }}>{familyMembers.length + 1}/5 members</Text>
                                    </View>
                                </View>
                                {!isFamilyMember && familyMembers.length < 4 && (
                                    <TouchableOpacity
                                        onPress={() => setShowFamilyModal(true)}
                                        style={{ backgroundColor: isDark ? colors.surface : '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: isDark ? colors.cardBorder : '#e5e7eb' }}
                                    >
                                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: isDark ? colors.text : '#111827' }}>+ Add Member</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Primary Tenant (Mother) */}
                            <View style={{ padding: 10, backgroundColor: isDark ? colors.surface : '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: isDark ? colors.cardBorder : '#f3f4f6', marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#4b5563', alignItems: 'center', justifyContent: 'center' }}>
                                    {isFamilyMember && occupancy?.tenant?.avatar_url ? (
                                        <Image source={{ uri: occupancy.tenant.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                                    ) : !isFamilyMember && profile?.avatar_url ? (
                                        <Image source={{ uri: profile.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                                    ) : (
                                        <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                                            {isFamilyMember ? `${occupancy?.tenant?.first_name?.[0] || ''}${occupancy?.tenant?.last_name?.[0] || ''}` : `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`}
                                        </Text>
                                    )}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: isDark ? colors.text : '#111827' }}>
                                        {isFamilyMember ? `${occupancy?.tenant?.first_name || ''} ${occupancy?.tenant?.last_name || ''}`.trim() || 'Primary Tenant' : `${profile?.first_name} ${profile?.last_name}`}
                                    </Text>
                                    <Text style={{ fontSize: 10, color: isDark ? colors.textMuted : '#6b7280', fontWeight: 'bold' }}>Primary Tenant</Text>
                                </View>
                                <View style={{ backgroundColor: isDark ? colors.surface : '#e5e7eb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                    <Text style={{ fontSize: 9, fontWeight: 'bold', color: isDark ? colors.textSecondary : '#374151' }}>Owner</Text>
                                </View>
                            </View>

                            {/* Members List */}
                            {loadingFamily ? (
                                <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 10 }} />
                            ) : familyMembers.length > 0 ? (
                                <View style={{ gap: 6 }}>
                                    {familyMembers.map((fm) => (
                                        <View key={fm.id} style={{ padding: 10, backgroundColor: isDark ? colors.surface : '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: isDark ? colors.cardBorder : '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
                                                {fm.member_profile?.avatar_url ? (
                                                    <Image source={{ uri: fm.member_profile.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                                                ) : (
                                                    <Text style={{ color: '#374151', fontSize: 10, fontWeight: 'bold' }}>
                                                        {`${fm.member_profile?.first_name?.[0] || ''}${fm.member_profile?.last_name?.[0] || ''}`}
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 12, fontWeight: 'bold', color: isDark ? colors.text : '#111827' }} numberOfLines={1}>
                                                    {fm.member_profile?.first_name} {fm.member_profile?.last_name}
                                                </Text>
                                                <Text style={{ fontSize: 10, color: isDark ? colors.textMuted : '#9ca3af' }} numberOfLines={1}>{fm.member_profile?.email}</Text>
                                            </View>
                                            {!isFamilyMember && (
                                                confirmRemoveMember === fm.id ? (
                                                    <View style={{ flexDirection: 'row', gap: 4 }}>
                                                        <TouchableOpacity onPress={() => removeFamilyMember(fm.id)} disabled={removingMember === fm.id} style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#ef4444' }}>Yes</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => setConfirmRemoveMember(null)} style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#6b7280' }}>No</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ) : (
                                                    <TouchableOpacity onPress={() => setConfirmRemoveMember(fm.id)} style={{ padding: 4 }}>
                                                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                                                    </TouchableOpacity>
                                                )
                                            )}
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>No family members added yet.</Text>
                                </View>
                            )}

                            {isFamilyMember && (
                                <View style={{ marginTop: 12, padding: 10, backgroundColor: isDark ? 'rgba(180,83,9,0.12)' : '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(180,83,9,0.25)' : '#fde68a', flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                    <Ionicons name="information-circle-outline" size={16} color={isDark ? '#fbbf24' : '#b45309'} />
                                    <Text style={{ fontSize: 10, color: isDark ? '#fbbf24' : '#b45309', fontWeight: 'bold', flex: 1 }}>You are a family member. Only the primary tenant can manage family members.</Text>
                                </View>
                            )}
                        </View>


                        {/* 4. Recent Payments */}
                        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                            <View style={[styles.rowBetween, { marginBottom: 16 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={[styles.cardTitleSmall, { color: isDark ? colors.text : '#111' }]}>Recent Payments</Text>
                                    {pendingPayments.length > 0 && <View style={styles.badgeRed}><Text style={styles.badgeRedText}>{pendingPayments.length} Pending</Text></View>}
                                </View>
                                <TouchableOpacity onPress={() => router.push('/payments' as any)}><Text style={styles.seeAllText}>See All</Text></TouchableOpacity>
                            </View>

                            {pendingPayments.length > 0 ? pendingPayments.map((bill, i) => {
                                const total = (Number(bill.rent_amount) || 0) + (Number(bill.water_bill) || 0) + (Number(bill.electrical_bill) || 0) + (Number(bill.other_bills) || 0) + (Number(bill.security_deposit_amount) || 0) + (Number(bill.advance_amount) || 0);
                                const isMoveIn = bill.is_move_in_payment || (Number(bill.security_deposit_amount) > 0);
                                return (
                                    <View key={i} style={[styles.billRow, { backgroundColor: isDark ? colors.surface : '#f8fafc', borderColor: isDark ? colors.cardBorder : '#f1f5f9' }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={[styles.billIcon, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e2e8f0' }]}><Ionicons name={bill.rent_amount > 0 ? "home-outline" : "flash-outline"} size={18} color={isDark ? colors.textSecondary : '#333'} /></View>
                                            <View>
                                                <Text style={[styles.billTitle, { color: isDark ? colors.text : '#334155' }]}>{isMoveIn ? 'Move-in Bill' : (bill.rent_amount > 0 ? 'House Rent' : 'Utility Bill')}</Text>
                                                {bill.status === 'pending_confirmation' ? (
                                                    <Text style={[styles.billDate, { color: '#f59e0b', fontWeight: 'bold' }]}>Processing Payment</Text>
                                                ) : bill.status === 'rejected' ? (
                                                    <Text style={[styles.billDate, { color: '#ef4444', fontWeight: 'bold' }]}>Payment Rejected</Text>
                                                ) : (
                                                    <Text style={styles.billDate}>Due: {new Date(bill.due_date).toLocaleDateString()}</Text>
                                                )}
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.billAmount, { color: isDark ? colors.text : '#0f172a' }]}>₱{total.toLocaleString()}</Text>
                                            {bill.status === 'pending_confirmation' ? (
                                                <View style={[styles.payBtnSmall, { backgroundColor: '#fef3c7' }]}>
                                                    <Text style={[styles.payBtnText, { color: '#d97706' }]}> verifying </Text>
                                                </View>
                                            ) : (
                                                <TouchableOpacity style={styles.payBtnSmall} onPress={() => router.push('/payments' as any)}>
                                                    <Text style={styles.payBtnText}>{bill.status === 'rejected' ? 'Retry' : 'Pay Now'}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                )
                            }) : (
                                <View style={styles.emptyStateBox}>
                                    <Ionicons name="checkmark-circle" size={32} color="#10b981" />
                                    <Text style={styles.emptyStateText}>You're all caught up!</Text>
                                </View>
                            )}
                            <Text style={styles.noteText}>Note: Landlord is not liable for late utility payments.</Text>
                        </View>

                        {/* 5. Payment Overview */}
                        <View style={[styles.borderCard, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                            <Text style={[styles.cardTitleSmall, { color: isDark ? colors.text : '#111' }]}>Payment Overview</Text>

                            {/* Credit */}
                            <View style={[styles.overviewRow, { backgroundColor: tenantBalance > 0 ? (isDark ? '#16331f' : '#f0fdf4') : (isDark ? colors.surface : '#f9fafb') }]}>
                                <View>
                                    <Text style={[styles.ovLabel, { color: isDark ? colors.textMuted : '#9ca3af' }]}>CREDIT BALANCE</Text>
                                    <Text style={[styles.ovSub, { color: isDark ? colors.textSecondary : '#4b5563' }]}>{tenantBalance > 0 ? 'Applied to next bill' : 'No credit available'}</Text>
                                </View>
                                <Text style={[styles.ovValue, { color: tenantBalance > 0 ? '#15803d' : (isDark ? colors.textMuted : '#9ca3af') }]}>₱{tenantBalance.toLocaleString()}</Text>
                            </View>

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                <View style={[styles.ovBox, { backgroundColor: isDark ? colors.surface : '#f9fafb', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                                    <Text style={[styles.ovLabel, { color: isDark ? colors.textMuted : '#9ca3af' }]}>NEXT HOUSE DUE DATE</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
                                        {/* <Ionicons name="calendar-outline" size={18} color="#000" /> */}
                                        <Text style={[styles.ovDate, { fontSize: 15, color: isDark ? colors.text : '#111' }]}>{nextPaymentDate}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <Ionicons name="calendar-outline" size={14} color={isDark ? colors.textSecondary : '#333'} />
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? colors.textSecondary : '#333' }}>Expected Bill: ₱{Number(occupancy.property?.price || 0).toLocaleString()}</Text>
                                    </View>
                                    {daysUntilContractEnd !== null && daysUntilContractEnd < 90 && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Ionicons name="alert-circle-outline" size={12} color="#ea580c" />
                                            <Text style={{ fontSize: 10, color: '#ea580c', fontWeight: 'bold' }}>Contract ends in {daysUntilContractEnd} days</Text>
                                        </View>
                                    )}
                                    {!isFamilyMember && canRenew && (
                                        <TouchableOpacity onPress={() => setShowRenewalModal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                            <Ionicons name="refresh" size={12} color="#4338ca" />
                                            <Text style={{ fontSize: 10, color: '#4338ca', fontWeight: 'bold' }}>Renew Contract Available</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <View style={[styles.ovBox, { backgroundColor: isDark ? colors.surface : '#f9fafb', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}>
                                    <Text style={[styles.ovLabel, { color: isDark ? colors.textMuted : '#9ca3af' }]}>LAST HOUSE DUE DATE</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
                                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: isDark ? colors.card : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name="time-outline" size={12} color={isDark ? colors.textSecondary : '#64748b'} />
                                        </View>
                                        <Text style={[styles.ovDateGray, { color: isDark ? colors.textSecondary : '#6b7280' }]}>
                                            {lastPayment ? new Date(lastPayment.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'N/A'}
                                        </Text>
                                    </View>
                                    <Text style={{ fontSize: 11, color: isDark ? colors.textMuted : '#64748b', marginTop: 2 }}>
                                        Total Paid: ₱{lastPayment ? Number(lastPayment.amount_paid || (parseFloat(lastPayment.rent_amount || 0) + parseFloat(lastPayment.security_deposit_amount || 0) + parseFloat(lastPayment.advance_amount || 0) + parseFloat(lastPayment.water_bill || 0) + parseFloat(lastPayment.electrical_bill || 0) + parseFloat(lastPayment.wifi_bill || 0) + parseFloat(lastPayment.other_bills || 0))).toLocaleString() : '0'}
                                    </Text>
                                </View>
                            </View>

                            {/* Payment History Grid */}
                            <View style={styles.historySection}>
                                <Text style={[styles.cardTitleSmall, { marginBottom: 10, color: isDark ? colors.text : '#111' }]}>Rent Payment History ({new Date().getFullYear()})</Text>
                                <View style={styles.historyGrid}>
                                    {(() => {
                                        // Build a Set of all paid month indices for current year
                                        // This accounts for advance payments covering extra months
                                        const paidMonths = new Set<number>();
                                        const currentYear = new Date().getFullYear();
                                        paymentHistory.forEach(p => {
                                            const d = new Date(p.due_date);
                                            if (d.getFullYear() !== currentYear) return;
                                            const billMonth = d.getMonth();
                                            paidMonths.add(billMonth);
                                            // If bill has advance_amount, mark additional month(s) as covered
                                            const rent = parseFloat(p.rent_amount || 0);
                                            const advance = parseFloat(p.advance_amount || 0);
                                            if (rent > 0 && advance > 0) {
                                                const extraMonths = Math.floor(advance / rent);
                                                for (let m = 1; m <= extraMonths; m++) {
                                                    const coveredMonth = billMonth + m;
                                                    if (coveredMonth < 12) paidMonths.add(coveredMonth);
                                                }
                                            }
                                        });
                                        return <>{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
                                            const isPaid = paidMonths.has(i);
                                            const isCurrent = new Date().getMonth() === i;
                                            return (
                                                <View key={m} style={styles.monthCol}>
                                                    <Text style={[styles.monthText, isPaid ? { color: isDark ? '#86efac' : 'black' } : { color: isDark ? colors.textMuted : '#d1d5db' }]}>{m}</Text>
                                                    {isPaid ? (
                                                        <View style={[styles.dotPaid, isDark && { backgroundColor: '#22c55e' }]}><Ionicons name="checkmark" size={10} color={isDark ? 'white' : 'black'} /></View>
                                                    ) : isCurrent ? (
                                                        <View style={[styles.dotCurrent, { borderColor: isDark ? colors.text : '#000' }]} />
                                                    ) : (
                                                        <View style={[styles.dotEmpty, { borderColor: isDark ? colors.border : '#e5e7eb' }]} />
                                                    )}
                                                </View>
                                            )
                                        })}</>;
                                    })()}
                                </View>
                            </View>
                        </View>
                    </View>
                ) : (
                    // --- BROWSE PROPERTIES VIEW (Grid Layout) ---
                    <View>
                        {/* Search Bar + Filter Button */}
                        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 10, alignItems: 'center' }}>
                            <View style={[styles.browseSearchBar, { flex: 1, marginHorizontal: 0, marginTop: 0, marginBottom: 0 }, { backgroundColor: isDark ? colors.card : '#f3f4f6' }]}>
                                <Ionicons name="search" size={18} color={isDark ? colors.textMuted : '#9ca3af'} />
                                <TextInput
                                    placeholder="Search by city or title..."
                                    placeholderTextColor={isDark ? colors.textMuted : '#c4c4c4'}
                                    style={[styles.browseSearchInput, { color: isDark ? colors.text : '#111' }]}
                                    value={noOccupancySearch}
                                    onChangeText={setNoOccupancySearch}
                                />
                                {noOccupancySearch.length > 0 && (
                                    <TouchableOpacity onPress={() => setNoOccupancySearch('')}>
                                        <Ionicons name="close-circle" size={18} color={isDark ? colors.textMuted : '#ccc'} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            {/* Filter Button */}
                            <TouchableOpacity
                                onPress={() => setShowBrowseFilterModal(true)}
                                style={[
                                    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
                                    { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.border : '#e5e7eb' },
                                    (noOccupancyBedrooms !== null || noOccupancyMaxPrice !== null || noOccupancySortBy !== 'newest') && { backgroundColor: isDark ? 'white' : '#111', borderColor: isDark ? 'white' : '#111' }
                                ]}
                            >
                                <Ionicons
                                    name="options-outline"
                                    size={22}
                                    color={(noOccupancyBedrooms !== null || noOccupancyMaxPrice !== null || noOccupancySortBy !== 'newest') ? (isDark ? '#111' : 'white') : (isDark ? colors.text : '#111')}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* City Chips (location only, sliding) */}
                        {(() => {
                            const cities = Array.from(new Set(properties.map((p: any) => p.city).filter(Boolean))) as string[];
                            if (cities.length === 0) return null;
                            const chipBase = { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 };
                            const activeStyle = { backgroundColor: isDark ? '#fff' : '#111', borderColor: isDark ? '#fff' : '#111' };
                            const inactiveStyle = { backgroundColor: isDark ? colors.card : '#f3f4f6', borderColor: isDark ? colors.border : '#e5e7eb' };
                            const activeText = { color: isDark ? '#111' : '#fff', fontWeight: '700' as const, fontSize: 12 };
                            const inactiveText = { color: isDark ? colors.textMuted : '#555', fontWeight: '600' as const, fontSize: 12 };
                            return (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' }}>
                                    <TouchableOpacity onPress={() => setNoOccupancyCityFilter(null)} style={[chipBase, noOccupancyCityFilter === null ? activeStyle : inactiveStyle]}>
                                        <Text style={noOccupancyCityFilter === null ? activeText : inactiveText}>All</Text>
                                    </TouchableOpacity>
                                    {cities.map(city => (
                                        <TouchableOpacity key={city} onPress={() => setNoOccupancyCityFilter(noOccupancyCityFilter === city ? null : city)} style={[chipBase, noOccupancyCityFilter === city ? activeStyle : inactiveStyle]}>
                                            <Text style={noOccupancyCityFilter === city ? activeText : inactiveText}>{city}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            );
                        })()}

                        {/* Title + Count */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
                            <Text style={[styles.sectionTitle, { fontSize: 16, color: isDark ? colors.text : '#111' }]}>Browse Properties</Text>
                            <View style={{ backgroundColor: isDark ? colors.text : '#111', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                                <Text style={{ color: isDark ? colors.background : 'white', fontSize: 11, fontWeight: 'bold' }}>
                                    {properties.filter((p: any) =>
                                        (!noOccupancySearch || p.title?.toLowerCase().includes(noOccupancySearch.toLowerCase()) || p.city?.toLowerCase().includes(noOccupancySearch.toLowerCase())) &&
                                        (!noOccupancyCityFilter || p.city === noOccupancyCityFilter) &&
                                        (noOccupancyBedrooms === null || (noOccupancyBedrooms === 4 ? p.bedrooms >= 4 : p.bedrooms === noOccupancyBedrooms)) &&
                                        (noOccupancyMaxPrice === null || p.price <= noOccupancyMaxPrice) &&
                                        (!noOccupancyPriceRange.min || p.price >= parseFloat(noOccupancyPriceRange.min)) &&
                                        (!noOccupancyPriceRange.max || p.price <= parseFloat(noOccupancyPriceRange.max)) &&
                                        (noOccupancyMinRating === 0 || (propertyStats[p.id]?.avg_rating || 0) >= noOccupancyMinRating) &&
                                        (!noOccupancyFilterFavorites || (propertyStats[p.id]?.favorite_count || 0) >= 1) &&
                                        (noOccupancySelectedAmenities.length === 0 || noOccupancySelectedAmenities.every((a: string) => (p.amenities || []).includes(a)))
                                    ).length}
                                </Text>
                            </View>
                        </View>

                        {/* 2-Column Grid */}
                        <View style={styles.browseGrid}>
                            {properties
                                .filter((p: any) =>
                                    (!noOccupancySearch || p.title?.toLowerCase().includes(noOccupancySearch.toLowerCase()) || p.city?.toLowerCase().includes(noOccupancySearch.toLowerCase())) &&
                                    (!noOccupancyCityFilter || p.city === noOccupancyCityFilter) &&
                                    (noOccupancyBedrooms === null || (noOccupancyBedrooms === 4 ? p.bedrooms >= 4 : p.bedrooms === noOccupancyBedrooms)) &&
                                    (noOccupancyMaxPrice === null || p.price <= noOccupancyMaxPrice) &&
                                    (!noOccupancyPriceRange.min || p.price >= parseFloat(noOccupancyPriceRange.min)) &&
                                    (!noOccupancyPriceRange.max || p.price <= parseFloat(noOccupancyPriceRange.max)) &&
                                    (noOccupancyMinRating === 0 || (propertyStats[p.id]?.avg_rating || 0) >= noOccupancyMinRating) &&
                                    (!noOccupancyFilterFavorites || (propertyStats[p.id]?.favorite_count || 0) >= 1) &&
                                    (noOccupancySelectedAmenities.length === 0 || noOccupancySelectedAmenities.every((a: string) => (p.amenities || []).includes(a)))
                                )
                                .sort((a: any, b: any) => {
                                    const sa = propertyStats[a.id] || {};
                                    const sb = propertyStats[b.id] || {};
                                    if (noOccupancySortBy === 'price_asc') return a.price - b.price;
                                    if (noOccupancySortBy === 'price_desc') return b.price - a.price;
                                    if (noOccupancySortBy === 'rating') return (sb.avg_rating || 0) - (sa.avg_rating || 0);
                                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                                })
                                .map((item: any) => {
                                    const isFav = favorites.includes(item.id);
                                    const isCompare = comparisonList.some((c: any) => c.id === item.id);
                                    const stats = propertyStats[item.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 };
                                    return (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={[styles.gridCard, { backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#f3f4f6' }]}
                                            activeOpacity={0.9}
                                            onPress={() => router.push(`/properties/${item.id}` as any)}
                                        >
                                            <View style={styles.gridCardImage}>
                                                <Image source={{ uri: item.images?.[0] || 'https://via.placeholder.com/400' }} style={{ width: '100%', height: '100%' }} />
                                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 }} />
                                                {/* Badges */}
                                                <View style={{ position: 'absolute', top: 6, left: 6 }}>
                                                    {topRatedId === item.id && (
                                                        <View style={[styles.badge, { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', marginBottom: 3 }]}>
                                                            <Ionicons name="trophy" size={8} color="#d97706" />
                                                            <Text style={[styles.badgeText, { color: '#d97706', marginLeft: 2 }]}>Top</Text>
                                                        </View>
                                                    )}
                                                    {mostFavId === item.id && (
                                                        <View style={[styles.badge, { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' }]}>
                                                            <Ionicons name="heart" size={8} color="#e11d48" />
                                                            <Text style={[styles.badgeText, { color: '#e11d48', marginLeft: 2 }]}>Fav</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                {/* Heart */}
                                                <TouchableOpacity
                                                    onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
                                                    style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}
                                                >
                                                    <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={14} color={isFav ? '#ef4444' : '#555'} />
                                                </TouchableOpacity>
                                                {/* Price */}
                                                <View style={{ position: 'absolute', bottom: 6, left: 8 }}>
                                                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>₱{Number(item.price).toLocaleString()}<Text style={{ fontSize: 9, fontWeight: '600' }}>/mo</Text></Text>
                                                </View>
                                            </View>
                                            <View style={{ padding: 9 }}>
                                                <Text style={[styles.cardTitle, { fontSize: 12, color: isDark ? colors.text : '#111' }]} numberOfLines={1}>{item.title}</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                                                    <Ionicons name="location-outline" size={9} color={isDark ? colors.textMuted : '#9ca3af'} />
                                                    <Text style={{ fontSize: 10, color: isDark ? colors.textMuted : '#9ca3af' }} numberOfLines={1}>{item.city}</Text>
                                                </View>
                                                {stats.review_count > 0 && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                                                        <Ionicons name="star" size={9} color="#fbbf24" />
                                                        <Text style={{ fontSize: 9, fontWeight: 'bold', marginLeft: 2, color: isDark ? colors.text : '#111' }}>{stats.avg_rating.toFixed(1)}</Text>
                                                        <Text style={{ fontSize: 9, color: isDark ? colors.textMuted : '#999', marginLeft: 1 }}>({stats.review_count})</Text>
                                                    </View>
                                                )}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#f3f4f6' }}>
                                                    <Ionicons name="bed-outline" size={10} color={isDark ? colors.textSecondary : '#666'} />
                                                    <Text style={{ fontSize: 9, color: isDark ? colors.textSecondary : '#666', fontWeight: '500' }}>{item.bedrooms}</Text>
                                                    <Text style={{ color: isDark ? colors.border : '#ddd', fontSize: 9 }}>|</Text>
                                                    <Ionicons name="water-outline" size={10} color={isDark ? colors.textSecondary : '#666'} />
                                                    <Text style={{ fontSize: 9, color: isDark ? colors.textSecondary : '#666', fontWeight: '500' }}>{item.bathrooms}</Text>
                                                    <Text style={{ color: isDark ? colors.border : '#ddd', fontSize: 9 }}>|</Text>
                                                    <Ionicons name="resize-outline" size={10} color={isDark ? colors.textSecondary : '#666'} />
                                                    <Text style={{ fontSize: 9, color: isDark ? colors.textSecondary : '#666', fontWeight: '500' }}>{item.area_sqft}sqm</Text>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                        </View>

                        {properties.filter((p: any) =>
                            (!noOccupancySearch || p.title?.toLowerCase().includes(noOccupancySearch.toLowerCase()) || p.city?.toLowerCase().includes(noOccupancySearch.toLowerCase())) &&
                            (!noOccupancyCityFilter || p.city === noOccupancyCityFilter) &&
                            (noOccupancyBedrooms === null || (noOccupancyBedrooms === 4 ? p.bedrooms >= 4 : p.bedrooms === noOccupancyBedrooms)) &&
                            (noOccupancyMaxPrice === null || p.price <= noOccupancyMaxPrice) &&
                            (!noOccupancyPriceRange.min || p.price >= parseFloat(noOccupancyPriceRange.min)) &&
                            (!noOccupancyPriceRange.max || p.price <= parseFloat(noOccupancyPriceRange.max)) &&
                            (noOccupancyMinRating === 0 || (propertyStats[p.id]?.avg_rating || 0) >= noOccupancyMinRating) &&
                            (!noOccupancyFilterFavorites || (propertyStats[p.id]?.favorite_count || 0) >= 1) &&
                            (noOccupancySelectedAmenities.length === 0 || noOccupancySelectedAmenities.every((a: string) => (p.amenities || []).includes(a)))
                        ).length === 0 && (
                                <View style={{ alignItems: 'center', paddingTop: 40, paddingBottom: 20 }}>
                                    <View style={[styles.emptyStateBox, { width: 70, height: 70, borderRadius: 35, justifyContent: 'center' }]}>
                                        <Ionicons name="home-outline" size={30} color={isDark ? colors.textMuted : '#d1d5db'} />
                                    </View>
                                    <Text style={[styles.emptyStateText, { color: isDark ? colors.textMuted : '#6b7280', marginTop: 12, fontSize: 14, fontWeight: '700' }]}>No properties found</Text>
                                    <Text style={{ fontSize: 12, color: isDark ? colors.textMuted : '#9ca3af', marginTop: 4 }}>Try adjusting your search or filter</Text>
                                </View>
                            )}

                        {/* Browse Filter Modal */}
                        <Modal visible={showBrowseFilterModal} animationType="slide" transparent>
                            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
                                <View style={{ maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: isDark ? colors.background : 'white' }}>

                                    {/* Header */}
                                    <View style={{ padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : '#f3f4f6' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
                                                <Ionicons name="filter" size={18} color="white" />
                                            </View>
                                            <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? colors.text : '#000' }}>Filters</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setShowBrowseFilterModal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? colors.card : '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name="close" size={20} color={isDark ? colors.text : '#666'} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Body */}
                                    <ScrollView contentContainerStyle={{ padding: 20 }}>

                                        {/* Sort By */}
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textMuted : '#666', textTransform: 'uppercase', marginBottom: 10, marginTop: 4, letterSpacing: 0.5 }}>Sort By</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                            {(['newest', 'price_asc', 'price_desc', 'rating'] as const).map(opt => (
                                                <TouchableOpacity key={opt} onPress={() => setNoOccupancySortBy(opt)} style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e5e7eb' }, noOccupancySortBy === opt && { backgroundColor: '#111', borderColor: '#111' }]}>
                                                    <Text style={[{ fontSize: 12, fontWeight: '600', color: isDark ? colors.text : '#333' }, noOccupancySortBy === opt && { color: 'white' }]}>
                                                        {opt === 'price_asc' ? 'Price: Low to High' : opt === 'price_desc' ? 'Price: High to Low' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        {/* Special */}
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textMuted : '#666', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Special</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                            <TouchableOpacity onPress={() => setNoOccupancyFilterFavorites(!noOccupancyFilterFavorites)} style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e5e7eb' }, noOccupancyFilterFavorites && { backgroundColor: '#111', borderColor: '#111' }]}>
                                                <Ionicons name="heart" size={14} color={noOccupancyFilterFavorites ? 'white' : (isDark ? colors.text : 'black')} style={{ marginRight: 4 }} />
                                                <Text style={[{ fontSize: 12, fontWeight: '600', color: isDark ? colors.text : '#333' }, noOccupancyFilterFavorites && { color: 'white' }]}>Guest Favorites</Text>
                                            </TouchableOpacity>
                                        </View>

                                        {/* Minimum Rating */}
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textMuted : '#666', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Minimum Rating</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                            {[0, 3, 4, 4.5].map(r => (
                                                <TouchableOpacity key={r} onPress={() => setNoOccupancyMinRating(r)} style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e5e7eb' }, noOccupancyMinRating === r && { backgroundColor: '#111', borderColor: '#111' }]}>
                                                    <Text style={[{ fontSize: 12, fontWeight: '600', color: isDark ? colors.text : '#333' }, noOccupancyMinRating === r && { color: 'white' }]}>{r === 0 ? 'Any' : `${r}+ Stars`}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        {/* Price Range */}
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textMuted : '#666', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Price Range (₱)</Text>
                                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                            <TextInput
                                                style={{ flex: 1, borderWidth: 1.5, borderColor: isDark ? colors.cardBorder : '#e5e7eb', padding: 14, borderRadius: 14, backgroundColor: isDark ? colors.card : '#fafafa', fontSize: 14, color: isDark ? colors.text : '#000' }}
                                                placeholder="Min price e.g. 5000"
                                                placeholderTextColor={isDark ? colors.textMuted : '#c4c4c4'}
                                                keyboardType="numeric"
                                                value={noOccupancyPriceRange.min}
                                                onChangeText={t => setNoOccupancyPriceRange(p => ({ ...p, min: t }))}
                                            />
                                            <TextInput
                                                style={{ flex: 1, borderWidth: 1.5, borderColor: isDark ? colors.cardBorder : '#e5e7eb', padding: 14, borderRadius: 14, backgroundColor: isDark ? colors.card : '#fafafa', fontSize: 14, color: isDark ? colors.text : '#000' }}
                                                placeholder="Max price e.g. 30000"
                                                placeholderTextColor={isDark ? colors.textMuted : '#c4c4c4'}
                                                keyboardType="numeric"
                                                value={noOccupancyPriceRange.max}
                                                onChangeText={t => setNoOccupancyPriceRange(p => ({ ...p, max: t }))}
                                            />
                                        </View>

                                        {/* Amenities */}
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.textMuted : '#666', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>Amenities</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                            {browseAvailableAmenities.map(a => (
                                                <TouchableOpacity key={a} onPress={() => browseToggleAmenity(a)} style={[{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, backgroundColor: isDark ? colors.card : 'white', borderColor: isDark ? colors.cardBorder : '#e5e7eb' }, noOccupancySelectedAmenities.includes(a) && { backgroundColor: '#111', borderColor: '#111' }]}>
                                                    <Text style={[{ fontSize: 12, fontWeight: '600', color: isDark ? colors.text : '#333' }, noOccupancySelectedAmenities.includes(a) && { color: 'white' }]}>{a}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>

                                        <View style={{ height: 50 }} />
                                    </ScrollView>

                                    {/* Footer */}
                                    <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: isDark ? colors.border : '#f3f4f6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? colors.surface : 'white' }}>
                                        <TouchableOpacity onPress={browseClearFilters} style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
                                            <Ionicons name="refresh" size={16} color={isDark ? colors.textSecondary : '#666'} />
                                            <Text style={{ fontWeight: '600', color: isDark ? colors.textSecondary : '#666', marginLeft: 4 }}>Clear</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setShowBrowseFilterModal(false)} style={{ backgroundColor: '#111', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14 }}>
                                            <Text style={{ color: 'white', fontWeight: 'bold' }}>Show Results</Text>
                                        </TouchableOpacity>
                                    </View>

                                </View>
                            </View>
                        </Modal>
                    </View>
                )}

            </ScrollView>

            {/* Compare Button */}
            {comparisonList.length > 0 && (
                <TouchableOpacity style={styles.compareBtn} onPress={() => router.push({ pathname: '/compare', params: { ids: comparisonList.map((c: any) => c.id).join(',') } })}>
                    <View style={styles.compareBadge}><Text style={styles.compareBadgeText}>{comparisonList.length}</Text></View>
                    <Text style={styles.compareText}>COMPARE SELECTED</Text>
                </TouchableOpacity>
            )}

            {/* Renewal Modal */}
            <Modal visible={showRenewalModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={[styles.modalIconContainer, { backgroundColor: '#e0e7ff' }]}>
                            <Ionicons name="repeat" size={28} color="#4338ca" />
                        </View>
                        <Text style={styles.modalTitle}>Request Contract Renewal</Text>
                        <Text style={styles.modalSubtitle}>{occupancy?.property?.title}</Text>

                        <View style={{ backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 'bold' }}>Current Contract Ends</Text>
                                <Text style={{ fontSize: 13, fontWeight: 'bold' }}>
                                    {occupancy?.contract_end_date ? new Date(occupancy.contract_end_date).toLocaleDateString() : 'N/A'}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: 'bold' }}>Days Remaining</Text>
                                <Text style={{ fontSize: 13, fontWeight: 'bold', color: daysUntilContractEnd !== null && daysUntilContractEnd < 30 ? '#ea580c' : '#111' }}>
                                    {daysUntilContractEnd !== null ? `${daysUntilContractEnd} days` : 'N/A'}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.inputLabel}>Select Meeting Date for Contract Signing *</Text>
                        <CalendarPicker
                            selectedDate={renewalMeetingDate}
                            onDateSelect={setRenewalMeetingDate}
                        />
                        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 10, lineHeight: 18 }}>
                            Please choose a date to meet the landlord for signing the new contract.
                        </Text>
                        <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 8, lineHeight: 18, fontStyle: 'italic' }}>
                            By requesting a renewal, your landlord will be notified and can approve or propose new terms for your continued stay.
                        </Text>

                        <View style={[styles.modalActions, { marginTop: 20 }]}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRenewalModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#4338ca' }]} onPress={requestContractRenewal}>
                                <Text style={styles.confirmBtnText}>Submit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Add Family Member Modal */}
            <Modal visible={showFamilyModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 0, overflow: 'hidden' }]}>
                        {/* Header */}
                        <View style={{ backgroundColor: '#111827', padding: 20, paddingTop: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Ionicons name="person-add-outline" size={24} color="white" />
                                </View>
                                <View>
                                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 20 }}>Add Family</Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 'bold' }}>{familyMembers.length}/4 slots used</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => { setShowFamilyModal(false); setFamilySearchQuery(''); setFamilySearchResults([]); }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="close" size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        {/* Body */}
                        <View style={{ padding: 20, backgroundColor: 'white' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, marginBottom: 16 }}>
                                <Ionicons name="search-outline" size={20} color="#9ca3af" />
                                <TextInput
                                    style={{ flex: 1, padding: 12, fontSize: 14, color: '#111827' }}
                                    placeholder="Search by name, email or phone..."
                                    placeholderTextColor="#9ca3af"
                                    value={familySearchQuery}
                                    onChangeText={setFamilySearchQuery}
                                />
                                {familySearchQuery.length > 0 && (
                                    <TouchableOpacity onPress={() => setFamilySearchQuery('')} style={{ padding: 4 }}>
                                        <Ionicons name="close-circle" size={16} color="#d1d5db" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
                                {familySearching ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                        <ActivityIndicator size="small" color="#6366f1" />
                                        <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 10 }}>Searching users...</Text>
                                    </View>
                                ) : familySearchResults.length > 0 ? (
                                    <View style={{ gap: 8 }}>
                                        {familySearchResults.map((user) => (
                                            <View key={user.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff' }}>
                                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                                    {user.avatar_url ? (
                                                        <Image source={{ uri: user.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                                                    ) : (
                                                        <Text style={{ color: '#4b5563', fontSize: 14, fontWeight: 'bold' }}>
                                                            {`${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`}
                                                        </Text>
                                                    )}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#111827' }}>
                                                        {user.first_name} {user.last_name}
                                                    </Text>
                                                    <Text style={{ fontSize: 11, color: '#6b7280' }}>{user.email}</Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={() => addFamilyMember(user.id)}
                                                    disabled={addingMember === user.id}
                                                    style={{ backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
                                                >
                                                    {addingMember === user.id ? (
                                                        <ActivityIndicator size="small" color="white" />
                                                    ) : (
                                                        <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>Add</Text>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                    </View>
                                ) : familySearchQuery.length >= 2 ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 30, backgroundColor: '#f9fafb', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6' }}>
                                        <Ionicons name="search" size={32} color="#d1d5db" style={{ marginBottom: 10 }} />
                                        <Text style={{ color: '#4b5563', fontSize: 14, fontWeight: 'bold' }}>No users found</Text>
                                        <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 }}>
                                            Try searching with a different name, email, or exact phone number.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                            <Ionicons name="people-outline" size={32} color="#d1d5db" />
                                        </View>
                                        <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center', paddingHorizontal: 30, lineHeight: 20 }}>
                                            Search for a registered user to add them as a family member. They will be able to see your property and payments.
                                        </Text>
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* End Request Modal */}
            <Modal visible={endRequestModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={10}>
                            <View style={styles.modalContent}>
                                <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false}>
                                    <Text style={styles.modalTitle}>Request to Leave</Text>
                                    <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                                    <CalendarPicker
                                        selectedDate={endRequestDate}
                                        onDateSelect={setEndRequestDate}
                                    />
                                    <Text style={styles.inputLabel}>Reason</Text>
                                    <TextInput
                                        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                        value={endRequestReason}
                                        onChangeText={setEndRequestReason}
                                        placeholder="Enter your reason..."
                                        blurOnSubmit={true}
                                        returnKeyType="done"
                                    />
                                    <View style={styles.modalActions}>
                                        <TouchableOpacity style={styles.cancelBtn} onPress={() => setEndRequestModalVisible(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                                        <TouchableOpacity style={styles.confirmBtn} onPress={requestEndOccupancy}><Text style={styles.confirmBtnText}>Submit</Text></TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Review Modal */}
            <Modal visible={reviewModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={[styles.modalIconContainer, { backgroundColor: '#fefce8' }]}>
                            <Ionicons name="star" size={28} color="#eab308" />
                        </View>
                        <Text style={styles.modalTitle}>Rate Your Stay</Text>
                        <Text style={styles.modalSubtitle}>How was your experience at {reviewTarget?.property?.title}?</Text>

                        <View style={styles.ratingCard}>
                            <View style={styles.ratingRow}>
                                <Text style={styles.ratingLabel}>Cleanliness</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setCleanlinessRating(s)}>
                                            <Ionicons name={s <= cleanlinessRating ? "star" : "star-outline"} size={20} color="#eab308" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.ratingRow}>
                                <Text style={styles.ratingLabel}>Communication</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setCommunicationRating(s)}>
                                            <Ionicons name={s <= communicationRating ? "star" : "star-outline"} size={20} color="#eab308" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.ratingRow}>
                                <Text style={styles.ratingLabel}>Location</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                        <TouchableOpacity key={s} onPress={() => setLocationRating(s)}>
                                            <Ionicons name={s <= locationRating ? "star" : "star-outline"} size={20} color="#eab308" />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>

                        <Text style={styles.inputLabel}>Comment</Text>
                        <TextInput
                            style={styles.textArea}
                            multiline
                            placeholder="Share your experience..."
                            value={reviewComment}
                            onChangeText={setReviewComment}
                        />

                        <View style={styles.checkboxContainer}>
                            <TouchableOpacity onPress={() => setDontShowAgain(!dontShowAgain)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name={dontShowAgain ? "checkbox" : "square-outline"} size={20} color="#666" />
                                <Text style={{ fontSize: 13, color: '#666' }}>Don't show again for this stay</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={handleSkipReview}>
                                <Text style={styles.cancelBtnText}>Skip</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.confirmBtn} onPress={submitReview} disabled={submittingReview}>
                                {submittingReview ? <ActivityIndicator color="white" /> : <Text style={styles.confirmBtnText}>Submit Review</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Property Terms Modal */}
            <Modal visible={showTermsModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                        <View style={[styles.modalIconContainer, { backgroundColor: '#f3f4f6' }]}>
                            <Ionicons name="document-text" size={28} color="#333" />
                        </View>
                        <Text style={styles.modalTitle}>Property Terms & Conditions</Text>
                        <Text style={styles.modalSubtitle}>{occupancy?.property?.title}</Text>
                        <ScrollView style={{ maxHeight: 300, marginVertical: 12 }} showsVerticalScrollIndicator>
                            <Text style={{ fontSize: 14, lineHeight: 22, color: '#444' }}>
                                {occupancy?.property?.terms_conditions || 'No terms available.'}
                            </Text>
                        </ScrollView>
                        <TouchableOpacity style={[styles.confirmBtn, { width: '100%' }]} onPress={() => setShowTermsModal(false)}>
                            <Text style={styles.confirmBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    section: { marginTop: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12, alignItems: 'center' },
    sectionTitle: { fontSize: 20, fontWeight: '900', color: '#111', textTransform: 'uppercase' },
    seeMore: { fontSize: 14, color: '#333', fontWeight: '600' },
    listContainer: { paddingHorizontal: 20, paddingBottom: 10 },

    // Header
    dashboardContent: { padding: 20 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
    headerTitle: { fontSize: 26, fontWeight: 'bold', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 4 },
    seeMoreLink: { fontSize: 12, fontWeight: 'bold', color: '#666' },

    // Active Card
    activeCard: { backgroundColor: 'white', borderRadius: 24, padding: 0, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#eee' },
    activeImageContainer: { height: 220, position: 'relative' },
    activeImage: { width: '100%', height: '100%' },
    activeGradient: { position: 'absolute', bottom: 0, width: '100%', height: 100 },
    activeBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: '#d1fae5' },
    statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    activeBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#047857', textTransform: 'uppercase' },
    activeInfoOverlay: { position: 'absolute', bottom: 12, left: 16, right: 16 },
    activeTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
    activeAddress: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
    sliderDots: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', gap: 4 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
    dotActive: { width: 12, backgroundColor: 'white' },

    activeContent: { padding: 16 },
    leaseRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 12 },
    leaseItem: {},
    leaseLabel: { fontSize: 10, color: '#9ca3af', fontWeight: 'bold', marginBottom: 4 },
    leaseValue: { fontSize: 13, fontWeight: 'bold', color: '#111' },
    gridActions: { flexDirection: 'row', gap: 10 },
    gridBtn: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    btnGray: { backgroundColor: '#f3f4f6' },
    btnBlack: { backgroundColor: '#000' },
    btnOutline: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'white' },
    btnOutlineRed: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
    btnDisabled: { backgroundColor: '#f3f4f6' },
    btnTextGray: { fontWeight: 'bold', fontSize: 12, color: '#374151' },
    btnTextWhite: { fontWeight: 'bold', fontSize: 12, color: 'white' },
    btnTextBlack: { fontWeight: 'bold', fontSize: 12, color: '#111' },
    btnTextRed: { fontWeight: 'bold', fontSize: 12, color: '#dc2626' },
    btnTextDisabled: { fontWeight: 'bold', fontSize: 12, color: '#9ca3af' },

    // Info Cards
    infoCard: { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#f3f4f6' },
    cardHeaderSmall: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
    cardTitleSmall: { fontSize: 14, fontWeight: 'bold', color: '#111' },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    textLabel: { fontSize: 12, color: '#6b7280' },
    textLabelBold: { fontSize: 13, color: '#374151', fontWeight: 'bold' },
    textValueBlack: { fontSize: 13, fontWeight: 'bold', color: '#000' },
    textValueGray: { fontSize: 13, fontWeight: 'bold', color: '#6b7280' },
    textValueBig: { fontSize: 18, fontWeight: '900', color: '#111' },
    borderTop: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    tipBox: { marginTop: 10, backgroundColor: '#f9fafb', padding: 8, borderRadius: 8 },
    tipText: { fontSize: 10, color: '#4b5563' },
    centerBox: { alignItems: 'center', paddingVertical: 10 },

    utilityItem: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    utilIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    utilTitle: { fontSize: 13, fontWeight: 'bold', color: '#1f2937' },
    utilSub: { fontSize: 11, color: '#6b7280' },

    badgeRed: { backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#fee2e2' },
    badgeRedText: { fontSize: 10, color: '#ea580c', fontWeight: 'bold' },
    seeAllText: { fontSize: 12, fontWeight: 'bold', color: '#666' },

    billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f1f5f9' },
    billIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
    billTitle: { fontSize: 13, fontWeight: 'bold', color: '#334155' },
    billDate: { fontSize: 10, color: '#64748b' },
    billAmount: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
    payBtnSmall: { marginTop: 4, backgroundColor: 'black', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    payBtnText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    emptyStateBox: { alignItems: 'center', padding: 20, backgroundColor: '#f8fafc', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
    emptyStateText: { marginTop: 8, fontSize: 13, color: '#64748b', fontWeight: '500' },
    noteText: { fontSize: 10, color: '#94a3b8', marginTop: 10, textAlign: 'center' },

    // Payment Overview
    borderCard: { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 80, borderWidth: 1, borderColor: '#f3f4f6' },
    overviewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 12 },
    ovLabel: { fontSize: 10, fontWeight: '700', color: '#9ca3af', marginBottom: 4 },
    ovSub: { fontSize: 11, color: '#4b5563', fontWeight: '500' },
    ovValue: { fontSize: 18, fontWeight: '900' },
    ovBox: { flex: 1, backgroundColor: '#f9fafb', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6' },
    ovDate: { fontSize: 13, fontWeight: 'bold', color: '#111' },
    ovDateGray: { fontSize: 13, fontWeight: 'bold', color: '#6b7280' },

    historySection: { marginTop: 20 },
    historyGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    monthCol: { width: '16.66%', alignItems: 'center', marginBottom: 12 },
    monthText: { fontSize: 10, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
    dotPaid: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#86efac', alignItems: 'center', justifyContent: 'center' },
    dotCurrent: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
    dotEmpty: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#e5e7eb' },

    // Browse grid (no-occupancy)
    browseSearchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 14, height: 46, borderRadius: 14, gap: 8, marginHorizontal: 16, marginTop: 14, marginBottom: 4 },
    browseSearchInput: { flex: 1, fontSize: 14, color: '#111' },
    cityChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6' },
    cityChipText: { fontSize: 12, fontWeight: '700' },
    browseGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
    gridCard: { width: '48.5%', backgroundColor: 'white', borderRadius: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#f3f4f6' },
    gridCardImage: { height: 120, position: 'relative' },

    // Existing Card & Modal Styles preserved...
    card: { width: CARD_WIDTH, marginRight: 16, backgroundColor: 'white', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
    cardImageContainer: { height: 160, width: '100%', position: 'relative' },
    cardImage: { width: '100%', height: '100%' },
    cardGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
    cardHeader: { position: 'absolute', top: 10, left: 10, alignItems: 'flex-start' },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
    badgeAvailable: { backgroundColor: 'white' },
    badgeOccupied: { backgroundColor: 'rgba(0,0,0,0.8)' },
    badgeFav: { backgroundColor: '#f43f5e', borderWidth: 0 },
    badgeText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    textDark: { color: 'black' },
    textWhite: { color: 'white' },
    cardActions: { position: 'absolute', top: 10, right: 10 },
    actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
    actionBtnActive: { backgroundColor: '#111' },
    priceOverlay: { position: 'absolute', bottom: 10, left: 12 },
    priceText: { color: 'white', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
    priceSub: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
    cardContent: { padding: 12 },
    cardLocation: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 4 },
    featureRow: { flexDirection: 'row', alignItems: 'center' },
    featureItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    featureText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
    divider: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginHorizontal: 8 },
    compareBtn: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#111', flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
    compareText: { color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
    compareBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#111' },
    compareBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, minHeight: 400 },
    modalIconContainer: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 8 },
    modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, fontSize: 14, marginBottom: 16 },
    inputLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
    cancelBtn: { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
    cancelBtnText: { fontWeight: 'bold', color: '#374151' },
    confirmBtn: { flex: 1, backgroundColor: '#111', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
    confirmBtnText: { fontWeight: 'bold', color: 'white' },

    // Review Modal Styles
    ratingCard: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 16, marginBottom: 16 },
    ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    ratingLabel: { fontSize: 13, fontWeight: '700', color: '#374151' },
    starsRow: { flexDirection: 'row', gap: 6 },
    textArea: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, height: 100, fontSize: 14, marginBottom: 16, textAlignVertical: 'top' },
    checkboxContainer: { marginBottom: 20 },
});