import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { scheduleLocalNotification } from './usePushNotifications';

const MAX_TRACKED_NOTIFICATION_IDS = 200;
const MISSED_NOTIFICATION_BACKFILL_LIMIT = 25;

function getNotificationMeta(type: string): { title: string; channelId: string } {
  switch (type) {
    case 'payment':
    case 'payment_paid':
      return { title: 'Payment Reminder', channelId: 'payments' };
    case 'auto_credit_applied':
      return { title: 'Auto Credit Applied', channelId: 'payments' };
    case 'payment_request':
      return { title: 'New Bill', channelId: 'payments' };
    case 'payment_confirmed':
    case 'payment_approved':
      return { title: 'Payment Confirmed', channelId: 'payments' };
    case 'payment_cash_accepted':
      return { title: 'Cash Payment Accepted', channelId: 'payments' };
    case 'payment_confirmation_needed':
      return { title: 'Payment Needs Confirmation', channelId: 'payments' };
    case 'payment_rejected':
      return { title: 'Payment Rejected', channelId: 'payments' };
    case 'payment_late_fee':
      return { title: 'Late Fee Applied', channelId: 'payments' };
    case 'security_deposit_deduction':
      return { title: 'Security Deposit Deduction', channelId: 'payments' };
    case 'rent_bill_reminder':
      return { title: 'Rent Reminder', channelId: 'payments' };
    case 'water_due_reminder':
      return { title: 'Water Bill Due', channelId: 'payments' };
    case 'electricity_due_reminder':
      return { title: 'Electricity Bill Due', channelId: 'payments' };
    case 'maintenance':
    case 'maintenance_request':
      return { title: 'Maintenance Request', channelId: 'default' };
    case 'maintenance_resolved':
      return { title: 'Maintenance Resolved', channelId: 'default' };
    case 'maintenance_in_progress':
      return { title: 'Maintenance In Progress', channelId: 'default' };
    case 'application':
      return { title: 'New Application', channelId: 'default' };
    case 'application_status':
      return { title: 'Application Update', channelId: 'default' };
    case 'message':
      return { title: 'New Message', channelId: 'messages' };
    case 'broadcast_message':
      return { title: 'Announcement', channelId: 'messages' };
    case 'booking_request':
    case 'new_booking':
      return { title: 'Booking Request', channelId: 'default' };
    case 'booking_approved':
      return { title: 'Booking Approved', channelId: 'default' };
    case 'booking_rejected':
      return { title: 'Booking Rejected', channelId: 'default' };
    case 'booking_cancelled':
      return { title: 'Booking Cancelled', channelId: 'default' };
    case 'viewing_success':
      return { title: 'Viewing Successful', channelId: 'default' };
    case 'end_occupancy_request':
      return { title: 'End Occupancy Request', channelId: 'default' };
    case 'end_request_approved':
      return { title: 'End Request Approved', channelId: 'default' };
    case 'contract_renewal_request':
      return { title: 'Contract Renewal', channelId: 'default' };
    case 'contract_renewal_approved':
      return { title: 'Renewal Approved', channelId: 'default' };
    case 'contract_renewal_rejected':
      return { title: 'Renewal Rejected', channelId: 'default' };
    case 'occupancy_assigned':
      return { title: 'Occupancy Assigned', channelId: 'default' };
    case 'occupancy_ended':
      return { title: 'Occupancy Ended', channelId: 'default' };
    case 'landlord_rating_received':
      return { title: 'New Landlord Rating', channelId: 'default' };
    default:
      return { title: 'Abalay', channelId: 'default' };
  }
}

function trackNotificationId(seenIds: Set<string>, notificationId: string) {
  seenIds.add(notificationId);
  if (seenIds.size <= MAX_TRACKED_NOTIFICATION_IDS) {
    return;
  }

  const trimmedIds = Array.from(seenIds).slice(
    seenIds.size - Math.floor(MAX_TRACKED_NOTIFICATION_IDS * 0.75),
  );
  seenIds.clear();
  trimmedIds.forEach((id) => seenIds.add(id));
}

/**
 * Hook that listens to Supabase realtime notifications table changes
 * and triggers native push notifications for new notifications.
 *
 * It also backfills any missed inserts after app resume or channel reconnect,
 * which makes foreground notification banners much more reliable.
 */
export function useRealtimeNotifications(
  userId?: string,
  notificationsReady: boolean = false,
) {
  const channelRef = useRef<any>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastProcessedAtRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    seenIdsRef.current = new Set();
    lastProcessedAtRef.current = new Date().toISOString();
  }, [userId]);

  useEffect(() => {
    if (!userId || !notificationsReady) {
      return;
    }

    let isMounted = true;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const markHandled = (notification: any) => {
      if (!notification?.id) {
        return;
      }

      trackNotificationId(seenIdsRef.current, String(notification.id));
      if (
        typeof notification.created_at === 'string' &&
        notification.created_at > lastProcessedAtRef.current
      ) {
        lastProcessedAtRef.current = notification.created_at;
      }
    };

    const presentNotification = async (notification: any) => {
      if (!isMounted || !notification?.id) {
        return;
      }

      const notificationId = String(notification.id);
      if (seenIdsRef.current.has(notificationId)) {
        markHandled(notification);
        return;
      }

      // Skip banners for notifications the current user created themselves.
      if (notification.actor === userId) {
        markHandled(notification);
        return;
      }

      const { title, channelId } = getNotificationMeta(notification.type);
      const delivered = await scheduleLocalNotification(
        title,
        notification.message || 'You have a new notification',
        {
          notificationId: notification.id,
          type: notification.type,
          screen: getScreenForType(notification.type),
        },
        channelId,
      );

      if (delivered) {
        markHandled(notification);
      }
    };

    const replayMissedNotifications = async () => {
      let cursor = lastProcessedAtRef.current;

      while (isMounted) {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, type, message, actor, created_at')
          .eq('recipient', userId)
          .gt('created_at', cursor)
          .order('created_at', { ascending: true })
          .limit(MISSED_NOTIFICATION_BACKFILL_LIMIT);

        if (!isMounted) {
          return;
        }

        if (error) {
          console.warn('Failed to replay missed notifications:', error.message);
          return;
        }

        if (!data || data.length === 0) {
          return;
        }

        for (const notification of data) {
          await presentNotification(notification);
        }

        const lastCreatedAt = data[data.length - 1]?.created_at;
        if (!lastCreatedAt || lastCreatedAt <= cursor) {
          return;
        }

        cursor = lastCreatedAt;
        lastProcessedAtRef.current = lastCreatedAt;

        if (data.length < MISSED_NOTIFICATION_BACKFILL_LIMIT) {
          return;
        }
      }
    };

    const subscribe = () => {
      clearReconnectTimer();

      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
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
            void presentNotification(payload.new as any);
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Realtime notification listener active');
            void replayMissedNotifications();
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(
              'Realtime notification channel error, retrying in 5 seconds...',
            );
            clearReconnectTimer();
            reconnectTimerRef.current = setTimeout(() => {
              if (isMounted) {
                subscribe();
              }
            }, 5000);
          }
        });

      channelRef.current = channel;
    };

    subscribe();

    const appStateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscribe();
      }
    });

    return () => {
      isMounted = false;
      clearReconnectTimer();
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      appStateListener.remove();
    };
  }, [notificationsReady, userId]);
}

/**
 * Maps notification type to the screen route for navigation
 */
function getScreenForType(type: string): string {
  switch (type) {
    case 'payment':
    case 'auto_credit_applied':
    case 'payment_request':
    case 'payment_confirmed':
    case 'payment_cash_accepted':
    case 'payment_approved':
    case 'payment_paid':
    case 'payment_confirmation_needed':
    case 'payment_rejected':
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
      return '/(tabs)/bookings';
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
