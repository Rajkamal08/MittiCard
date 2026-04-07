import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { sendOTP } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [phone, setPhone]     = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  }, []);

  const shakeInput = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8,   duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSendOTP = async () => {
    const cleaned = phone.trim();
    if (cleaned.length !== 10 || isNaN(cleaned)) {
      shakeInput();
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    try {
      const response = await sendOTP(cleaned);
      if (response.data.success) {
        navigation.navigate('OTP', {
          phone: cleaned,
          dev_otp: response.data.dev_otp,
        });
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send OTP. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const isReady = phone.trim().length === 10 && !isNaN(phone.trim());

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* ── GREEN HEADER BAND (no overflow:hidden so logo floats freely) ── */}
      <View style={styles.greenBand}>
        {/* Decorative circle inside band */}
        <View style={styles.bandCircle1} />
        <View style={styles.bandCircle2} />
      </View>

      {/* ── LOGO (absolutely positioned, floats above the band boundary) ── */}
      <View style={styles.logoWrapper}>
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>🌱</Text>
        </View>
        <Text style={styles.appName}>MittiCard</Text>
      </View>

      {/* ── SCROLLABLE CONTENT (starts below the logo) ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* Welcome heading */}
            <Text style={styles.welcomeText}>Welcome to MittiCard</Text>
            <Text style={styles.subtitle}>Soil health advisory for Indian farmers</Text>

            {/* ── SIGN IN CARD ── */}
            <View style={[styles.card, shadows.md]}>
              <Text style={styles.cardTitle}>Sign In</Text>
              <Text style={styles.cardSubtitle}>Enter your mobile number to continue</Text>

              {/* Label */}
              <Text style={styles.label}>MOBILE NUMBER</Text>

              {/* Phone input with shake animation */}
              <Animated.View
                style={[
                  styles.inputWrapper,
                  focused && styles.inputWrapperFocused,
                  { transform: [{ translateX: shakeAnim }] },
                ]}
              >
                {/* Country code */}
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                </View>
                <View style={styles.divider} />

                <TextInput
                  style={styles.input}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={setPhone}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleSendOTP}
                />

                {phone.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setPhone('')}
                    style={styles.clearBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Text style={styles.clearBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>

              {/* Digit counter */}
              <Text style={styles.charCount}>{phone.length}/10 digits</Text>

              {/* Send OTP Button */}
              <TouchableOpacity
                style={[styles.sendBtn, !isReady && styles.sendBtnDisabled]}
                onPress={handleSendOTP}
                disabled={loading || !isReady}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.sendBtnText, !isReady && styles.sendBtnTextDisabled]}>
                    Get OTP via Voice Call
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <Text style={styles.footer}>
              🔒 Your data is safe · No spam guaranteed
            </Text>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BAND_HEIGHT   = 200;
const LOGO_SIZE     = 80;
const LOGO_OVERLAP  = 44; // how much logo hangs below the band

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Green header — NO overflow:hidden so logo can float over the edge
  greenBand: {
    height: BAND_HEIGHT,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bandCircle1: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.primaryLight,
    opacity: 0.35,
  },
  bandCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primaryDark,
    opacity: 0.2,
  },

  // Logo floats above the band boundary — zIndex keeps it on top
  logoWrapper: {
    position: 'absolute',
    top: BAND_HEIGHT - LOGO_OVERLAP,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    elevation: 10,
  },
  logoBox: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  logoEmoji: {
    fontSize: 38,
  },
  appName: {
    marginTop: 8,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },

  // KAV covers everything below the top of the band
  kav: {
    flex: 1,
  },
  scroll: {
    // Push content below: band + logo size + small gap
    paddingTop: BAND_HEIGHT + LOGO_SIZE - LOGO_OVERLAP + 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Welcome text
  welcomeText: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },

  // Sign in card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  cardTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },

  label: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },

  // Phone input
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    overflow: 'hidden',
  },
  inputWrapperFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.surface,
  },
  countryCode: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  countryCodeText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  input: {
    flex: 1,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.medium,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    letterSpacing: 1.5,
  },
  clearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  clearBtnText: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  charCount: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },

  // Send button
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  sendBtnDisabled: {
    backgroundColor: colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  sendBtnText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: '#fff',
    letterSpacing: 0.5,
  },
  sendBtnTextDisabled: {
    color: colors.textMuted,
  },

  footer: {
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
});
