import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; // Ensure you have installed expo-linear-gradient
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PropertyCardProps {
  property: any;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  showCompare?: boolean;
  onToggleCompare?: () => void;
  isCompareSelected?: boolean;
  isTopRated?: boolean;
  isMostFavorite?: boolean;
}

export default function PropertyCard({
  property,
  onToggleFavorite,
  isFavorite = false,
  showCompare = false,
  onToggleCompare,
  isCompareSelected = false,
  isTopRated = false,
  isMostFavorite = false
}: PropertyCardProps) {
  const router = useRouter();
  const imageUri = property.images?.[0] || 'https://via.placeholder.com/400x300';
  const isGuestFavorite = (property.reviews_count > 3 && property.avg_rating >= 4.5) || false;

  return (
    <TouchableOpacity
      style={[styles.card, isCompareSelected && styles.compareSelected]}
      onPress={() => router.push(`/properties/${property.id}` as any)}
      activeOpacity={0.9}
    >
      {/* Image Section */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />

        {/* Gradient Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.gradient}
        />

        {/* Status Badge */}
        <View style={[styles.badgeContainer, { top: 10, left: 10 }]}>
          <View style={[styles.badge, property.status === 'available' ? { backgroundColor: 'rgba(255,255,255,0.95)' } : { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
            <Text style={[styles.badgeText, property.status === 'available' ? { color: 'black' } : { color: 'white' }]}>
              {property.status === 'available' ? 'AVAILABLE' : property.status?.toUpperCase()}
            </Text>
          </View>
          {isGuestFavorite && (
            <View style={styles.favBadge}>
              <Ionicons name="trophy" size={10} color="white" />
              <Text style={styles.favText}>Guest Favorite</Text>
            </View>
          )}
          {isTopRated && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#fde68a' }}>
              <Ionicons name="trophy" size={10} color="#d97706" />
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#d97706', marginLeft: 3 }}>Top Rated</Text>
            </View>
          )}
          {isMostFavorite && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff1f2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#fecdd3' }}>
              <Ionicons name="heart" size={10} color="#e11d48" />
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#e11d48', marginLeft: 3 }}>Most Favorite</Text>
            </View>
          )}
        </View>

        {/* Action Icons */}
        <View style={styles.actions}>
          {showCompare && (
            <TouchableOpacity onPress={onToggleCompare} style={[styles.iconBtn, isCompareSelected && { backgroundColor: 'black' }]}>
              <Ionicons
                name={isCompareSelected ? "checkmark" : "add"}
                size={18}
                color={isCompareSelected ? "white" : "black"}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onToggleFavorite} style={styles.iconBtn}>
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={18}
              color={isFavorite ? "#ef4444" : "black"}
            />
          </TouchableOpacity>
        </View>

        {/* Price Overlay */}
        <View style={styles.priceOverlay}>
          <Text style={styles.price}>₱{Number(property.price).toLocaleString()}</Text>
          <Text style={styles.priceSub}>/mo</Text>
        </View>
      </View>

      {/* Details Section */}
      <View style={styles.details}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={styles.title} numberOfLines={1}>{property.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name="star" color="#eab308" size={12} />
            <Text style={{ fontWeight: 'bold', fontSize: 12 }}>{Number(property.avg_rating || 0).toFixed(1)}</Text>
          </View>
        </View>

        <Text style={styles.location} numberOfLines={1}>
          <Ionicons name="location-outline" size={12} /> {property.city}, Philippines
        </Text>

        <View style={styles.features}>
          <Text style={styles.featText}>
            <Text style={{ fontWeight: 'bold' }}>{property.bedrooms}</Text> Beds
          </Text>
          <View style={styles.dot} />
          <Text style={styles.featText}>
            <Text style={{ fontWeight: 'bold' }}>{property.bathrooms}</Text> Baths
          </Text>
          <View style={styles.dot} />
          <Text style={styles.featText}>
            <Text style={{ fontWeight: 'bold' }}>{property.area_sqft}</Text> sqft
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 4,
    borderWidth: 1, borderColor: '#f3f4f6'
  },
  compareSelected: { borderColor: 'black', borderWidth: 2 },
  imageContainer: { height: 220, width: '100%', position: 'relative' },
  image: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  badgeContainer: { position: 'absolute', gap: 5, alignItems: 'flex-start' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  favBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ec4899', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  favText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  actions: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 },
  iconBtn: { backgroundColor: 'rgba(255,255,255,0.9)', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  priceOverlay: { position: 'absolute', bottom: 12, left: 12 },
  price: { color: 'white', fontSize: 20, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  priceSub: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  details: { padding: 15 },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 4, color: '#1a1a1a', flex: 1 },
  location: { fontSize: 12, color: '#666', marginBottom: 12 },
  features: { flexDirection: 'row', alignItems: 'center' },
  featText: { fontSize: 12, color: '#444' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#ccc', marginHorizontal: 8 },
});