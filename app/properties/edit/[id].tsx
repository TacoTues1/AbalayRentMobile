import { Ionicons } from "@expo/vector-icons";
import { decode } from "base64-arraybuffer";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import {
    Redirect,
    useLocalSearchParams,
    useRouter,
    useSegments,
} from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
} from "../../../lib/locationData";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

export default function EditProperty() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const inTabsRoute = segments[0] === "(tabs)";
  const propertyId = Array.isArray(id) ? id[0] : id;

  // UI State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingTerms, setUploadingTerms] = useState(false); // New state for PDF
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [stateSearch, setStateSearch] = useState("");
  const [session, setSession] = useState<any>(null);
  const [profileRole, setProfileRole] = useState("tenant");
  const { isDark, colors } = useTheme();
  const styles = React.useMemo(
    () => createStyles(isDark, colors),
    [isDark, colors],
  );
  const placeholderTextColor = isDark ? colors.textMuted : "#9CA3AF";

  // Form State
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

  const availableAmenities = [
    "Free WiFi",
    "Paid WiFi",
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
    "Pool",
    "Elevator",
    "Gym",
    "Security",
    "Balcony",
  ];

  useEffect(() => {
    if (!inTabsRoute) return;
    checkAuthAndLoad();
  }, [id, inTabsRoute]);

  if (!inTabsRoute && propertyId) {
    return (
      <Redirect
        href={{
          pathname: "/(tabs)/properties/edit/[id]",
          params: { id: propertyId },
        }}
      />
    );
  }

  async function checkAuthAndLoad() {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession) {
      router.replace("/");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", currentSession.user.id)
      .maybeSingle();

    setSession(currentSession);
    const normalizedRole = (profile?.role || "tenant").toLowerCase();
    setProfileRole(normalizedRole);
    loadProperty(currentSession.user.id, normalizedRole);
  }

  const loadProperty = async (userId: string, role: string) => {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      Alert.alert("Error", "Property not found");
      router.back();
      return;
    }

    const ownerId = data.landlord || data.landlord_id;
    const isOwner = ownerId && String(ownerId) === String(userId);

    if (role !== "admin" && !isOwner) {
      Alert.alert("Access Denied", "You can only edit your own properties.");
      router.back();
      return;
    }

    setForm({
      title: data.title || "",
      description: data.description || "",
      building_no: data.building_no || "",
      street: data.street || "",
      address: data.address || "",
      city: data.city || "",
      state_province: data.state_province || "",
      country: data.country || "",
      zip: data.zip || "",
      location_link: data.location_link || "",
      owner_phone: data.owner_phone || "",
      owner_email: data.owner_email || "",
      price: data.price?.toString() || "",
      utilities_cost: data.utilities_cost?.toString() || "",
      internet_cost: data.internet_cost?.toString() || "",
      association_dues: data.association_dues?.toString() || "",
      bedrooms: data.bedrooms?.toString() || "1",
      bathrooms: data.bathrooms?.toString() || "1",
      area_sqft: data.area_sqft?.toString() || "",
      status: data.status || "available",
      terms_conditions: data.terms_conditions || "",
      amenities: data.amenities || [],
      images: data.images || [],
    });
    setLoading(false);
  };

  const handleUpdate = async () => {
    if (
      !form.title ||
      !form.price ||
      !form.street ||
      !form.city ||
      !form.state_province ||
      !form.country
    ) {
      return Alert.alert(
        "Missing Fields",
        "Please fill in Title, Price, Street, City, State/Province, and Country.",
      );
    }

    setSaving(true);

    const sanitize = (val: string) =>
      val === "" || val === null ? 0 : parseFloat(val);

    const payload = {
      ...form,
      price: sanitize(form.price),
      utilities_cost: sanitize(form.utilities_cost),
      internet_cost: sanitize(form.internet_cost),
      association_dues: sanitize(form.association_dues),
      bedrooms: sanitize(form.bedrooms),
      bathrooms: sanitize(form.bathrooms),
      area_sqft: sanitize(form.area_sqft),
      images: form.images.length > 0 ? form.images : null,
    };

    const { error } = await supabase
      .from("properties")
      .update(payload)
      .eq("id", id);

    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Property updated successfully!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      "Confirm Delete",
      "Are you sure you want to delete this property?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            const { error } = await supabase
              .from("properties")
              .update({ is_deleted: true })
              .eq("id", id);

            setSaving(false);
            if (!error) {
              router.replace(profileRole === "admin" ? "/admin" : "/(tabs)");
            } else {
              Alert.alert("Error", error.message);
            }
          },
        },
      ],
    );
  };

  const toggleAmenity = (amenity: string) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

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

  // --- IMAGE UPLOAD LOGIC ---
  const pickImage = async () => {
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
      const randomId = Math.random().toString(36).substring(2, 10);
      const fileName = `${session?.user?.id}/${Date.now()}_${randomId}.${fileExt}`;

      const { data, error } = await supabase.storage
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

  // --- NEW: PDF TERMS UPLOAD LOGIC ---
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

      // Read file as Base64 for Supabase upload
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: "base64",
      });

      const { error } = await supabase.storage
        .from("property-documents")
        .upload(fileName, decode(base64), {
          contentType: "application/pdf",
        });

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

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={isDark ? colors.text : "black"}
        />
      </View>
    );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.header}>Edit Property</Text>
        <Text style={styles.subHeader}>Update details for this listing.</Text>

        {/* --- Title --- */}
        <View style={styles.section}>
          <Text style={styles.label}>PROPERTY TITLE *</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="e.g. Modern Loft"
            placeholderTextColor={placeholderTextColor}
            value={form.title}
            onChangeText={(t) => setForm({ ...form, title: t })}
          />
        </View>

        {/* --- Location --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <View style={styles.indicator} /> Location
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Bldg No.</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={placeholderTextColor}
                value={form.building_no}
                onChangeText={(t) => setForm({ ...form, building_no: t })}
              />
            </View>
            <View style={{ flex: 2, marginLeft: 10 }}>
              <Text style={styles.subLabel}>Street *</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={placeholderTextColor}
                value={form.street}
                onChangeText={(t) => setForm({ ...form, street: t })}
              />
            </View>
          </View>

          <Text style={styles.subLabel}>Barangay/Address *</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={placeholderTextColor}
            value={form.address}
            onChangeText={(t) => setForm({ ...form, address: t })}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>City *</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={placeholderTextColor}
                value={form.city}
                onChangeText={(t) => setForm({ ...form, city: t })}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.subLabel}>Zip</Text>
              <TextInput
                style={styles.input}
                placeholderTextColor={placeholderTextColor}
                value={form.zip}
                onChangeText={(t) => setForm({ ...form, zip: t })}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>Country *</Text>
              <TouchableOpacity
                style={styles.pickerField}
                onPress={() => setShowCountryPicker(true)}
                activeOpacity={0.8}
              >
                <Text
                  style={
                    form.country
                      ? styles.pickerFieldText
                      : styles.pickerFieldPlaceholder
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

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.subLabel}>State/Province *</Text>
              {form.country && stateOptions.length === 0 ? (
                <TextInput
                  style={styles.input}
                  placeholder="Type state/province"
                  placeholderTextColor={placeholderTextColor}
                  value={form.state_province}
                  onChangeText={(t) => setForm({ ...form, state_province: t })}
                />
              ) : (
                <TouchableOpacity
                  style={styles.pickerField}
                  onPress={() => {
                    if (form.country) setShowStatePicker(true);
                  }}
                  activeOpacity={0.8}
                  disabled={!form.country}
                >
                  <Text
                    style={
                      form.state_province
                        ? styles.pickerFieldText
                        : styles.pickerFieldPlaceholder
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
                          ? colors.border
                          : "#9CA3AF"
                    }
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.subLabel}>Google Map Link (Preferred)</Text>
          <TextInput
            style={[styles.input, styles.linkInput]}
            value={form.location_link}
            placeholder="https://maps.google.com/..."
            placeholderTextColor={placeholderTextColor}
            onChangeText={(t) => setForm({ ...form, location_link: t })}
          />
        </View>

        {/* --- Details --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <View style={styles.indicator} /> Details
          </Text>

          <Text style={styles.label}>MONTHLY PRICE (₱) *</Text>
          <TextInput
            style={[styles.input, styles.priceInput]}
            keyboardType="numeric"
            placeholderTextColor={placeholderTextColor}
            value={form.price}
            onChangeText={(t) => setForm({ ...form, price: t })}
          />

          <View style={styles.row}>
            <View style={styles.third}>
              <Text style={styles.subLabel}>Beds</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholderTextColor={placeholderTextColor}
                value={form.bedrooms}
                onChangeText={(t) => setForm({ ...form, bedrooms: t })}
              />
            </View>
            <View style={styles.third}>
              <Text style={styles.subLabel}>Baths</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholderTextColor={placeholderTextColor}
                value={form.bathrooms}
                onChangeText={(t) => setForm({ ...form, bathrooms: t })}
              />
            </View>
            <View style={styles.third}>
              <Text style={styles.subLabel}>Sq Ft</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholderTextColor={placeholderTextColor}
                value={form.area_sqft}
                onChangeText={(t) => setForm({ ...form, area_sqft: t })}
              />
            </View>
          </View>

          <Text style={styles.label}>ADDITIONAL COSTS</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.third, { marginRight: 10 }]}
              placeholder="Utilities"
              keyboardType="numeric"
              placeholderTextColor={placeholderTextColor}
              value={form.utilities_cost}
              onChangeText={(t) => setForm({ ...form, utilities_cost: t })}
            />
            <TextInput
              style={[styles.input, styles.third]}
              placeholder="Assoc. Dues"
              keyboardType="numeric"
              placeholderTextColor={placeholderTextColor}
              value={form.association_dues}
              onChangeText={(t) => setForm({ ...form, association_dues: t })}
            />
          </View>

          <Text style={styles.label}>STATUS</Text>
          <View style={styles.statusRow}>
            {["available", "occupied", "not available"].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusBtn,
                  form.status === status && styles.statusBtnActive,
                  status === "occupied" &&
                    form.status === "occupied" && {
                      backgroundColor: isDark
                        ? "rgba(59,130,246,0.22)"
                        : "#dbeafe",
                      borderColor: isDark ? "rgba(96,165,250,0.95)" : "#3b82f6",
                    },
                  status === "not available" &&
                    form.status === "not available" && {
                      backgroundColor: isDark
                        ? "rgba(239,68,68,0.2)"
                        : "#fee2e2",
                      borderColor: isDark
                        ? "rgba(248,113,113,0.95)"
                        : "#ef4444",
                    },
                ]}
                onPress={() => setForm({ ...form, status })}
              >
                <Text
                  style={[
                    styles.statusText,
                    form.status === status && styles.statusTextActive,
                    status === "occupied" &&
                      form.status === "occupied" && {
                        color: isDark ? "#93c5fd" : "#1e40af",
                      },
                    status === "not available" &&
                      form.status === "not available" && {
                        color: isDark ? "#fca5a5" : "#991b1b",
                      },
                  ]}
                >
                  {status.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* --- Contact --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <View style={styles.indicator} /> Contact Info
          </Text>
          <Text style={styles.subLabel}>Phone *</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            placeholderTextColor={placeholderTextColor}
            value={form.owner_phone}
            onChangeText={(t) => setForm({ ...form, owner_phone: t })}
          />
          <Text style={styles.subLabel}>Email *</Text>
          <TextInput
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={placeholderTextColor}
            value={form.owner_email}
            onChangeText={(t) => setForm({ ...form, owner_email: t })}
          />
        </View>

        {/* --- Description & Terms (UPDATED) --- */}
        <View style={styles.section}>
          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            multiline
            placeholder="Describe the property..."
            placeholderTextColor={placeholderTextColor}
            value={form.description}
            onChangeText={(t) => setForm({ ...form, description: t })}
          />

          <Text style={styles.label}>TERMS & CONDITIONS (PDF)</Text>

          {form.terms_conditions && form.terms_conditions.startsWith("http") ? (
            <View style={styles.pdfContainer}>
              <TouchableOpacity
                onPress={() => Linking.openURL(form.terms_conditions)}
                style={styles.pdfLinkRow}
              >
                <Ionicons
                  name="document-text"
                  size={20}
                  color={colors.accent}
                />
                <Text style={styles.pdfLinkText}>View Uploaded PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  setForm((prev) => ({ ...prev, terms_conditions: "" }))
                }
                style={styles.removePdfBtn}
              >
                <Text style={styles.removePdfText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyTermsText}>No custom terms uploaded.</Text>
          )}

          <TouchableOpacity
            onPress={pickDocument}
            disabled={uploadingTerms}
            style={styles.uploadFileBtn}
          >
            {uploadingTerms ? (
              <ActivityIndicator
                size="small"
                color={isDark ? colors.text : "black"}
              />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={20}
                  color={isDark ? colors.text : "black"}
                />
                <Text style={styles.uploadFileBtnText}>Upload Terms PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* --- Images --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Photos ({form.images.length}/10)
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexDirection: "row", marginVertical: 10 }}
          >
            <TouchableOpacity
              style={styles.addImgBtn}
              onPress={pickImage}
              disabled={uploading || form.images.length >= 10}
            >
              {uploading ? (
                <ActivityIndicator color={isDark ? colors.textMuted : "gray"} />
              ) : (
                <Ionicons
                  name="add"
                  size={30}
                  color={isDark ? colors.textMuted : "gray"}
                />
              )}
            </TouchableOpacity>
            {form.images.map((img, idx) => (
              <View key={idx} style={styles.imgThumbContainer}>
                <Image source={{ uri: img }} style={styles.imgThumb} />
                <TouchableOpacity
                  onPress={() => removeImage(idx)}
                  style={styles.removeImgBtn}
                >
                  <Ionicons name="close" size={12} color="white" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.infoText}>
            Max 5MB per image. Up to 10 photos.
          </Text>
        </View>

        {/* --- Amenities --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Amenities</Text>
          <View style={styles.amenitiesContainer}>
            {(showAllAmenities
              ? availableAmenities
              : availableAmenities.slice(0, 10)
            ).map((amenity) => (
              <TouchableOpacity
                key={amenity}
                style={[
                  styles.amenityChip,
                  form.amenities.includes(amenity) && styles.amenityChipActive,
                ]}
                onPress={() => toggleAmenity(amenity)}
              >
                {form.amenities.includes(amenity) && (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color="white"
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  style={[
                    styles.amenityText,
                    form.amenities.includes(amenity) && { color: "white" },
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
            <Text style={styles.toggleText}>
              {showAllAmenities
                ? "SHOW LESS"
                : `SHOW ALL (${availableAmenities.length})`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- Actions --- */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleUpdate}
          disabled={saving || uploading || uploadingTerms}
        >
          {saving ? (
            <ActivityIndicator color={isDark ? colors.background : "white"} />
          ) : (
            <Text style={styles.saveText}>Update Property</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={saving}
        >
          <Text style={styles.deleteText}>Delete Property</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showCountryPicker} transparent animationType="fade">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select Country</Text>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search country"
              placeholderTextColor={placeholderTextColor}
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            <ScrollView style={styles.pickerOptionsList}>
              {filteredCountries.map((country) => (
                <TouchableOpacity
                  key={country.isoCode}
                  style={styles.pickerOption}
                  onPress={() => handleCountrySelect(country.name)}
                >
                  <Text style={styles.pickerOptionText}>{country.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.pickerCancelBtn}
              onPress={() => {
                setCountrySearch("");
                setShowCountryPicker(false);
              }}
            >
              <Text style={styles.pickerCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showStatePicker} transparent animationType="fade">
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>Select State/Province</Text>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search state/province"
              placeholderTextColor={placeholderTextColor}
              value={stateSearch}
              onChangeText={setStateSearch}
            />
            <ScrollView style={styles.pickerOptionsList}>
              {filteredStates.map((state) => (
                <TouchableOpacity
                  key={state.isoCode || state.name}
                  style={styles.pickerOption}
                  onPress={() => handleStateSelect(state.name)}
                >
                  <Text style={styles.pickerOptionText}>{state.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.pickerCancelBtn}
              onPress={() => {
                setStateSearch("");
                setShowStatePicker(false);
              }}
            >
              <Text style={styles.pickerCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (
  isDark: boolean,
  colors: ReturnType<typeof useTheme>["colors"],
) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 20, paddingBottom: 100 },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    header: {
      fontSize: 30,
      fontWeight: "bold",
      color: colors.text,
      letterSpacing: -0.5,
      marginTop: 20,
    },
    subHeader: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 25,
      marginTop: 4,
    },
    section: {
      backgroundColor: colors.card,
      padding: 20,
      borderRadius: 16,
      marginBottom: 15,
      shadowColor: colors.shadow,
      shadowOpacity: 0.03,
      shadowRadius: 10,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 15,
      flexDirection: "row",
      alignItems: "center",
      color: colors.text,
    },
    indicator: {
      width: 4,
      height: 16,
      backgroundColor: colors.accent,
      borderRadius: 2,
      marginRight: 8,
    },
    label: {
      fontSize: 11,
      fontWeight: "bold",
      marginBottom: 8,
      color: colors.textMuted,
      letterSpacing: 1,
    },
    subLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 6,
      marginLeft: 2,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      padding: 12,
      borderRadius: 10,
      marginBottom: 12,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.inputBg,
    },
    pickerField: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      minHeight: 46,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.inputBg,
    },
    pickerFieldText: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
      paddingRight: 8,
    },
    pickerFieldPlaceholder: {
      fontSize: 14,
      color: colors.textMuted,
      flex: 1,
      paddingRight: 8,
    },
    titleInput: {
      backgroundColor: isDark ? colors.surface : "#F9FAFB",
      borderWidth: 1,
      borderColor: isDark ? colors.border : "transparent",
      padding: 16,
      borderRadius: 12,
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    priceInput: {
      fontWeight: "bold",
      backgroundColor: isDark ? colors.surface : "#F9FAFB",
    },
    linkInput: { color: colors.accent },
    descriptionInput: { height: 100, textAlignVertical: "top" },

    pickerModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    pickerModalCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 16,
      maxHeight: "80%",
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerModalTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 10,
    },
    pickerSearchInput: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      marginBottom: 10,
    },
    pickerOptionsList: {
      maxHeight: 320,
    },
    pickerOption: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pickerOptionText: {
      fontSize: 14,
      color: colors.text,
    },
    pickerCancelBtn: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    pickerCancelBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
    },

    row: { flexDirection: "row" },
    third: { flex: 1, marginRight: 8 },

    statusRow: { flexDirection: "row", gap: 8, marginTop: 5 },
    statusBtn: {
      flex: 1,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.inputBg,
    },
    statusBtnActive: {
      backgroundColor: isDark ? "rgba(34,197,94,0.2)" : "#DCFCE7",
      borderColor: isDark ? "rgba(74,222,128,0.95)" : "#22C55E",
    },
    statusText: {
      fontSize: 10,
      fontWeight: "bold",
      color: colors.textSecondary,
    },
    statusTextActive: { color: isDark ? "#86efac" : "#166534" },

    // PDF Styles
    pdfContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      backgroundColor: isDark ? "rgba(59,130,246,0.14)" : "#eff6ff",
      borderRadius: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: isDark ? "rgba(96,165,250,0.35)" : "#dbeafe",
    },
    pdfLinkRow: { flexDirection: "row", alignItems: "center" },
    pdfLinkText: {
      color: colors.accent,
      fontWeight: "bold",
      marginLeft: 5,
      textDecorationLine: "underline",
    },
    removePdfBtn: { padding: 5 },
    removePdfText: {
      color: colors.danger,
      fontSize: 10,
      fontWeight: "bold",
      textTransform: "uppercase",
    },
    emptyTermsText: {
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: "italic",
      marginBottom: 10,
    },
    uploadFileBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: 14,
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    uploadFileBtnText: {
      fontWeight: "bold",
      marginLeft: 8,
      color: colors.text,
    },

    addImgBtn: {
      width: 85,
      height: 85,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed",
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
      backgroundColor: colors.surface,
    },
    imgThumbContainer: { position: "relative", marginRight: 10 },
    imgThumb: {
      width: 85,
      height: 85,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    removeImgBtn: {
      position: "absolute",
      top: -5,
      right: -5,
      backgroundColor: colors.danger,
      borderRadius: 12,
      width: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.card,
    },

    amenitiesContainer: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    amenityChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: "row",
      alignItems: "center",
    },
    amenityChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    amenityText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    toggleText: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: "bold",
      textAlign: "center",
      textDecorationLine: "underline",
    },
    infoText: {
      fontSize: 10,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 8,
    },

    saveBtn: {
      backgroundColor: colors.accent,
      padding: 18,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 10,
      shadowColor: colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    saveText: {
      color: isDark ? colors.background : "#fff",
      fontSize: 16,
      fontWeight: "bold",
    },
    deleteBtn: {
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 10,
    },
    deleteText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
  });
