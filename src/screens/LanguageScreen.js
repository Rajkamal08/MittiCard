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
import LinearGradient from 'react-native-linear-gradient';
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
    icon: '🇮🇳',
  },
  {
    code: 'en',
    label: 'English',
    sublabel: 'English',
    icon: '🌍',
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
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* ── Title ────────────────────────────────────────────────────── */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>अपनी भाषा चुनें</Text>
          <View style={styles.titleUnderline} />
        </View>
        <Text style={styles.subtitle}>Select your preferred language</Text>

        {/* ── Language cards ───────────────────────────────────────────── */}
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
                    shadows.md,
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
                    {isSelected && <Text style={styles.radioCheck}>✓</Text>}
                  </View>

                  {/* Language icon */}
                  <Text style={styles.langIcon}>{lang.icon}</Text>

                  <Text style={[
                    styles.langLabel,
                    isSelected && styles.langLabelSelected,
                  ]}>
                    {lang.label}
                  </Text>
                  <Text style={styles.langSublabel}>{lang.sublabel}</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* ── Continue button ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.continueBtn, saving && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={saving}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={saving ? ['#E2E8F0', '#CBD5E1'] : ['#1F6E43', '#2F9E5B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueBtnGradient}
          >
            <Text style={styles.continueBtnText}>
              {saving
                ? (selected === 'hi' ? 'सहेज रहे हैं...' : 'Saving...')
                : (selected === 'hi' ? 'आगे बढ़ें' : 'Continue')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <View style={styles.footerRow}>
          <View style={styles.shieldIcon}>
            <Text style={{ fontSize: 10 }}>✔</Text>
          </View>
          <Text style={styles.footerText}>आपका डेटा सुरक्षित है | सुरक्षित उपयोग का भरोसा</Text>
        </View>

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

  content: {
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 20,
  },

  // Title
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#14532d',
    textAlign: 'center',
  },
  titleUnderline: {
    width: 32,
    height: 4,
    backgroundColor: '#3FA169',
    borderRadius: 2,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginTop: -8,
  },

  // Cards row
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },

  langCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 8,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  langCardSelected: {
    borderColor: '#1F6E43',
    backgroundColor: '#F0FDF4',
    shadowOpacity: 0.08,
    elevation: 5,
  },

  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  radioOuterSelected: {
    borderColor: '#1F6E43',
    backgroundColor: '#1F6E43',
  },
  radioCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  langIcon: {
    fontSize: 34,
    marginBottom: 6,
  },
  langLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: '#14532d',
    textAlign: 'center',
  },
  langLabelSelected: {
    color: '#1F6E43',
  },
  langSublabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },

  // Continue button
  continueBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
    height: 54,
    marginTop: 8,
    shadowColor: '#1F6E43',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  continueBtnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  continueBtnDisabled: {
    opacity: 0.7,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  shieldIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
});
