import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { scheduleLocalNotification } from './usePushNotifications';

/**
 * Maps notification types to user-friendly titles and Android channels
 */
function getNotificationMeta(type: string): { title: string; channelId: string } {
  switch (type) {
    // --- Payments ---
    case 'payment':
    case 'payment_paid':
      return { title: '💳 Payment Reminder', channelId: 'payments' };
    case 'payment_request':
      return { title: '💳 New Bill', channelId: 'payments' };
    case 'payment_confirmed':
    case 'payment_approved':
      return { title: '✅ Payment Confirmed', channelId: 'payments' };
    case 'payment_confirmation_needed':
      return { title: '💳 Payment Needs Confirmation', channelId: 'payments' };
    case 'payment_late_fee':
      return { title: '⚠️ Late Fee Applied', channelId: 'payments' };
    case 'security_deposit_deduction':
      return { title: '💰 Security Deposit Deduction', channelId: 'payments' };
    case 'rent_bill_reminder':
      return { title: '📢 Rent Reminder', channelId: 'payments' };

    // --- Utilities ---
    case 'water_due_reminder':
      return { title: '💧 Water Bill Due', channelId: 'payments' };
    case 'electricity_due_reminder':
      return { title: '⚡ Electricity Bill Due', channelId: 'payments' };

    // --- Maintenance ---
    case 'maintenance':
    case 'maintenance_request':
      return { title: '🔧 Maintenance Request', channelId: 'default' };
    case 'maintenance_resolved':
      return { title: '✅ Maintenance Resolved', channelId: 'default' };
    case 'maintenance_in_progress':
      return { title: '🔧 Maintenance In Progress', channelId: 'default' };

    // --- Applications ---
    case 'application':
      return { title: '📋 New Application', channelId: 'default' };
    case 'application_status':
      return { title: '📋 Application Update', channelId: 'default' };

    // --- Messages ---
    case 'message':
      return { title: '💬 New Message', channelId: 'messages' };
    case 'broadcast_message':
      return { title: '📢 Announcement', channelId: 'messages' };

    // --- Bookings ---
    case 'booking_request':
    case 'new_booking':
      return { title: '📅 Booking Request', channelId: 'default' };
    case 'booking_approved':
      return { title: '✅ Booking Approved', channelId: 'default' };
    case 'booking_rejected':
      return { title: '❌ Booking Rejected', channelId: 'default' };
    case 'booking_cancelled':
      return { title: '❌ Booking Cancelled', channelId: 'default' };
    case 'viewing_success':
      return { title: '🎉 Viewing Successful', channelId: 'default' };

    // --- Occupancy & Contracts ---
    case 'end_occupancy_request':
      return { title: '🏠 End Occupancy Request', channelId: 'default' };
    case 'end_request_approved':
      return { title: '🏠 End Request Approved', channelId: 'default' };
    case 'contract_renewal_request':
      return { title: '📝 Contract Renewal', channelId: 'default' };
    case 'contract_renewal_approved':
      return { title: '✅ Renewal Approved', channelId: 'default' };
    case 'contract_renewal_rejected':
      return { title: '❌ Renewal Rejected', channelId: 'default' };
    case 'occupancy_assigned':
      return { title: '🏠 Occupancy Assigned', channelId: 'default' };
    case 'occupancy_ended':
      return { title: '🏠 Occupancy Ended', channelId: 'default' };

    default:
      return { title: '🔔 Abalay', channelId: 'default' };
  }
}

/**
 * Hook that listens to Supabase realtime notifications table changes
 * and triggers native push notifications for new notifications.
 * 
 * This ensures that even when the app is in the foreground,
 * users see a native notification banner at the top of the screen.
 */
export function useRealtimeNotifications(userId?: string) {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!userId) return;

    const subscribe = () => {
      // Clean up existing channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase
        .channel(`push-notif-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient=eq.${userId}`,
          },
          (payload) => {
            const newNotification = payload.new as any;
            
            // Don't show native notification if the actor is the current user
            // (i.e., the user triggered this notification themselves)
            if (newNotification.actor === userId) return;

            const { title, channelId } = getNotificationMeta(newNotification.type);

            // Trigger a native notification banner
            scheduleLocalNotification(
              title,
              newNotification.message || 'You have a new notification',
              {
                notificationId: newNotification.id,
                type: newNotification.type,
                screen: getScreenForType(newNotification.type),
              },
              channelId,
            );
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Realtime notification listener active');
          }
          if (status === 'CHANNEL_ERROR') {
            console.warn('Realtime notification channel error, retrying in 5s...');
            setTimeout(() => subscribe(), 5000);
          }
        });

      channelRef.current = channel;
    };

    subscribe();

    // Re-subscribe when app comes back to foreground
    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscribe();
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      appStateListener.remove();
    };
  }, [userId]);
}

/**
 * Maps notification type to the screen route for navigation
 */
function getScreenForType(type: string): string {
  switch (type) {
    case 'payment':
    case 'payment_request':
    case 'payment_confirmed':
    case 'payment_approved':
    case 'payment_paid':
    case 'payment_confirmation_needed':
    case 'payment_late_fee':
    case 'security_deposit_deduction':
    case 'rent_bill_reminder':
    case 'water_due_reminder':
    case 'electricity_due_reminder':
      return '/(tabs)/payments';
    case 'maintenance':
    case 'maintenance_request':
    case 'maintenance_resolved':
    case 'maintenance_in_progress':
      return '/(tabs)/maintenance';
    case 'application':
    case 'application_status':
      return '/(tabs)/applications';
    case 'message':
    case 'broadcast_message':
      return '/(tabs)/messages';
    case 'booking_request':
    case 'booking_approved':
    case 'booking_rejected':
    case 'booking_cancelled':
    case 'viewing_success':
    case 'new_booking':
      return '/(tabs)/bookings';
    default:
      return '/(tabs)/notifications';
  }
}

