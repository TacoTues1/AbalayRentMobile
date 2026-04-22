import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LogoutScreen() {
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        const performLogout = async () => {
            try {
                // 1. Standard Sign Out
                await supabase.auth.signOut();
                
                // 2. Forceful manual clear of AsyncStorage keys related to Supabase
                // This ensures that even if signOut() fails or throws an error,
                // the local session is definitively removed.
                const keys = await AsyncStorage.getAllKeys();
                const authKeys = keys.filter(key => key.includes('auth-token'));
                for (const key of authKeys) {
                    await AsyncStorage.removeItem(key);
                }

                // 3. Wait to ensure filesystem writes are finished
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.log("Logout error caught, proceeding with manual clear:", error);
                try {
                    const keys = await AsyncStorage.getAllKeys();
                    const authKeys = keys.filter(key => key.includes('auth-token'));
                    for (const key of authKeys) {
                        await AsyncStorage.removeItem(key);
                    }
                } catch (e) {
                    console.log("Manual clear failed:", e);
                }
            } finally {
                if (isMounted) {
                    router.replace('/');
                }
            }
        };

        performLogout();

        return () => { isMounted = false; };
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
            <ActivityIndicator size="large" color="black" />
        </View>
    );
}
