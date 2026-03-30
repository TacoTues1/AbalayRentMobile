import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Animations
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerTranslate = useRef(new Animated.Value(-50)).current;
  const cardTranslate = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    Animated.sequence([
      // 1. Logo & Name Fade In + Slide Down slightly
      Animated.parallel([
        Animated.timing(headerFade, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.spring(headerTranslate, {
          toValue: 0,
          friction: 6,
          useNativeDriver: true,
        }),
      ]),
      // 2. White Card Slides Up from Bottom
      Animated.delay(300),
      Animated.spring(cardTranslate, {
        toValue: 0,
        friction: 7,
        tension: 20,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.backgroundImage}>
        <Animated.View
          style={[
            styles.headerContainer,
            {
              opacity: headerFade,
              transform: [{ translateY: headerTranslate }],
            },
          ]}
        >
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logoIcon}
            resizeMode="contain"
          />
          <Text style={styles.systemName}>Abalay</Text>
        </Animated.View>
      </View>

      {/* White Bottom Sheet Card */}
      <Animated.View
        style={[
          styles.bottomCard,
          {
            transform: [{ translateY: cardTranslate }],
            paddingBottom:
              Platform.OS === "ios" ? 50 : Math.max(insets.bottom + 20, 50),
            height:
              height * 0.35 +
              (Platform.OS === "android" ? Math.max(insets.bottom, 0) : 0),
          },
        ]}
      >
        <Text style={styles.title}>
          A <Text style={styles.highlight}>Rental</Text> Management Platform
        </Text>

        <Text style={styles.subtitle}>
          Streamline your property workflow, track payments, and connect with
          tenants effortlessly.
        </Text>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace("/login?initialView=register")}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.loginLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
  },
  backgroundImage: {
    flex: 1,
    width: "100%",
    justifyContent: "center", // Center content vertically
    alignItems: "center",
    paddingBottom: height * 0.35, // Push content up to center it in the visible area above the card
  },
  headerContainer: {
    alignItems: "center",
    gap: 15,
  },

  logoIcon: {
    width: 100,
    height: 100,
  },

  systemName: {
    fontSize: 50,
    color: "white",
    letterSpacing: 1,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    fontFamily: "Pacifico_400Regular",
  },
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(17, 24, 39, 0.95)",
    borderTopLeftRadius: 35,
    borderTopRightRadius: 35,
    padding: 30,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  handleContainer: {
    flexDirection: "row",
    marginBottom: 25,
  },
  handle: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e5e5e5",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#f9fafb",
    textAlign: "center",
    marginBottom: 15,
    lineHeight: 34,
  },
  highlight: {
    color: "#ea580c", // Orange-ish to match "Fashion" highlight in ref
  },
  subtitle: {
    fontSize: 14,
    color: "#d1d5db",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: "90%",
  },
  spacer: {
    flex: 1,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#ea580c",
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  loginRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loginText: {
    fontSize: 13,
    color: "#d1d5db",
    fontWeight: "600",
  },
  loginLink: {
    fontSize: 13,
    color: "#ea580c",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
