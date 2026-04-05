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
  Modal,
  Dimensions,
} from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { verifyOTP, saveFCMToken } from '../services/api';
import { saveToken, saveUser } from '../services/storage';
import { setAuthToken } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OTP_LENGTH = 6;

// ─── SMS Sent Confirmation Modal (no OTP shown on screen) ─────────────────────────
function SMSSentModal({ visible, isError, phone, onClose }) {
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80 }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.92);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.modalCard, { transform: [{ scale: scaleAnim }] }]}>
          {/* Icon */}
          <View style={styles.modalIconWrap}>
            <Text style={styles.modalIcon}>{isError ? '❌' : '📱'}</Text>
          </View>

          {isError ? (
            <>
              <Text style={styles.modalTitle}>Something went wrong</Text>
              <Text style={styles.modalSub}>Could not send the code. Please try again.</Text>
            </>
          ) : (
            <>
              <Text style={styles.modalTitle}>Voice Call Coming!</Text>
              <Text style={styles.modalSub}>
                {'A call will be made to '}
                <Text style={{ fontWeight: '700', color: '#2D6A4F' }}>+91 {phone}</Text>
                {'\nAnswer the call and note your OTP.'}
              </Text>
            </>
          )}

          {/* Button */}
          <TouchableOpacity style={styles.modalBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.modalBtnText}>{isError ? 'OK' : 'Enter OTP'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}


// ─── Main OTP Screen ───────────────────────────────────────────────────────────
export default function OTPScreen({ navigation, route }) {
  const { phone, dev_otp } = route.params;

  const [otp, setOtp]           = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading]   = useState(false);
  const [timer, setTimer]       = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalError, setModalError]     = useState(false);

  const inputRefs = useRef(Array(OTP_LENGTH).fill(null).map(() => React.createRef()));
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    // Auto-fill OTP boxes if dev_otp returned (DND demo phones)
    if (dev_otp) {
      const digits = String(dev_otp).split('').slice(0, OTP_LENGTH);
      const filled = [...digits, ...Array(OTP_LENGTH - digits.length).fill('')];
      setOtp(filled);
    }
  }, []);

  // ─── Countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timer === 0) { setCanResend(true); return; }
    const t = setInterval(() => setTimer(n => n - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  // ─── Shake on wrong OTP ──────────────────────────────────────────────────────
  const shakeBoxes = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7,   duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  };

  // ─── Input handler ───────────────────────────────────────────────────────────
  const handleChange = (value, index) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];

    if (value.length > 1) {
      // Paste: fill all boxes
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      digits.forEach((d, i) => { next[i] = d; });
      setOtp(next);
      inputRefs.current[OTP_LENGTH - 1]?.current?.focus();
      const full = next.join('');
      if (full.length === OTP_LENGTH) setTimeout(() => verify(full), 100);
      return;
    }

    next[index] = value;
    setOtp(next);

    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.current?.focus();
    }
    if (value && index === OTP_LENGTH - 1) {
      const full = next.join('');
      if (full.length === OTP_LENGTH) setTimeout(() => verify(full), 100);
    }
  };

  // ─── Backspace ───────────────────────────────────────────────────────────────
  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      inputRefs.current[index - 1]?.current?.focus();
    }
  };

  // ─── Verify ──────────────────────────────────────────────────────────────────
  const verify = async (otpStr) => {
    const code = otpStr || otp.join('');
    if (code.length !== OTP_LENGTH) return;
    setLoading(true);
    try {
      const res = await verifyOTP(phone, code);
      if (res.data.success) {
        const { token, user } = res.data;
        await saveToken(token);
        await saveUser(user);
        setAuthToken(token);

        try {
          let fcmToken;
          try {
            const messaging = require('@react-native-firebase/messaging').default;
            await messaging().requestPermission();
            fcmToken = await messaging().getToken();
          } catch {
            fcmToken = await AsyncStorage.getItem('device_fcm_token');
            if (!fcmToken) {
              fcmToken = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              await AsyncStorage.setItem('device_fcm_token', fcmToken);
            }
          }
          await saveFCMToken(fcmToken);
        } catch {}

        navigation.replace('Language', { user });
      }
    } catch (err) {
      shakeBoxes();
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.current?.focus();
      setModalError(true);
      setModalVisible(true);
    } finally {
      setLoading(false);
    }
  };

  // ─── Resend ──────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend) return;
    setOtp(Array(OTP_LENGTH).fill(''));
    setTimer(30);
    setCanResend(false);
    inputRefs.current[0]?.current?.focus();
    try {
      const { sendOTP } = require('../services/api');
      await sendOTP(phone);
      setModalError(false);
      setModalVisible(true);
    } catch {
      setModalError(true);
      setModalVisible(true);
    }
  };

  const filled   = otp.filter(Boolean).length;
  const complete = filled === OTP_LENGTH;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark || '#1a4a2e'} />

      {/* Modal */}
      <SMSSentModal
        visible={modalVisible}
        isError={modalError}
        phone={phone}
        onClose={() => { setModalVisible(false); setModalError(false); }}
      />

      {/* Top green header */}
      <View style={styles.topBand}>
        <View style={styles.topBlobTL} />
        <View style={styles.topBlobBR} />
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.heading}>Verify Your Number</Text>
            <Text style={styles.subText}>Enter the 6-digit code from your voice call</Text>
            <Text style={styles.phoneText}>+91 {phone}</Text>
          </Animated.View>

          {/* Demo hint — only shows when dev_otp is present (DND phones) */}
          {dev_otp ? (
            <View style={styles.demoHint}>
              <Text style={styles.demoHintText}>📋 OTP auto-filled: {dev_otp}</Text>
            </View>
          ) : null}

          {/* Card */}
          <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* OTP Boxes */}
            <Animated.View style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={inputRefs.current[i]}
                  style={[
                    styles.otpBox,
                    digit        ? styles.otpBoxFilled  : null,
                    i === filled && !digit ? styles.otpBoxActive : null,
                  ]}
                  value={digit}
                  onChangeText={v => handleChange(v, i)}
                  onKeyPress={e => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  textAlign="center"
                  selectTextOnFocus
                  caretHidden={false}
                  autoFocus={i === 0}
                />
              ))}
            </Animated.View>

            {/* Verify Button */}
            <TouchableOpacity
              style={[styles.btn, !complete && styles.btnDisabled]}
              onPress={() => verify()}
              disabled={loading || !complete}
              activeOpacity={0.82}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[styles.btnText, !complete && styles.btnTextDisabled]}>
                  {complete ? 'Verify & Login →' : `Enter ${OTP_LENGTH - filled} more digit${OTP_LENGTH - filled !== 1 ? 's' : ''}`}
                </Text>
              )}
            </TouchableOpacity>

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn't receive it? </Text>
              {canResend ? (
                <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLink}>Resend Code</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.resendTimer}>
                  Resend in <Text style={styles.resendTimerBold}>{String(timer).padStart(2, '0')}s</Text>
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Footer */}
          <Animated.Text style={[styles.footer, { opacity: fadeAnim }]}>
            🔒 This code is valid for 5 minutes
          </Animated.Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const PRIMARY   = '#2D6A4F';
const PRIMARY_D = '#1B4332';
const BG        = '#F7F8F5';
const SURFACE   = '#FFFFFF';
const TEXT_1    = '#111111';
const TEXT_2    = '#555555';
const TEXT_3    = '#999999';
const BORDER    = '#D8DDD6';

// Responsive box size: fit 6 boxes + 5 gaps inside card
const SCREEN_W  = Dimensions.get('window').width;
const CARD_PAD  = 20;   // card padding each side
const SCROLL_PAD = 20;  // scroll paddingHorizontal
const GAP       = 10;   // gap between boxes
const BOX_SIZE  = Math.floor((SCREEN_W - SCROLL_PAD * 2 - CARD_PAD * 2 - GAP * 5) / 6);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },

  // ── Header band ─────────────────────────────────────────────────────────────
  topBand: {
    height: 170,
    backgroundColor: PRIMARY,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    paddingHorizontal: 24,
    paddingBottom: 20,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  topBlobTL: {
    position: 'absolute', top: -50, left: -50,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  topBlobBR: {
    position: 'absolute', bottom: -40, right: -40,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '500',
  },

  // ── Scroll ───────────────────────────────────────────────────────────────────
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },

  // ── Header text ──────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT_1,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subText: {
    fontSize: 14,
    color: TEXT_2,
    marginBottom: 2,
  },
  phoneText: {
    fontSize: 18,
    fontWeight: '700',
    color: PRIMARY,
  },

  // ── Card ─────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    padding: CARD_PAD,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },

  // ── OTP Row ──────────────────────────────────────────────────────────────────
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  otpBox: {
    width: BOX_SIZE,
    height: BOX_SIZE + 8,      // slightly taller than wide
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    fontSize: Math.min(22, BOX_SIZE * 0.46),
    fontWeight: '700',
    color: TEXT_1,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    padding: 0,
  },
  otpBoxActive: {
    borderColor: PRIMARY,
    borderWidth: 2,
    backgroundColor: '#F0F7F4',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  otpBoxFilled: {
    borderColor: PRIMARY,
    backgroundColor: '#EAF4EE',
    color: PRIMARY_D,
  },

  // ── Button ───────────────────────────────────────────────────────────────────
  btn: {
    backgroundColor: PRIMARY,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: '#E0E4DF',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnTextDisabled: {
    color: '#AAB0A8',
  },

  // ── Resend ───────────────────────────────────────────────────────────────────
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendLabel: {
    fontSize: 13,
    color: TEXT_3,
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
    color: PRIMARY,
    textDecorationLine: 'underline',
  },
  resendTimer: {
    fontSize: 13,
    color: TEXT_3,
  },
  resendTimerBold: {
    fontWeight: '700',
    color: TEXT_2,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: TEXT_3,
  },

  // ── Modal ────────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  modalIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#EAF4EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalIcon: {
    fontSize: 28,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_1,
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: TEXT_2,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalOTPWrap: {
    backgroundColor: '#F0F7F4',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C8E6D2',
  },
  modalOTPText: {
    fontSize: 32,
    fontWeight: '800',
    color: PRIMARY_D,
    letterSpacing: 6,
    textAlign: 'center',
  },
  modalNote: {
    fontSize: 11,
    color: TEXT_3,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  demoHint: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  demoHintText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.5,
  },
});
