import React, { useState, useRef, useEffect } from 'react';
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
import { verifyOTP } from '../services/api';
import { saveToken, saveUser } from '../services/storage';
import { setAuthToken } from '../services/api';

// ─── How many digits in the OTP ──────────────────────────────────────────────
// Backend uses "1234" (4 digits) in dev mode
// Change to 6 for production MSG91 OTPs
const OTP_LENGTH = 4;

export default function OTPScreen({ navigation, route }) {
  const { phone, dev_otp } = route.params;

  const [otp, setOtp]         = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [timer, setTimer]     = useState(30);
  const [canResend, setCanResend] = useState(false);

  // One ref per OTP box
  const inputRefs = useRef(Array(OTP_LENGTH).fill(null).map(() => React.createRef()));

  // Animation refs
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ─── Animate in ────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  // ─── Countdown timer for resend ────────────────────────────────────────────
  useEffect(() => {
    if (timer === 0) {
      setCanResend(true);
      return;
    }
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // ─── Shake animation for wrong OTP ─────────────────────────────────────────
  const shakeBoxes = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  // ─── OTP Box input handler ──────────────────────────────────────────────────
  const handleOTPChange = (value, index) => {
    // Only accept digits
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];

    if (value.length > 1) {
      // User pasted a full OTP — fill all boxes
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      digits.forEach((d, i) => { newOtp[i] = d; });
      setOtp(newOtp);
      inputRefs.current[OTP_LENGTH - 1]?.current?.focus();
      return;
    }

    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance to next box
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.current?.focus();
    }

    // Auto-verify when last box is filled
    if (value && index === OTP_LENGTH - 1) {
      const fullOTP = newOtp.join('');
      if (fullOTP.length === OTP_LENGTH) {
        setTimeout(() => verifyOTPCode(fullOTP), 100);
      }
    }
  };

  // ─── Backspace handler ──────────────────────────────────────────────────────
  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.current?.focus();
    }
  };

  // ─── Main verify function ───────────────────────────────────────────────────
  const verifyOTPCode = async (otpString) => {
    const fullOTP = otpString || otp.join('');

    if (fullOTP.length !== OTP_LENGTH) {
      Alert.alert('Incomplete OTP', `Please enter all ${OTP_LENGTH} digits`);
      return;
    }

    setLoading(true);
    try {
      const response = await verifyOTP(phone, fullOTP);

      if (response.data.success) {
        const { token, user } = response.data;

        // 1. Save token to AsyncStorage
        await saveToken(token);
        // 2. Save user data to AsyncStorage
        await saveUser(user);
        // 3. Set axios Authorization header globally
        setAuthToken(token);

        // 4. Go to LanguageScreen (shown ONCE on first login)
        //    LanguageScreen → ProfileScreen → Home
        navigation.replace('Language', { user });
      }
    } catch (err) {
      shakeBoxes();
      // Clear OTP boxes on wrong OTP
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.current?.focus();

      Alert.alert(
        'Incorrect OTP',
        err.message || 'The OTP you entered is wrong. Try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend) return;
    setOtp(Array(OTP_LENGTH).fill(''));
    setTimer(30);
    setCanResend(false);
    inputRefs.current[0]?.current?.focus();

    try {
      const { sendOTP } = require('../services/api');
      await sendOTP(phone);
      Alert.alert('OTP Resent', `A new OTP has been sent to +91 ${phone}`);
    } catch {
      Alert.alert('Error', 'Failed to resend OTP. Check your connection.');
    }
  };

  const otpFilled  = otp.filter(Boolean).length;
  const isComplete = otpFilled === OTP_LENGTH;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Top decorative band */}
      <View style={styles.topBand}>
        <View style={styles.topBandInner} />
        {/* Back button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
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
          {/* Header */}
          <Animated.View
            style={[
              styles.header,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.otpIcon}>
              <Text style={styles.otpIconEmoji}>📲</Text>
            </View>
            <Text style={styles.headingText}>Verify Your Number</Text>
            <Text style={styles.subText}>
              Enter the {OTP_LENGTH}-digit code sent to
            </Text>
            <Text style={styles.phoneDisplay}>+91 {phone}</Text>
          </Animated.View>

          {/* OTP Card */}
          <Animated.View
            style={[
              styles.card,
              shadows.md,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Dev hint banner */}
            {dev_otp && (
              <View style={styles.devBanner}>
                <Text style={styles.devBannerText}>
                  🛠 Dev Mode — OTP is{' '}
                  <Text style={styles.devOTPValue}>{dev_otp}</Text>
                </Text>
              </View>
            )}

            <Text style={styles.cardLabel}>Enter OTP</Text>

            {/* OTP Boxes */}
            <Animated.View
              style={[
                styles.otpRow,
                { transform: [{ translateX: shakeAnim }] },
              ]}
            >
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={inputRefs.current[index]}
                  style={[
                    styles.otpBox,
                    digit ? styles.otpBoxFilled : null,
                    index === otpFilled && !digit ? styles.otpBoxActive : null,
                  ]}
                  value={digit}
                  onChangeText={value => handleOTPChange(value, index)}
                  onKeyPress={e => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH} // allows paste
                  textAlign="center"
                  selectTextOnFocus
                  caretHidden={false}
                />
              ))}
            </Animated.View>

            {/* Progress dots */}
            <View style={styles.progressRow}>
              {otp.map((digit, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressDot,
                    digit ? styles.progressDotFilled : null,
                  ]}
                />
              ))}
            </View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[styles.verifyBtn, !isComplete && styles.verifyBtnDisabled]}
              onPress={() => verifyOTPCode()}
              disabled={loading || !isComplete}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={colors.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.verifyBtnText}>
                  {isComplete ? 'Verify & Login ✓' : `Enter ${OTP_LENGTH - otpFilled} more digit${OTP_LENGTH - otpFilled !== 1 ? 's' : ''}`}
                </Text>
              )}
            </TouchableOpacity>

            {/* Resend OTP */}
            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't receive it? </Text>
              {canResend ? (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLink}>Resend OTP</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.resendTimer}>
                  Resend in{' '}
                  <Text style={styles.resendTimerBold}>
                    {String(timer).padStart(2, '0')}s
                  </Text>
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Security note */}
          <Animated.Text style={[styles.secureNote, { opacity: fadeAnim }]}>
            🔒 This OTP is valid for 5 minutes
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
    height: 180,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    justifyContent: 'flex-end',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  topBandInner: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.primaryLight,
    opacity: 0.4,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  kav: {
    flex: 1,
    marginTop: -60,
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
  otpIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  otpIconEmoji: {
    fontSize: 38,
  },
  headingText: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  phoneDisplay: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
  },
  devBanner: {
    backgroundColor: '#FFF8E1',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  devBannerText: {
    fontSize: fontSizes.sm,
    color: '#7A5C00',
    fontWeight: fontWeights.medium,
  },
  devOTPValue: {
    fontWeight: fontWeights.extrabold,
    fontSize: fontSizes.lg,
    color: colors.accentDark,
    letterSpacing: 2,
  },
  cardLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.lg,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 72,
    borderWidth: 2,
    borderColor: colors.otpBorder,
    borderRadius: radius.md,
    backgroundColor: colors.otpBackground,
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: '#EAF4EE',
    color: colors.primaryDark,
  },
  otpBoxActive: {
    borderColor: colors.otpBorderActive,
    borderWidth: 2.5,
    backgroundColor: colors.surface,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotFilled: {
    backgroundColor: colors.primary,
    width: 18,
    borderRadius: 4,
  },
  verifyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  verifyBtnDisabled: {
    backgroundColor: colors.border,
  },
  verifyBtnText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  resendLink: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  resendTimer: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  resendTimerBold: {
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  secureNote: {
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
});
