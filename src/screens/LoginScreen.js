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
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  colors,
  spacing,
  fontSizes,
  fontWeights,
  radius,
  shadows,
} from '../theme';
import { sendOTP } from '../services/api';

const { width, height } = Dimensions.get('window');

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

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
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const onBtnPressIn = () => {
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const onBtnPressOut = () => {
    Animated.spring(btnScale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handleSendOTP = async () => {
    const cleaned = phone.trim();
    if (cleaned.length !== 10 || isNaN(cleaned)) {
      shakeInput();
      Alert.alert(
        'Invalid Number',
        'Please enter a valid 10-digit mobile number.',
      );
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
      Alert.alert(
        'Error',
        err.message || 'Failed to send OTP. Check your connection.',
      );
    } finally {
      setLoading(false);
    }
  };

  const isReady = phone.trim().length === 10 && !isNaN(phone.trim());

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#165A36" />

      {/* Soft gradient background */}
      <LinearGradient
        colors={['#F8FAF8', '#EEF7F1']}
        style={StyleSheet.absoluteFill}
      />

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
            {/* ── MINIMAL LOGO HEADER ── */}
            <View style={styles.headerSection}>
              <View style={[styles.logoBox, shadows.sm]}>
                <Text style={styles.logoEmoji}>🌱</Text>
              </View>
              <Text style={styles.brandName}>MittiCard</Text>
              <Text style={styles.tagline}>
                Smart Soil Intelligence for Farmers
              </Text>
            </View>

            {/* ── LOGIN CARD ── */}
            <View style={styles.card}>
              {/* Welcome with icon */}
              <View style={styles.welcomeRow}>
                <Text style={styles.cardTitle}>Welcome</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                Enter your mobile number to get started
              </Text>

              <Text style={styles.label}>MOBILE NUMBER</Text>

              {/* Phone input */}
              <Animated.View
                style={[
                  styles.inputWrapper,
                  focused && styles.inputWrapperFocused,
                  { transform: [{ translateX: shakeAnim }] },
                ]}
              >
                <View style={styles.countryCode}>
                  <Text style={styles.flagText}>🇮🇳</Text>
                  <Text style={styles.countryCodeText}>
                    +91{' '}
                    <Text style={{ fontSize: 10, color: '#94A3B8' }}>▼</Text>
                  </Text>
                </View>
                <View style={styles.inputDivider} />

                <TextInput
                  style={styles.input}
                  placeholder="98765 43210"
                  placeholderTextColor="#94A3B8"
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

              {/* ── CTA BUTTON ── */}
              <Animated.View
                style={[styles.btnWrap, { transform: [{ scale: btnScale }] }]}
              >
                <TouchableOpacity
                  onPress={handleSendOTP}
                  disabled={loading || !isReady}
                  activeOpacity={1}
                  onPressIn={onBtnPressIn}
                  onPressOut={onBtnPressOut}
                  style={styles.sendBtnTouch}
                >
                  {isReady || loading ? (
                    <LinearGradient
                      colors={['#1F6E43', '#3FA169']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.sendBtnGradient}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <View style={styles.btnContent}>
                          <Text style={styles.sendBtnText}>Get OTP</Text>
                        </View>
                      )}
                    </LinearGradient>
                  ) : (
                    <View style={styles.sendBtnDisabled}>
                      <Text style={styles.sendBtnTextDisabled}>Get OTP</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Terms of Service Text */}
              <Text style={styles.termsText}>
                By continuing, you agree to our Terms of Service & Privacy
                Policy
              </Text>
            </View>

            {/* ── TRUST FOOTER ── */}
            <View style={styles.footerRow}>
              <Text style={{ fontSize: 14, marginRight: 6 }}>✅</Text>
              <Text style={styles.footerText}>
                Your data is safe and secure
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },

  // ── Header (minimal, no green block) ──
  headerSection: {
    alignItems: 'center',
    paddingTop: (StatusBar.currentHeight || 24) + 8,
    paddingBottom: 16,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(31,110,67,0.05)',
  },
  logoEmoji: {
    fontSize: 32,
  },

  brandName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  tagline: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  headerDashes: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  dashLong: {
    width: 24,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#86C58B',
  },
  dashShort: {
    width: 6,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#86C58B',
  },

  // ── Card ──
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 28,
    // Premium shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    elevation: 8,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
    lineHeight: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
    letterSpacing: 1.2,
  },

  // ── Input ──
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginBottom: 32,
  },
  inputWrapperFocused: {
    borderColor: '#3FA169',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#3FA169',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 6,
  },
  flagText: { fontSize: 18 },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  inputDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    paddingHorizontal: 14,
    letterSpacing: 1.5,
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  clearBtnText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
  },
  charCount: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'right',
    marginBottom: 16,
  },

  // ── CTA Button ──
  btnWrap: {
    // no extra margin needed
  },
  sendBtnTouch: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 54,
  },
  sendBtnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  sendBtnDisabled: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginRight: 8,
  },
  termsText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
  },

  // ── Footer ──
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 'auto',
    marginBottom: 32,
  },
  shieldIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
});
