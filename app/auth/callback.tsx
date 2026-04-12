import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { getUserRouteById } from "../../lib/authRedirect";
import { supabase } from "../../lib/supabase";

/**
 * OAuth callback landing page.
 *
 * When the Google OAuth flow completes, the in-app browser redirects to
 * `abalay://auth/callback?...`.  Expo Router resolves this to the current
 * file.  We silently extract the tokens / code from the URL, establish the
 * Supabase session, and forward the user to their dashboard – all without
 * showing any visible UI beyond a brief spinner.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
    code?: string;
  }>();

  useEffect(() => {
    const handle = async () => {
      try {
        const { access_token, refresh_token, code } = params;

        if (access_token && refresh_token) {
          await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
        } else if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }

        // Wait briefly for the session to propagate
        let session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          // Poll a few times in case there's a small delay
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 500));
            session = (await supabase.auth.getSession()).data.session;
            if (session) break;
          }
        }

        if (session) {
          const destination = await getUserRouteById(session.user.id);
          router.replace(destination as any);
        } else {
          // No session could be established – fall back to login
          router.replace("/login");
        }
      } catch (error) {
        console.warn("OAuth callback error:", error);
        router.replace("/login");
      }
    };

    handle();
  }, []);

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
