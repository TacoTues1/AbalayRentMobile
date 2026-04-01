import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';

export default function PrivacyView({ onBack }: { onBack: () => void }) {
    const { isDark, colors } = useTheme();
    const heading = isDark ? colors.text : '#111827';
    const body = isDark ? colors.textSecondary : '#4b5563';
    const cardBg = isDark ? colors.card : '#f9fafb';
    const cardBorder = isDark ? colors.cardBorder : '#f3f4f6';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : '#f9fafb' }]}>
            <View style={[styles.subHeader, { backgroundColor: isDark ? colors.surface : 'white', borderColor: isDark ? colors.border : '#eee' }]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={isDark ? colors.text : 'black'} />
                </TouchableOpacity>
                <Text style={[styles.subHeaderTitle, { color: isDark ? colors.text : '#000' }]}>Privacy Policy</Text>
                <View style={{ width: 40 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={{ fontSize: 14, color: isDark ? colors.textMuted : '#6b7280', marginBottom: 16 }}>Last Updated: March 2026</Text>
                <Text style={{ fontSize: 16, color: body, lineHeight: 24, marginBottom: 32 }}>At Abalay, we value your trust. This policy explains how we collect, use, and share your personal information when you use our property management platform, web, and mobile applications.</Text>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>1. Information We Collect</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 12 }}>We collect information required to facilitate rentals and verify identities.</Text>

                    <View style={{ backgroundColor: cardBg, borderRadius: 12, padding: 16 }}>
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: heading, marginBottom: 4 }}>ACCOUNT INFORMATION</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>Name, email address, phone number, and profile photo provided during registration.</Text>
                        <View style={{ height: 16 }} />
                        <Text style={{ fontSize: 12, fontWeight: 'bold', color: heading, marginBottom: 4 }}>PROPERTY & RENTAL DATA</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>Property addresses, photos, lease terms, maintenance request photos/videos, and chat history between users.</Text>
                    </View>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>2. How We Use Information</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Service Provision:</Text> To create bookings, generate lease agreements, and manage maintenance requests.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Communication:</Text> To send SMS notifications (via services like SMSGate) regarding booking status, maintenance updates, or security alerts.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Safety & Security:</Text> To detect and prevent fraud, spam, and abuse. We use data to verify that landlords own their properties and tenants are real people.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Platform Improvement:</Text> To analyze usage trends and improve the Abalay user experience.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>3. Sharing & Disclosure</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 12 }}>We do not sell your personal data. Data is shared only when necessary to perform the service:</Text>

                    <View style={{ borderWidth: 1, borderColor: cardBorder, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <Text style={{ fontWeight: 'bold', color: heading, marginBottom: 4 }}>Between Users</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>When a booking is confirmed, we share necessary contact info (Name, Phone) between the Landlord and Tenant to facilitate the meeting and move-in process.</Text>
                    </View>
                    <View style={{ borderWidth: 1, borderColor: cardBorder, borderRadius: 12, padding: 16 }}>
                        <Text style={{ fontWeight: 'bold', color: heading, marginBottom: 4 }}>Service Providers</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>We share data with trusted third-party providers who help us operate:</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>• <Text style={{ fontWeight: 'bold' }}>Supabase:</Text> For secure database hosting and authentication.</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>• <Text style={{ fontWeight: 'bold' }}>PayMongo:</Text> For processing rental payments securely.</Text>
                        <Text style={{ fontSize: 14, color: body, lineHeight: 20 }}>• <Text style={{ fontWeight: 'bold' }}>Google Maps:</Text> To display property locations.</Text>
                    </View>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>4. Data Security</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24 }}>We implement robust security measures, including <Text style={{ fontWeight: 'bold' }}>Row Level Security (RLS)</Text>, to ensure that only authorized users can access specific data. Your passwords are never stored in plain text. While no system is 100% secure, we continuously monitor our systems to protect your information.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>5. Payment Information</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24 }}>Abalay does not store your full credit card or bank account details on our servers. All payment transactions are processed securely through <Text style={{ fontWeight: 'bold' }}>PayMongo</Text>. We only retain transaction records (date, amount, status) for booking history and accounting purposes.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>6. Your Rights</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>You have control over your data:</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Access & Update:</Text> You can edit your profile and property information directly through your dashboard.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Data Portability:</Text> You may request a copy of the personal data we hold about you in a structured, machine-readable format.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>7. Cookies & Tracking Technologies</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24 }}>We use cookies and similar tracking technologies to track activity on our platform and store certain information. Tracking technologies used include beacons, tags, and scripts to collect and track information and to improve and analyze our service.</Text>
                </View>

                {/* <View style={{ backgroundColor: '#000', borderRadius: 16, padding: 24, marginTop: 16 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>Have questions?</Text>
                    <Text style={{ color: '#d1d5db', marginBottom: 16 }}>If you have questions about this policy or your privacy rights, please contact our support team.</Text>
                    <TouchableOpacity style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 14 }}>Contact Support</Text>
                    </TouchableOpacity>
                </View> */}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f9fafb' },
    subHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee' },
    backBtn: { padding: 5 },
    subHeaderTitle: { fontSize: 18, fontWeight: 'bold' },
});
