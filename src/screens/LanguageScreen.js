/**
 * LanguageScreen.js
 * Shown ONCE — right after OTP is verified, before Home.
 * Returning users skip this screen entirely (language already saved in AsyncStorage).
 *
 * Flow:
 *   OTP verified → LanguageScreen → ProfileScreen (first login)
 *   Returning user → App.js reads saved language → Home directly
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { saveLanguage } from '../services/storage';
import { changeLanguage } from '../i18n';

const { width } = Dimensions.get('window');

// The two language options
const LANGUAGES = [
  {
    code: 'hi',
    label: 'हिंदी',
    sublabel: 'Hindi',
    description: 'सलाह हिंदी में मिलेगी',
    descriptionSub: 'Advisory in Hindi',
  },
  {
    code: 'en',
    label: 'English',
    sublabel: 'अंग्रेज़ी',
    description: 'Advisory in English',
    descriptionSub: 'सलाह अंग्रेज़ी में',
  },
];

export default function LanguageScreen({ navigation, route }) {
  // Who came here — passed from OTPScreen
  const { user } = route.params || {};

  const { t } = useTranslation();

  // Track which card is selected (default: Hindi)
  const [selected, setSelected] = useState('hi');
  const [saving,   setSaving]   = useState(false);

  // Entrance animations
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(40)).current;
  const scaleLeft  = useRef(new Animated.Value(0.92)).current;
  const scaleRight = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleLeft,  { toValue: 1, useNativeDriver: true }),
      Animated.spring(scaleRight, { toValue: 1, delay: 100, useNativeDriver: true }),
    ]).start();
  }, []);

  // Animate card press
  const getCardScale = (code) =>
    code === 'hi' ? scaleLeft : scaleRight;

  const handleSelect = (code) => {
    setSelected(code);
    // Immediately switch the UI language so button text etc changes live
    changeLanguage(code);
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      // 1. Save language to AsyncStorage so we reload it on next app start
      await saveLanguage(selected);

      // 2. Apply language to i18next (already done in handleSelect but do it again to be safe)
      await changeLanguage(selected);

      // 3. Navigate to ProfileScreen — user fills name + district once
      navigation.replace('Profile', { user: user || {}, language: selected });

    } catch (err) {
      console.warn('LanguageScreen: could not save language', err);
      // Even if save fails, still navigate — app will default to Hindi
      navigation.replace('Profile', { user: user || {}, language: selected });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* ── Background decoration ──────────────────────────────────────── */}
      <View style={styles.topBlob} />
      <View style={styles.bottomBlob} />

      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* ── Globe icon ──────────────────────────────────────────────── */}
        <View style={styles.iconCircle}>
          <Text style={styles.iconEmoji}>🌐</Text>
        </View>

        {/* ── Title ───────────────────────────────────────────────────── */}
        <Text style={styles.title}>अपनी भाषा चुनें</Text>
        <Text style={styles.subtitle}>Select Your Preferred Language</Text>

        {/* ── Language cards ──────────────────────────────────────────── */}
        <View style={styles.cardsRow}>
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            const scaleAnim  = getCardScale(lang.code);

            return (
              <Animated.View
                key={lang.code}
                style={{ transform: [{ scale: scaleAnim }], flex: 1 }}
              >
                <TouchableOpacity
                  style={[
                    styles.langCard,
                    isSelected && styles.langCardSelected,
                  ]}
                  onPress={() => handleSelect(lang.code)}
                  activeOpacity={0.85}
                >
                  {/* Selection indicator */}
                  <View style={[
                    styles.radioOuter,
                    isSelected && styles.radioOuterSelected,
                  ]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>

                  <Text style={[
                    styles.langLabel,
                    isSelected && styles.langLabelSelected,
                  ]}>
                    {lang.label}
                  </Text>
                  <Text style={styles.langSublabel}>{lang.sublabel}</Text>

                  <View style={styles.divider} />

                  <Text style={[
                    styles.langDesc,
                    isSelected && styles.langDescSelected,
                  ]}>
                    {lang.description}
                  </Text>
                  <Text style={styles.langDescSub}>{lang.descriptionSub}</Text>

                  {/* Selected glow border */}
                  {isSelected && <View style={styles.selectedGlow} />}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* ── Info note ───────────────────────────────────────────────── */}
        <View style={styles.noteRow}>
          <Text style={styles.noteIcon}>💡</Text>
          <Text style={styles.noteText}>
            {selected === 'hi'
              ? 'आप यह बाद में Settings में बदल सकते हैं'
              : 'You can change this later in Settings'}
          </Text>
        </View>

        {/* ── Continue button ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.continueBtn, saving && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={saving}
          activeOpacity={0.88}
        >
          <Text style={styles.continueBtnText}>
            {saving
              ? (selected === 'hi' ? 'सहेज रहे हैं...' : 'Saving...')
              : (selected === 'hi' ? 'आगे बढ़ें →' : 'Continue →')}
          </Text>
          <Text style={styles.continueBtnArrow}>→</Text>
        </TouchableOpacity>

      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },

  // Decorative background blobs
  topBlob: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.08,
  },
  bottomBlob: {
    position: 'absolute',
    bottom: -100,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.primary,
    opacity: 0.06,
  },

  content: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.lg,
  },

  // Globe icon
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  iconEmoji: { fontSize: 40 },

  // Title
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },

  // Cards row
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    marginTop: spacing.sm,
  },

  langCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.sm,
    overflow: 'hidden',
  },
  langCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
    ...shadows.md,
  },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: spacing.xs,
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },

  langFlag: {
    fontSize: 44,
    marginVertical: spacing.xs,
  },
  langLabel: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  langLabelSelected: {
    color: colors.primary,
  },
  langSublabel: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },

  divider: {
    width: '80%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  langDesc: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: fontWeights.medium,
  },
  langDescSelected: {
    color: colors.primaryDark,
  },
  langDescSub: {
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Green glow overlay when selected
  selectedGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 4,
    backgroundColor: colors.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },

  // Info note
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF9E6',
    borderRadius: radius.md,
    padding: spacing.md,
    width: '100%',
  },
  noteIcon: { fontSize: 16 },
  noteText: {
    fontSize: fontSizes.xs,
    color: '#8B6914',
    flex: 1,
    lineHeight: 18,
  },

  // Continue button
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    justifyContent: 'center',
    ...shadows.md,
    marginTop: spacing.sm,
  },
  continueBtnDisabled: {
    opacity: 0.7,
  },
  continueBtnText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: '#fff',
  },
  continueBtnArrow: {
    fontSize: fontSizes.xl,
    color: 'rgba(255,255,255,0.8)',
  },
});
