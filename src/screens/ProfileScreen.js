/**
 * ProfileScreen.js
 * Shown ONCE — right after LanguageScreen on first login.
 * Returning users skip this (isProfileDone flag in AsyncStorage).
 *
 * Saves: name, district, state to PostgreSQL via PATCH /auth/profile
 * Also marks profile as done in AsyncStorage so it's skipped next time.
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
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { markProfileDone } from '../services/storage';
import api from '../services/api';

// Indian states list for quick selection
const STATES = [
  'Andhra Pradesh', 'Bihar', 'Chhattisgarh', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Madhya Pradesh',
  'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 'Tamil Nadu',
  'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

export default function ProfileScreen({ navigation, route }) {
  const { user, language } = route.params || {};
  const { t } = useTranslation();

  const [name,     setName]     = useState(user?.name !== 'Farmer' ? (user?.name || '') : '');
  const [district, setDistrict] = useState('');
  const [state,    setState]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [showStates, setShowStates] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(
        language === 'hi' ? 'नाम ज़रूरी है' : 'Name Required',
        language === 'hi' ? 'कृपया अपना नाम दर्ज करें।' : 'Please enter your name.'
      );
      return;
    }

    if (district.trim()) {
      const districtRegex = /^[a-zA-Z\s]{3,50}$/;
      if (!districtRegex.test(district.trim())) {
        Alert.alert(
          language === 'hi' ? 'अमान्य जिला' : 'Invalid District',
          language === 'hi' ? 'कृपया एक मान्य जिले का नाम दर्ज करें (केवल अक्षर)।' : 'Please enter a genuine district name (letters only).'
        );
        return;
      }
    }

    setSaving(true);
    try {
      // Save profile to backend
      // ⚠️  This calls PATCH /auth/profile — we'll add that route next
      await api.patch('/auth/profile', {
        name: name.trim(),
        district: district.trim(),
        state: state.trim(),
        language,
      });

      // Mark profile as done so this screen is never shown again
      await markProfileDone();

      // Navigate to Home
      navigation.replace('Home', { user: { ...user, name: name.trim() } });

    } catch (err) {
      // If the API call fails, still allow them to continue
      // Profile data is not critical enough to block the app
      console.warn('ProfileScreen: save failed', err?.message);
      await markProfileDone();
      navigation.replace('Home', { user: { ...user, name: name.trim() } });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    // Let the farmer skip — they don't have to fill this
    await markProfileDone();
    navigation.replace('Home', { user });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Complete Your Profile</Text>
          <View style={styles.titleUnderline} />
        </View>
        <Text style={styles.subtitle}>Add details for better advisory</Text>

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
            {/* ── Name ──────────────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Your Name *</Text>
              <View style={[styles.inputWrapper, focusedInput === 'name' && styles.inputWrapperFocused]}>
                <Text style={styles.inputIcon}>👤</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your name"
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

            {/* ── District ──────────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>District</Text>
              <View style={[styles.inputWrapper, focusedInput === 'district' && styles.inputWrapperFocused]}>
                <Text style={styles.inputIcon}>📍</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Nagpur"
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

            {/* ── State (tap to pick from list) ─────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>State</Text>
              <TouchableOpacity
                style={[styles.inputWrapper, showStates && styles.inputWrapperFocused]}
                onPress={() => setShowStates(v => !v)}
              >
                <Text style={styles.inputIcon}>🏙️</Text>
                <Text style={[
                  styles.stateSelectorText,
                  !state && { color: '#94A3B8' },
                ]}>
                  {state || 'e.g. Maharashtra'}
                </Text>
                <Text style={styles.dropdownArrow}>
                  {showStates ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {/* State dropdown */}
              {showStates && (
                <ScrollView nestedScrollEnabled={true} style={styles.stateDropdown}>
                  {STATES.map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.stateItem, state === s && styles.stateItemSelected]}
                      onPress={() => { setState(s); setShowStates(false); }}
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

          </Animated.View>

          {/* ── Buttons ─────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving...' : 'Save & Continue'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>Skip for now</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF8' },

  titleContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#14532d',
    textAlign: 'center',
  },
  titleUnderline: {
    width: 40,
    height: 4,
    backgroundColor: '#3FA169',
    borderRadius: 2,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },

  scroll: {
    padding: 24,
    paddingBottom: 48,
    gap: 24,
  },

  formCard: {
    gap: 16,
  },

  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginLeft: 4,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
  },
  inputWrapperFocused: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },

  // State picker specific overrides
  stateSelectorText: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#94A3B8',
  },
  stateDropdown: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    maxHeight: 220,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  stateItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  stateItemSelected: {
    backgroundColor: '#EEF7F1',
  },
  stateItemText: {
    fontSize: 16,
    color: '#0F172A',
  },
  stateItemTextSelected: {
    color: '#1F6E43',
    fontWeight: '700',
  },

  // Buttons
  saveBtn: {
    backgroundColor: '#16A34A', // stronger green
    borderRadius: 16,
    height: 56, // 50-55 as requested
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },

  skipBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  skipBtnText: {
    fontSize: 15,
    color: '#64748B',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
