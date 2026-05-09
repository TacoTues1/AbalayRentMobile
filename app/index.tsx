import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { waitForRestoredSession } from "../lib/authSession";
import { getUserRouteById } from "../lib/authRedirect";

export default function EntryScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Allow storage hydration to complete before deciding user is logged out.
        const session = await waitForRestoredSession();

        if (session) {
          const destination = await getUserRouteById(session.user.id);
          router.replace(destination as any);
        } else {
          // No session -> show visitor dashboard by default
          router.replace("/(tabs)");
        }
      } catch (error) {
        console.log("Session check error:", error);
        // Avoid clearing persisted sessions for transient startup/network errors.
        router.replace("/welcome");
      } finally {
        setChecking(false);
      }
    };

    checkSession();
  }, [router]);

  // Show a brief loading spinner while checking session
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
