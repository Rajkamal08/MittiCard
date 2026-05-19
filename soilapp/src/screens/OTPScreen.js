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
import LinearGradient from 'react-native-linear-gradient';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { verifyOTP, saveFCMToken } from '../services/api';
import { saveToken, saveUser } from '../services/storage';
import { setAuthToken } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OTP_LENGTH = 6;
const { width: SCREEN_W } = Dimensions.get('window');

// ─── SMS Sent Confirmation Modal ─────────────────────────────────────────────
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.modalCard, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.modalIconWrap, isError && { backgroundColor: '#FEE2E2' }]}>
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
                <Text style={{ fontWeight: '700', color: '#1F6E43' }}>{`+91 ${phone}`}</Text>
                {'\nAnswer the call and note your OTP.'}
              </Text>
            </>
          )}

          <TouchableOpacity style={styles.modalBtn} onPress={onClose} activeOpacity={0.85}>
            <LinearGradient
              colors={['#1F6E43', '#3FA169']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalBtnGradient}
            >
              <Text style={styles.modalBtnText}>{isError ? 'OK' : 'Enter OTP'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}


// ─── Main OTP Screen ────────────────────────────────────────────────────────
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
  const btnScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Auto-fill OTP boxes if dev_otp returned (DND demo phones)
    if (dev_otp) {
      const digits = String(dev_otp).split('').slice(0, OTP_LENGTH);
      const filled = [...digits, ...Array(OTP_LENGTH - digits.length).fill('')];
      setOtp(filled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timer === 0) { setCanResend(true); return; }
    const t = setInterval(() => setTimer(n => n - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);

  // ─── Shake on wrong OTP ─────────────────────────────────────────────────────
  const shakeBoxes = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7,   duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7,  duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  };

  // ─── Button Animation ───────────────────────────────────────────────────────
  const onBtnPressIn = () => {
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const onBtnPressOut = () => {
    Animated.spring(btnScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };

  // ─── Input handler ──────────────────────────────────────────────────────────
  const handleChange = (value, index) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];

    if (value.length > 1) {
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

  // ─── Backspace ──────────────────────────────────────────────────────────────
  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      inputRefs.current[index - 1]?.current?.focus();
    }
  };

  // ─── Verify ─────────────────────────────────────────────────────────────────
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

  // ─── Resend ─────────────────────────────────────────────────────────────────
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
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAF8" />

      {/* Soft gradient background matching LoginScreen */}
      <LinearGradient
        colors={['#F8FAF8', '#EEF7F1']}
        style={StyleSheet.absoluteFill}
      />

      {/* Modal */}
      <SMSSentModal
        visible={modalVisible}
        isError={modalError}
        phone={phone}
        onClose={() => { setModalVisible(false); setModalError(false); }}
      />

      {/* Simple Text Back Button */}
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
      >
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              flex: 1,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            {/* ── MINIMAL HEADER ── */}
            <View style={styles.headerSection}>
              <Text style={styles.brandName}>Enter Your Verification Code</Text>
              <Text style={styles.tagline}>
                We have sent a 6 digit code to +91 {phone}.{'\n'}Please enter it below to continue.
              </Text>
            </View>

            {/* ── OTP CARD ── */}
            <View style={styles.card}>
              
              {/* Timer / Auto-fill (Above OTP) */}
              <View style={styles.timerContainer}>
                {dev_otp ? (
                  <Text style={styles.timerText}>OTP auto-filled: {dev_otp}</Text>
                ) : !canResend ? (
                  <Text style={styles.timerText}>OTP will expire in 00:{String(timer).padStart(2, '0')}</Text>
                ) : (
                  <Text style={styles.timerTextExpired}>OTP has expired</Text>
                )}
              </View>

              {/* OTP Boxes */}
              <Animated.View style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}>
                {otp.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={inputRefs.current[i]}
                    style={[
                      styles.otpBox,
                      digit ? styles.otpBoxFilled : null,
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
              <Animated.View style={[styles.btnWrap, { transform: [{ scale: btnScale }] }]}>
                <TouchableOpacity
                  style={styles.sendBtnTouch}
                  onPress={() => verify()}
                  disabled={loading || !complete}
                  activeOpacity={1}
                  onPressIn={onBtnPressIn}
                  onPressOut={onBtnPressOut}
                >
                  {loading || complete ? (
                    <LinearGradient
                      colors={['#1F6E43', '#2F9E5B']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.sendBtnGradient}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <View style={styles.btnContent}>
                          <Text style={styles.sendBtnText}>Verify & Continue</Text>
                        </View>
                      )}
                    </LinearGradient>
                  ) : (
                    <View style={styles.sendBtnDisabled}>
                      <Text style={styles.sendBtnTextDisabled}>Verify & Continue</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Resend Row (Moved below button per mockup) */}
              <View style={styles.resendRow}>
                <Text style={styles.resendLabel}>Didn't receive the code? </Text>
                {canResend ? (
                  <TouchableOpacity onPress={handleResend} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.resendLink}>Resend OTP</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.resendTimer}>
                    Resend OTP in <Text style={styles.resendTimerBold}>{String(timer).padStart(2, '0')}s</Text>
                  </Text>
                )}
              </View>
            </View>

            {/* ── TRUST FOOTER ── */}
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>This code is valid for 5 minutes</Text>
            </View>
            
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const BOX_SIZE  = Math.floor((SCREEN_W - 88) / 6); // Calculate box size dynamically based on screen width padding

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
    paddingTop: 40,
  },

  // ── Back Button ──
  backBtn: {
    position: 'absolute',
    top: (StatusBar.currentHeight || 24) + 12,
    left: 20,
    zIndex: 10,
  },
  backBtnText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Header (minimal) ──
  headerSection: {
    alignItems: 'center',
    paddingTop: 64, // Added top padding to clear back button completely
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  brandName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
    letterSpacing: 0.2,
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 24,
  },

  // ── Timer / Hint ──
  timerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  timerText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E76F00',
    letterSpacing: 0.3,
  },
  timerTextExpired: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    letterSpacing: 0.3,
  },

  // ── Card ──
  card: {
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginBottom: 24,
  },

  // ── OTP Boxes ──
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
    paddingHorizontal: 8, // Bring boxes in slightly to guarantee gap
  },
  otpBox: {
    width: BOX_SIZE - 10, // Explicitly subtracted to create clean gaps between underlines
    height: BOX_SIZE + 10,
    borderBottomWidth: 3, // Thicker underline per mockup
    borderColor: '#E2E8F0',
    backgroundColor: 'transparent',
    fontSize: Math.min(28, BOX_SIZE * 0.5),
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    padding: 0,
  },
  otpBoxActive: {
    borderColor: '#3FA169',
  },
  otpBoxFilled: {
    borderColor: '#0F172A',
  },

  // ── Resend ──
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  resendLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F6E43',
  },
  resendTimer: {
    fontSize: 14,
    color: '#64748B',
  },
  resendTimerBold: {
    fontWeight: '700',
    color: '#1F6E43',
  },
  
  // ── CTA Button ──
  btnWrap: {
    shadowColor: '#1F6E43',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
  },
  sendBtnTouch: {
    height: 60,
    borderRadius: 16,
  },
  sendBtnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  sendBtnDisabled: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  sendBtnTextDisabled: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  termsText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 16,
  },
  // ── Footer ──
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 8,
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(31,110,67,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalIcon: {
    fontSize: 30,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    height: 54,
  },
  modalBtnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
