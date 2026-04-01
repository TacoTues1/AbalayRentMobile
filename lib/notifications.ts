import { supabase } from './supabase';

export type NotificationType =
  | 'payment'
  | 'auto_credit_applied'
  | 'payment_confirmed'
  | 'maintenance'
  | 'application'
  | 'application_status'
  | 'message'
  | 'booking_request'
  | 'booking_approved'
  | 'booking_rejected'
  | 'landlord_rating_received'
  | string; // fallback for any future types

export async function createNotification(
  recipientId: string,
  type: NotificationType,
  message: string,
  extras: Record<string, any> = {},
) {
  try {
    const payload: Record<string, any> = {
      recipient: recipientId,
      type,
      message,
      read: false,
    };

    if (typeof extras.actor !== 'undefined') {
      payload.actor = extras.actor;
    }

    if (typeof extras.link !== 'undefined') {
      payload.link = extras.link;
    }

    if (typeof extras.data !== 'undefined') {
      payload.data = extras.data;
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // Client-side inserts can be blocked by RLS for certain roles.
      // Treat this as a soft failure so UI flows can continue without noisy logs.
      if (error.code === '42501') {
        return null;
      }
      console.log('Notification insert error:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.log('Notification creation failed:', err);
    return null;
  }
}


