import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";

export default function FavoritesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/");
        return;
      }

      setSession(session);

      const { data: favoriteRows, error: favoriteError } = await supabase
        .from("favorites")
        .select("property_id, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (favoriteError) throw favoriteError;

      const ids = (favoriteRows || []).map((row: any) => row.property_id);
      if (!ids.length) {
        setFavorites([]);
        return;
      }

      const { data: properties, error: propertyError } = await supabase
        .from("properties")
        .select("id, title, city, address, price, images, status")
        .in("id", ids)
        .eq("is_deleted", false);

      if (propertyError) throw propertyError;

      const propertyMap = (properties || []).reduce(
        (acc: any, property: any) => {
          acc[property.id] = property;
          return acc;
        },
        {},
      );

      const ordered = ids.map((id: string) => propertyMap[id]).filter(Boolean);

      setFavorites(ordered);
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to load favorites.");
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (propertyId: string) => {
    if (!session?.user?.id) return;

    const previous = [...favorites];
    setFavorites((prev) => prev.filter((item) => item.id !== propertyId));

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", session.user.id)
      .eq("property_id", propertyId);

    if (error) {
      setFavorites(previous);
      Alert.alert("Error", error.message || "Failed to remove favorite.");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.title}>My Favorites</Text>
        <View style={{ width: 34 }} />
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="heart-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyTitle}>No favorite properties yet</Text>
          <Text style={styles.emptyText}>
            Tap heart on a property to save it here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listWrap}>
          {favorites.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              activeOpacity={0.9}
              onPress={() => router.push(`/properties/${item.id}` as any)}
            >
              <Image
                source={{
                  uri: item.images?.[0] || "https://via.placeholder.com/500",
                }}
                style={styles.cardImage}
              />

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title || "Untitled Property"}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.city || "Unknown City"} • {item.address || "No address"}
                </Text>
                <Text style={styles.cardPrice}>
                  PHP {Number(item.price || 0).toLocaleString()}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.heartButton}
                onPress={() => removeFavorite(item.id)}
              >
                <Ionicons name="heart" size={18} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: "#6b7280",
  },
  listWrap: {
    padding: 14,
    paddingBottom: 30,
    gap: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 150,
    backgroundColor: "#e5e7eb",
  },
  cardBody: {
    padding: 12,
    paddingRight: 46,
  },
  cardTitle: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "800",
  },
  cardMeta: {
    marginTop: 3,
    color: "#6b7280",
    fontSize: 12,
  },
  cardPrice: {
    marginTop: 8,
    color: "#111827",
    fontWeight: "800",
    fontSize: 14,
  },
  heartButton: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
});
