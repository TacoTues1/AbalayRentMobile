import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebViewMap from "../../components/WebViewMap";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const { width } = Dimensions.get("window");

const canUseNativeMapLibre =
  Platform.OS !== "web" && Constants.appOwnership !== "expo";
const MapLibreGL: any = canUseNativeMapLibre
  ? require("@maplibre/maplibre-react-native").default
  : null;
const MAPLIBRE_LOW_MEMORY_PROPS = {
  attributionEnabled: false,
  logoEnabled: false,
  compassEnabled: false,
  scaleBarEnabled: false,
  preferredFramesPerSecond: 30,
  surfaceView: Platform.OS === "android",
};

// --- Distance Calculation Helper ---
function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const extractCoordinates = (link: string | null) => {
  if (!link) return null;
  const atMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const qMatch = link.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  const placeMatch = link.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/);
  const match = atMatch || qMatch || placeMatch;
  if (match) {
    return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
  }
  return null;
};

export default function AllProperties() {
  const router = useRouter();
  const { isDark, colors } = useTheme();

  // -- STATE --
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [filterMostFavorite, setFilterMostFavorite] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [filterNearMe, setFilterNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<any>(null);

  // Comparison & Favorites
  const [comparisonList, setComparisonList] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [propertyStats, setPropertyStats] = useState<any>({});

  // UI State
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showMapView, setShowMapView] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );

  const availableAmenities = [
    "Wifi",
    "Air Condition",
    "Washing Machine",
    "Parking",
    "Hot Shower",
    "Bathroom",
    "Smoke Alarm",
    "Veranda",
    "Fire Extinguisher",
    "Outside Garden",
    "Furnished",
    "Semi-Furnished",
    "Pet Friendly",
    "Kitchen",
    "Smart TV",
  ];

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setSession(session);

    if (session?.user?.id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      setProfile(prof);
    }

    loadProperties(session?.user?.id);
  };

  const loadProperties = async (userId?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from("properties")
        .select(
          "*, landlord_profile:profiles!properties_landlord_fkey(first_name, last_name)",
        )
        .eq("is_deleted", false);

      // Always show available properties for browsing
      query = query.eq("status", "available");

      const { data: props, error } = await query;
      if (error) throw error;

      // 2. Fetch Stats (Ratings, Counts)
      const { data: stats } = await supabase.from("property_stats").select("*");
      const statsMap: any = {};
      if (stats) {
        stats.forEach((s: any) => {
          statsMap[s.property_id] = s;
        });
      }
      setPropertyStats(statsMap);

      // 3. Fetch User Favorites
      if (userId) {
        const { data: favs } = await supabase
          .from("favorites")
          .select("property_id")
          .eq("user_id", userId);
        if (favs) setFavorites(favs.map((f: any) => f.property_id));
      }

      setProperties(props || []);
    } catch (err: any) {
      console.error("Error loading properties:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // --- ACTIONS ---

  const toggleFavorite = async (propId: string) => {
    if (!session)
      return Alert.alert(
        "Sign In Required",
        "Please sign in to save favorites.",
      );

    const isFav = favorites.includes(propId);
    let newFavs = [...favorites];

    if (isFav) {
      newFavs = newFavs.filter((id) => id !== propId);
      setFavorites(newFavs);
      await supabase
        .from("favorites")
        .delete()
        .eq("user_id", session.user.id)
        .eq("property_id", propId);
    } else {
      newFavs.push(propId);
      setFavorites(newFavs);
      await supabase
        .from("favorites")
        .insert({ user_id: session.user.id, property_id: propId });
    }
  };

  const toggleCompare = (property: any) => {
    setComparisonList((prev) => {
      const exists = prev.find((p) => p.id === property.id);
      if (exists) {
        return prev.filter((p) => p.id !== property.id);
      } else {
        if (prev.length >= 3) {
          Alert.alert("Limit Reached", "You can compare up to 3 properties.");
          return prev;
        }
        return [...prev, property];
      }
    });
  };

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenity)
        ? prev.filter((a) => a !== amenity)
        : [...prev, amenity],
    );
  };

  const handleToggleNearMe = async () => {
    if (filterNearMe) {
      setFilterNearMe(false);
      setUserLocation(null);
      setShowMapView(false);
    } else {
      setLoading(true);
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Please enable location services to use this feature.",
          );
          setLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        setFilterNearMe(true);
        setShowMapView(true);
      } catch (error) {
        console.error("Geolocation error:", error);
        Alert.alert(
          "Error",
          "Could not get your location. Please check your device settings.",
        );
      } finally {
        setLoading(false);
      }
    }
  };

  const clearFilters = () => {
    setPriceRange({ min: "", max: "" });
    setSelectedAmenities([]);
    setMinRating(0);
    setFilterMostFavorite(false);
    setSortBy("newest");
    setFilterNearMe(false);
    setUserLocation(null);
    setShowMapView(false);
  };

  // --- FILTERING LOGIC ---
  const getFilteredProperties = () => {
    return properties
      .filter((item) => {
        const stats = propertyStats[item.id] || {
          avg_rating: 0,
          review_count: 0,
          favorite_count: 0,
        };

        const matchSearch =
          item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.city?.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchSearch) return false;

        if (priceRange.min && item.price < parseFloat(priceRange.min))
          return false;
        if (priceRange.max && item.price > parseFloat(priceRange.max))
          return false;

        if (selectedAmenities.length > 0) {
          const itemAmenities = item.amenities || [];
          const hasAll = selectedAmenities.every((a) =>
            itemAmenities.includes(a),
          );
          if (!hasAll) return false;
        }

        if (minRating > 0 && (stats.avg_rating || 0) < minRating) return false;
        if (filterMostFavorite && (stats.favorite_count || 0) < 1) return false;

        if (filterNearMe && userLocation) {
          const coords =
            item.latitude && item.longitude
              ? { lat: item.latitude, lng: item.longitude }
              : extractCoordinates(item.location_link);
          if (!coords || !coords.lat || !coords.lng) return false;
          const dist = getDistanceFromLatLonInKm(
            userLocation.latitude,
            userLocation.longitude,
            coords.lat,
            coords.lng,
          );
          if (dist > 1) return false; // within 1km
        }

        return true;
      })
      .sort((a, b) => {
        const statsA = propertyStats[a.id] || {};
        const statsB = propertyStats[b.id] || {};

        switch (sortBy) {
          case "price_asc":
            return a.price - b.price;
          case "price_desc":
            return b.price - a.price;
          case "rating":
            return (statsB.avg_rating || 0) - (statsA.avg_rating || 0);
          default:
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
        }
      });
  };

  const filteredData = getFilteredProperties();

  // Compute Top Rated & Most Favorite property IDs
  const statsArray = Object.values(propertyStats) as any[];
  const mostFavId =
    statsArray
      .filter((s: any) => (s.favorite_count || 0) > 0)
      .sort((a: any, b: any) => b.favorite_count - a.favorite_count)[0]
      ?.property_id || null;
  const topRatedId =
    statsArray
      .filter((s: any) => (s.review_count || 0) > 0)
      .sort(
        (a: any, b: any) =>
          (b.avg_rating || 0) - (a.avg_rating || 0) ||
          b.review_count - a.review_count,
      )[0]?.property_id || null;

  // --- RENDERERS ---

  const renderCard = (item: any) => {
    const stats = propertyStats[item.id] || {
      avg_rating: 0,
      review_count: 0,
      favorite_count: 0,
    };
    const isFav = favorites.includes(item.id);
    const isCompare = comparisonList.some((c) => c.id === item.id);

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card,
          { backgroundColor: isDark ? colors.card : "white" },
        ]}
        onPress={() => router.push(`/properties/${item.id}` as any)}
        activeOpacity={0.9}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{
              uri: item.images?.[0] || "https://via.placeholder.com/400",
            }}
            style={styles.cardImage}
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={styles.gradient}
          />

          {/* Badges */}
          <View style={styles.badgeContainer}>
            {topRatedId === item.id && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
                ]}
              >
                <Ionicons name="trophy" size={8} color="#d97706" />
                <Text
                  style={[
                    styles.badgeText,
                    { color: "#d97706", marginLeft: 2 },
                  ]}
                >
                  Top Rated
                </Text>
              </View>
            )}
            {mostFavId === item.id && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: "#fff1f2", borderColor: "#fecdd3" },
                ]}
              >
                <Ionicons name="heart" size={8} color="#e11d48" />
                <Text
                  style={[
                    styles.badgeText,
                    { color: "#e11d48", marginLeft: 2 },
                  ]}
                >
                  Most Favorite
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                toggleFavorite(item.id);
              }}
              style={styles.iconBtn}
            >
              <Ionicons
                name={isFav ? "heart" : "heart-outline"}
                size={16}
                color={isFav ? "#ef4444" : "#333"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                toggleCompare(item);
              }}
              style={[
                styles.iconBtn,
                isCompare && { backgroundColor: "black" },
              ]}
            >
              <Ionicons
                name={isCompare ? "checkmark" : "git-compare-outline"}
                size={16}
                color={isCompare ? "white" : "#333"}
              />
            </TouchableOpacity>
          </View>

          {/* Price Overlay */}
          <View style={styles.priceOverlay}>
            <Text style={styles.priceText}>
              ₱{(item.price || 0).toLocaleString()}
            </Text>
            <Text style={styles.periodText}>/mo</Text>
          </View>
        </View>

        <View
          style={[
            styles.cardContent,
            { borderTopColor: isDark ? colors.border : "#f3f4f6" },
          ]}
        >
          <Text
            style={[styles.cardTitle, { color: isDark ? colors.text : "#111" }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 3,
              marginTop: 2,
            }}
          >
            <Ionicons
              name="location-outline"
              size={10}
              color={isDark ? colors.textMuted : "#9ca3af"}
            />
            <Text
              style={[
                styles.cardAddress,
                { color: isDark ? colors.textMuted : "#9ca3af" },
              ]}
              numberOfLines={1}
            >
              {item.city}
            </Text>
          </View>
          {/* Rating */}
          {stats.review_count > 0 && (
            <View style={[styles.ratingBox, { marginTop: 6 }]}>
              <Ionicons name="star" size={10} color="#fbbf24" />
              <Text style={{ fontSize: 10, fontWeight: "bold", marginLeft: 2 }}>
                {stats.avg_rating.toFixed(1)}
              </Text>
              <Text style={{ fontSize: 9, color: "#666", marginLeft: 1 }}>
                ({stats.review_count})
              </Text>
            </View>
          )}

          <View
            style={[
              styles.metaBox,
              { borderTopColor: isDark ? colors.border : "#f3f4f6" },
            ]}
          >
            <Ionicons
              name="bed-outline"
              size={12}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textSecondary : "#444" },
              ]}
            >
              {item.bedrooms}
            </Text>
            <Text
              style={{ color: isDark ? colors.border : "#ddd", fontSize: 10 }}
            >
              |
            </Text>
            <Ionicons
              name="water-outline"
              size={12}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textSecondary : "#444" },
              ]}
            >
              {item.bathrooms}
            </Text>
            <Text
              style={{ color: isDark ? colors.border : "#ddd", fontSize: 10 }}
            >
              |
            </Text>
            <Ionicons
              name="resize-outline"
              size={12}
              color={isDark ? colors.textSecondary : "#666"}
            />
            <Text
              style={[
                styles.metaText,
                { color: isDark ? colors.textSecondary : "#444" },
              ]}
            >
              {item.area_sqft}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#f9fafb" },
      ]}
      edges={["top"]}
    >
      {/* Header & Search */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.headerBg : "white",
            borderBottomColor: isDark ? colors.border : "#f3f4f6",
          },
        ]}
      >
        <View
          style={[
            styles.searchBar,
            { backgroundColor: isDark ? colors.card : "#f3f4f6" },
          ]}
        >
          <Ionicons
            name="search"
            size={18}
            color={isDark ? colors.textMuted : "#9ca3af"}
          />
          <TextInput
            placeholder="Search by city, title, or keyword..."
            placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
            style={[
              styles.searchInput,
              { color: isDark ? colors.text : "#111" },
            ]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={isDark ? colors.textMuted : "#ccc"}
              />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.filterBtn,
            {
              backgroundColor: isDark ? colors.card : "#fff",
              borderColor: isDark ? colors.border : "#e5e7eb",
            },
          ]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons
            name="options-outline"
            size={22}
            color={isDark ? colors.text : "black"}
          />
        </TouchableOpacity>
      </View>

      {/* Page Title */}
      <View style={styles.pageTitleBar}>
        <Text
          style={[styles.pageTitle, { color: isDark ? colors.text : "#111" }]}
        >
          Browse Properties
        </Text>
        <View
          style={[
            styles.resultBadge,
            { backgroundColor: isDark ? colors.text : "#111" },
          ]}
        >
          <Text
            style={[
              styles.resultBadgeText,
              { color: isDark ? colors.background : "white" },
            ]}
          >
            {filteredData.length}
          </Text>
        </View>
      </View>

      {/* Active Filters */}
      {(selectedAmenities.length > 0 ||
        minRating > 0 ||
        filterMostFavorite ||
        filterNearMe) && (
        <View style={{ height: 50 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              alignItems: "center",
              gap: 8,
            }}
          >
            {filterNearMe && (
              <View style={styles.activeFilterChip}>
                <Text style={styles.activeFilterText}>📍 Near Me &lt;1km</Text>
                <TouchableOpacity onPress={() => handleToggleNearMe()}>
                  <Ionicons name="close" size={12} color="white" />
                </TouchableOpacity>
              </View>
            )}
            {filterMostFavorite && (
              <View style={styles.activeFilterChip}>
                <Text style={styles.activeFilterText}>♥ Guest Favorites</Text>
                <TouchableOpacity onPress={() => setFilterMostFavorite(false)}>
                  <Ionicons name="close" size={12} color="white" />
                </TouchableOpacity>
              </View>
            )}
            {minRating > 0 && (
              <View style={styles.activeFilterChip}>
                <Text style={styles.activeFilterText}>★ {minRating}+</Text>
                <TouchableOpacity onPress={() => setMinRating(0)}>
                  <Ionicons name="close" size={12} color="white" />
                </TouchableOpacity>
              </View>
            )}
            {selectedAmenities.map((a) => (
              <View key={a} style={styles.activeFilterChip}>
                <Text style={styles.activeFilterText}>{a}</Text>
                <TouchableOpacity onPress={() => toggleAmenity(a)}>
                  <Ionicons name="close" size={12} color="white" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={clearFilters}>
              <Text
                style={{
                  fontSize: 12,
                  color: "#ef4444",
                  fontWeight: "bold",
                  marginLeft: 5,
                }}
              >
                Clear All
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Main Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="black" />
        </View>
      ) : showMapView && filterNearMe && Platform.OS !== "web" && MapLibreGL ? (
        <View style={{ flex: 1 }}>
          <MapLibreGL.MapView
            style={StyleSheet.absoluteFillObject}
            styleURL="https://tiles.openfreemap.org/styles/bright"
            {...MAPLIBRE_LOW_MEMORY_PROPS}
          >
            <MapLibreGL.Camera
              centerCoordinate={
                userLocation
                  ? [userLocation.longitude, userLocation.latitude]
                  : [123.8854, 10.3157]
              }
              zoomLevel={filterNearMe ? 14 : 12}
            />

            {filteredData.map((item, index) => {
              const coords =
                item.latitude && item.longitude
                  ? { lat: item.latitude, lng: item.longitude }
                  : extractCoordinates(item.location_link);
              if (!coords || !coords.lat || !coords.lng) return null;

              let matches = 0;
              for (let i = 0; i < index; i++) {
                const otherItem = filteredData[i];
                const otherCoords =
                  otherItem.latitude && otherItem.longitude
                    ? { lat: otherItem.latitude, lng: otherItem.longitude }
                    : extractCoordinates(otherItem.location_link);
                if (
                  otherCoords &&
                  Math.abs(otherCoords.lat - coords.lat) < 0.00001 &&
                  Math.abs(otherCoords.lng - coords.lng) < 0.00001
                ) {
                  matches++;
                }
              }
              const jitterOffset = 0.00015;
              const angle = matches * (Math.PI / 4);
              const adjustedLat =
                coords.lat + (matches > 0 ? jitterOffset * Math.sin(angle) : 0);
              const adjustedLng =
                coords.lng + (matches > 0 ? jitterOffset * Math.cos(angle) : 0);

              return (
                <MapLibreGL.PointAnnotation
                  key={`marker-${item.id}`}
                  id={`marker-${item.id}`}
                  coordinate={[adjustedLng, adjustedLat]}
                  onSelected={() => setSelectedPropertyId(item.id)}
                >
                  <View
                    style={[
                      styles.mapMarker,
                      selectedPropertyId === item.id &&
                        styles.mapMarkerSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mapMarkerText,
                        selectedPropertyId === item.id && { color: "white" },
                      ]}
                    >
                      ₱
                      {item.price >= 1000
                        ? (item.price / 1000).toFixed(1) + "k"
                        : item.price}
                    </Text>
                  </View>
                </MapLibreGL.PointAnnotation>
              );
            })}

            {filterNearMe &&
              userLocation &&
              (() => {
                const points = 40;
                const km = 1;
                const coordinates = [];
                for (let i = 0; i <= points; i++) {
                  const a = (i / points) * 2 * Math.PI;
                  const dx = km * Math.cos(a);
                  const dy = km * Math.sin(a);
                  const lat = userLocation.latitude + dy / 111.32;
                  const lng =
                    userLocation.longitude +
                    dx /
                      (111.32 *
                        Math.cos((userLocation.latitude * Math.PI) / 180));
                  coordinates.push([lng, lat]);
                }
                return (
                  <MapLibreGL.ShapeSource
                    id="near-me-circle"
                    shape={{
                      type: "Feature",
                      geometry: { type: "Polygon", coordinates: [coordinates] },
                      properties: {},
                    }}
                  >
                    <MapLibreGL.FillLayer
                      id="near-me-fill"
                      style={{
                        fillColor: "rgba(59, 130, 246, 0.2)",
                        fillOutlineColor: "rgba(59, 130, 246, 0.5)",
                      }}
                    />
                  </MapLibreGL.ShapeSource>
                );
              })()}

            {userLocation && (
              <MapLibreGL.PointAnnotation
                id="user-location"
                coordinate={[userLocation.longitude, userLocation.latitude]}
              >
                <View style={styles.userLocationMarker}>
                  <View style={styles.userLocationDot} />
                </View>
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>

          {selectedPropertyId && (
            <View style={styles.mapCardOverlay}>
              {filteredData.find((p) => p.id === selectedPropertyId) &&
                renderCard(
                  filteredData.find((p) => p.id === selectedPropertyId),
                )}
            </View>
          )}
        </View>
      ) : showMapView &&
        filterNearMe &&
        Platform.OS !== "web" &&
        !MapLibreGL ? (
        <View style={{ flex: 1 }}>
          <WebViewMap
            center={
              userLocation
                ? [userLocation.longitude, userLocation.latitude]
                : [123.8854, 10.3157]
            }
            zoom={14}
            interactive={true}
            markers={
              filteredData
                .map((item) => {
                  const coords =
                    item.latitude && item.longitude
                      ? { lat: item.latitude, lng: item.longitude }
                      : extractCoordinates(item.location_link);
                  if (!coords || !coords.lat || !coords.lng) return null;
                  return {
                    id: `marker-${item.id}`,
                    coordinate: [coords.lng, coords.lat] as [number, number],
                    title: `₱${item.price >= 1000 ? (item.price / 1000).toFixed(1) + "k" : item.price}`,
                    color: "#111",
                  };
                })
                .filter(Boolean) as any[]
            }
            showMarkerLabels={true}
            userLocation={userLocation || undefined}
            circleOverlay={
              userLocation
                ? {
                    center: [userLocation.longitude, userLocation.latitude],
                    radiusKm: 1,
                  }
                : undefined
            }
            style={StyleSheet.absoluteFillObject}
          />

          {selectedPropertyId && (
            <View style={styles.mapCardOverlay}>
              {filteredData.find((p) => p.id === selectedPropertyId) &&
                renderCard(
                  filteredData.find((p) => p.id === selectedPropertyId),
                )}
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 10, paddingBottom: 130 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadProperties(session?.user?.id)}
            />
          }
        >
          <View style={styles.gridContainer}>
            {filteredData.map(renderCard)}
          </View>
          {filteredData.length === 0 && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="home-outline" size={40} color="#d1d5db" />
              </View>
              <Text style={styles.emptyTitle}>No properties found</Text>
              <Text style={styles.emptySubtitle}>
                Try adjusting your search or filters.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Map/List Toggle Float Button */}
      {!loading && filterNearMe && (
        <TouchableOpacity
          style={styles.mapToggleBtn}
          onPress={() => setShowMapView(!showMapView)}
        >
          <Ionicons
            name={showMapView ? "list" : "map"}
            size={20}
            color="white"
            style={{ marginRight: 8 }}
          />
          <Text style={{ color: "white", fontWeight: "bold" }}>
            {showMapView ? "List View" : "Map View"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Comparison Floating Button */}
      {comparisonList.length > 0 && (
        <TouchableOpacity
          style={styles.compareFloatBtn}
          onPress={() =>
            router.push({
              pathname: "/compare",
              params: { ids: comparisonList.map((c) => c.id).join(",") },
            })
          }
        >
          <View style={styles.compareCount}>
            <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>
              {comparisonList.length}
            </Text>
          </View>
          <Ionicons
            name="git-compare-outline"
            size={20}
            color="white"
            style={{ marginRight: 8 }}
          />
          <Text style={{ color: "white", fontWeight: "bold" }}>
            Compare Selected
          </Text>
        </TouchableOpacity>
      )}

      {/* Filter Modal */}
      <Modal visible={showFilterModal} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={[
              styles.modalContainer,
              { backgroundColor: isDark ? colors.background : "white" },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: isDark ? colors.border : "#f3f4f6" },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View style={styles.modalHeaderIcon}>
                  <Ionicons name="filter" size={18} color="white" />
                </View>
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? colors.text : "#000" },
                  ]}
                >
                  Filters
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={[
                  styles.modalCloseBtn,
                  { backgroundColor: isDark ? colors.card : "#f3f4f6" },
                ]}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={isDark ? colors.text : "#666"}
                />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Sort By */}
              <Text
                style={[
                  styles.filterLabel,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Sort By
              </Text>
              <View style={styles.chipContainer}>
                {["newest", "price_asc", "price_desc", "rating"].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setSortBy(opt)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isDark ? colors.card : "white",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                      sortBy === opt && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isDark ? colors.text : "#333" },
                        sortBy === opt && { color: "white" },
                      ]}
                    >
                      {opt === "price_asc"
                        ? "Price: Low to High"
                        : opt === "price_desc"
                          ? "Price: High to Low"
                          : opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Special Filters */}
              <Text
                style={[
                  styles.filterLabel,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Special
              </Text>
              <View style={styles.chipContainer}>
                <TouchableOpacity
                  onPress={() => setFilterMostFavorite(!filterMostFavorite)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isDark ? colors.card : "white",
                      borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                    },
                    filterMostFavorite && styles.chipActive,
                  ]}
                >
                  <Ionicons
                    name="heart"
                    size={14}
                    color={
                      filterMostFavorite
                        ? "white"
                        : isDark
                          ? colors.text
                          : "black"
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: isDark ? colors.text : "#333" },
                      filterMostFavorite && { color: "white" },
                    ]}
                  >
                    Guest Favorites
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowFilterModal(false);
                    handleToggleNearMe();
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isDark ? colors.card : "white",
                      borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                    },
                    filterNearMe && styles.chipActive,
                  ]}
                >
                  <Ionicons
                    name="location"
                    size={14}
                    color={
                      filterNearMe ? "white" : isDark ? colors.text : "black"
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      { color: isDark ? colors.text : "#333" },
                      filterNearMe && { color: "white" },
                    ]}
                  >
                    Find Near Me
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Rating */}
              <Text
                style={[
                  styles.filterLabel,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Minimum Rating
              </Text>
              <View style={styles.chipContainer}>
                {[0, 3, 4, 4.5].map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setMinRating(r)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isDark ? colors.card : "white",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                      minRating === r && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isDark ? colors.text : "#333" },
                        minRating === r && { color: "white" },
                      ]}
                    >
                      {r === 0 ? "Any" : `${r}+ Stars`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Price Range */}
              <Text
                style={[
                  styles.filterLabel,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Price Range (₱)
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? colors.card : "#fafafa",
                      borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      color: isDark ? colors.text : "#000",
                    },
                  ]}
                  placeholder="Min price e.g. 5000"
                  placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
                  keyboardType="numeric"
                  value={priceRange.min}
                  onChangeText={(t) => setPriceRange((p) => ({ ...p, min: t }))}
                />
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? colors.card : "#fafafa",
                      borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      color: isDark ? colors.text : "#000",
                    },
                  ]}
                  placeholder="Max price e.g. 30000"
                  placeholderTextColor={isDark ? colors.textMuted : "#c4c4c4"}
                  keyboardType="numeric"
                  value={priceRange.max}
                  onChangeText={(t) => setPriceRange((p) => ({ ...p, max: t }))}
                />
              </View>

              {/* Amenities */}
              <Text
                style={[
                  styles.filterLabel,
                  { color: isDark ? colors.textMuted : "#666" },
                ]}
              >
                Amenities
              </Text>
              <View style={styles.chipContainer}>
                {availableAmenities.map((a) => (
                  <TouchableOpacity
                    key={a}
                    onPress={() => toggleAmenity(a)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isDark ? colors.card : "white",
                        borderColor: isDark ? colors.cardBorder : "#e5e7eb",
                      },
                      selectedAmenities.includes(a) && styles.chipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: isDark ? colors.text : "#333" },
                        selectedAmenities.includes(a) && { color: "white" },
                      ]}
                    >
                      {a}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: 50 }} />
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                {
                  borderTopColor: isDark ? colors.border : "#f3f4f6",
                  backgroundColor: isDark ? colors.surface : "white",
                },
              ]}
            >
              <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
                <Ionicons
                  name="refresh"
                  size={16}
                  color={isDark ? colors.textSecondary : "#666"}
                />
                <Text
                  style={{
                    fontWeight: "600",
                    color: isDark ? colors.textSecondary : "#666",
                    marginLeft: 4,
                  }}
                >
                  Clear
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                style={styles.applyBtn}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  Show {filteredData.length} Homes
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    alignItems: "center",
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111" },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
  },

  // Page Title
  pageTitleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#111" },
  resultBadge: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  resultBadgeText: { color: "white", fontSize: 11, fontWeight: "bold" },

  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "black",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    gap: 5,
  },
  activeFilterText: { color: "white", fontSize: 10, fontWeight: "bold" },

  // Card Styles
  card: {
    width: (width - 30) / 2,
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  imageContainer: { height: 140, position: "relative" },
  cardImage: { width: "100%", height: "100%" },
  gradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },

  badgeContainer: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "column",
    gap: 4,
    right: 40,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 8, fontWeight: "bold" },

  actionsContainer: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "column",
    gap: 6,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  priceOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceText: {
    color: "white",
    fontSize: 16,
    fontWeight: "900",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowRadius: 4,
  },
  periodText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 9,
    fontWeight: "bold",
    marginLeft: 2,
  },

  cardContent: { padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: "#111" },
  cardAddress: { fontSize: 10, color: "#9ca3af" },
  ratingBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },

  metaBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  metaText: { fontSize: 10, color: "#444", fontWeight: "500" },

  landlordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  landlordAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  landlordName: { fontSize: 12, color: "#666", fontWeight: "500" },

  // Empty State
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  emptySubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
  },

  // Floating Compare Button
  compareFloatBtn: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    backgroundColor: "#111",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100,
  },
  compareCount: {
    backgroundColor: "#ef4444",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: -5,
    right: -5,
    borderWidth: 2,
    borderColor: "#111",
  },

  // Map Toggle Button
  mapToggleBtn: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100,
  },

  // Map Markers & Overlay
  mapMarker: {
    backgroundColor: "white",
    minWidth: 64,
    maxWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
  },
  mapMarkerSelected: { backgroundColor: "#111", borderColor: "#111" },
  mapMarkerText: { fontSize: 11, fontWeight: "bold", color: "#111" },
  userLocationMarker: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  userLocationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#3b82f6",
    borderWidth: 3,
    borderColor: "white",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  mapCardOverlay: {
    position: "absolute",
    bottom: 90,
    left: 10,
    right: 10,
    zIndex: 50,
  },

  // Filter Modal
  modalContainer: {
    maxHeight: "75%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "white",
  },
  modalHeader: {
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  filterLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 10,
    letterSpacing: 0.5,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 15,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
    flexDirection: "row",
    alignItems: "center",
  },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#333" },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#fafafa",
    fontSize: 14,
  },

  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clearBtn: { flexDirection: "row", alignItems: "center", padding: 14 },
  applyBtn: {
    backgroundColor: "#111",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
});
