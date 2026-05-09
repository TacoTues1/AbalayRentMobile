import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TermsStandalone() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.mb8}>
          <Text style={styles.mainTitle}>Terms of Service</Text>
          <Text style={styles.lastUpdated}>Last Updated: March 2026</Text>
        </View>

        {/* Section 1 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="warning-outline" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>1. Multiple Accounts Policy</Text>
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>STRICT PROHIBITION</Text>
            <Text style={styles.warningText}>
              Creating multiple accounts for the same user identity is strictly
              prohibited on Abalay.
            </Text>
          </View>

          <View style={[styles.card, { marginBottom: 12 }]}>
            <Text style={styles.cardTitle}>One Identity, One Account</Text>
            <Text style={styles.cardText}>
              You may not register multiple accounts using different email
              addresses or phone numbers.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Detection & Enforcement</Text>
            <Text style={styles.cardText}>
              Our system actively monitors for duplicate data points. If a
              duplicate account is detected, access will be restricted immediately.
            </Text>
          </View>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="person-outline" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>2. User Responsibilities</Text>
          </View>

          <Text style={styles.paragraph}>By using Abalay, you agree to:</Text>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>Provide accurate and truthful information during registration.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>Maintain the confidentiality of your login credentials.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>Use the platform only for lawful property management and rental purposes.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>Treat other users (Landlords and Tenants) with respect and professionalism.</Text>
            </View>
          </View>
        </View>

        {/* Section 3 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="home-outline" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>3. Landlord Responsibilities</Text>
          </View>

          <Text style={styles.paragraph}>As a Landlord listing properties on Abalay, you specifically agree that:</Text>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Property Accuracy:</Text> You will provide accurate, truthful descriptions and photos of your properties. Misrepresentation is grounds for immediate listing removal.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Legal Compliance:</Text> You bear full responsibility for ensuring your properties comply with all local housing, safety, and health regulations.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Fair Dealing:</Text> You will not discriminate against prospective tenants based on race, religion, gender, disability, or other legally protected characteristics.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Maintenance:</Text> You will promptly respond to maintenance requests to ensure the property remains habitable.</Text>
            </View>
          </View>
        </View>

        {/* Section 4 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="key-outline" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>4. Tenant Responsibilities</Text>
          </View>

          <Text style={styles.paragraph}>As a Tenant utilizing Abalay, you specifically agree that:</Text>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Timely Payments:</Text> You are responsible for paying all rent and applicable fees on time, as scheduled by the platform or your lease agreement.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Property Care:</Text> You will maintain the property in a clean, sanitary condition and promptly report any damages or maintenance issues to the Landlord.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Lawful Use:</Text> You will not use the property for any illicit or prohibited activities, nor cause unreasonable nuisance to neighbors.</Text>
            </View>
          </View>
        </View>

        {/* Section 5 - Subscription & Slot Policy */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconBox, { backgroundColor: "#2563eb" }]}>
              <Ionicons name="card-outline" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>5. Subscription & Slot Policy</Text>
          </View>

          <Text style={styles.paragraph}>Abalay provides certain features on a freemium basis. Users receive a limited number of free slots and may purchase additional slots to expand their capacity.</Text>

          {/* Landlord Slots */}
          <View style={[styles.card, { marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="business-outline" size={18} color="black" />
              <Text style={[styles.cardTitle, { marginBottom: 0, fontSize: 15 }]}>Landlord — Property Slots</Text>
            </View>
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#22c55e", fontSize: 14, marginRight: 8 }}>✓</Text>
                <Text style={styles.bulletText}><Text style={styles.bold}>3 free property slots</Text> are included with every landlord account upon registration.</Text>
              </View>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#3b82f6", fontSize: 14, marginRight: 8 }}>+</Text>
                <Text style={styles.bulletText}>Additional property slots may be purchased at <Text style={styles.bold}>₱50.00 per slot</Text>.</Text>
              </View>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#9ca3af", fontSize: 14, marginRight: 8 }}>⬡</Text>
                <Text style={styles.bulletText}>Each landlord account may hold a <Text style={styles.bold}>maximum of 10 property slots</Text>.</Text>
              </View>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#9ca3af", fontSize: 14, marginRight: 8 }}>∞</Text>
                <Text style={styles.bulletText}>Purchased slots are <Text style={styles.bold}>permanent</Text> and non-refundable.</Text>
              </View>
            </View>
          </View>

          {/* Tenant Slots */}
          <View style={[styles.card, { marginBottom: 16 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="people-outline" size={18} color="black" />
              <Text style={[styles.cardTitle, { marginBottom: 0, fontSize: 15 }]}>Tenant — Family Member Slots</Text>
            </View>
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#22c55e", fontSize: 14, marginRight: 8 }}>✓</Text>
                <Text style={styles.bulletText}><Text style={styles.bold}>1 free family member slot</Text> is included with every tenant account upon registration.</Text>
              </View>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#3b82f6", fontSize: 14, marginRight: 8 }}>+</Text>
                <Text style={styles.bulletText}>Additional family member slots may be purchased at <Text style={styles.bold}>₱50.00 per slot</Text>.</Text>
              </View>
              <View style={styles.bulletItem}>
                <Text style={{ color: "#9ca3af", fontSize: 14, marginRight: 8 }}>∞</Text>
                <Text style={styles.bulletText}>Purchased slots are <Text style={styles.bold}>permanent</Text> and non-refundable.</Text>
              </View>
            </View>
          </View>

          {/* Payment Note */}
          <View style={{ backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#dbeafe", borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 13, color: "#1e3a5f", lineHeight: 20 }}>
              <Text style={styles.bold}>Payment: </Text>
              All slot purchases are processed securely through PayMongo. Accepted payment methods include GCash, Maya, and credit/debit cards. Once a slot is purchased, it is immediately available and permanently added to your account.
            </Text>
          </View>
        </View>

        {/* Section 6 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="shield-checkmark" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>6. Privacy & Data</Text>
          </View>

          <Text style={styles.paragraph}>
            Your use of the platform is also governed by our Privacy Policy, which details how we collect, use, and protect your information.
          </Text>
        </View>

        {/* Section 7 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="alert-circle-outline" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>7. Disclaimers & Limitations</Text>
          </View>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>"As Is" Basis:</Text> Abalay is provided indiscriminately on an "as is" and "as available" basis without any warranties of any kind.</Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}><Text style={styles.bold}>Limitation of Liability:</Text> In no event shall Abalay, its directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the platform.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  backBtn: { padding: 5 },

  headerTitle: { fontSize: 16, fontWeight: "bold" },
  scrollContent: { padding: 24, paddingBottom: 20 },

  mb8: {
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 20,
  },
  mainTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "black",
    marginBottom: 8,
  },
  lastUpdated: { fontSize: 14, color: "#666", fontWeight: "500" },

  section: { marginBottom: 40 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 15,
  },
  iconBox: { backgroundColor: "black", padding: 8, borderRadius: 8 },
  sectionTitle: { fontSize: 20, fontWeight: "bold" },

  warningBox: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#f3f4f6",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningTitle: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#111827",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  warningText: { color: "#374151", fontSize: 14 },

  bulletList: { paddingLeft: 5 },
  bulletItem: { flexDirection: "row", marginBottom: 12 },
  bulletPoint: { fontSize: 16, marginRight: 10, lineHeight: 22 },
  bulletText: { fontSize: 15, color: "#4b5563", lineHeight: 22, flex: 1 },
  bold: { fontWeight: "bold", color: "#1f2937" },

  paragraph: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 24,
    marginBottom: 20,
  },

  card: {
    padding: 20,
    borderWidth: 1,
    borderColor: "#f3f4f6",
    borderRadius: 12,
  },
  cardTitle: {
    fontWeight: "bold",
    fontSize: 16,
    color: "black",
    marginBottom: 5,
  },
  cardText: { fontSize: 13, color: "#6b7280", lineHeight: 20 },
});
