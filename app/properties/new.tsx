import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../lib/supabase";

const { width } = Dimensions.get("window");

export default function NewProperty() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadingTerms, setUploadingTerms] = useState(false); // New: PDF State
  const [showAllAmenities, setShowAllAmenities] = useState(false); // New: Amenities Toggle
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const statuses = [
    { label: "Available", value: "available" },
    { label: "Occupied", value: "occupied" },
    { label: "Unavailable", value: "not available" },
  ];

  const utilityAmenities = ["Free Water", "Free Electricity", "Free WiFi"];

  const [form, setForm] = useState({
    title: "",
    description: "",
    building_no: "",
    street: "",
    address: "",
    city: "",
    zip: "",
    location_link: "",
    owner_phone: "",
    owner_email: "",
    price: "",
    utilities_cost: "",
    internet_cost: "",
    association_dues: "",
    bedrooms: "1",
    bathrooms: "1",
    area_sqft: "",
    status: "available",
    property_type: "House Apartment",
    bed_type: "Single Bed",
    max_occupancy: "1",
    has_security_deposit: true,
    security_deposit_amount: "",
    deposit_same_as_rent: true,
    has_advance: true,
    advance_amount: "",
    advance_same_as_rent: true,
    terms_conditions: "",
    amenities: [] as string[],
    images: [] as string[],
  });

  const propertyTypes = [
    "House Apartment",
    "Studio Type",
    "Solo Room",
    "Boarding House",
  ];
  const bedTypes = ["Single Bed", "Double Bed", "Triple Bed"];

  const availableAmenities = [
    "Pool",
    "TV",
    "Elevator",
    "Air conditioning",
    "Heating",
    "CCTV",
    "Washing machine",
    "Dryer",
    "Parking",
    "Gym",
    "Security",
    "Balcony",
    "Garden",
    "Pet friendly",
    "Not Furnished",
    "Fully Furnished",
    "Semi-Furnished",
    "Carbon monoxide alarm",
    "Smoke alarm",
    "Fire extinguisher",
    "First aid kit",
  ];

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/");
        return;
      }
      setSession(session);

      // Role guard: only landlords can add properties
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "landlord") {
        Alert.alert("Access Denied", "Only landlords can add properties.");
        router.back();
      }
    });
  }, []);

  // --- IMAGE UPLOAD ---
  const pickImage = async () => {
    if (form.images.length >= 10)
      return Alert.alert("Limit Reached", "Max 10 images allowed");

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      uploadImage(result.assets[0]);
    }
  };

  const uploadImage = async (imageAsset: any) => {
    try {
      setUploading(true);
      const fileExt = imageAsset.uri.split(".").pop();
      const fileName = `${session?.user?.id}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from("property-images")
        .upload(fileName, decode(imageAsset.base64), {
          contentType: imageAsset.mimeType || "image/jpeg",
        });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("property-images").getPublicUrl(fileName);
      setForm((prev) => ({ ...prev, images: [...prev.images, publicUrl] }));
    } catch (error: any) {
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...form.images];
    newImages.splice(index, 1);
    setForm({ ...form, images: newImages });
  };

  // --- PDF UPLOAD (Ported) ---
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        if (file.size && file.size > 10 * 1024 * 1024) {
          Alert.alert("Error", "File size must be less than 10MB");
          return;
        }
        uploadTerms(file);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const uploadTerms = async (file: any) => {
    try {
      setUploadingTerms(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${session?.user?.id}/terms-${Date.now()}.${fileExt}`;
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { error } = await supabase.storage
        .from("property-documents")
        .upload(fileName, decode(base64), { contentType: "application/pdf" });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("property-documents").getPublicUrl(fileName);
      setForm((prev) => ({ ...prev, terms_conditions: publicUrl }));
      Alert.alert("Success", "Terms PDF uploaded!");
    } catch (error: any) {
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploadingTerms(false);
    }
  };

  // --- SUBMIT ---
  const handleSubmit = async () => {
    if (!validateAllRequiredFields()) return;

    setLoading(true);
    const sanitize = (val: string) => (val === "" ? 0 : parseFloat(val));

    const { deposit_same_as_rent, advance_same_as_rent, ...cleanedFormData } =
      form;

    const payload = {
      ...cleanedFormData,
      landlord: session.user.id,
      price: sanitize(form.price),
      utilities_cost: sanitize(form.utilities_cost),
      internet_cost: sanitize(form.internet_cost),
      association_dues: sanitize(form.association_dues),
      bedrooms: sanitize(form.bedrooms),
      bathrooms: sanitize(form.bathrooms),
      area_sqft: sanitize(form.area_sqft),
      max_occupancy: sanitize(form.max_occupancy),
      images: form.images.length > 0 ? form.images : null,
      has_security_deposit: form.has_security_deposit,
      security_deposit_amount: form.has_security_deposit
        ? form.deposit_same_as_rent
          ? sanitize(form.price)
          : sanitize(form.security_deposit_amount)
        : 0,
      has_advance: form.has_advance,
      advance_amount: form.has_advance
        ? form.advance_same_as_rent
          ? sanitize(form.price)
          : sanitize(form.advance_amount)
        : 0,
    };

    const { error } = await supabase.from("properties").insert(payload);

    setLoading(false);
    if (error) Alert.alert("Error", error.message);
    else {
      Alert.alert("Success", "Property listed successfully!");
      router.replace("/(tabs)/landlordproperties");
    }
  };

  const toggleAmenity = (amenity: string) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const isBlank = (value: string) => value.trim().length === 0;

  const validateStep = (step: number) => {
    if (step === 1) {
      if (isBlank(form.title)) {
        Alert.alert("Required Field", "Rent title is required.");
        return false;
      }

      if (
        isBlank(form.street) ||
        isBlank(form.address) ||
        isBlank(form.city) ||
        isBlank(form.zip)
      ) {
        Alert.alert(
          "Required Field",
          "Location fields (Street, Barangay, City, ZIP) are required.",
        );
        return false;
      }
    }

    if (step === 2) {
      if (isBlank(form.owner_phone) || isBlank(form.owner_email)) {
        Alert.alert("Required Field", "Phone number and email are required.");
        return false;
      }
    }

    if (step === 3) {
      if (
        isBlank(form.price) ||
        isBlank(form.bedrooms) ||
        isBlank(form.bathrooms) ||
        isBlank(form.area_sqft) ||
        isBlank(form.status)
      ) {
        Alert.alert(
          "Required Field",
          "Monthly price, beds, baths, sqft, and status are required.",
        );
        return false;
      }
    }

    if (step === 4) {
      if (
        form.has_security_deposit &&
        !form.deposit_same_as_rent &&
        isBlank(form.security_deposit_amount)
      ) {
        Alert.alert("Required Field", "Security deposit amount is required.");
        return false;
      }

      if (
        form.has_advance &&
        !form.advance_same_as_rent &&
        isBlank(form.advance_amount)
      ) {
        Alert.alert("Required Field", "Advance amount is required.");
        return false;
      }

      const hasUtilitySelection = utilityAmenities.some((amenity) =>
        form.amenities.includes(amenity),
      );
      if (!hasUtilitySelection) {
        Alert.alert(
          "Required Field",
          "Please select at least one utility as Free in Utilities.",
        );
        return false;
      }
    }

    if (step === 5) {
      if (isBlank(form.description)) {
        Alert.alert("Required Field", "Description is required.");
        return false;
      }

      if (form.images.length === 0) {
        Alert.alert("Required Field", "At least one photo is required.");
        return false;
      }
    }

    return true;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep(currentStep + 1);
  };

  const validateAllRequiredFields = () => {
    for (let step = 1; step <= 5; step += 1) {
      if (!validateStep(step)) {
        if (currentStep !== step) setCurrentStep(step);
        return false;
      }
    }
    return true;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerArea}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text style={styles.headerTitle}>Add Rent</Text>
            <Text style={{ fontSize: 12, color: "#666", fontWeight: "600" }}>
              Step {currentStep} of 7
            </Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Create a new listing for your portfolio.
          </Text>
        </View>

        {/* Step 1: Rent Title & Location */}
        {currentStep === 1 && (
          <>
            {/* --- Rent Title --- */}
            <View style={styles.card}>
              <Text style={styles.inputLabel}>RENT TITLE *</Text>
              <TextInput
                style={styles.hugeInput}
                placeholder="Rent Title"
                value={form.title}
                onChangeText={(t) => setForm({ ...form, title: t })}
              />
            </View>

            {/* --- Location --- */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.blackPill} />
                <Text style={styles.cardTitle}>Location</Text>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.subLabel}>Bldg No.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Bldg 5"
                    value={form.building_no}
                    onChangeText={(t) => setForm({ ...form, building_no: t })}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 2, marginLeft: 10 }]}>
                  <Text style={styles.subLabel}>Street *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Street"
                    value={form.street}
                    onChangeText={(t) => setForm({ ...form, street: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 2 }]}>
                  <Text style={styles.subLabel}>Barangay *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Barangay"
                    value={form.address}
                    onChangeText={(t) => setForm({ ...form, address: t })}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.subLabel}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="City"
                    value={form.city}
                    onChangeText={(t) => setForm({ ...form, city: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.subLabel}>ZIP Code*</Text>
                  <TextInput
                    style={styles.input}
                    placeholder=""
                    value={form.zip}
                    onChangeText={(t) => setForm({ ...form, zip: t })}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.subLabel}>Google Map Link (Preferred)</Text>
                <TextInput
                  style={[styles.input, { color: "#2563EB" }]}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor="#9CA3AF"
                  value={form.location_link}
                  onChangeText={(t) => setForm({ ...form, location_link: t })}
                />
              </View>
            </View>
          </>
        )}

        {/* Step 2: Contact */}
        {currentStep === 2 && (
          <>
            {/* --- Contact --- */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.blackPill} />
                <Text style={styles.cardTitle}>Contact</Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.subLabel}>Phone *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                  value={form.owner_phone}
                  onChangeText={(t) => setForm({ ...form, owner_phone: t })}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.subLabel}>Email *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={form.owner_email}
                  onChangeText={(t) => setForm({ ...form, owner_email: t })}
                />
              </View>
            </View>
          </>
        )}

        {/* Step 3: Details & Price */}
        {currentStep === 3 && (
          <>
            {/* --- Details --- */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.blackPill} />
                <Text style={styles.cardTitle}>Details</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.labelDark}>Monthly Price (₱) *</Text>
                <TextInput
                  style={styles.inputBold}
                  keyboardType="numeric"
                  value={form.price}
                  onChangeText={(t) => setForm({ ...form, price: t })}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.subLabel}>Beds</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={form.bedrooms}
                    onChangeText={(t) => setForm({ ...form, bedrooms: t })}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.subLabel}>Baths</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={form.bathrooms}
                    onChangeText={(t) => setForm({ ...form, bathrooms: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.subLabel}>Sqft</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={form.area_sqft}
                    onChangeText={(t) => setForm({ ...form, area_sqft: t })}
                  />
                </View>
                <View
                  style={[
                    styles.fieldGroup,
                    { flex: 1, marginLeft: 10, position: "relative" },
                  ]}
                >
                  <Text style={styles.subLabel}>Status</Text>
                  <TouchableOpacity
                    style={[
                      styles.input,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 10,
                      },
                    ]}
                    onPress={() => setShowStatusPicker(true)}
                  >
                    <Text style={{ fontSize: 14, color: "#111" }}>
                      {form.status === "not available"
                        ? "Unavailable"
                        : form.status === "occupied"
                          ? "Occupied"
                          : "Available"}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#6B7280" />
                  </TouchableOpacity>

                  <Modal
                    visible={showStatusPicker}
                    transparent
                    animationType="fade"
                  >
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.4)",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 100,
                      }}
                      onPress={() => setShowStatusPicker(false)}
                    >
                      <View
                        style={{
                          backgroundColor: "#fff",
                          width: "70%",
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        {statuses.map((s, i) => (
                          <TouchableOpacity
                            key={s.value}
                            style={{
                              padding: 16,
                              borderBottomWidth:
                                i === statuses.length - 1 ? 0 : 1,
                              borderBottomColor: "#F3F4F6",
                            }}
                            onPress={() => {
                              setForm({ ...form, status: s.value });
                              setShowStatusPicker(false);
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight:
                                  form.status === s.value ? "bold" : "normal",
                                color:
                                  form.status === s.value ? "#111" : "#4B5563",
                                textAlign: "center",
                              }}
                            >
                              {s.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Step 4: Payment Terms */}
        {currentStep === 4 && (
          <>
            {/* --- Payment Terms --- */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.blackPill} />
                <Text style={styles.cardTitle}>Payment Terms</Text>
              </View>

              <View style={styles.toggleBox}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>
                    Require Security Deposit?
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setForm({
                        ...form,
                        has_security_deposit: !form.has_security_deposit,
                      })
                    }
                    style={[
                      styles.switch,
                      form.has_security_deposit && styles.switchActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.switchThumb,
                        form.has_security_deposit && styles.switchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
                {form.has_security_deposit && (
                  <View style={{ marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() =>
                        setForm({
                          ...form,
                          deposit_same_as_rent: !form.deposit_same_as_rent,
                        })
                      }
                      style={styles.checkboxRow}
                    >
                      <Ionicons
                        name={
                          form.deposit_same_as_rent
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={20}
                        color="black"
                      />
                      <Text style={styles.checkboxLabel}>
                        Same as monthly rent
                      </Text>
                    </TouchableOpacity>
                    {!form.deposit_same_as_rent && (
                      <TextInput
                        style={[
                          styles.input,
                          { marginTop: 10, marginBottom: 0 },
                        ]}
                        placeholder="Amount (₱)"
                        keyboardType="numeric"
                        value={form.security_deposit_amount}
                        onChangeText={(t) =>
                          setForm({ ...form, security_deposit_amount: t })
                        }
                      />
                    )}
                  </View>
                )}
              </View>

              <View style={styles.toggleBox}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>
                    Require Advance Payment?
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setForm({ ...form, has_advance: !form.has_advance })
                    }
                    style={[
                      styles.switch,
                      form.has_advance && styles.switchActive,
                    ]}
                  >
                    <View
                      style={[
                        styles.switchThumb,
                        form.has_advance && styles.switchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
                {form.has_advance && (
                  <View style={{ marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() =>
                        setForm({
                          ...form,
                          advance_same_as_rent: !form.advance_same_as_rent,
                        })
                      }
                      style={styles.checkboxRow}
                    >
                      <Ionicons
                        name={
                          form.advance_same_as_rent
                            ? "checkbox"
                            : "square-outline"
                        }
                        size={20}
                        color="black"
                      />
                      <Text style={styles.checkboxLabel}>
                        Same as monthly rent
                      </Text>
                    </TouchableOpacity>
                    {!form.advance_same_as_rent && (
                      <TextInput
                        style={[
                          styles.input,
                          { marginTop: 10, marginBottom: 0 },
                        ]}
                        placeholder="Amount (₱)"
                        keyboardType="numeric"
                        value={form.advance_amount}
                        onChangeText={(t) =>
                          setForm({ ...form, advance_amount: t })
                        }
                      />
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* --- Utilities --- */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.blackPill} />
                <Text style={styles.cardTitle}>Utilities</Text>
              </View>
              <Text style={styles.helperText}>
                Toggle which utilities are included free. Non-free utilities
                will require a due date when assigning a tenant.
              </Text>

              {[
                {
                  label: "Water",
                  amenity: "Free Water",
                  icon: "water-outline",
                  bg: "#EFF6FF",
                  text: "#3B82F6",
                },
                {
                  label: "Electricity",
                  amenity: "Free Electricity",
                  icon: "flash-outline",
                  bg: "#FEF3C7",
                  text: "#D97706",
                },
              ].map((u) => {
                const isFree = form.amenities.includes(u.amenity);
                return (
                  <View
                    key={u.label}
                    style={[
                      styles.utilityRow,
                      isFree && styles.utilityRowActive,
                    ]}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View
                        style={[
                          styles.utilityIconBox,
                          isFree
                            ? { backgroundColor: "#D1FAE5" }
                            : { backgroundColor: u.bg },
                        ]}
                      >
                        <Ionicons
                          name={u.icon as any}
                          size={18}
                          color={isFree ? "#059669" : u.text}
                        />
                      </View>
                      <Text
                        style={[
                          styles.utilityLabel,
                          isFree && { color: "#059669" },
                        ]}
                      >
                        {u.label}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.utilityBtn,
                        isFree && styles.utilityBtnActive,
                      ]}
                      onPress={() => toggleAmenity(u.amenity)}
                    >
                      <Text
                        style={[
                          styles.utilityBtnText,
                          isFree && styles.utilityBtnTextActive,
                        ]}
                      >
                        {isFree ? "Free" : "Not Free"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* WIFI SECTION */}
              <View style={[styles.utilityRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={[styles.utilityIconBox, { backgroundColor: "#F3E8FF" }]}>
                      <Ionicons name="wifi-outline" size={18} color="#9333EA" />
                    </View>
                    <Text style={[styles.utilityLabel, { color: '#9333EA' }]}>WiFi Internet</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.utilityBtn,
                      (form.amenities.includes("Free WiFi") || form.amenities.includes("Paid WiFi")) && styles.utilityBtnActive
                    ]}
                    onPress={() => {
                      const hasWifi = form.amenities.includes("Free WiFi") || form.amenities.includes("Paid WiFi");
                      if (hasWifi) {
                        setForm(prev => ({ ...prev, amenities: prev.amenities.filter(a => a !== "Free WiFi" && a !== "Paid WiFi") }));
                      } else {
                        setForm(prev => ({ ...prev, amenities: [...prev.amenities, "Paid WiFi"] }));
                      }
                    }}
                  >
                    <Text style={[styles.utilityBtnText, (form.amenities.includes("Free WiFi") || form.amenities.includes("Paid WiFi")) && styles.utilityBtnTextActive]}>
                      {(form.amenities.includes("Free WiFi") || form.amenities.includes("Paid WiFi")) ? "Available" : "Not Available"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {(form.amenities.includes("Free WiFi") || form.amenities.includes("Paid WiFi")) && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingLeft: 46 }}>
                    <Text style={{ fontSize: 13, color: '#4B5563', fontWeight: 'bold' }}>Is WiFi Free?</Text>
                    <TouchableOpacity
                      style={[
                        styles.utilityBtn,
                        form.amenities.includes("Free WiFi") && { backgroundColor: '#10B981', borderColor: '#10B981' }
                      ]}
                      onPress={() => {
                        const isFree = form.amenities.includes("Free WiFi");
                        if (isFree) {
                          setForm(prev => ({ ...prev, amenities: [...prev.amenities.filter(a => a !== "Free WiFi" && a !== "Paid WiFi"), "Paid WiFi"] }));
                        } else {
                          setForm(prev => ({ ...prev, amenities: [...prev.amenities.filter(a => a !== "Free WiFi" && a !== "Paid WiFi"), "Free WiFi"] }));
                        }
                      }}
                    >
                      <Text style={[styles.utilityBtnText, form.amenities.includes("Free WiFi") && { color: 'white' }]}>
                        {form.amenities.includes("Free WiFi") ? "Yes, Free WiFi" : "No, Tenant Pays"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        {/* Step 5: Description & Terms */}
        {currentStep === 5 && (
          <>
            {/* --- Description & Terms --- */}
            <View style={styles.card}>
              <Text style={styles.inputLabel}>DESCRIPTION</Text>
              <TextInput
                style={[
                  styles.input,
                  { height: 100, textAlignVertical: "top" },
                ]}
                multiline
                placeholder="Describe the property..."
                value={form.description}
                onChangeText={(t) => setForm({ ...form, description: t })}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>
                TERMS & CONDITIONS (PDF)
              </Text>
              <View style={styles.pdfArea}>
                {form.terms_conditions ? (
                  <View style={styles.pdfUploaded}>
                    <TouchableOpacity
                      onPress={() => Linking.openURL(form.terms_conditions)}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Ionicons
                        name="document-text"
                        size={20}
                        color="#2563eb"
                      />
                      <Text style={styles.pdfLink}>View Uploaded PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        setForm((prev) => ({ ...prev, terms_conditions: "" }))
                      }
                    >
                      <Text style={styles.pdfRemove}>REMOVE</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.pdfEmpty}>
                    No custom terms uploaded. The default system terms will be
                    used.
                  </Text>
                )}

                <TouchableOpacity
                  onPress={pickDocument}
                  disabled={uploadingTerms}
                  style={styles.uploadBtn}
                >
                  {uploadingTerms ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.uploadBtnText}>Upload PDF</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* --- Photos --- */}
            <View style={styles.card}>
              <Text style={styles.cardTitlePlain}>Photos</Text>
              <View style={styles.photoGrid}>
                <TouchableOpacity
                  style={styles.photoAddBox}
                  onPress={pickImage}
                  disabled={uploading || form.images.length >= 10}
                >
                  {uploading ? (
                    <ActivityIndicator color="#9CA3AF" />
                  ) : (
                    <Text style={styles.photoAddPlus}>+</Text>
                  )}
                </TouchableOpacity>
                {form.images.map((img, idx) => (
                  <View key={idx} style={styles.photoBox}>
                    <Image source={{ uri: img }} style={styles.photoImg} />
                    <TouchableOpacity
                      onPress={() => removeImage(idx)}
                      style={styles.photoRemove}
                    >
                      <Ionicons name="close" size={14} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={styles.uploadMultiBtn}
                onPress={pickImage}
              >
                <Ionicons name="images-outline" size={16} color="#4B5563" />
                <Text style={styles.uploadMultiText}>Upload Photo</Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.helperText,
                  { textAlign: "center", marginTop: 8 },
                ]}
              >
                Max 5MB per image. Up to 10 photos.
              </Text>
            </View>
          </>
        )}

        {/* Step 6: Amenities */}
        {currentStep === 6 && (
          <>
            {/* --- Amenities --- */}
            <View style={styles.card}>
              <Text style={styles.cardTitlePlain}>Amenities</Text>
              <View style={styles.amenitiesWrap}>
                {(showAllAmenities
                  ? availableAmenities
                  : availableAmenities.slice(0, 10)
                ).map((amenity) => (
                  <TouchableOpacity
                    key={amenity}
                    style={[
                      styles.amenityPill,
                      form.amenities.includes(amenity) &&
                        styles.amenityPillActive,
                    ]}
                    onPress={() => toggleAmenity(amenity)}
                  >
                    <Text
                      style={[
                        styles.amenityPillText,
                        form.amenities.includes(amenity) &&
                          styles.amenityPillTextActive,
                      ]}
                    >
                      {amenity}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => setShowAllAmenities(!showAllAmenities)}
                style={{ marginTop: 15 }}
              >
                <Text style={styles.toggleAllText}>
                  {showAllAmenities
                    ? "Show Less"
                    : `Show All (${availableAmenities.length})`}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Navigation Buttons */}
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={styles.btnCancel}
            onPress={() =>
              currentStep > 1 ? setCurrentStep(currentStep - 1) : router.back()
            }
          >
            <Text style={styles.btnCancelText}>
              {currentStep === 1 ? "Cancel" : "Back"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnCreate}
            onPress={() =>
              currentStep < 6 ? handleNextStep() : handleSubmit()
            }
            disabled={loading || uploading || uploadingTerms}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.btnCreateText}>
                {currentStep === 6 ? "Create" : "Next"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAF9F6" },
  scrollContent: {
    paddingTop: 55,
    paddingHorizontal: 16,
    paddingVertical: 25,
    paddingBottom: 100,
  },
  headerArea: { marginBottom: 20, paddingHorizontal: 4 },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  headerSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },

  card: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  blackPill: {
    width: 6,
    height: 16,
    backgroundColor: "#000",
    borderRadius: 4,
    marginRight: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardTitlePlain: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },

  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 6,
    marginLeft: 4,
  },
  labelDark: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    marginLeft: 4,
  },

  hugeInput: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 18,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    color: "#111",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
    color: "#111",
  },
  inputBold: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 16,
    color: "#111",
  },

  row: { flexDirection: "row" },
  fieldGroup: { marginBottom: 4 },

  toggleBox: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleLabel: { fontSize: 13, fontWeight: "700", color: "#374151" },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchActive: { backgroundColor: "#000" },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    transform: [{ translateX: 0 }],
  },
  switchThumbActive: { transform: [{ translateX: 20 }] },
  checkboxRow: { flexDirection: "row", alignItems: "center" },
  checkboxLabel: { fontSize: 13, fontWeight: "500", color: "#4B5563" },
  helperText: { fontSize: 11, color: "#9CA3AF", marginTop: 4 },

  utilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 8,
  },
  utilityRowActive: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  utilityIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  utilityLabel: { fontSize: 14, fontWeight: "700", color: "#374151" },
  utilityBtn: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  utilityBtnActive: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  utilityBtnText: { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  utilityBtnTextActive: { color: "#059669" },

  pdfArea: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    borderRadius: 12,
    padding: 16,
  },
  pdfUploaded: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 12,
  },
  pdfLink: { color: "#2563EB", fontSize: 13, fontWeight: "600", marginLeft: 6 },
  pdfRemove: { color: "#EF4444", fontSize: 11, fontWeight: "700" },
  pdfEmpty: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 16,
    textAlign: "center",
  },
  uploadBtn: {
    backgroundColor: "#111",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  uploadBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  photoAddBox: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  photoAddPlus: { fontSize: 24, color: "#9CA3AF", fontWeight: "300" },
  photoBox: { width: 80, height: 80, borderRadius: 12, position: "relative" },
  photoImg: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  photoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    backgroundColor: "#EF4444",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  uploadMultiBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    borderRadius: 10,
  },
  uploadMultiText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    marginLeft: 8,
  },

  amenitiesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenityPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  amenityPillActive: { backgroundColor: "#111", borderColor: "#111" },
  amenityPillText: { fontSize: 12, color: "#4B5563", fontWeight: "500" },
  amenityPillTextActive: { color: "#fff", fontWeight: "600" },
  toggleAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111",
    textDecorationLine: "underline",
  },

  footerRow: { flexDirection: "row", gap: 12, marginTop: 10, marginBottom: 40 },
  btnCancel: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnCancelText: { fontSize: 15, fontWeight: "700", color: "#111" },
  btnCreate: {
    flex: 1,
    backgroundColor: "#000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnCreateText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
