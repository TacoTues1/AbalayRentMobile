import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function EntryScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        // First get the locally cached session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // Validate the session against the server (not just local cache)
          // This prevents stale/expired sessions from auto-logging users in
          const { data: { user }, error } = await supabase.auth.getUser();

          if (user && !error) {
            // Session is valid on the server -> go to dashboard
            router.replace('/(tabs)');
          } else {
            // Session is stale/expired -> clear it and show welcome
            await supabase.auth.signOut();
            router.replace('/welcome');
          }
        } else {
          // No session at all -> show welcome screen
          router.replace('/welcome');
        }
      } catch (error) {
        console.log('Session check error:', error);
        // On any error, clear session and show welcome
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        router.replace('/welcome');
      } finally {
        setChecking(false);
      }
    };

    checkSession();
  }, []);

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
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});