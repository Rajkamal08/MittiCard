import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, Platform, Animated, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { verifyOTP } from '../services/api';
import { saveToken } from '../services/storage';
import { useTranslation } from 'react-i18next';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;
const OTP_LENGTH = 4;

export default function OTPScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { phone } = route.params || {};
  const [otp,     setOtp]     = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resend,  setResend]  = useState(30);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    const interval = setInterval(() => {
      setResend(r => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDigit = (val, idx) => {
    const clean = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = clean;
    setOtp(next);
    if (clean && idx < OTP_LENGTH - 1) refs[idx + 1]?.current?.focus();
  };

  const handleBackspace = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[idx] && idx > 0) {
      refs[idx - 1]?.current?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      Alert.alert('Incomplete OTP', 'Please enter all 4 digits.');
      return;
    }
    setLoading(true);
    try {
      const res = await verifyOTP(phone, code);
      if (res.data?.token) {
        await saveToken(res.data.token);
        const needsProfile = !res.data.user?.name;
        navigation.replace(needsProfile ? 'Profile' : 'Main');
      } else {
        Alert.alert('Verification Failed', 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      const status = err?.status;
      const msg = status === 401
        ? 'Wrong OTP. Please try again.'
        : status === 500
        ? 'Server error, please try again.'
        : err?.message || 'Verification failed. Check your internet.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (resend > 0) return;
    setResend(30);
    setOtp(['', '', '', '']);
    refs[0]?.current?.focus();
    Alert.alert('OTP Resent', 'A new OTP has been sent to +91 ' + phone);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Curved header */}
      <View style={styles.header}>
        <View style={styles.headerBlob} />
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{'\u{1F4F1}'} Enter OTP</Text>
        <Text style={styles.headerSub}>
          Sent to +91 {phone?.replace(/(\d{5})(\d{5})/, '$1 $2')}
        </Text>
      </View>

      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {/* OTP boxes */}
        <Text style={styles.sectionLabel}>4-DIGIT CODE</Text>
        <View style={styles.otpRow}>
          {otp.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={refs[idx]}
              style={[styles.otpBox, digit && styles.otpBoxFilled]}
              value={digit}
              onChangeText={val => handleDigit(val, idx)}
              onKeyPress={e => handleBackspace(e, idx)}
              keyboardType="number-pad"
              maxLength={1}
              textAlign="center"
              selectTextOnFocus
            />
          ))}
        </View>

        {/* Resend */}
        <TouchableOpacity onPress={handleResend} disabled={resend > 0} style={styles.resendRow}>
          <Text style={[styles.resendText, resend > 0 && styles.resendDisabled]}>
            {resend > 0 ? `Resend OTP in ${resend}s` : 'Resend OTP'}
          </Text>
        </TouchableOpacity>

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.verifyBtn, (loading || otp.join('').length < 4) && styles.verifyBtnDisabled]}
          onPress={handleVerify}
          disabled={loading || otp.join('').length < 4}
          activeOpacity={0.82}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.verifyBtnText}>{t('login.verify') || 'Verify & Login'}</Text>
          }
        </TouchableOpacity>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            {'\u{1F512}'} OTP is valid for 10 minutes. Do not share with anyone.
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingTop: STATUS_HEIGHT + 12,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute', top: -50, right: -40,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: colors.primaryLight, opacity: 0.25,
  },
  backBtn: {
    alignSelf: 'flex-start', marginBottom: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm,
  },
  backText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  headerTitle: {
    fontSize: 26, fontWeight: fontWeights.extrabold,
    color: '#fff', marginBottom: 4,
  },
  headerSub: {
    fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)',
  },

  content: {
    flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl,
  },

  sectionLabel: {
    fontSize: fontSizes.xs, fontWeight: fontWeights.bold,
    color: colors.textMuted, letterSpacing: 1.4,
    textTransform: 'uppercase', marginBottom: spacing.lg,
    textAlign: 'center',
  },

  // OTP boxes
  otpRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 14, marginBottom: spacing.xl,
  },
  otpBox: {
    width: 64, height: 64,
    backgroundColor: colors.inputBackground,
    borderWidth: 2, borderColor: colors.border,
    borderRadius: radius.md,
    fontSize: 28, fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },

  resendRow: { alignItems: 'center', marginBottom: spacing.xxl },
  resendText: {
    fontSize: fontSizes.sm, color: colors.primary,
    fontWeight: fontWeights.semibold, textDecorationLine: 'underline',
  },
  resendDisabled: { color: colors.textMuted, textDecorationLine: 'none' },

  verifyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg, paddingVertical: 16,
    alignItems: 'center', ...shadows.md, marginBottom: spacing.lg,
  },
  verifyBtnDisabled: { backgroundColor: colors.border },
  verifyBtnText: {
    fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: '#fff',
  },

  infoCard: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.md, padding: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.accent,
  },
  infoText: { fontSize: fontSizes.sm, color: colors.textSecondary },
});
