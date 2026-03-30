import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import WebViewMap from "../components/WebViewMap";
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

const { width, height } = Dimensions.get("window");

export default function GetDirections() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const webMapRef = useRef<any>(null);

  const searchTimeout = useRef<any>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(
    null,
  );

  // Helper: use MapLibre camera ref or WebView map ref
  const getCamera = () => cameraRef.current || webMapRef.current;

  // Animation for user marker ping
  const pingAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0.8)).current;

  // State
  const [fromAddress, setFromAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    heading?: number;
  } | null>(null);
  const [destLocation, setDestLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [panelVisible, setPanelVisible] = useState(true);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Routes
  const [routesData, setRoutesData] = useState({
    driving: [],
    bike: [],
    foot: [],
  });
  const [selectedMode, setSelectedMode] = useState<"driving" | "bike" | "foot">(
    "driving",
  );
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  // 1. Initial Setup & Animation
  useEffect(() => {
    startPingAnimation();
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setStatusMsg("Permission to access location was denied");
        return;
      }

      // Handle Auto-Start Params
      if (params.to) {
        setToAddress(params.to as string);
        if (params.lat && params.lng) {
          const dLat = parseFloat(params.lat as string);
          const dLng = parseFloat(params.lng as string);
          setDestLocation({ latitude: dLat, longitude: dLng });
        } else {
          geocodeAddress(params.to as string, "dest");
        }
      }

      if (params.from) {
        setFromAddress(params.from as string);
        if (params.from !== "My Location") {
          geocodeAddress(params.from as string, "from");
        }
      }

      if (params.auto === "true") {
        handleShowMyLocation();
      }
    })();
  }, []);

  const startPingAnimation = () => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(pingAnim, {
          toValue: 2,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  };

  // 2. Geocoding (Nominatim)
  const geocodeAddress = async (address: string, type: "from" | "dest") => {
    setStatusMsg("Locating...");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`,
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        const loc = { latitude: lat, longitude: lng };

        if (type === "dest") {
          setDestLocation(loc);
          getCamera()?.setCamera({
            centerCoordinate: [lng, lat],
            zoomLevel: 14,
            animationDuration: 500,
          });
        } else {
          setUserLocation(loc);
          getCamera()?.setCamera({
            centerCoordinate: [lng, lat],
            zoomLevel: 14,
            animationDuration: 500,
          });
        }
        setStatusMsg("");
      } else {
        setStatusMsg("Location not found");
      }
    } catch (err) {
      setStatusMsg("Error finding location");
    }
  };

  // 3. Autocomplete
  const handleAddressChange = (text: string) => {
    setFromAddress(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (text.length > 2) {
      searchTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5&addressdetails=1`,
          );
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        } catch (error) {
          console.log(error);
        }
      }, 500);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (item: any) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    setFromAddress(item.display_name);
    setUserLocation({ latitude: lat, longitude: lng });
    setShowSuggestions(false);
    setSuggestions([]);

    getCamera()?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 14,
      animationDuration: 500,
    });

    if (destLocation) {
      calculateAllRoutes({ latitude: lat, longitude: lng }, destLocation);
    }
  };

  // 4. Locate User
  const handleShowMyLocation = async () => {
    setStatusMsg("Locating...");
    try {
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude, heading } = location.coords;
      setUserLocation({ latitude, longitude, heading: heading || 0 });
      setFromAddress("My Location");
      setStatusMsg("");

      getCamera()?.setCamera({
        centerCoordinate: [longitude, latitude],
        zoomLevel: 14,
        animationDuration: 500,
      });

      if (destLocation) {
        calculateAllRoutes({ latitude, longitude }, destLocation);
      }
    } catch (e) {
      setStatusMsg("Could not get location");
    }
  };

  // 5. Routing (OSRM)
  const fetchRouteData = async (profile: string, start: any, end: any) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?alternatives=true&overview=full&geometries=geojson`,
      );
      const data = await response.json();
      if (data.code === "Ok" && data.routes.length > 0) return data.routes;
      return [];
    } catch (error) {
      return [];
    }
  };

  const calculateAllRoutes = async (start: any, end: any) => {
    if (!start || !end) return;
    setStatusMsg("Calculating routes...");

    const [driving, bike, foot] = await Promise.all([
      fetchRouteData("driving", start, end),
      fetchRouteData("bike", start, end),
      fetchRouteData("foot", start, end),
    ]);

    setRoutesData({ driving, bike, foot });
    setStatusMsg("");

    const initialMode =
      driving.length > 0 ? "driving" : bike.length > 0 ? "bike" : "foot";
    setSelectedMode(initialMode as any);
    setSelectedRouteIndex(0);

    fitToRoute(initialMode as any, 0, driving, bike, foot);
  };

  const fitToRoute = (
    mode: string,
    index: number,
    d: any[],
    b: any[],
    f: any[],
  ) => {
    let routes: any[] = [];
    if (mode === "driving") routes = d;
    else if (mode === "bike") routes = b;
    else routes = f;

    if (routes.length > index) {
      const route = routes[index];
      const coords = route.geometry.coordinates;
      // Calculate bounds from coordinates
      let minLng = Infinity,
        maxLng = -Infinity,
        minLat = Infinity,
        maxLat = -Infinity;
      coords.forEach((c: any) => {
        if (c[0] < minLng) minLng = c[0];
        if (c[0] > maxLng) maxLng = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[1] > maxLat) maxLat = c[1];
      });
      getCamera()?.fitBounds(
        [maxLng, maxLat], // NE
        [minLng, minLat], // SW
        [50, 50, 350, 50], // padding [top, right, bottom, left]
        500, // duration
      );
    }
  };

  const handleModeClick = (mode: "driving" | "bike" | "foot") => {
    setSelectedMode(mode);
    setSelectedRouteIndex(0); // Reset to primary route
  };

  // 6. Live Navigation
  const toggleNavigation = async () => {
    if (isNavigating) {
      // STOP
      setIsNavigating(false);
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
      setStatusMsg("Navigation Stopped");

      // Zoom out to route
      const currentRoutes = routesData[selectedMode];
      if (currentRoutes.length > selectedRouteIndex) {
        const route = currentRoutes[selectedRouteIndex];
        const coords = (route as any).geometry.coordinates;
        let minLng = Infinity,
          maxLng = -Infinity,
          minLat = Infinity,
          maxLat = -Infinity;
        coords.forEach((c: any) => {
          if (c[0] < minLng) minLng = c[0];
          if (c[0] > maxLng) maxLng = c[0];
          if (c[1] < minLat) minLat = c[1];
          if (c[1] > maxLat) maxLat = c[1];
        });
        getCamera()?.fitBounds(
          [maxLng, maxLat],
          [minLng, minLat],
          [50, 50, 350, 50],
          500,
        );
      }
    } else {
      // START
      if (!userLocation) {
        Alert.alert("Location Needed", "Please locate yourself first.");
        handleShowMyLocation();
        return;
      }

      setIsNavigating(true);
      setStatusMsg("Live Navigation Active");

      // Initial Zoom to User
      getCamera()?.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: 17,
        animationDuration: 1000,
      });

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          const { latitude, longitude, heading } = loc.coords;
          setUserLocation({ latitude, longitude, heading: heading || 0 });

          // Keep centering map on user
          getCamera()?.setCamera({
            centerCoordinate: [longitude, latitude],
            pitch: 45,
            heading: heading || 0,
            zoomLevel: 18,
            animationDuration: 1000,
          });
        },
      );
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "--";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  const getDuration = (mode: string) => {
    const routes = routesData[mode as keyof typeof routesData];
    if (routes && routes.length > 0)
      return formatDuration((routes[0] as any).duration);
    return "--";
  };

  const getCount = (mode: string) => {
    const routes = routesData[mode as keyof typeof routesData];
    return routes ? routes.length : 0;
  };

  // Helper to create GeoJSON for a route
  const getRouteGeoJSON = (route: any) => {
    if (!route) return null;
    return {
      type: "Feature" as const,
      geometry: route.geometry,
      properties: {},
    };
  };

  // Build routes array for WebViewMap fallback
  const webViewRoutes = (() => {
    const result: any[] = [];
    const currentRoutes = routesData[selectedMode];
    const routeColor =
      selectedMode === "bike"
        ? "#7c3aed"
        : selectedMode === "foot"
          ? "#059669"
          : "#111827";

    currentRoutes.forEach((route: any, index: number) => {
      if (index === selectedRouteIndex) return;
      if (route?.geometry?.coordinates) {
        result.push({
          id: `alt-route-${index}`,
          coordinates: route.geometry.coordinates,
          color: "#9ca3af",
          width: 5,
          opacity: 0.7,
        });
      }
    });

    if (currentRoutes.length > selectedRouteIndex) {
      const selectedRoute = currentRoutes[selectedRouteIndex];
      if ((selectedRoute as any)?.geometry?.coordinates) {
        result.push({
          id: "selected-route",
          coordinates: (selectedRoute as any).geometry.coordinates,
          color: routeColor,
          width: 7,
          opacity: 1,
        });
      }
    }

    return result;
  })();

  // Build markers for WebViewMap fallback
  const webViewMarkers = (() => {
    const m: any[] = [];
    if (destLocation) {
      m.push({
        id: "destination",
        coordinate: [destLocation.longitude, destLocation.latitude] as [
          number,
          number,
        ],
        title: "Destination",
        color: "#ef4444",
      });
    }
    return m;
  })();

  // Determine center for WebView map
  const webViewCenter: [number, number] = destLocation
    ? [destLocation.longitude, destLocation.latitude]
    : userLocation
      ? [userLocation.longitude, userLocation.latitude]
      : [123.8854, 10.3157];

  return (
    <View style={styles.container}>
      {/* 1. Map Layer */}
      {Platform.OS !== "web" && MapLibreGL ? (
        <MapLibreGL.MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          styleURL="https://tiles.openfreemap.org/styles/bright"
          rotateEnabled={true}
          pitchEnabled={true}
          {...MAPLIBRE_LOW_MEMORY_PROPS}
        >
          <MapLibreGL.Camera
            ref={cameraRef}
            centerCoordinate={[123.8854, 10.3157]}
            zoomLevel={12}
          />

          {/* Render Alternate Routes (Gray) */}
          {routesData[selectedMode].map((route: any, index: number) => {
            if (index === selectedRouteIndex) return null;
            const geoJSON = getRouteGeoJSON(route);
            if (!geoJSON) return null;
            return (
              <MapLibreGL.ShapeSource
                key={`alt-route-${index}`}
                id={`alt-route-${index}`}
                shape={geoJSON}
              >
                <MapLibreGL.LineLayer
                  id={`alt-route-line-${index}`}
                  style={{
                    lineColor: "#9ca3af",
                    lineWidth: 5,
                    lineOpacity: 0.7,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              </MapLibreGL.ShapeSource>
            );
          })}

          {/* Render Selected Route (Colored) */}
          {routesData[selectedMode].length > selectedRouteIndex &&
            (() => {
              const geoJSON = getRouteGeoJSON(
                routesData[selectedMode][selectedRouteIndex],
              );
              if (!geoJSON) return null;
              const color =
                selectedMode === "bike"
                  ? "#7c3aed"
                  : selectedMode === "foot"
                    ? "#059669"
                    : "#111827";
              return (
                <MapLibreGL.ShapeSource id="selected-route" shape={geoJSON}>
                  <MapLibreGL.LineLayer
                    id="selected-route-line"
                    style={{
                      lineColor: color,
                      lineWidth: 7,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </MapLibreGL.ShapeSource>
              );
            })()}

          {/* User Marker with Animation */}
          {userLocation && (
            <MapLibreGL.PointAnnotation
              id="user-location"
              coordinate={[userLocation.longitude, userLocation.latitude]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.userMarkerContainer}>
                <Animated.View
                  style={[
                    styles.pingCircle,
                    { transform: [{ scale: pingAnim }], opacity: fadeAnim },
                  ]}
                />
                <View style={styles.userMarkerOuter}>
                  <View
                    style={[
                      styles.userMarkerInner,
                      {
                        transform: [
                          { rotate: `${userLocation.heading || 0}deg` },
                        ],
                      },
                    ]}
                  >
                    <View style={styles.directionArrow} />
                  </View>
                </View>
              </View>
            </MapLibreGL.PointAnnotation>
          )}

          {/* Destination Marker */}
          {destLocation && (
            <MapLibreGL.PointAnnotation
              id="destination"
              coordinate={[destLocation.longitude, destLocation.latitude]}
              title="Destination"
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="location" size={30} color="#ef4444" />
              </View>
            </MapLibreGL.PointAnnotation>
          )}
        </MapLibreGL.MapView>
      ) : Platform.OS !== "web" ? (
        <WebViewMap
          ref={webMapRef}
          center={webViewCenter}
          zoom={12}
          interactive={true}
          markers={webViewMarkers}
          routes={webViewRoutes}
          userLocation={userLocation || undefined}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Text style={{ color: "#666" }}>
            Map is not available on this platform
          </Text>
        </View>
      )}

      {/* 2. Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color="black" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      {/* 3. Floating Bottom Panel */}
      <View style={styles.bottomContainer}>
        {/* Toggle Button */}
        <TouchableOpacity
          onPress={() => setPanelVisible(!panelVisible)}
          style={styles.toggleBtn}
        >
          <Ionicons
            name={panelVisible ? "chevron-down" : "chevron-up"}
            size={20}
            color="#4b5563"
          />
        </TouchableOpacity>

        {panelVisible && (
          <View style={styles.card}>
            {/* Status Bar */}
            {isNavigating && (
              <View style={styles.statusBar}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusText}>Live Navigation Active</Text>
              </View>
            )}

            {/* Inputs */}
            <View style={styles.inputStack}>
              {/* From Input */}
              <View style={styles.inputRow}>
                <View style={[styles.dot, { backgroundColor: "#3b82f6" }]} />
                <TextInput
                  style={styles.input}
                  placeholder="Your Location"
                  value={fromAddress}
                  onChangeText={handleAddressChange}
                />
                <TouchableOpacity
                  onPress={handleShowMyLocation}
                  style={styles.locateBtn}
                >
                  <Ionicons name="locate" size={20} color="#2563eb" />
                </TouchableOpacity>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <View style={styles.suggestionsBox}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                      {suggestions.map((item, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.suggestionItem}
                          onPress={() => selectSuggestion(item)}
                        >
                          <Text numberOfLines={1} style={styles.suggestionText}>
                            {item.display_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={styles.connectorLine} />

              {/* To Input */}
              <View style={styles.inputRow}>
                <View style={[styles.dot, { backgroundColor: "#ef4444" }]} />
                <TextInput
                  style={[styles.input, { color: "#6b7280" }]}
                  placeholder="Destination"
                  value={toAddress || "Property Location"}
                  editable={false}
                />
              </View>
            </View>

            {/* Route Info & Controls */}
            {routesData.driving.length > 0 ||
            routesData.bike.length > 0 ||
            routesData.foot.length > 0 ? (
              <View style={styles.grid}>
                {/* Mode Buttons */}
                {[
                  {
                    mode: "driving",
                    label: "Car",
                    icon: "car-sport",
                    color: "black",
                  },
                  {
                    mode: "bike",
                    label: "Bike",
                    icon: "bicycle",
                    color: "#7c3aed",
                  },
                  {
                    mode: "foot",
                    label: "Walk",
                    icon: "walk",
                    color: "#059669",
                  },
                ].map((item: any) => (
                  <TouchableOpacity
                    key={item.mode}
                    style={[
                      styles.modeBtn,
                      selectedMode === item.mode && {
                        borderColor: item.color,
                        backgroundColor:
                          item.mode === "driving" ? "black" : item.color,
                      },
                    ]}
                    onPress={() => handleModeClick(item.mode)}
                  >
                    <Ionicons
                      name={item.icon}
                      size={24}
                      color={selectedMode === item.mode ? "white" : "#9ca3af"}
                    />
                    <Text
                      style={[
                        styles.modeLabel,
                        selectedMode === item.mode && { color: "white" },
                      ]}
                    >
                      {item.label} ({getCount(item.mode)})
                    </Text>
                    <Text
                      style={[
                        styles.durationLabel,
                        selectedMode === item.mode && { color: "white" },
                      ]}
                    >
                      {getDuration(item.mode)}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* Start/Stop Navigation Button */}
                <TouchableOpacity
                  style={[
                    styles.navBtn,
                    isNavigating
                      ? { backgroundColor: "#dc2626" }
                      : { backgroundColor: "#2563eb" },
                  ]}
                  onPress={toggleNavigation}
                >
                  <Ionicons
                    name={
                      isNavigating
                        ? "stop-circle-outline"
                        : "navigate-circle-outline"
                    }
                    size={24}
                    color="white"
                  />
                  <Text style={styles.navBtnLabel}>
                    {isNavigating ? "STOP" : "START"}
                  </Text>
                  <Text style={styles.navBtnSub}>NAV</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyState}>
                {statusMsg ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.emptyText}>{statusMsg}</Text>
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    Tap location button to start
                  </Text>
                )}
              </View>
            )}

            {/* Route Selection Tabs (if multiple) */}
            {!isNavigating && routesData[selectedMode].length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.altRoutesContainer}
              >
                {routesData[selectedMode].map((route: any, idx: number) => {
                  const isSelected = selectedRouteIndex === idx;
                  return (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => setSelectedRouteIndex(idx)}
                      style={[
                        styles.altRouteBtn,
                        isSelected && styles.altRouteBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.altRouteTitle,
                          isSelected && { color: "black" },
                        ]}
                      >
                        {idx === 0 ? "Fastest" : `Route ${idx + 1}`}
                      </Text>
                      <Text style={styles.altRouteDetail}>
                        {formatDuration(route.duration)} •{" "}
                        {(route.distance / 1000).toFixed(1)} km
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: "white",
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  backText: { fontWeight: "bold", marginLeft: 5 },

  // Custom User Marker
  userMarkerContainer: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  pingCircle: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(59, 130, 246, 0.3)",
  },
  userMarkerOuter: {
    width: 24,
    height: 24,
    backgroundColor: "white",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  userMarkerInner: {
    width: 18,
    height: 18,
    backgroundColor: "#2563eb",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  directionArrow: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "white",
    transform: [{ translateY: -1 }],
  },

  // Bottom Panel
  bottomContainer: {
    position: "absolute",
    bottom: 30,
    left: 10,
    right: 10,
    alignItems: "center",
    zIndex: 20,
  },
  toggleBtn: {
    backgroundColor: "white",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    elevation: 5,
  },
  card: {
    width: "100%",
    maxWidth: 450,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },

  statusBar: {
    backgroundColor: "#eff6ff",
    padding: 8,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#dbeafe",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
  },
  statusText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },

  inputStack: { marginBottom: 15 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 5,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  input: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1f2937" },
  locateBtn: {
    padding: 5,
    backgroundColor: "white",
    borderRadius: 8,
    marginLeft: 5,
  },
  connectorLine: {
    width: 2,
    height: 12,
    backgroundColor: "#d1d5db",
    marginLeft: 16,
    marginVertical: -4,
    zIndex: 0,
  },

  suggestionsBox: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 10,
    maxHeight: 200,
    zIndex: 100,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: { fontSize: 13, color: "#374151", fontWeight: "500" },

  grid: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  modeBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "white",
  },
  modeLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 4,
    color: "#9ca3af",
  },
  durationLabel: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 2,
    color: "#4b5563",
  },

  navBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    elevation: 3,
  },
  navBtnLabel: {
    color: "white",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  navBtnSub: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "bold",
  },

  emptyState: { alignItems: "center", paddingVertical: 10 },
  emptyText: { color: "#6b7280", fontSize: 13, fontWeight: "500" },

  // Alternate Routes
  altRoutesContainer: { marginTop: 15, maxHeight: 50 },
  altRouteBtn: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginRight: 8,
    minWidth: 100,
  },
  altRouteBtnActive: { borderColor: "black", backgroundColor: "#f9fafb" },
  altRouteTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  altRouteDetail: { fontSize: 11, fontWeight: "600", color: "#1f2937" },
});
