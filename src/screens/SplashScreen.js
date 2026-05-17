import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, spacing, fontSizes, fontWeights } from '../theme';
import { getToken, getUser } from '../services/storage';
import { setAuthToken } from '../services/api';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const logoScale   = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textSlide   = useRef(new Animated.Value(30)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const ringScale   = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  const bottomFade  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Step 1: Logo appears with spring
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Step 2: Ring pulse animation
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 2.5,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Step 3: Text slides up
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(textSlide, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Step 4: Bottom text fades in
    Animated.sequence([
      Animated.delay(900),
      Animated.timing(bottomFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // After 2.5s: check if farmer is already logged in
    const timer = setTimeout(async () => {
      try {
        const token = await getToken();
        const user  = await getUser();

        if (token && user) {
          // Returning farmer — restore JWT header and skip Login
          setAuthToken(token);
          navigation.replace('Home', { user });
        } else {
          // New / logged-out farmer — go to Login
          navigation.replace('Login');
        }
      } catch {
        navigation.replace('Login');
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} translucent />

      <LinearGradient
        colors={[colors.primaryDark, colors.primary, colors.primaryLight]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative floating circles */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      {/* Pulse ring behind logo */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <View style={styles.logoBox}>
          <Text style={styles.logoEmoji}>🌱</Text>
        </View>
      </Animated.View>

      {/* Brand Text */}
      <Animated.View
        style={{
          opacity: textOpacity,
          transform: [{ translateY: textSlide }],
          alignItems: 'center',
        }}
      >
        <Text style={styles.appName}>MittiCard</Text>
        <Text style={styles.taglineHi}>मिट्टी की सेहत, फसल का भविष्य</Text>
        <View style={styles.dividerLine} />
        <Text style={styles.taglineEn}>Smart Soil Intelligence for Farmers</Text>
      </Animated.View>

      {/* Bottom text */}
      <Animated.View style={[styles.bottomSection, { opacity: bottomFade }]}>
        <View style={styles.aiPill}>
          <Text style={styles.aiPillText}>✨ Powered by AI</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Decorative circles
  circle1: {
    position: 'absolute',
    top: -height * 0.12,
    right: -width * 0.2,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  circle2: {
    position: 'absolute',
    bottom: -height * 0.08,
    left: -width * 0.15,
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: width * 0.25,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  circle3: {
    position: 'absolute',
    top: height * 0.3,
    left: -width * 0.1,
    width: width * 0.3,
    height: width * 0.3,
    borderRadius: width * 0.15,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  // Pulse ring
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },

  // Logo
  logoContainer: {
    marginBottom: spacing.xl,
  },
  logoBox: {
    width: 110,
    height: 110,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  logoEmoji: {
    fontSize: 56,
  },

  // Brand text
  appName: {
    fontSize: 44,
    fontWeight: fontWeights.extrabold,
    color: '#FFFFFF',
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  taglineHi: {
    fontSize: fontSizes.lg,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: fontWeights.medium,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  dividerLine: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    marginBottom: spacing.sm,
  },
  taglineEn: {
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: fontWeights.regular,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Bottom section
  bottomSection: {
    position: 'absolute',
    bottom: spacing.xxl + 10,
    alignItems: 'center',
  },
  aiPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  aiPillText: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: fontWeights.semibold,
    letterSpacing: 1,
  },
});
