import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';

export default function TermsView({ onBack }: { onBack: () => void }) {
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
                <Text style={[styles.subHeaderTitle, { color: isDark ? colors.text : '#000' }]}>Terms of Service</Text>
                <View style={{ width: 40 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
                <Text style={{ fontSize: 14, color: isDark ? colors.textMuted : '#6b7280', marginBottom: 24 }}>Last Updated: March 2026</Text>

                <View style={{ marginBottom: 32 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                        <View style={{ padding: 8, backgroundColor: isDark ? '#3b1c1c' : '#fef2f2', borderRadius: 8, marginRight: 12 }}>
                            <Ionicons name="warning-outline" size={20} color="#dc2626" />
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading }}>1. Multiple Accounts Policy</Text>
                    </View>

                    <View style={{ backgroundColor: isDark ? '#3b1c1c' : '#fef2f2', borderWidth: 1, borderColor: isDark ? '#5c2a2a' : '#fee2e2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <Text style={{ color: '#991b1b', fontWeight: 'bold', marginBottom: 4 }}>STRICT PROHIBITION</Text>
                        <Text style={{ color: isDark ? '#f87171' : '#7f1d1d', fontWeight: '500' }}>Creating multiple accounts for the same user identity is strictly prohibited on Abalay.</Text>
                    </View>

                    <View style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <Text style={{ fontWeight: 'bold', color: heading, marginBottom: 4 }}>One Identity, One Account</Text>
                        <Text style={{ fontSize: 14, color: body }}>You may not register multiple accounts using different email addresses or phone numbers.</Text>
                    </View>

                    <View style={{ backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <Text style={{ fontWeight: 'bold', color: heading, marginBottom: 4 }}>Detection & Enforcement</Text>
                        <Text style={{ fontSize: 14, color: body }}>Our system actively monitors for duplicate data points. If a duplicate account is detected, access will be restricted immediately.</Text>
                    </View>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginTop: 12 }}>
                        <Text style={{ fontWeight: 'bold' }}>Permanent Ban:</Text> Repeated attempts to bypass this policy may result in a permanent ban from the platform.
                    </Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>2. User Responsibilities</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>By using Abalay, you agree to:</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>• Provide accurate and truthful information during registration.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>• Maintain the confidentiality of your login credentials.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>• Use the platform only for lawful property management and rental purposes.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>• Treat other users (Landlords and Tenants) with respect and professionalism.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>3. Landlord Responsibilities & Terms</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>As a Landlord listing properties on Abalay, you specifically agree that:</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Property Accuracy:</Text> You will provide accurate, truthful descriptions and photos of your properties. Misrepresentation is grounds for immediate listing removal.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Legal Compliance:</Text> You bear full responsibility for ensuring your properties comply with all local housing, safety, and health regulations.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Fair Dealing:</Text> You will not discriminate against prospective tenants based on race, religion, gender, disability, or other legally protected characteristics.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Maintenance:</Text> You will promptly respond to maintenance requests to ensure the property remains habitable.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>4. Tenant Responsibilities & Terms</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}>As a Tenant utilizing Abalay, you specifically agree that:</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Timely Payments:</Text> You are responsible for paying all rent and applicable fees on time, as scheduled by the platform or your lease agreement.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Property Care:</Text> You will maintain the property in a clean, sanitary condition and promptly report any damages or maintenance issues to the Landlord.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Lawful Use:</Text> You will not use the property for any illicit or prohibited activities, nor cause unreasonable nuisance to neighbors.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>• Compliance with Rules:</Text> You agree to abide by all specific property rules, such as those regarding pets, smoking, or noise, as outlined by the Landlord.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>5. Privacy & Data</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24 }}>Your use of the platform is also governed by our Privacy Policy, which details how we collect, use, and protect your information.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>6. Disclaimers & Limitation of Liability</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>"As Is" Basis:</Text> Abalay is provided indiscriminately on an "as is" and "as available" basis without any warranties of any kind, whether express or implied.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>Service Interruption:</Text> While we strive for 99.9% uptime, we do not guarantee that the service will be uninterrupted, error-free, or entirely secure at all times.</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24, marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>Limitation of Liability:</Text> In no event shall Abalay, its directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of or inability to use the platform.</Text>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: heading, marginBottom: 12 }}>7. Governing Law & Dispute Resolution</Text>
                    <Text style={{ fontSize: 15, color: body, lineHeight: 24 }}>These Terms shall be governed by and construed in accordance with the applicable laws of the jurisdiction in which Abalay operates, without regard to its conflict of law provisions. Any dispute arising from these Terms will be handled strictly through binding arbitration or within competent local courts.</Text>
                </View>

                <View style={{ backgroundColor: '#000', borderRadius: 16, padding: 24, marginTop: 16 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>Questions regarding these terms?</Text>
                    <Text style={{ color: '#d1d5db', marginBottom: 16 }}>If you have any clarifications required for our terms of service, reach out to us.</Text>
                    <TouchableOpacity style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 14 }}>Contact Us</Text>
                    </TouchableOpacity>
                </View>
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
