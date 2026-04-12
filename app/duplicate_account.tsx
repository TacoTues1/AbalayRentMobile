import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

export default function DuplicateAccount() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Confirm Deletion",
      "This will permanently delete your account data. You can then sign in with your original account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete & Sign Out",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              if (session) {
                const { error: deleteAccountError } =
                  await supabase.functions.invoke("delete-account", {
                    headers: session?.access_token
                      ? { Authorization: `Bearer ${session.access_token}` }
                      : undefined,
                  });

                if (deleteAccountError) {
                  const message = String(deleteAccountError.message || "");
                  const functionUnavailable =
                    /404|not found|delete-account/i.test(message);

                  if (!functionUnavailable) throw deleteAccountError;

                  const { error: profileError } = await supabase
                    .from("profiles")
                    .delete()
                    .eq("id", session.user.id);

                  if (profileError) throw profileError;
                }

                // 2. Sign Out
                await supabase.auth.signOut();

                Alert.alert("Account Deleted", "You have been signed out.");
                router.replace("/");
              }
            } catch (error: any) {
              Alert.alert(
                "Error",
                "Could not delete account. Please contact support.",
              );
              // Fallback sign out so they aren't stuck
              await supabase.auth.signOut();
              router.replace("/");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="warning" size={80} color="#dc2626" />

        <Text style={styles.title}>DUPLICATE ACCOUNT</Text>

        <Text style={styles.subtitle}>
          Our system detected that your phone number is already associated with
          another account.
        </Text>
        <Text style={styles.instruction}>
          To maintain security, duplicate accounts are not allowed. Please
          delete this account and sign in with your existing credentials.
        </Text>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDeleteAccount}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.btnText}>Delete Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fef2f2" }, // Light red background
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#991b1b",
    marginTop: 20,
    letterSpacing: 2,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    color: "#7f1d1d",
    marginBottom: 10,
  },
  instruction: {
    fontSize: 14,
    textAlign: "center",
    color: "#b91c1c",
    marginBottom: 40,
    lineHeight: 20,
  },
  deleteBtn: {
    backgroundColor: "#dc2626",
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 12,
    shadowColor: "#dc2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  btnText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
    textTransform: "uppercase",
  },
});
