import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TermsStandalone() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          <Text style={styles.mainTitle}>Terms & Privacy Policy</Text>
          <Text style={styles.lastUpdated}>Last Updated: January 2026</Text>
        </View>

        {/* Section 1 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="people" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>1. Multiple Accounts Policy</Text>
          </View>

          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>STRICT PROHIBITION</Text>
            <Text style={styles.warningText}>
              Creating multiple accounts for the same user identity is strictly prohibited on EaseRent.
            </Text>
          </View>

          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>One Identity, One Account:</Text> You may not register multiple accounts using different email addresses or phone numbers.
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Text style={styles.bulletPoint}>•</Text>
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>Detection:</Text> If a duplicate account is detected, access will be restricted immediately.
              </Text>
            </View>
          </View>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="shield-checkmark" size={20} color="white" />
            </View>
            <Text style={styles.sectionTitle}>2. Data Privacy</Text>
          </View>

          <Text style={styles.paragraph}>
            We collect only the minimum amount of data required to verify your identity.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Data Collection</Text>
            <Text style={styles.cardText}>We collect Name, Emails, Birthday, Gender, and Phone number solely for identity verification.</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0'
  },
  backBtn: { padding: 5 },

  headerTitle: { fontSize: 16, fontWeight: 'bold' },
  scrollContent: { padding: 24, paddingBottom: 20 },

  mb8: { marginBottom: 30, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 20 },
  mainTitle: { fontSize: 30, fontWeight: '900', color: 'black', marginBottom: 8 },
  lastUpdated: { fontSize: 14, color: '#666', fontWeight: '500' },

  section: { marginBottom: 40 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  iconBox: { backgroundColor: 'black', padding: 8, borderRadius: 8 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold' },

  warningBox: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6', padding: 20, borderRadius: 12, marginBottom: 20 },
  warningTitle: { fontWeight: 'bold', fontSize: 14, color: '#111827', marginBottom: 5, textTransform: 'uppercase' },
  warningText: { color: '#374151', fontSize: 14 },

  bulletList: { paddingLeft: 5 },
  bulletItem: { flexDirection: 'row', marginBottom: 12 },
  bulletPoint: { fontSize: 16, marginRight: 10, lineHeight: 22 },
  bulletText: { fontSize: 15, color: '#4b5563', lineHeight: 22, flex: 1 },
  bold: { fontWeight: 'bold', color: '#1f2937' },

  paragraph: { fontSize: 15, color: '#4b5563', lineHeight: 24, marginBottom: 20 },

  card: { padding: 20, borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 12 },
  cardTitle: { fontWeight: 'bold', fontSize: 16, color: 'black', marginBottom: 5 },
  cardText: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
});
