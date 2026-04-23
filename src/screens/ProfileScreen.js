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
        <View style={styles.header}>
          <View style={styles.headerBubble} />
          <Text style={styles.headerEmoji}>👤</Text>
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
          <Text style={styles.headerSub}>{t('profile.subtitle')}</Text>
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
            {/* ── Name ──────────────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profile.name_label')} *</Text>
              <TextInput
                style={styles.input}
                placeholder={t('profile.name_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* ── District ──────────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profile.district_label')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('profile.district_placeholder')}
                placeholderTextColor={colors.textMuted}
                value={district}
                onChangeText={setDistrict}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* ── State (tap to pick from list) ─────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{t('profile.state_label')}</Text>
              <TouchableOpacity
                style={styles.stateSelector}
                onPress={() => setShowStates(v => !v)}
              >
                <Text style={[
                  styles.stateSelectorText,
                  !state && { color: colors.textMuted },
                ]}>
                  {state || t('profile.state_placeholder')}
                </Text>
                <Text style={styles.dropdownArrow}>
                  {showStates ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {/* State dropdown */}
              {showStates && (
                <View style={styles.stateDropdown}>
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
                </View>
              )}
            </View>

            {/* ── Phone (read-only, from auth) ──────────────────────── */}
            {user?.phone && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {language === 'hi' ? 'मोबाइल नंबर' : 'Mobile Number'}
                </Text>
                <View style={styles.readOnlyField}>
                  <Text style={styles.readOnlyText}>+91 {user.phone}</Text>
                  <Text style={styles.verifiedBadge}>✅ Verified</Text>
                </View>
              </View>
            )}

          </Animated.View>

          {/* ── Buttons ─────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? t('profile.saving') : t('profile.save')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnText}>
              {language === 'hi' ? 'अभी नहीं, बाद में' : 'Skip for now'}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerBubble: {
    position: 'absolute',
    top: -40, right: -40,
    width: 160, height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerEmoji: { fontSize: 40, marginBottom: spacing.xs },
  headerTitle: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: '#fff',
    textAlign: 'center',
  },
  headerSub: {
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },

  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadows.sm,
  },

  fieldGroup: { gap: spacing.xs },
  fieldLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },

  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },

  // State picker
  stateSelector: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
  },
  stateSelectorText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  dropdownArrow: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  stateDropdown: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    maxHeight: 220,
    overflow: 'scroll',
    ...shadows.sm,
  },
  stateItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stateItemSelected: {
    backgroundColor: colors.primary + '12',
  },
  stateItemText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  stateItemTextSelected: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },

  // Read-only phone field
  readOnlyField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#F5F5F5',
  },
  readOnlyText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  verifiedBadge: {
    fontSize: fontSizes.xs,
    color: colors.statusGood,
    fontWeight: fontWeights.semibold,
  },

  // Buttons
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...shadows.md,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: '#fff',
  },

  skipBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
