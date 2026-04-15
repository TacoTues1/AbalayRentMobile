import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Hook to manage push notifications:
 * - Requests permission
 * - Gets the Expo push token
 * - Stores it in Supabase (profiles.push_token)
 * - Listens for incoming notifications (foreground)
 * - Listens for notification responses (when user taps)
 */
export function usePushNotifications(userId?: string) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [notificationsReady, setNotificationsReady] = useState<boolean>(false);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const lastSavedPushStateRef = useRef<{ userId: string; token: string } | null>(
    null,
  );

  useEffect(() => {
    if (!userId) {
      setExpoPushToken(null);
      setNotification(null);
      setPermissionGranted(false);
      setNotificationsReady(false);
      lastSavedPushStateRef.current = null;
      return;
    }

    let isMounted = true;

    const initializeNotifications = async () => {
      setNotificationsReady(false);

      const { token, granted } = await registerForPushNotificationsAsync();
      if (!isMounted) return;

      setPermissionGranted(granted);
      setNotificationsReady(granted);
      setExpoPushToken(token);

      const alreadySaved =
        lastSavedPushStateRef.current?.token === token &&
        lastSavedPushStateRef.current?.userId === userId;

      if (token && !alreadySaved) {
        lastSavedPushStateRef.current = { userId, token };
        // Save to Supabase so the server can send push notifications to this device
        void savePushToken(userId, token);
      }
    };

    void initializeNotifications();

    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
    });

    // Refresh permission state and channels when the app returns to foreground.
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void initializeNotifications();
      }
    });

    return () => {
      isMounted = false;
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      appStateSubscription.remove();
    };
  }, [userId]);

  return { expoPushToken, notification, permissionGranted, notificationsReady };
}

/**
 * Request permission and get the Expo push token
 */
async function registerForPushNotificationsAsync(): Promise<{
  token: string | null;
  granted: boolean;
}> {
  await ensureNotificationChannelsAsync();

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return { token: null, granted: false };
  }

  // Check existing permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // If not granted, request it
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return { token: null, granted: false };
  }

  // Get the Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '275e7f6a-6e1c-4953-a990-b5376e1f53de',
    });
    return { token: tokenData.data, granted: true };
  } catch (error) {
    console.error('Error getting push token:', error);
    // Local in-app notifications can still work without a push token.
    return { token: null, granted: true };
  }
}

async function ensureNotificationChannelsAsync() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563eb',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('payments', {
    name: 'Payments',
    description: 'Payment reminders and confirmations',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    description: 'New messages from landlords or tenants',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

/**
 * Save push token to Supabase so server can send notifications
 */
async function savePushToken(userId: string, token: string) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', userId);

    if (error) {
      console.log('Error saving push token:', error.message);
    } else {
      console.log('Push token saved successfully');
    }
  } catch (err) {
    console.log('Error saving push token:', err);
  }
}

/**
 * Schedule a local notification (used for realtime events when app is in foreground)
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  channelId?: string,
) {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return false;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      // On Android, use a channel-aware trigger to route to the correct notification channel.
      // On iOS or when no channel is specified, use null for immediate delivery.
      trigger: Platform.OS === 'android' && channelId ? { channelId } : null,
    });
    return true;
  } catch (error) {
    console.error('Error scheduling local notification:', error);
    return false;
  }
}

