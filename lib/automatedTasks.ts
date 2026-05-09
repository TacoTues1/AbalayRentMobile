// UTF-8 Clean File
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNotification } from './notifications';
import { supabase } from './supabase';

export const runDailyAutomatedTasks = async (landlordId: string) => {
    try {
        const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }); // Or local timezone
        const lastRunStr = await AsyncStorage.getItem('last_automated_run_date');
        
        const now = new Date();
        const currentHour = now.getHours();
        
        // Only run after 8:00 AM and if it hasn't run today
        if (currentHour < 8 || lastRunStr === todayStr) {
            return;
        }

        console.log("Running Daily Automated Tasks at 8:00 AM...");

        const getPropTitle = (prop: any) => Array.isArray(prop) ? prop[0]?.title : prop?.title;

        const todayDay = now.getDate();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();
        const todayDate = now.toISOString().split('T')[0];

        // 1. Auto-end contracts whose approved end date is due today or earlier.
        const { data: dueContractEnds } = await supabase
            .from('tenant_occupancies')
            .select(`
                id,
                tenant_id,
                property_id,
                end_request_date,
                end_request_reason,
                tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name),
                property:properties(id, title)
            `)
            .eq('landlord_id', landlordId)
            .in('status', ['active', 'pending_end'])
            .eq('end_request_status', 'approved')
            .not('end_request_date', 'is', null)
            .lte('end_request_date', todayDate);

        if (dueContractEnds && dueContractEnds.length > 0) {
            for (const occ of dueContractEnds) {
                const unresolvedPaymentStatuses = ['pending', 'unpaid', 'rejected', 'pending_confirmation'];
                const { count: pendingPaymentCount, error: pendingPaymentError } = await supabase
                    .from('payment_requests')
                    .select('id', { count: 'exact', head: true })
                    .eq('occupancy_id', occ.id)
                    .eq('tenant', occ.tenant_id)
                    .in('status', unresolvedPaymentStatuses);

                if (pendingPaymentError) {
                    console.error(`Failed to verify pending payments for occupancy ${occ.id}:`, pendingPaymentError);
                    continue;
                }

                if ((pendingPaymentCount || 0) > 0) {
                    console.log(`Skipping auto-end for occupancy ${occ.id} due to pending payments.`);
                    continue;
                }

                const { error: endError } = await supabase
                    .from('tenant_occupancies')
                    .update({ status: 'ended' })
                    .eq('id', occ.id)
                    .eq('landlord_id', landlordId);

                if (endError) {
                    console.error(`Failed to auto-end occupancy ${occ.id}:`, endError);
                    continue;
                }

                await supabase
                    .from('properties')
                    .update({ status: 'available' })
                    .eq('id', occ.property_id);

                await supabase
                    .from('bookings')
                    .update({ status: 'completed' })
                    .eq('tenant', occ.tenant_id)
                    .eq('property_id', occ.property_id)
                    .in('status', ['approved', 'pending']);

                await supabase
                    .from('maintenance_requests')
                    .update({ status: 'cancelled' })
                    .eq('property_id', occ.property_id)
                    .eq('tenant', occ.tenant_id)
                    .in('status', ['pending', 'scheduled', 'in_progress']);

                const reasonText = occ.end_request_reason
                    ? ` Reason: ${occ.end_request_reason}`
                    : '';

                await createNotification(
                    occ.tenant_id,
                    'occupancy_ended',
                    `Your contract for "${getPropTitle(occ.property) || 'your rental'}" has ended on ${occ.end_request_date}.${reasonText}`,
                    { actor: landlordId },
                );
            }
        }
        
        // 2. Auto-start occupancies whose start date is today or earlier.
        const { data: incomingStarts } = await supabase
            .from('tenant_occupancies')
            .select(`
                id,
                tenant_id,
                property_id,
                start_date,
                property:properties(id, title)
            `)
            .eq('landlord_id', landlordId)
            .eq('status', 'pending_start')
            .lte('start_date', todayDate);

        if (incomingStarts && incomingStarts.length > 0) {
            for (const occ of incomingStarts) {
                await supabase
                    .from('tenant_occupancies')
                    .update({ status: 'active' })
                    .eq('id', occ.id);

                await createNotification(
                    occ.tenant_id,
                    'occupancy_started',
                    `Your occupancy for "${getPropTitle(occ.property)}" has officially started today. Welcome!`,
                    { actor: landlordId, email: true, sms: true }
                );
            }
        }
        
        // 3. Fetch current occupancies for this landlord
        const { data: occupancies } = await supabase
            .from('tenant_occupancies')
            .select(`
                *,
                landlord_profile:profiles!tenant_occupancies_landlord_id_fkey(accepted_payments),
                tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, email),
                property:properties(id, title)
            `)
            .eq('landlord_id', landlordId)
            .in('status', ['active', 'pending_end']);

        // 3. Send utility reminders 1-3 days before their configured due dates.
        if (occupancies) {
            const todayDateOnly = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0);
            const todayStart = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0).toISOString();
            const todayEnd = new Date(todayYear, todayMonth, todayDay, 23, 59, 59, 999).toISOString();
            const millisecondsPerDay = 1000 * 60 * 60 * 24;
            const catchUpPastDueDays = 7;

            const normalizeDueDay = (value: any, fallback: number) => {
                const parsed = parseInt(value, 10);
                if (!Number.isFinite(parsed)) return fallback;
                return Math.max(1, Math.min(31, parsed));
            };

            const getDaysUntilDue = (dueDate: Date) =>
                Math.floor((dueDate.getTime() - todayDateOnly.getTime()) / millisecondsPerDay);

            const getReminderDueDateForDay = (dueDay: number) => {
                const currentMonthDueDate = new Date(todayYear, todayMonth, dueDay, 0, 0, 0, 0);
                const currentMonthDaysUntilDue = getDaysUntilDue(currentMonthDueDate);
                const autoSendDate = new Date(currentMonthDueDate);
                autoSendDate.setDate(autoSendDate.getDate() - 3);

                if (
                    autoSendDate <= todayDateOnly &&
                    currentMonthDaysUntilDue >= -catchUpPastDueDays &&
                    currentMonthDaysUntilDue <= 3
                ) {
                    return currentMonthDueDate;
                }

                const candidate = new Date(currentMonthDueDate);
                if (candidate < todayDateOnly) candidate.setMonth(candidate.getMonth() + 1);
                return candidate;
            };

            const shouldSendReminderForDueDate = (dueDate: Date) => {
                const daysUntilDue = getDaysUntilDue(dueDate);
                if (daysUntilDue >= 1 && daysUntilDue <= 3) return true;

                const autoSendDate = new Date(dueDate);
                autoSendDate.setDate(autoSendDate.getDate() - 3);
                return autoSendDate <= todayDateOnly && daysUntilDue >= -catchUpPastDueDays && daysUntilDue <= 3;
            };

            const getReminderTimingText = (daysUntilDue: number) => {
                if (daysUntilDue > 1) return `${daysUntilDue} days before due`;
                if (daysUntilDue === 1) return '1 day before due';
                if (daysUntilDue === 0) return 'due today';

                const overdueDays = Math.abs(daysUntilDue);
                return overdueDays === 1 ? '1 day past due' : `${overdueDays} days past due`;
            };

            const isUtilityEnabled = (occ: any, utilityKey: string) => {
                const settings = occ?.landlord_profile?.accepted_payments?.utility_reminders || {};
                return settings[utilityKey] !== false;
            };

            const hasOccupancyStarted = (occ: any) => {
                if (!occ.start_date) return true;

                const startDate = new Date(occ.start_date);
                startDate.setHours(0, 0, 0, 0);
                return todayDateOnly >= startDate;
            };

            const utilityConfigs = [
                {
                    key: 'internet',
                    label: 'Internet/WiFi',
                    dueDayField: 'wifi_due_day',
                    fallbackDay: 10,
                    notificationType: 'wifi_due_reminder',
                },
                {
                    key: 'water',
                    label: 'Water',
                    dueDayField: 'water_due_day',
                    fallbackDay: 7,
                    notificationType: 'water_due_reminder',
                },
                {
                    key: 'electricity',
                    label: 'Electricity',
                    dueDayField: 'electricity_due_day',
                    fallbackDay: 7,
                    notificationType: 'electricity_due_reminder',
                },
            ];

            for (const occ of occupancies) {
                if (!occ.tenant || !hasOccupancyStarted(occ)) continue;

                for (const utility of utilityConfigs) {
                    if (!isUtilityEnabled(occ, utility.key)) continue;

                    const dueDay = normalizeDueDay(occ[utility.dueDayField], utility.fallbackDay);
                    const dueDateOnly = getReminderDueDateForDay(dueDay);
                    const daysUntilDue = getDaysUntilDue(dueDateOnly);

                    if (!shouldSendReminderForDueDate(dueDateOnly)) continue;

                    const { data: existingNotifications } = await supabase
                        .from('notifications')
                        .select('id')
                        .eq('recipient', occ.tenant_id)
                        .eq('type', utility.notificationType)
                        .gte('created_at', todayStart)
                        .lte('created_at', todayEnd)
                        .limit(1);

                    if (existingNotifications && existingNotifications.length > 0) continue;

                    const dueDate = new Date(dueDateOnly);
                    dueDate.setHours(23, 59, 59, 999);
                    const dueDateText = dueDate.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                    });
                    const daysText = getReminderTimingText(daysUntilDue);
                    const message = `${utility.label} Bill Reminder (${daysText}): Your ${utility.label.toLowerCase()} bill for "${getPropTitle(occ.property)}" is due on ${dueDateText}.`;

                    await createNotification(occ.tenant_id, utility.notificationType, message, { actor: landlordId });
                }
            }
        }

        // 4. APPLY OVERDUE PENALTIES AND SEC DEPOSIT DEDUCT
        const todayISO = now.toISOString();
        const { data: overdueBills } = await supabase
            .from('payment_requests')
            .select(`
                *,
                occupancy:tenant_occupancies(id, late_payment_fee, security_deposit, security_deposit_used, landlord_id),
                property:properties(title)
            `)
            .eq('landlord', landlordId)
            .eq('status', 'pending')
            .lt('due_date', todayISO)
            .gt('rent_amount', 0); // Rent bills

        if (overdueBills && overdueBills.length > 0) {
            for (const bill of overdueBills) {
                const lateFee = parseFloat(bill.occupancy?.late_payment_fee || 0);
                if (lateFee <= 0) continue;

                const description = bill.bills_description || '';
                // Avoid applying duplicate late fees
                if (!description.includes('Late Fee')) {
                    const newOtherBills = (parseFloat(bill.other_bills) || 0) + lateFee;
                    const newDescription = `${description} (Includes Late Fee: ₱${lateFee.toLocaleString()})`;

                    // Update the bill
                    await supabase.from('payment_requests').update({
                        other_bills: newOtherBills,
                        bills_description: newDescription
                    }).eq('id', bill.id);

                    // Auto Deduct from Security Deposit
                    const securityDeposit = parseFloat(bill.occupancy?.security_deposit || 0);
                    const securityDepositUsed = parseFloat(bill.occupancy?.security_deposit_used || 0);
                    const availableDeposit = securityDeposit - securityDepositUsed;

                    let deductedFromDeposit = 0;
                    if (availableDeposit > 0) {
                        deductedFromDeposit = Math.min(lateFee, availableDeposit);
                        const newDepositUsed = securityDepositUsed + deductedFromDeposit;

                        await supabase.from('tenant_occupancies').update({
                            security_deposit_used: newDepositUsed
                        }).eq('id', bill.occupancy.id);
                        const depositMsg = `₱${deductedFromDeposit.toLocaleString()} has been auto-deducted from your security deposit as a late payment penalty for "${getPropTitle(bill.property)}". Remaining deposit: ₱${(availableDeposit - deductedFromDeposit).toLocaleString()}.`;
                        await createNotification(bill.tenant, 'security_deposit_deduction', depositMsg, { actor: landlordId });
                    }

                    // Tenant notification for late fee
                    const totalDue = (parseFloat(bill.rent_amount) || 0) + newOtherBills;
                    let message = `A late payment fee of ₱${lateFee.toLocaleString()} has been added to your rent bill for "${getPropTitle(bill.property)}". Total due: ₱${totalDue.toLocaleString()}.`;
                    if (deductedFromDeposit > 0) message += ` ₱${deductedFromDeposit.toLocaleString()} was deducted from your security deposit.`;

                    await createNotification(bill.tenant, 'payment_late_fee', message, { actor: landlordId });
                }
            }
        }

        // Save execution state so it only runs once per day
        await AsyncStorage.setItem('last_automated_run_date', todayStr);
        console.log("Automated Tasks executed successfully for today.");
    } catch (err) {
        console.error("Automated Tasks Error:", err);
    }
};
