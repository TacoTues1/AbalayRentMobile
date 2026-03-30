import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);

// Helper to avoid simultaneous getSession calls during mount which causes token refresh race conditions
let sessionPromise: Promise<any> | null = null;
const getSafeSession = () => {
  if (!sessionPromise) {
    sessionPromise = supabase.auth.getSession().finally(() => {
      setTimeout(() => {
        sessionPromise = null;
      }, 2000); // Clear cache after a brief delay
    });
  }
  return sessionPromise;
};

function NotificationsTabIcon({
  color,
  focused,
}: {
  color: string;
  focused: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    let channel: any;
    let intervalId: any;

    const setupBadge = async () => {
      try {
        const {
          data: { session },
          error,
        } = await getSafeSession();
        if (error || !session) return;
        const userId = session.user.id;

        const fetchCount = async () => {
          const { count, error } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("recipient", userId)
            .eq("read", false);

          if (!error && isMounted) {
            setUnreadCount(count || 0);
          }
        };

        fetchCount();
        intervalId = setInterval(fetchCount, 5000);

        channel = supabase
          .channel(`badge-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `recipient=eq.${userId}`,
            },
            () => fetchCount(),
          )
          .subscribe();
      } catch (err) {
        console.warn("NotificationsTabIcon setupBadge error:", err);
      }
    };

    setupBadge();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        setupBadge();
      }
      appState.current = nextAppState;
    });

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, []);

  const badgeValue = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <View
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={focused ? "notifications" : "notifications-outline"}
        size={26}
        color={color}
      />
      {unreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -6,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "red",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "white",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "white", fontSize: 9, fontWeight: "bold" }}>
            {badgeValue}
          </Text>
        </View>
      )}
    </View>
  );
}

function MessagesTabIcon({
  color,
  focused,
}: {
  color: string;
  focused: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let isMounted = true;
    let channel: any;
    let intervalId: any;

    const setupBadge = async () => {
      try {
        const {
          data: { session },
          error,
        } = await getSafeSession();
        if (error || !session) return;
        const userId = session.user.id;

        const fetchCount = async () => {
          const { count, error } = await supabase
            .from("messages")
            .select("*", { count: "exact", head: true })
            .eq("receiver_id", userId)
            .eq("read", false);

          if (!error && isMounted) {
            setUnreadCount(count || 0);
          }
        };

        fetchCount();
        intervalId = setInterval(fetchCount, 5000);

        channel = supabase
          .channel(`msg-badge-${userId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `receiver_id=eq.${userId}`,
            },
            () => fetchCount(),
          )
          .subscribe();
      } catch (err) {
        console.warn("MessagesTabIcon setupBadge error:", err);
      }
    };

    setupBadge();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        setupBadge();
      }
      appState.current = nextAppState;
    });

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, []);

  const badgeValue = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <View
      style={{
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={focused ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
        size={22}
        color={color}
      />
      {unreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: -6,
            right: -8,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: "#FF3B30",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "#fff",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "white", fontSize: 9, fontWeight: "bold" }}>
            {badgeValue}
          </Text>
        </View>
      )}
    </View>
  );
}

function ProfileTabIcon({
  color,
  focused,
}: {
  color: string;
  focused: boolean;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [fallbackInitial, setFallbackInitial] = useState<string>("U");

  useEffect(() => {
    let isMounted = true;
    const appState = { current: AppState.currentState };

    const loadAvatar = async () => {
      try {
        const {
          data: { session },
          error,
        } = await getSafeSession();
        if (error || !session) return;

        const metaAvatar = session.user?.user_metadata?.avatar_url || "";
        const metaName =
          session.user?.user_metadata?.full_name ||
          session.user?.user_metadata?.name ||
          session.user?.email ||
          "User";
        if (isMounted) {
          setFallbackInitial(
            String(metaName).trim().charAt(0).toUpperCase() || "U",
          );
        }

        const { data } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", session.user.id)
          .single();

        if (isMounted) {
          setAvatarUrl(data?.avatar_url || metaAvatar || "");
        }
      } catch (err) {
        console.warn("ProfileTabIcon loadAvatar error:", err);
      }
    };

    loadAvatar();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        loadAvatar();
      }
      appState.current = nextAppState;
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  if (avatarUrl) {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          overflow: "hidden",
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? "#111" : "#d1d5db",
        }}
      >
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: "100%", height: "100%" }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? "#111" : "#d1d5db",
        backgroundColor: focused ? "#111" : "#f3f4f6",
      }}
    >
      <Text
        style={{
          color: focused ? "#fff" : "#374151",
          fontSize: 11,
          fontWeight: "700",
        }}
      >
        {fallbackInitial}
      </Text>
    </View>
  );
}

const VISIBLE_TABS = ["index", "messages", "notifications", "profile"];

const TabBarItem = ({ route, options, isFocused, onPress, isDark }: any) => {
  const activeColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(240,241,243,1)";

  const itemSizeStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(isFocused ? 66 : 50, { duration: 220 }),
    };
  }, [isFocused]);

  const bgStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isFocused ? 1 : 0, { duration: 300 }),
    };
  }, [isFocused]);

  return (
    <AnimatedTouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[
        {
          height: 50,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 25,
          marginHorizontal: 1,
          overflow: "hidden",
        },
        itemSizeStyle,
      ]}
    >
      {/* Background layer animated via opacity */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: activeColor, borderRadius: 25 },
          bgStyle,
        ]}
      />

      <View
        style={{ alignItems: "center", justifyContent: "center", zIndex: 1 }}
      >
        {options.tabBarIcon
          ? options.tabBarIcon({
              focused: isFocused,
              color: isFocused
                ? isDark
                  ? "#fff"
                  : "#111"
                : isDark
                  ? "rgba(255,255,255,0.4)"
                  : "#9ca3af",
              size: 20,
            })
          : null}
      </View>
    </AnimatedTouchableOpacity>
  );
};

const CustomTabBar = ({ state, descriptors, navigation }: any) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  const [userRole, setUserRole] = useState<string | null>(null);
  const routes = state.routes.filter((route: any) =>
    VISIBLE_TABS.includes(route.name),
  );

  useEffect(() => {
    let isMounted = true;
    const fetchRole = async () => {
      try {
        const {
          data: { session },
        } = await getSafeSession();
        if (!session) return;
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        if (isMounted && data) setUserRole(data.role);
      } catch (e) {
        console.warn("CustomTabBar fetchRole error:", e);
      }
    };
    fetchRole();
    return () => {
      isMounted = false;
    };
  }, []);

  const bottomOffset = Platform.OS === "ios" ? 22 : Math.max(insets.bottom, 10);

  return (
    <View
      style={{
        position: "absolute",
        bottom: bottomOffset,
        left: 16,
        right: 16,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View
        style={{
          width: userRole === "landlord" ? 280 : 300,
          flexDirection: "row",
          justifyContent: "space-evenly",
          backgroundColor: isDark ? colors.tabBarBg : "#ffffff",
          borderRadius: 28,
          borderWidth: 1.5,
          borderColor: isDark ? colors.tabBarBorder : "#E8E8E8",
          paddingHorizontal: 4,
          height: 54,
          elevation: isDark ? 0 : 5,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.08,
          shadowRadius: isDark ? 0 : 10,
          alignItems: "center",
        }}
      >
        {routes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === state.routes.indexOf(route);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TabBarItem
              key={route.key}
              route={route}
              options={options}
              isFocused={isFocused}
              onPress={onPress}
              isDark={isDark}
            />
          );
        })}
      </View>

      {userRole === "landlord" && (
        <TouchableOpacity
          activeOpacity={0.7}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: "#000",
            elevation: 5,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={() => router.push("/properties/new")}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="allproperties"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "business" : "business-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="landlordproperties" options={{ href: null }} />
      <Tabs.Screen
        name="messages"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <MessagesTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <NotificationsTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <ProfileTabIcon color={color} focused={focused} />
          ),
        }}
      />

      {/* Hidden Screens */}
      <Tabs.Screen name="maintenance" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="schedule" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="applications" options={{ href: null }} />
      <Tabs.Screen name="terms" options={{ href: null }} />
      <Tabs.Screen name="assigntenant" options={{ href: null }} />
    </Tabs>
  );
}
