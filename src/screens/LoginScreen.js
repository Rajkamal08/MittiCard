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
import { useTranslation } from 'react-i18next';

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const [phone, setPhone]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState(false);

  // Shake animation for invalid input
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  // Animate in on mount
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const shakeInput = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleSendOTP = async () => {
    const cleaned = phone.trim();

    if (cleaned.length !== 10 || isNaN(cleaned)) {
      shakeInput();
      Alert.alert(t('common.error'), t('login.error_invalid'));
      return;
    }

    setLoading(true);
    try {
      const response = await sendOTP(cleaned);

      if (response.data.success) {
        // Navigate to OTP screen, pass phone + devOTP (for emulator testing)
        navigation.navigate('OTP', {
          phone: cleaned,
          dev_otp: response.data.dev_otp,
        });
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send OTP. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const isReady = phone.trim().length === 10 && !isNaN(phone.trim());

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Top decorative band */}
      <View style={styles.topBand}>
        <View style={styles.topBandInner} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Heading */}
          <Animated.View
            style={[
              styles.header,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.logoMini}>
              <Text style={styles.logoEmoji}>🌱</Text>
            </View>
            <Text style={styles.appTitle}>MittiCard</Text>
            <Text style={styles.welcomeText}>{t('login.title')}</Text>
            <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
          </Animated.View>

          {/* Card */}
          <Animated.View
            style={[
              styles.card,
              shadows.md,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <Text style={styles.cardTitle}>{t('otp.title')}</Text>
            <Text style={styles.cardSubtitle}>{t('login.subtitle')}</Text>

            {/* Phone Input */}
            <Text style={styles.label}>{t('login.phone_placeholder')}</Text>
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

              {/* Clear button */}
              {phone.length > 0 && (
                <TouchableOpacity
                  onPress={() => setPhone('')}
                  style={styles.clearBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.clearBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* Character counter */}
            <Text style={styles.charCount}>{phone.length}/10 digits</Text>

            {/* Send OTP Button */}
            <TouchableOpacity
              style={[styles.sendBtn, !isReady && styles.sendBtnDisabled]}
              onPress={handleSendOTP}
              disabled={loading || !isReady}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.textOnPrimary} size="small" />
              ) : (
                <>
                  <Text style={styles.sendBtnText}>{loading ? t('login.sending') : t('login.send_otp')}</Text>
                  <Text style={styles.sendBtnArrow}> →</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Dev hint */}
            <Text style={styles.devHint}>
              📱 Dev mode: OTP is always{' '}
              <Text style={styles.devOTP}>1234</Text>
            </Text>
          </Animated.View>

          {/* Footer */}
          <Animated.Text style={[styles.footer, { opacity: fadeAnim }]}>
            Your data is safe 🔒 · No spam guaranteed
          </Animated.Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBand: {
    height: 200,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
  },
  topBandInner: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.primaryLight,
    opacity: 0.4,
  },
  kav: {
    flex: 1,
    marginTop: -70,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoMini: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  logoEmoji: {
    fontSize: 34,
  },
  appTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textOnPrimary,
    marginBottom: 2,
  },
  welcomeText: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
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
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
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
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    textAlign: 'right',
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  sendBtnDisabled: {
    backgroundColor: colors.border,
  },
  sendBtnText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  sendBtnArrow: {
    fontSize: fontSizes.xl,
    color: colors.textOnPrimary,
    fontWeight: fontWeights.bold,
  },
  devHint: {
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  devOTP: {
    fontWeight: fontWeights.bold,
    color: colors.accent,
  },
  footer: {
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
});
