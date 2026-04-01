import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import AdminDashboard from "../components/auth/dashboard/AdminDashboard";
import { getRouteForRole, normalizeRole } from "../lib/authRedirect";
import { supabase } from "../lib/supabase";

export default function AdminScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const verifyAdmin = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.replace("/welcome");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();

        const normalizedRole = normalizeRole(profile?.role);
        if (normalizedRole !== "admin") {
          router.replace(getRouteForRole(normalizedRole) as any);
          return;
        }
      } catch (error) {
        console.warn("Admin guard failed:", error);
        router.replace("/welcome");
      } finally {
        if (isMounted) setChecking(false);
      }
    };

    verifyAdmin();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  return <AdminDashboard />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
