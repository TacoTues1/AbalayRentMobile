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
            .eq('status', 'pending_end')
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
                    `Your contract for "${occ.property?.title || 'your rental'}" has ended on ${occ.end_request_date}.${reasonText}`,
                    { actor: landlordId },
                );
            }
        }
        
        // 2. Fetch current occupancies for this landlord
        const { data: occupancies } = await supabase
            .from('tenant_occupancies')
            .select(`
                *,
                tenant:profiles!tenant_occupancies_tenant_id_fkey(id, first_name, last_name, phone, email),
                property:properties(id, title)
            `)
            .eq('landlord_id', landlordId)
            .in('status', ['active', 'pending_end']);

        // 3. FIRST WEEK OF THE MONTH (Days 1, 2, 3) - Send Electricity and Water Bill "Auto Send" (Reminders)
        if (todayDay >= 1 && todayDay <= 3 && occupancies) {
            const todayStart = new Date(todayYear, todayMonth, todayDay, 0, 0, 0, 0).toISOString();
            const todayEnd = new Date(todayYear, todayMonth, todayDay, 23, 59, 59, 999).toISOString();

            for (const occ of occupancies) {
                if (!occ.tenant) continue;
                
                const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                const daysText = todayDay === 1 ? '3 days' : todayDay === 2 ? '2 days' : '1 day';

                // Check and send Water Reminder
                const { data: waterNotifs } = await supabase.from('notifications')
                    .select('id').eq('recipient', occ.tenant_id).eq('type', 'water_due_reminder')
                    .gte('created_at', todayStart).lte('created_at', todayEnd).limit(1);
                    
                if (!waterNotifs || waterNotifs.length === 0) {
                    const waterMessage = `Water Bill Reminder (${daysText} into first week): Your water bill for "${occ.property?.title}" is due in the first week of ${monthYear}.`;
                    await createNotification(occ.tenant_id, 'water_due_reminder', waterMessage, { actor: landlordId });
                    // Optionally push full email/sms endpoints here if required
                }

                // Check and send Electricity Reminder
                const { data: elecNotifs } = await supabase.from('notifications')
                    .select('id').eq('recipient', occ.tenant_id).eq('type', 'electricity_due_reminder')
                    .gte('created_at', todayStart).lte('created_at', todayEnd).limit(1);
                    
                if (!elecNotifs || elecNotifs.length === 0) {
                    const elecMessage = `Electricity Bill Reminder (${daysText} into first week): Your electricity bill for "${occ.property?.title}" is due in the first week of ${monthYear}.`;
                    await createNotification(occ.tenant_id, 'electricity_due_reminder', elecMessage, { actor: landlordId });
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

                        const depositMsg = `₱${deductedFromDeposit.toLocaleString()} has been auto-deducted from your security deposit as a late payment penalty for "${bill.property?.title}". Remaining deposit: ₱${(availableDeposit - deductedFromDeposit).toLocaleString()}.`;
                        await createNotification(bill.tenant, 'security_deposit_deduction', depositMsg, { actor: landlordId });
                    }

                    // Tenant notification for late fee
                    const totalDue = (parseFloat(bill.rent_amount) || 0) + (parseFloat(bill.water_bill) || 0) + (parseFloat(bill.electrical_bill) || 0) + (parseFloat(bill.wifi_bill) || 0) + newOtherBills;
                    let message = `A late payment fee of ₱${lateFee.toLocaleString()} has been added to your rent bill for "${bill.property?.title}". Total due: ₱${totalDue.toLocaleString()}.`;
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
