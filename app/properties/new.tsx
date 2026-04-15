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
import {
    getCountryOptions,
    getStateOptionsForCountry,
} from "../../lib/locationData";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

const { width } = Dimensions.get("window");

export default function NewProperty() {
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [profileRole, setProfileRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadingTerms, setUploadingTerms] = useState(false); // New: PDF State
  const [showAllAmenities, setShowAllAmenities] = useState(false); // New: Amenities Toggle
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");

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
    state_province: "",
    country: "",
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

  const countryOptions = React.useMemo(() => getCountryOptions(), []);
  const stateOptions = React.useMemo(
    () => getStateOptionsForCountry(form.country),
    [form.country],
  );

  const filteredCountries = React.useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    if (!query) return countryOptions;
    return countryOptions.filter((country) =>
      country.name.toLowerCase().includes(query),
    );
  }, [countryOptions, countrySearch]);

  const filteredStates = React.useMemo(() => {
    const query = stateSearch.trim().toLowerCase();
    if (!query) return stateOptions;
    return stateOptions.filter((state) =>
      state.name.toLowerCase().includes(query),
    );
  }, [stateOptions, stateSearch]);

  const propertyTypes = [
    "House Apartment",
    "Studio Type",
    "Solo Room",
    "Boarding House",
  ];
  const bedTypes = ["Single Bed", "Double Bed", "Triple Bed"];

  const availableAmenities = [
    "Kitchen",
    "Pool",
    "TV",
    "Elevator",
    "Air conditioning",
    "Heating",
    "Basketball court",
    "Washing machine",
    "Dryer",
    "Parking",
    "Gym",
    "Security",
    "Balcony",
    "Garden",
    "Kid's Playground",
    "Pet friendly",
    "Furnished",
    "Carbon monoxide alarm",
    "Smoke alarm",
    "Fire extinguisher",
    "First aid kit",
    "WiFi",
    "Cable TV",
    "Workspace",
    "Study desk",
    "Wardrobe",
    "Closet",
    "Hot water",
    "Refrigerator",
    "Microwave",
    "Oven",
    "Dishwasher",
    "Coffee maker",
    "24/7 Security",
    "CCTV",
    "Gated community",
    "Doorman",
    "Private entrance",
    "Fire exit",
    "Emergency lighting",
    "Beach access",
    "Mountain view",
    "City view",
    "BBQ grill",
    "Outdoor dining area",
    "Patio",
    "Terrace",
    "Game room",
    "Billiards",
    "Table tennis",
    "Sauna",
    "Spa",
    "Jacuzzi",
    "Power backup",
    "Generator",
    "Solar panels",
    "Water heater",
    "Water tank",
    "Deep well",
    "Garbage disposal",
    "Recycling bins",
    "Bicycle parking",
    "Motorcycle parking",
    "Shuttle service",
    "Transport service",
    "Cleaning service",
    "Laundry service",
    "Keycard access",
    "Smart lock",
    "Soundproof rooms",
    "Non-smoking rooms",
    "Wheelchair accessible",
    "Ramp access",
  ];

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/");
        return;
      }
      setSession(session);

      // Role guard: allow landlord and admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      const normalizedRole = String(profile?.role || "").toLowerCase();
      setProfileRole(normalizedRole);

      if (normalizedRole !== "landlord" && normalizedRole !== "admin") {
        Alert.alert(
          "Access Denied",
          "Only landlords and admins can add properties.",
        );
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
      if (profileRole === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/(tabs)/landlordproperties");
      }
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

  const handleCountrySelect = (countryName: string) => {
    setForm((prev) => ({
      ...prev,
      country: countryName,
      state_province: "",
    }));
    setCountrySearch("");
    setStateSearch("");
    setShowCountryPicker(false);
  };

  const handleStateSelect = (stateName: string) => {
    setForm((prev) => ({ ...prev, state_province: stateName }));
    setStateSearch("");
    setShowStatePicker(false);
  };

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
        isBlank(form.state_province) ||
        isBlank(form.country) ||
        isBlank(form.zip)
      ) {
        Alert.alert(
          "Required Field",
          "Location fields (Street, Barangay, City, State/Province, Country, ZIP) are required.",
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
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? colors.background : "#FAF9F6" },
      ]}
    >
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
            <Text
              style={[
                styles.headerTitle,
                { color: isDark ? colors.text : "#111827" },
              ]}
            >
              Add Rent
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: isDark ? colors.textMuted : "#666",
                fontWeight: "600",
              }}
            >
              Step {currentStep} of 7
            </Text>
          </View>
          <Text
            style={[
              styles.headerSubtitle,
              { color: isDark ? colors.textMuted : "#6B7280" },
            ]}
          >
            Create a new listing for your portfolio.
          </Text>
        </View>

        {/* Step 1: Rent Title & Location */}
        {currentStep === 1 && (
          <>
            {/* --- Rent Title --- */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <Text
                style={[
                  styles.inputLabel,
                  { color: isDark ? colors.textMuted : "#9CA3AF" },
                ]}
              >
                RENT TITLE *
              </Text>
              <TextInput
                style={[
                  styles.hugeInput,
                  {
                    backgroundColor: isDark ? colors.inputBg : "#F9FAFB",
                    borderColor: isDark ? colors.inputBorder : "#F3F4F6",
                    color: isDark ? colors.text : "#111",
                  },
                ]}
                placeholder="Rent Title"
                placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                value={form.title}
                onChangeText={(t) => setForm({ ...form, title: t })}
              />
            </View>

            {/* --- Location --- */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.blackPill,
                    { backgroundColor: isDark ? colors.text : "#000" },
                  ]}
                />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? colors.text : "#111827" },
                  ]}
                >
                  Location
                </Text>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Bldg No.
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    placeholder="Bldg 5"
                    placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                    value={form.building_no}
                    onChangeText={(t) => setForm({ ...form, building_no: t })}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 2, marginLeft: 10 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Street *
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    placeholder="Street"
                    placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                    value={form.street}
                    onChangeText={(t) => setForm({ ...form, street: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 2 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Barangay *
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    placeholder="Barangay"
                    placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                    value={form.address}
                    onChangeText={(t) => setForm({ ...form, address: t })}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    City *
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    placeholder="City"
                    placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                    value={form.city}
                    onChangeText={(t) => setForm({ ...form, city: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Country *
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.pickerField,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setShowCountryPicker(true)}
                  >
                    <Text
                      style={
                        form.country
                          ? [
                              styles.pickerFieldText,
                              { color: isDark ? colors.text : "#111" },
                            ]
                          : [
                              styles.pickerFieldPlaceholder,
                              { color: isDark ? colors.textMuted : "#9CA3AF" },
                            ]
                      }
                    >
                      {form.country || "Select country"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={isDark ? colors.textMuted : "#6B7280"}
                    />
                  </TouchableOpacity>
                </View>

                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    State/Province *
                  </Text>
                  {form.country && stateOptions.length === 0 ? (
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                          borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                          color: isDark ? colors.text : "#111",
                        },
                      ]}
                      placeholder="Type state/province"
                      placeholderTextColor={
                        isDark ? colors.textMuted : "#9CA3AF"
                      }
                      value={form.state_province}
                      onChangeText={(t) =>
                        setForm({ ...form, state_province: t })
                      }
                    />
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.pickerField,
                        {
                          backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                          borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        },
                      ]}
                      activeOpacity={0.8}
                      disabled={!form.country}
                      onPress={() => {
                        if (form.country) setShowStatePicker(true);
                      }}
                    >
                      <Text
                        style={
                          form.state_province
                            ? [
                                styles.pickerFieldText,
                                { color: isDark ? colors.text : "#111" },
                              ]
                            : [
                                styles.pickerFieldPlaceholder,
                                {
                                  color: isDark ? colors.textMuted : "#9CA3AF",
                                },
                              ]
                        }
                      >
                        {form.state_province ||
                          (form.country
                            ? "Select state/province"
                            : "Select country first")}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={
                          form.country
                            ? isDark
                              ? colors.textMuted
                              : "#6B7280"
                            : isDark
                              ? colors.textMuted
                              : "#9CA3AF"
                        }
                      />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    ZIP Code*
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    placeholder=""
                    placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                    value={form.zip}
                    onChangeText={(t) => setForm({ ...form, zip: t })}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.subLabel,
                    { color: isDark ? colors.textMuted : "#6B7280" },
                  ]}
                >
                  Google Map Link (Preferred)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                      borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                      color: "#2563EB",
                    },
                  ]}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.blackPill,
                    { backgroundColor: isDark ? colors.text : "#000" },
                  ]}
                />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? colors.text : "#111827" },
                  ]}
                >
                  Contact
                </Text>
              </View>
              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.subLabel,
                    { color: isDark ? colors.textMuted : "#6B7280" },
                  ]}
                >
                  Phone *
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                      borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                      color: isDark ? colors.text : "#111",
                    },
                  ]}
                  placeholder="Phone number"
                  placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                  keyboardType="phone-pad"
                  value={form.owner_phone}
                  onChangeText={(t) => setForm({ ...form, owner_phone: t })}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.subLabel,
                    { color: isDark ? colors.textMuted : "#6B7280" },
                  ]}
                >
                  Email *
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                      borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                      color: isDark ? colors.text : "#111",
                    },
                  ]}
                  placeholder="Email Address"
                  placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.blackPill,
                    { backgroundColor: isDark ? colors.text : "#000" },
                  ]}
                />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? colors.text : "#111827" },
                  ]}
                >
                  Details
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text
                  style={[
                    styles.labelDark,
                    { color: isDark ? colors.textSecondary : "#374151" },
                  ]}
                >
                  Monthly Price (₱) *
                </Text>
                <TextInput
                  style={[
                    styles.inputBold,
                    {
                      backgroundColor: isDark ? colors.inputBg : "#F9FAFB",
                      borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                      color: isDark ? colors.text : "#111",
                    },
                  ]}
                  placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                  keyboardType="numeric"
                  value={form.price}
                  onChangeText={(t) => setForm({ ...form, price: t })}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Beds
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    keyboardType="numeric"
                    value={form.bedrooms}
                    onChangeText={(t) => setForm({ ...form, bedrooms: t })}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Baths
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
                    keyboardType="numeric"
                    value={form.bathrooms}
                    onChangeText={(t) => setForm({ ...form, bathrooms: t })}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Sqft
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        color: isDark ? colors.text : "#111",
                      },
                    ]}
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
                  <Text
                    style={[
                      styles.subLabel,
                      { color: isDark ? colors.textMuted : "#6B7280" },
                    ]}
                  >
                    Status
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.input,
                      {
                        backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                        borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 10,
                      },
                    ]}
                    onPress={() => setShowStatusPicker(true)}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: isDark ? colors.text : "#111",
                      }}
                    >
                      {form.status === "not available"
                        ? "Unavailable"
                        : form.status === "occupied"
                          ? "Occupied"
                          : "Available"}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      color={isDark ? colors.textMuted : "#6B7280"}
                    />
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
                          backgroundColor: isDark ? colors.surface : "#fff",
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
                              borderBottomColor: isDark
                                ? colors.border
                                : "#F3F4F6",
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
                                  form.status === s.value
                                    ? isDark
                                      ? colors.text
                                      : "#111"
                                    : isDark
                                      ? colors.textSecondary
                                      : "#4B5563",
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.blackPill,
                    { backgroundColor: isDark ? colors.text : "#000" },
                  ]}
                />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? colors.text : "#111827" },
                  ]}
                >
                  Payment Terms
                </Text>
              </View>

              <View
                style={[
                  styles.toggleBox,
                  {
                    backgroundColor: isDark ? colors.card : "#F9FAFB",
                    borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                  },
                ]}
              >
                <View style={styles.toggleRow}>
                  <Text
                    style={[
                      styles.toggleLabel,
                      { color: isDark ? colors.text : "#374151" },
                    ]}
                  >
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
                      { backgroundColor: isDark ? colors.border : "#E5E7EB" },
                      form.has_security_deposit && [
                        styles.switchActive,
                        { backgroundColor: isDark ? colors.text : "#000" },
                      ],
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
                        color={isDark ? colors.text : "black"}
                      />
                      <Text
                        style={[
                          styles.checkboxLabel,
                          { color: isDark ? colors.textSecondary : "#4B5563" },
                        ]}
                      >
                        Same as monthly rent
                      </Text>
                    </TouchableOpacity>
                    {!form.deposit_same_as_rent && (
                      <TextInput
                        style={[
                          styles.input,
                          {
                            marginTop: 10,
                            marginBottom: 0,
                            backgroundColor: isDark
                              ? colors.inputBg
                              : "#FFFFFF",
                            borderColor: isDark
                              ? colors.inputBorder
                              : "#E5E7EB",
                            color: isDark ? colors.text : "#111",
                          },
                        ]}
                        placeholder="Amount (₱)"
                        placeholderTextColor={
                          isDark ? colors.textMuted : "#9CA3AF"
                        }
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

              <View
                style={[
                  styles.toggleBox,
                  {
                    backgroundColor: isDark ? colors.card : "#F9FAFB",
                    borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                  },
                ]}
              >
                <View style={styles.toggleRow}>
                  <Text
                    style={[
                      styles.toggleLabel,
                      { color: isDark ? colors.text : "#374151" },
                    ]}
                  >
                    Require Advance Payment?
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setForm({ ...form, has_advance: !form.has_advance })
                    }
                    style={[
                      styles.switch,
                      { backgroundColor: isDark ? colors.border : "#E5E7EB" },
                      form.has_advance && [
                        styles.switchActive,
                        { backgroundColor: isDark ? colors.text : "#000" },
                      ],
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
                        color={isDark ? colors.text : "black"}
                      />
                      <Text
                        style={[
                          styles.checkboxLabel,
                          { color: isDark ? colors.textSecondary : "#4B5563" },
                        ]}
                      >
                        Same as monthly rent
                      </Text>
                    </TouchableOpacity>
                    {!form.advance_same_as_rent && (
                      <TextInput
                        style={[
                          styles.input,
                          {
                            marginTop: 10,
                            marginBottom: 0,
                            backgroundColor: isDark
                              ? colors.inputBg
                              : "#FFFFFF",
                            borderColor: isDark
                              ? colors.inputBorder
                              : "#E5E7EB",
                            color: isDark ? colors.text : "#111",
                          },
                        ]}
                        placeholder="Amount (₱)"
                        placeholderTextColor={
                          isDark ? colors.textMuted : "#9CA3AF"
                        }
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.blackPill,
                    { backgroundColor: isDark ? colors.text : "#000" },
                  ]}
                />
                <Text
                  style={[
                    styles.cardTitle,
                    { color: isDark ? colors.text : "#111827" },
                  ]}
                >
                  Utilities
                </Text>
              </View>
              <Text
                style={[
                  styles.helperText,
                  { color: isDark ? colors.textMuted : "#9CA3AF" },
                ]}
              >
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
                      {
                        backgroundColor: isDark ? colors.card : "#F9FAFB",
                        borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                      },
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
                          { color: isDark ? colors.textSecondary : "#374151" },
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
              <View
                style={[
                  styles.utilityRow,
                  {
                    flexDirection: "column",
                    alignItems: "stretch",
                    backgroundColor: isDark ? colors.card : "#F9FAFB",
                    borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={[
                        styles.utilityIconBox,
                        { backgroundColor: "#F3E8FF" },
                      ]}
                    >
                      <Ionicons name="wifi-outline" size={18} color="#9333EA" />
                    </View>
                    <Text style={[styles.utilityLabel, { color: "#9333EA" }]}>
                      WiFi Internet
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.utilityBtn,
                      (form.amenities.includes("Free WiFi") ||
                        form.amenities.includes("Paid WiFi")) &&
                        styles.utilityBtnActive,
                    ]}
                    onPress={() => {
                      const hasWifi =
                        form.amenities.includes("Free WiFi") ||
                        form.amenities.includes("Paid WiFi");
                      if (hasWifi) {
                        setForm((prev) => ({
                          ...prev,
                          amenities: prev.amenities.filter(
                            (a) => a !== "Free WiFi" && a !== "Paid WiFi",
                          ),
                        }));
                      } else {
                        setForm((prev) => ({
                          ...prev,
                          amenities: [...prev.amenities, "Paid WiFi"],
                        }));
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.utilityBtnText,
                        (form.amenities.includes("Free WiFi") ||
                          form.amenities.includes("Paid WiFi")) &&
                          styles.utilityBtnTextActive,
                      ]}
                    >
                      {form.amenities.includes("Free WiFi") ||
                      form.amenities.includes("Paid WiFi")
                        ? "Available"
                        : "Not Available"}
                    </Text>
                  </TouchableOpacity>
                </View>

                {(form.amenities.includes("Free WiFi") ||
                  form.amenities.includes("Paid WiFi")) && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 16,
                      paddingLeft: 46,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: isDark ? colors.textSecondary : "#4B5563",
                        fontWeight: "bold",
                      }}
                    >
                      Is WiFi Free?
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.utilityBtn,
                        form.amenities.includes("Free WiFi") && {
                          backgroundColor: "#10B981",
                          borderColor: "#10B981",
                        },
                      ]}
                      onPress={() => {
                        const isFree = form.amenities.includes("Free WiFi");
                        if (isFree) {
                          setForm((prev) => ({
                            ...prev,
                            amenities: [
                              ...prev.amenities.filter(
                                (a) => a !== "Free WiFi" && a !== "Paid WiFi",
                              ),
                              "Paid WiFi",
                            ],
                          }));
                        } else {
                          setForm((prev) => ({
                            ...prev,
                            amenities: [
                              ...prev.amenities.filter(
                                (a) => a !== "Free WiFi" && a !== "Paid WiFi",
                              ),
                              "Free WiFi",
                            ],
                          }));
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.utilityBtnText,
                          form.amenities.includes("Free WiFi") && {
                            color: "white",
                          },
                        ]}
                      >
                        {form.amenities.includes("Free WiFi")
                          ? "Yes, Free WiFi"
                          : "No, Tenant Pays"}
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <Text
                style={[
                  styles.inputLabel,
                  { color: isDark ? colors.textMuted : "#9CA3AF" },
                ]}
              >
                DESCRIPTION
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    height: 100,
                    textAlignVertical: "top",
                    backgroundColor: isDark ? colors.inputBg : "#FFFFFF",
                    borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                    color: isDark ? colors.text : "#111",
                  },
                ]}
                multiline
                placeholder="Describe the property..."
                placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
                value={form.description}
                onChangeText={(t) => setForm({ ...form, description: t })}
              />

              <Text
                style={[
                  styles.inputLabel,
                  {
                    marginTop: 10,
                    color: isDark ? colors.textMuted : "#9CA3AF",
                  },
                ]}
              >
                TERMS & CONDITIONS (PDF)
              </Text>
              <View
                style={[
                  styles.pdfArea,
                  {
                    backgroundColor: isDark ? colors.card : "#F9FAFB",
                    borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                  },
                ]}
              >
                {form.terms_conditions ? (
                  <View
                    style={[
                      styles.pdfUploaded,
                      {
                        backgroundColor: isDark ? colors.surface : "#fff",
                        borderColor: isDark ? colors.border : "#E5E7EB",
                      },
                    ]}
                  >
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
                  <Text
                    style={[
                      styles.pdfEmpty,
                      { color: isDark ? colors.textMuted : "#9CA3AF" },
                    ]}
                  >
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <Text
                style={[
                  styles.cardTitlePlain,
                  { color: isDark ? colors.text : "#111827" },
                ]}
              >
                Photos
              </Text>
              <View style={styles.photoGrid}>
                <TouchableOpacity
                  style={[
                    styles.photoAddBox,
                    {
                      backgroundColor: isDark ? colors.card : "#F9FAFB",
                      borderColor: isDark ? colors.border : "#D1D5DB",
                    },
                  ]}
                  onPress={pickImage}
                  disabled={uploading || form.images.length >= 10}
                >
                  {uploading ? (
                    <ActivityIndicator
                      color={isDark ? colors.textMuted : "#9CA3AF"}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.photoAddPlus,
                        { color: isDark ? colors.textMuted : "#9CA3AF" },
                      ]}
                    >
                      +
                    </Text>
                  )}
                </TouchableOpacity>
                {form.images.map((img, idx) => (
                  <View key={idx} style={styles.photoBox}>
                    <Image
                      source={{ uri: img }}
                      style={[
                        styles.photoImg,
                        { borderColor: isDark ? colors.border : "#E5E7EB" },
                      ]}
                    />
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
                style={[
                  styles.uploadMultiBtn,
                  { backgroundColor: isDark ? colors.card : "#F3F4F6" },
                ]}
                onPress={pickImage}
              >
                <Ionicons
                  name="images-outline"
                  size={16}
                  color={isDark ? colors.textSecondary : "#4B5563"}
                />
                <Text
                  style={[
                    styles.uploadMultiText,
                    { color: isDark ? colors.textSecondary : "#4B5563" },
                  ]}
                >
                  Upload Photo
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.helperText,
                  {
                    textAlign: "center",
                    marginTop: 8,
                    color: isDark ? colors.textMuted : "#9CA3AF",
                  },
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
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? colors.surface : "#FFFFFF",
                  borderColor: isDark ? colors.cardBorder : "#F3F4F6",
                },
              ]}
            >
              <Text
                style={[
                  styles.cardTitlePlain,
                  { color: isDark ? colors.text : "#111827" },
                ]}
              >
                Amenities
              </Text>
              <View style={styles.amenitiesWrap}>
                {(showAllAmenities
                  ? availableAmenities
                  : availableAmenities.slice(0, 10)
                ).map((amenity) => (
                  <TouchableOpacity
                    key={amenity}
                    style={[
                      styles.amenityPill,
                      {
                        backgroundColor: isDark ? colors.card : "#fff",
                        borderColor: isDark ? colors.border : "#E5E7EB",
                      },
                      form.amenities.includes(amenity) &&
                        styles.amenityPillActive,
                    ]}
                    onPress={() => toggleAmenity(amenity)}
                  >
                    <Text
                      style={[
                        styles.amenityPillText,
                        { color: isDark ? colors.textSecondary : "#4B5563" },
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
                <Text
                  style={[
                    styles.toggleAllText,
                    { color: isDark ? colors.text : "#111" },
                  ]}
                >
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
            style={[
              styles.btnCancel,
              {
                backgroundColor: isDark ? colors.surface : "#fff",
                borderColor: isDark ? colors.border : "#E5E7EB",
              },
            ]}
            onPress={() =>
              currentStep > 1 ? setCurrentStep(currentStep - 1) : router.back()
            }
          >
            <Text
              style={[
                styles.btnCancelText,
                { color: isDark ? colors.text : "#111" },
              ]}
            >
              {currentStep === 1 ? "Cancel" : "Back"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btnCreate,
              { backgroundColor: isDark ? colors.text : "#000" },
            ]}
            onPress={() =>
              currentStep < 6 ? handleNextStep() : handleSubmit()
            }
            disabled={loading || uploading || uploadingTerms}
          >
            {loading ? (
              <ActivityIndicator color={isDark ? colors.background : "white"} />
            ) : (
              <Text
                style={[
                  styles.btnCreateText,
                  { color: isDark ? colors.background : "#fff" },
                ]}
              >
                {currentStep === 6 ? "Create" : "Next"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showCountryPicker} transparent animationType="fade">
        <View style={styles.pickerModalOverlay}>
          <View
            style={[
              styles.pickerModalCard,
              { backgroundColor: isDark ? colors.surface : "#fff" },
            ]}
          >
            <Text
              style={[
                styles.pickerModalTitle,
                { color: isDark ? colors.text : "#111827" },
              ]}
            >
              Select Country
            </Text>
            <TextInput
              style={[
                styles.pickerSearchInput,
                {
                  backgroundColor: isDark ? colors.inputBg : "#F9FAFB",
                  borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                  color: isDark ? colors.text : "#111",
                },
              ]}
              placeholder="Search country"
              placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            <ScrollView style={styles.pickerOptionsList}>
              {filteredCountries.map((country) => (
                <TouchableOpacity
                  key={country.isoCode}
                  style={[
                    styles.pickerOption,
                    { borderBottomColor: isDark ? colors.border : "#F3F4F6" },
                  ]}
                  onPress={() => handleCountrySelect(country.name)}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      { color: isDark ? colors.text : "#111827" },
                    ]}
                  >
                    {country.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[
                styles.pickerCancelBtn,
                { backgroundColor: isDark ? colors.card : "#F3F4F6" },
              ]}
              onPress={() => {
                setCountrySearch("");
                setShowCountryPicker(false);
              }}
            >
              <Text
                style={[
                  styles.pickerCancelBtnText,
                  { color: isDark ? colors.text : "#374151" },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showStatePicker} transparent animationType="fade">
        <View style={styles.pickerModalOverlay}>
          <View
            style={[
              styles.pickerModalCard,
              { backgroundColor: isDark ? colors.surface : "#fff" },
            ]}
          >
            <Text
              style={[
                styles.pickerModalTitle,
                { color: isDark ? colors.text : "#111827" },
              ]}
            >
              Select State/Province
            </Text>
            <TextInput
              style={[
                styles.pickerSearchInput,
                {
                  backgroundColor: isDark ? colors.inputBg : "#F9FAFB",
                  borderColor: isDark ? colors.inputBorder : "#E5E7EB",
                  color: isDark ? colors.text : "#111",
                },
              ]}
              placeholder="Search state/province"
              placeholderTextColor={isDark ? colors.textMuted : "#9CA3AF"}
              value={stateSearch}
              onChangeText={setStateSearch}
            />
            <ScrollView style={styles.pickerOptionsList}>
              {filteredStates.map((state) => (
                <TouchableOpacity
                  key={state.isoCode || state.name}
                  style={[
                    styles.pickerOption,
                    { borderBottomColor: isDark ? colors.border : "#F3F4F6" },
                  ]}
                  onPress={() => handleStateSelect(state.name)}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      { color: isDark ? colors.text : "#111827" },
                    ]}
                  >
                    {state.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[
                styles.pickerCancelBtn,
                { backgroundColor: isDark ? colors.card : "#F3F4F6" },
              ]}
              onPress={() => {
                setStateSearch("");
                setShowStatePicker(false);
              }}
            >
              <Text
                style={[
                  styles.pickerCancelBtnText,
                  { color: isDark ? colors.text : "#374151" },
                ]}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  pickerField: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 42,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pickerFieldText: {
    fontSize: 14,
    color: "#111",
    flex: 1,
    paddingRight: 8,
  },
  pickerFieldPlaceholder: {
    fontSize: 14,
    color: "#9CA3AF",
    flex: 1,
    paddingRight: 8,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  pickerModalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    maxHeight: "80%",
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  pickerSearchInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111",
    marginBottom: 10,
  },
  pickerOptionsList: {
    maxHeight: 320,
  },
  pickerOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  pickerOptionText: {
    fontSize: 14,
    color: "#111827",
  },
  pickerCancelBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  pickerCancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
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
