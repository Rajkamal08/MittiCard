import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, Platform, Animated, ActivityIndicator, Alert,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { sendOTP } from '../services/api';
import { useTranslation } from 'react-i18next';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSend = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      await sendOTP(cleaned);
      navigation.navigate('OTP', { phone: cleaned });
    } catch (err) {
      const msg = err?.status === 500
        ? 'Server error, please try again.'
        : err?.message || 'Could not send OTP. Check your internet.';
      Alert.alert('Failed to Send OTP', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Top band */}
      <View style={styles.topBand}>
        <View style={styles.bandBlob} />
        <View style={styles.logoRow}>
          <View style={styles.logoMini}>
            <Text style={{ fontSize: 28 }}>{'\u{1F331}'}</Text>
          </View>
          <View style={{ marginLeft: spacing.md }}>
            <Text style={styles.bandAppName}>MittiCard</Text>
            <Text style={styles.bandWelcome}>Welcome Back</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Floating card */}
          <Animated.View
            style={[
              styles.card,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Text style={styles.sectionLabel}>LOGIN WITH OTP</Text>
            <Text style={styles.cardTitle}>{t('login.title') || 'Enter your mobile number'}</Text>
            <Text style={styles.cardSub}>
              {t('login.subtitle') || 'We\'ll send a 4-digit code to verify your number'}
            </Text>

            {/* Phone input */}
            <View style={styles.phoneRow}>
              <View style={styles.countryPill}>
                <Text style={styles.countryText}>{'\u{1F1EE}\u{1F1F3}'} +91</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="XXXXXXXXXX"
                placeholderTextColor={colors.placeholder}
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
              />
            </View>
            <Text style={styles.charCount}>{phone.length}/10</Text>

            {/* Send OTP */}
            <TouchableOpacity
              style={[styles.sendBtn, (loading || phone.length !== 10) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={loading || phone.length !== 10}
              activeOpacity={0.82}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.sendBtnText}>{t('login.send_otp') || 'Send OTP'}</Text>
              }
            </TouchableOpacity>

            {/* Footer */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>{'\u{1F512}'} Your data is safe and secure</Text>
            </View>
          </Animated.View>

          <Text style={styles.version}>MittiCard v1.0  · Powered by AI</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Top band
  topBand: {
    backgroundColor: colors.primary,
    height: 220,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingTop: STATUS_HEIGHT + 20,
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  bandBlob: {
    position: 'absolute', top: -50, right: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: colors.primaryLight, opacity: 0.25,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoMini: {
    width: 60, height: 60, backgroundColor: '#fff',
    borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    ...shadows.md,
  },
  bandAppName: {
    fontSize: fontSizes.xxl, fontWeight: fontWeights.extrabold,
    color: '#fff', letterSpacing: 1,
  },
  bandWelcome: {
    fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },

  // Floating card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: spacing.xxl,
    marginTop: -60,
    ...shadows.xl,
  },
  sectionLabel: {
    fontSize: fontSizes.xs, fontWeight: fontWeights.bold,
    color: colors.textMuted, letterSpacing: 1.4,
    textTransform: 'uppercase', marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fontSizes.xl, fontWeight: fontWeights.bold,
    color: colors.textPrimary, marginBottom: 6,
  },
  cardSub: {
    fontSize: fontSizes.sm, color: colors.textSecondary,
    marginBottom: spacing.xl, lineHeight: 20,
  },

  // Phone row
  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, marginBottom: 6,
  },
  countryPill: {
    backgroundColor: colors.primarySurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryMuted,
  },
  countryText: {
    fontSize: fontSizes.md, fontWeight: fontWeights.semibold,
    color: colors.primaryDark,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: fontSizes.xl, fontWeight: fontWeights.semibold,
    color: colors.textPrimary, letterSpacing: 1.5,
  },
  charCount: {
    fontSize: fontSizes.xs, color: colors.textMuted,
    textAlign: 'right', marginBottom: spacing.lg,
  },

  // Send button
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadows.md,
    marginBottom: spacing.xl,
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendBtnText: {
    fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: '#fff',
  },

  footerRow: { alignItems: 'center' },
  footerText: { fontSize: fontSizes.sm, color: colors.textMuted },
  version: {
    textAlign: 'center', fontSize: fontSizes.xs,
    color: colors.textMuted, marginTop: spacing.xl,
  },
});
