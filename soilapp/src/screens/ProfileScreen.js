/**
 * ProfileScreen.js
 * Shown ONCE — right after LanguageScreen on first login.
 * Returning users can edit this via the Account Settings gear panel.
 *
 * Saves: name, village, district, state, farm_size, primary_crop, soil_type,
 * farming_experience, water_source, farming_type to PostgreSQL via PATCH /auth/profile
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ScrollView,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme';
import { markProfileDone } from '../services/storage';
import api from '../services/api';

// Indian states list for quick selection
const STATES = [
  'Andhra Pradesh', 'Bihar', 'Chhattisgarh', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Madhya Pradesh',
  'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu',
  'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const CROPS = [
  { id: 'Wheat', en: 'Wheat', hi: 'गेहूँ 🌾' },
  { id: 'Rice', en: 'Rice', hi: 'धान 🍚' },
  { id: 'Maize', en: 'Maize', hi: 'मक्का 🌽' },
  { id: 'Cotton', en: 'Cotton', hi: 'कपास 🌿' },
  { id: 'Sugarcane', en: 'Sugarcane', hi: 'गन्ना 🎋' },
  { id: 'Soybean', en: 'Soybean', hi: 'सोयाबीन 🫘' },
  { id: 'Groundnut', en: 'Groundnut', hi: 'मूंगफली 🥜' },
  { id: 'Mustard', en: 'Mustard', hi: 'सरसों 🟡' },
  { id: 'Vegetables', en: 'Vegetables', hi: 'सब्जियां 🥦' },
];

const SOILS = [
  { id: 'Alluvial Soil', en: 'Alluvial Soil', hi: 'जलोढ़ मिट्टी 🏜️' },
  { id: 'Black Soil', en: 'Black Soil', hi: 'काली मिट्टी 🏜️' },
  { id: 'Red Soil', en: 'Red Soil', hi: 'लाल मिट्टी 🏜️' },
  { id: 'Sandy Soil', en: 'Sandy Soil', hi: 'रेतीली मिट्टी 🏜️' },
  { id: 'Clay Soil', en: 'Clay Soil', hi: 'चिकनी मिट्टी 🏜️' },
  { id: 'Loamy Soil', en: 'Loamy Soil', hi: 'दोमट मिट्टी 🏜️' },
];

const EXPERIENCES = [
  { id: '1-3 Years', en: '1-3 Years', hi: '1-3 वर्ष' },
  { id: '3-5 Years', en: '3-5 Years', hi: '3-5 वर्ष' },
  { id: '5-10 Years', en: '5-10 Years', hi: '5-10 वर्ष' },
  { id: '10+ Years', en: '10+ Years', hi: '10+ वर्ष' },
];

const WATER_SOURCES = [
  { id: 'Borewell', en: 'Borewell', hi: 'ट्यूबवेल / बोरवेल 🚰' },
  { id: 'Canal', en: 'Canal', hi: 'नहर 🌊' },
  { id: 'Rainfed', en: 'Rainfed', hi: 'वर्षा-आधारित 🌧️' },
  { id: 'Drip', en: 'Drip Irrigation', hi: 'ड्रिप सिंचाई 💧' },
];

const FARMING_TYPES = [
  { id: 'Organic', en: 'Organic Farming', hi: 'जैविक खेती 🍀' },
  { id: 'Conventional', en: 'Conventional/Chemical', hi: 'रासायनिक खेती 🧪' },
  { id: 'Natural', en: 'Natural Farming', hi: 'प्राकृतिक खेती 🌸' },
];

export default function ProfileScreen({ navigation, route }) {
  const { user, language } = route.params || {};
  const { t, i18n } = useTranslation();
  const isHindi = language === 'hi' || i18n.language === 'hi' || t('common.lang') === 'hi';

  const [name, setName] = useState(user?.name !== 'Farmer' ? (user?.name || '') : '');
  const [village, setVillage] = useState(user?.village || '');
  const [district, setDistrict] = useState(user?.district || '');
  const [state, setState] = useState(user?.state || '');
  const [farmSize, setFarmSize] = useState(user?.farm_size ? user.farm_size.toString() : '');
  const [primaryCrop, setPrimaryCrop] = useState(user?.primary_crop || '');
  const [soilType, setSoilType] = useState(user?.soil_type || '');
  const [farmingExp, setFarmingExp] = useState(user?.farming_experience || '');
  const [waterSource, setWaterSource] = useState(user?.water_source || '');
  const [farmingType, setFarmingType] = useState(user?.farming_type || '');

  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [focusedInput, setFocusedInput] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'state', 'crop', 'soil', 'experience', 'water', 'method'

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Bilingual label dictionary
  const labels = {
    title: isHindi ? 'किसान प्रोफ़ाइल' : 'Farmer Profile',
    subtitle: isHindi ? 'बेहतर सलाह के लिए अपनी जानकारी भरें' : 'Complete details for custom advisory',
    name: isHindi ? 'आपका नाम *' : 'Your Name *',
    namePlaceholder: isHindi ? 'अपना नाम दर्ज करें' : 'Enter your name',
    village: isHindi ? 'ग्राम / ब्लॉक' : 'Village / Block',
    villagePlaceholder: isHindi ? 'उदा. अभनपुर' : 'e.g. Abhanpur',
    district: isHindi ? 'जिला' : 'District',
    districtPlaceholder: isHindi ? 'उदा. रायपुर' : 'e.g. Raipur',
    state: isHindi ? 'राज्य' : 'State',
    statePlaceholder: isHindi ? 'राज्य चुनें' : 'Select State',
    farmSize: isHindi ? 'खेत का आकार (एकड़)' : 'Farm Size (Acres)',
    farmSizePlaceholder: isHindi ? 'उदा. 2.5' : 'e.g. 2.5',
    crop: isHindi ? 'प्राथमिक फसल' : 'Primary Crop',
    cropPlaceholder: isHindi ? 'फसल चुनें' : 'Select Crop',
    soil: isHindi ? 'मिट्टी का प्रकार' : 'Soil Type',
    soilPlaceholder: isHindi ? 'मिट्टी का प्रकार चुनें' : 'Select Soil Type',
    experience: isHindi ? 'खेती का अनुभव' : 'Farming Experience',
    experiencePlaceholder: isHindi ? 'अनुभव चुनें' : 'Select Experience',
    water: isHindi ? 'सिंचाई का साधन' : 'Water/Irrigation Source',
    waterPlaceholder: isHindi ? 'सिंचाई का स्रोत चुनें' : 'Select Irrigation Source',
    method: isHindi ? 'खेती की पद्धति' : 'Farming Methodology',
    methodPlaceholder: isHindi ? 'पद्धति चुनें' : 'Select Methodology',
    save: isHindi ? 'सहेजें और जारी रखें' : 'Save & Continue',
    saving: isHindi ? 'सहेजा जा रहा है...' : 'Saving...',
    skip: isHindi ? 'अभी छोड़ें' : 'Skip for now',
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await api.get('/auth/me');
        if (res.data?.success && res.data?.user) {
          const u = res.data.user;
          if (u.name && u.name !== 'Farmer') setName(u.name);
          if (u.district) setDistrict(u.district);
          if (u.state) setState(u.state);
          if (u.village) setVillage(u.village);
          if (u.farm_size) setFarmSize(u.farm_size.toString());
          if (u.primary_crop) setPrimaryCrop(u.primary_crop);
          if (u.soil_type) setSoilType(u.soil_type);
          if (u.farming_experience) setFarmingExp(u.farming_experience);
          if (u.water_source) setWaterSource(u.water_source);
          if (u.farming_type) setFarmingType(u.farming_type);
        }
      } catch (err) {
        console.warn('ProfileScreen: failed to fetch profile details', err.message);
      } finally {
        setLoadingProfile(false);
        Animated.parallel([
          Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
      }
    };
    loadProfile();
  }, [fadeAnim, slideAnim]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(
        isHindi ? 'नाम ज़रूरी है' : 'Name Required',
        isHindi ? 'कृपया अपना नाम दर्ज करें।' : 'Please enter your name.'
      );
      return;
    }

    if (district.trim()) {
      const districtRegex = /^[a-zA-Z\s\u0900-\u097F]{3,50}$/;
      if (!districtRegex.test(district.trim())) {
        Alert.alert(
          isHindi ? 'अमान्य जिला' : 'Invalid District',
          isHindi ? 'कृपया एक मान्य जिले का नाम दर्ज करें।' : 'Please enter a valid district name.'
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        district: district.trim(),
        state: state.trim(),
        village: village.trim(),
        farm_size: farmSize.trim() ? parseFloat(farmSize.trim()) : null,
        primary_crop: primaryCrop,
        soil_type: soilType,
        farming_experience: farmingExp,
        water_source: waterSource,
        farming_type: farmingType,
        language: language || i18n.language || 'en',
      };

      await api.patch('/auth/profile', payload);
      await markProfileDone();

      navigation.replace('Home', { user: { ...user, name: name.trim() } });
    } catch (err) {
      console.warn('ProfileScreen: save failed', err?.message);
      await markProfileDone();
      navigation.replace('Home', { user: { ...user, name: name.trim() } });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await markProfileDone();
    navigation.replace('Home', { user });
  };

  if (loadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1B4D3E" />

        {/* Header Banner - Yellow/Green Palette matching Reference 4 */}
        <View style={styles.headerBanner}>
          <View style={styles.headerAvatarCircle}>
            <Text style={styles.headerAvatarText}>
              {(name || 'F').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerTitleText}>{labels.title}</Text>
          <View style={styles.headerStatusBadge}>
            <Text style={styles.headerStatusText}>
              🌾 {isHindi ? 'सत्यापित किसान' : 'Verified Profile'}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.formCard,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* ── CATEGORY 1: PERSONAL INFORMATION ── */}
            <Text style={styles.sectionHeader}>{isHindi ? 'व्यक्तिगत जानकारी' : 'Personal Information'}</Text>

            {/* Name */}
            <View style={[styles.inputWrapper, focusedInput === 'name' && styles.inputWrapperFocused]}>
              <Text style={styles.inputIcon}>👤</Text>
              <View style={styles.inputContentCol}>
                <Text style={styles.inputLabelMini}>{labels.name}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={labels.namePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocusedInput('name')}
                  onBlur={() => setFocusedInput(null)}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Village / Block */}
            <View style={[styles.inputWrapper, focusedInput === 'village' && styles.inputWrapperFocused]}>
              <Text style={styles.inputIcon}>🏡</Text>
              <View style={styles.inputContentCol}>
                <Text style={styles.inputLabelMini}>{labels.village}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={labels.villagePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={village}
                  onChangeText={setVillage}
                  onFocus={() => setFocusedInput('village')}
                  onBlur={() => setFocusedInput(null)}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* State (Dropdown) */}
            <View>
              <TouchableOpacity
                style={[styles.inputWrapper, activeDropdown === 'state' && styles.inputWrapperFocused]}
                onPress={() => setActiveDropdown(activeDropdown === 'state' ? null : 'state')}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>🏙️</Text>
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputLabelMini}>{labels.state}</Text>
                  <Text style={[
                    styles.stateSelectorText,
                    !state && { color: '#94A3B8' },
                  ]}>
                    {state || labels.statePlaceholder}
                  </Text>
                </View>
                <Text style={styles.dropdownArrow}>
                  {activeDropdown === 'state' ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {activeDropdown === 'state' && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {STATES.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.stateItem, state === s && styles.stateItemSelected]}
                      onPress={() => { setState(s); setActiveDropdown(null); }}
                    >
                      <Text style={[
                        styles.stateItemText,
                        state === s && styles.stateItemTextSelected,
                      ]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* District */}
            <View style={[styles.inputWrapper, focusedInput === 'district' && styles.inputWrapperFocused]}>
              <Text style={styles.inputIcon}>📍</Text>
              <View style={styles.inputContentCol}>
                <Text style={styles.inputLabelMini}>{labels.district}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={labels.districtPlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={district}
                  onChangeText={setDistrict}
                  onFocus={() => setFocusedInput('district')}
                  onBlur={() => setFocusedInput(null)}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>


            {/* ── CATEGORY 2: FARM PARAMETERS ── */}
            <Text style={styles.sectionHeader}>{isHindi ? 'कृषि एवं भूमि विवरण' : 'Farm & Agriculture Parameters'}</Text>

            {/* Farm Size */}
            <View style={[styles.inputWrapper, focusedInput === 'size' && styles.inputWrapperFocused]}>
              <Text style={styles.inputIcon}>📏</Text>
              <View style={styles.inputContentCol}>
                <Text style={styles.inputLabelMini}>{labels.farmSize}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={labels.farmSizePlaceholder}
                  placeholderTextColor="#94A3B8"
                  value={farmSize}
                  onChangeText={setFarmSize}
                  onFocus={() => setFocusedInput('size')}
                  onBlur={() => setFocusedInput(null)}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Primary Crop (Dropdown) */}
            <View>
              <TouchableOpacity
                style={[styles.inputWrapper, activeDropdown === 'crop' && styles.inputWrapperFocused]}
                onPress={() => setActiveDropdown(activeDropdown === 'crop' ? null : 'crop')}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>🌾</Text>
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputLabelMini}>{labels.crop}</Text>
                  <Text style={[
                    styles.stateSelectorText,
                    !primaryCrop && { color: '#94A3B8' },
                  ]}>
                    {primaryCrop ? (CROPS.find(c => c.id === primaryCrop)?.[isHindi ? 'hi' : 'en'] || primaryCrop) : labels.cropPlaceholder}
                  </Text>
                </View>
                <Text style={styles.dropdownArrow}>
                  {activeDropdown === 'crop' ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {activeDropdown === 'crop' && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {CROPS.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.stateItem, primaryCrop === c.id && styles.stateItemSelected]}
                      onPress={() => { setPrimaryCrop(c.id); setActiveDropdown(null); }}
                    >
                      <Text style={[
                        styles.stateItemText,
                        primaryCrop === c.id && styles.stateItemTextSelected,
                      ]}>
                        {isHindi ? c.hi : c.en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Soil Type (Dropdown) */}
            <View>
              <TouchableOpacity
                style={[styles.inputWrapper, activeDropdown === 'soil' && styles.inputWrapperFocused]}
                onPress={() => setActiveDropdown(activeDropdown === 'soil' ? null : 'soil')}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>🏜️</Text>
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputLabelMini}>{labels.soil}</Text>
                  <Text style={[
                    styles.stateSelectorText,
                    !soilType && { color: '#94A3B8' },
                  ]}>
                    {soilType ? (SOILS.find(s => s.id === soilType)?.[isHindi ? 'hi' : 'en'] || soilType) : labels.soilPlaceholder}
                  </Text>
                </View>
                <Text style={styles.dropdownArrow}>
                  {activeDropdown === 'soil' ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {activeDropdown === 'soil' && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {SOILS.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.stateItem, soilType === s.id && styles.stateItemSelected]}
                      onPress={() => { setSoilType(s.id); setActiveDropdown(null); }}
                    >
                      <Text style={[
                        styles.stateItemText,
                        soilType === s.id && styles.stateItemTextSelected,
                      ]}>
                        {isHindi ? s.hi : s.en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Farming Experience (Dropdown) */}
            <View>
              <TouchableOpacity
                style={[styles.inputWrapper, activeDropdown === 'experience' && styles.inputWrapperFocused]}
                onPress={() => setActiveDropdown(activeDropdown === 'experience' ? null : 'experience')}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>⏳</Text>
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputLabelMini}>{labels.experience}</Text>
                  <Text style={[
                    styles.stateSelectorText,
                    !farmingExp && { color: '#94A3B8' },
                  ]}>
                    {farmingExp ? (EXPERIENCES.find(e => e.id === farmingExp)?.[isHindi ? 'hi' : 'en'] || farmingExp) : labels.experiencePlaceholder}
                  </Text>
                </View>
                <Text style={styles.dropdownArrow}>
                  {activeDropdown === 'experience' ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {activeDropdown === 'experience' && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {EXPERIENCES.map(e => (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.stateItem, farmingExp === e.id && styles.stateItemSelected]}
                      onPress={() => { setFarmingExp(e.id); setActiveDropdown(null); }}
                    >
                      <Text style={[
                        styles.stateItemText,
                        farmingExp === e.id && styles.stateItemTextSelected,
                      ]}>
                        {isHindi ? e.hi : e.en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Water Source (Dropdown) */}
            <View>
              <TouchableOpacity
                style={[styles.inputWrapper, activeDropdown === 'water' && styles.inputWrapperFocused]}
                onPress={() => setActiveDropdown(activeDropdown === 'water' ? null : 'water')}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>🚰</Text>
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputLabelMini}>{labels.water}</Text>
                  <Text style={[
                    styles.stateSelectorText,
                    !waterSource && { color: '#94A3B8' },
                  ]}>
                    {waterSource ? (WATER_SOURCES.find(w => w.id === waterSource)?.[isHindi ? 'hi' : 'en'] || waterSource) : labels.waterPlaceholder}
                  </Text>
                </View>
                <Text style={styles.dropdownArrow}>
                  {activeDropdown === 'water' ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {activeDropdown === 'water' && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {WATER_SOURCES.map(w => (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.stateItem, waterSource === w.id && styles.stateItemSelected]}
                      onPress={() => { setWaterSource(w.id); setActiveDropdown(null); }}
                    >
                      <Text style={[
                        styles.stateItemText,
                        waterSource === w.id && styles.stateItemTextSelected,
                      ]}>
                        {isHindi ? w.hi : w.en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Farming Method (Dropdown) */}
            <View>
              <TouchableOpacity
                style={[styles.inputWrapper, activeDropdown === 'method' && styles.inputWrapperFocused]}
                onPress={() => setActiveDropdown(activeDropdown === 'method' ? null : 'method')}
                activeOpacity={0.8}
              >
                <Text style={styles.inputIcon}>🍀</Text>
                <View style={styles.inputContentCol}>
                  <Text style={styles.inputLabelMini}>{labels.method}</Text>
                  <Text style={[
                    styles.stateSelectorText,
                    !farmingType && { color: '#94A3B8' },
                  ]}>
                    {farmingType ? (FARMING_TYPES.find(f => f.id === farmingType)?.[isHindi ? 'hi' : 'en'] || farmingType) : labels.methodPlaceholder}
                  </Text>
                </View>
                <Text style={styles.dropdownArrow}>
                  {activeDropdown === 'method' ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {activeDropdown === 'method' && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {FARMING_TYPES.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[styles.stateItem, farmingType === f.id && styles.stateItemSelected]}
                      onPress={() => { setFarmingType(f.id); setActiveDropdown(null); }}
                    >
                      <Text style={[
                        styles.stateItemText,
                        farmingType === f.id && styles.stateItemTextSelected,
                      ]}>
                        {isHindi ? f.hi : f.en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </Animated.View>

          {/* Action Save Buttons */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? labels.saving : labels.save}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>{labels.skip}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAF9' },

  // Top Banner Header Card (similar to Reference Image 4)
  headerBanner: {
    backgroundColor: '#1B4D3E',
    paddingTop: 50,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B4D3E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  headerAvatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4ADE80',
    marginBottom: 10,
  },
  headerAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1B4D3E',
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerStatusBadge: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4ADE80',
    textTransform: 'uppercase',
  },

  scroll: {
    padding: 16,
    paddingBottom: 48,
  },

  // Category Header (similar to REFERENCE IMAGE 3, "GENERAL")
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 6,
  },

  formCard: {
    gap: 12,
  },

  // Premium Card Layout for Row Inputs (similar to REFERENCE IMAGE 3)
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
  },
  inputWrapperFocused: {
    borderColor: '#1B4D3E',
    backgroundColor: '#F0FDF4',
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  inputContentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  inputLabelMini: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  input: {
    padding: 0,
    height: 24,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  stateSelectorText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    height: 24,
    lineHeight: 24,
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#94A3B8',
    marginLeft: 8,
  },
  stateDropdown: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    maxHeight: 200,
    marginTop: -4,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  stateItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stateItemSelected: {
    backgroundColor: '#EEF7F1',
  },
  stateItemText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  stateItemTextSelected: {
    color: '#1B4D3E',
    fontWeight: '800',
  },

  // Buttons
  saveBtn: {
    backgroundColor: '#1F6E43',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#1F6E43',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  skipBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  skipBtnText: {
    fontSize: 14,
    color: '#64748B',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
