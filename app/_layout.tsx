import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import {
    LogBox,
    Platform,
    StatusBar,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useRealtimeNotifications } from "../hooks/useRealtimeNotifications";
import { supabase } from "../lib/supabase";
import { ThemeProvider, useTheme } from "../lib/theme";

SplashScreen.preventAutoHideAsync();

// Suppress MapLibre native module error in Expo Go (map gracefully falls back to null)
LogBox.ignoreLogs(["Native module of @maplibre/maplibre-react-native"]);

function NotificationManager() {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const router = useRouter();
  const lastNotificationResponse = useRef<string | null>(null);

  // Get session and track auth state
  useEffect(() => {
    const getInitialSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id);
    };
    getInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register push notifications (permission, token, foreground listener)
  usePushNotifications(userId);

  // Listen for Supabase realtime notification inserts → trigger native notifications
  useRealtimeNotifications(userId);

  // Handle notification tap → navigate to the appropriate screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const responseId = response.notification.request.identifier;

        // Prevent duplicate handling
        if (lastNotificationResponse.current === responseId) return;
        lastNotificationResponse.current = responseId;

        if (data?.screen) {
          // Small delay to ensure the app is ready for navigation
          setTimeout(() => {
            router.push(data.screen as any);
          }, 300);
        }
      },
    );

    return () => subscription.remove();
  }, [router]);

  return null; // This component only manages side effects
}

const STACK_HEADER_ROUTES = new Set([
  "properties/[id]",
  "properties/new",
  "properties/edit/[id]",
  "rented-tenant/[id]",
]);

function AppHeader({
  title,
  canGoBack,
  onBack,
  showNavigationRow,
  backgroundColor,
  borderColor,
  tintColor,
}: {
  title: string;
  canGoBack: boolean;
  onBack: () => void;
  showNavigationRow: boolean;
  backgroundColor: string;
  borderColor: string;
  tintColor: string;
}) {
  const insets = useSafeAreaInsets();
  const topInset =
    insets.top > 0
      ? insets.top
      : Platform.OS === "android"
        ? (StatusBar.currentHeight ?? 0)
        : 0;

  return (
    <View style={{ backgroundColor }}>
      <View style={{ paddingTop: topInset }} />

      {showNavigationRow ? (
        <View
          style={{
            height: 56,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            backgroundColor,
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
          }}
        >
          <View style={{ width: 40, alignItems: "flex-start" }}>
            {canGoBack ? (
              <TouchableOpacity onPress={onBack} style={{ padding: 6 }}>
                <Ionicons name="arrow-back" size={22} color={tintColor} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "center",
              color: tintColor,
              fontSize: 17,
              fontWeight: "700",
            }}
          >
            {title}
          </Text>

          <View style={{ width: 40 }} />
        </View>
      ) : null}
    </View>
  );
}

function ThemedStack() {
  const { isDark, colors } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <NotificationManager />
      <Stack
        screenOptions={({ route, navigation, options }: any) => {
          const showNavigationRow = STACK_HEADER_ROUTES.has(route.name);
          const title = typeof options?.title === "string" ? options.title : "";

          return {
            headerShown: true,
            header: ({ back }: any) => (
              <AppHeader
                title={title}
                canGoBack={Boolean(back) && showNavigationRow}
                onBack={() => navigation.goBack()}
                showNavigationRow={showNavigationRow}
                backgroundColor={isDark ? colors.headerBg : "#fff"}
                borderColor={isDark ? colors.border : "#e5e7eb"}
                tintColor={isDark ? colors.text : "#000"}
              />
            ),
          };
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="favorites" options={{ headerShown: false }} />
        <Stack.Screen name="terms" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="properties/[id]"
          options={{ title: "Property Details" }}
        />
        <Stack.Screen
          name="properties/new"
          options={{ title: "Add Property" }}
        />
        <Stack.Screen
          name="properties/edit/[id]"
          options={{ title: "Edit Property" }}
        />
        <Stack.Screen
          name="rented-tenant/[id]"
          options={{ title: "Rented Tenant" }}
        />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Pacifico_400Regular: require("../assets/fonts/Pacifico_400Regular.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}
