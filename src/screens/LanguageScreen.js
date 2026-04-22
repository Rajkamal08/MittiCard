import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Platform, Animated, ScrollView,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

const LANGUAGES = [
  {
    code: 'hi',
    flag: '\u{1F1EE}\u{1F1F3}',
    name: '\u0939\u093F\u0928\u094D\u0926\u0940',
    subName: 'Hindi',
    desc: '\u0938\u092D\u0940 \u092B\u0938\u0932 \u0938\u0902\u092C\u0902\u0927\u0940 \u091C\u093E\u0928\u0915\u093E\u0930\u0940 \u0939\u093F\u0928\u094D\u0926\u0940 \u092E\u0947\u0902',
  },
  {
    code: 'en',
    flag: '\u{1F1EC}\u{1F1E7}',
    name: 'English',
    subName: '\u0905\u0902\u0917\u094D\u0930\u0947\u091C\u093C\u0940',
    desc: 'All crop info in English',
  },
];

export default function LanguageScreen({ navigation }) {
  const { i18n } = useTranslation();
  const [selected, setSelected] = useState('hi');
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
    ]).start();
  }, []);

  const handleContinue = async () => {
    await i18n.changeLanguage(selected);
    await AsyncStorage.setItem('lang', selected);
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>

          {/* Globe icon */}
          <View style={styles.globeCircle}>
            <Text style={styles.globeEmoji}>{'\u{1F30D}'}</Text>
          </View>

          <Text style={styles.title}>{'\u0905\u092A\u0928\u0940 \u092D\u093E\u0937\u093E \u091A\u0941\u0928\u0947\u0902'}</Text>
          <Text style={styles.titleEn}>Choose Your Language</Text>
          <Text style={styles.subtitle}>
            You can change this later in Settings
          </Text>

          {/* Language cards */}
          <View style={styles.cardsRow}>
            {LANGUAGES.map(lang => {
              const active = selected === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langCard, active && styles.langCardActive]}
                  onPress={() => setSelected(lang.code)}
                  activeOpacity={0.82}
                >
                  {/* Green top accent bar */}
                  {active && <View style={styles.langCardAccent} />}

                  {/* Radio indicator */}
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>

                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langName, active && styles.langNameActive]}>{lang.name}</Text>
                  <Text style={styles.langSubName}>{lang.subName}</Text>

                  <View style={styles.langDivider} />
                  <Text style={styles.langDesc}>{lang.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Continue button */}
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <Text style={styles.continueBtnText}>
              {selected === 'hi' ? '\u0906\u0917\u0947 \u091C\u093E\u090F\u0902  \u2192' : 'Continue  \u2192'}
            </Text>
          </TouchableOpacity>

          {/* Info note */}
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>
              {'\u{1F4A1}'} {selected === 'hi'
                ? '\u0906\u092A \u092C\u093E\u0926 \u092E\u0947\u0902 \u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938 \u092E\u0947\u0902 \u092D\u093E\u0937\u093E \u092C\u0926\u0932 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902'
                : 'You can change language later in Settings'}
            </Text>
          </View>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: STATUS_HEIGHT + spacing.xxl,
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
  },

  globeCircle: {
    width: 84, height: 84,
    backgroundColor: colors.primarySurface,
    borderRadius: 42,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  globeEmoji: { fontSize: 40 },

  title: {
    fontSize: fontSizes.xxl, fontWeight: fontWeights.extrabold,
    color: colors.textPrimary, textAlign: 'center', marginBottom: 4,
  },
  titleEn: {
    fontSize: fontSizes.lg, fontWeight: fontWeights.medium,
    color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.sm, color: colors.textMuted,
    textAlign: 'center', marginBottom: spacing.xxl,
  },

  cardsRow: {
    flexDirection: 'row', gap: spacing.md,
    alignSelf: 'stretch', marginBottom: spacing.xxl,
  },
  langCard: {
    flex: 1, minHeight: 168,
    backgroundColor: colors.surface,
    borderRadius: radius.xl, borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg, alignItems: 'center',
    overflow: 'hidden',
    ...shadows.sm,
  },
  langCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
    ...shadows.md,
  },
  langCardAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
    backgroundColor: colors.primary,
    borderTopLeftRadius: radius.xl - 2,
    borderTopRightRadius: radius.xl - 2,
  },
  radio: {
    position: 'absolute', top: 12, right: 12,
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.primary,
  },

  langFlag:  { fontSize: 44, marginTop: spacing.xl, marginBottom: spacing.sm },
  langName:  { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary },
  langNameActive: { color: colors.primary },
  langSubName: { fontSize: fontSizes.sm, color: colors.textMuted, marginBottom: spacing.sm },
  langDivider: { height: 1, backgroundColor: colors.divider, alignSelf: 'stretch', marginBottom: spacing.sm },
  langDesc: { fontSize: fontSizes.xs, color: colors.textSecondary, textAlign: 'center' },

  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16, paddingHorizontal: spacing.xxxl,
    alignSelf: 'stretch', alignItems: 'center',
    ...shadows.md, marginBottom: spacing.lg,
  },
  continueBtnText: {
    fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: '#fff',
  },

  infoNote: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.md, padding: spacing.md,
    alignSelf: 'stretch',
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  infoNoteText: { fontSize: fontSizes.sm, color: colors.textSecondary },
});
