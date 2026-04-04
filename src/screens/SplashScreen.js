import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights } from '../theme';
import { getToken, getUser } from '../services/storage';
import { setAuthToken } from '../services/api';

const { width, height } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.7)).current;
  const slideAnim  = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Animate logo in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
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
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Background circles for depth */}
      <View style={styles.circleTop} />
      <View style={styles.circleBottom} />

      {/* Logo & Brand */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* App Icon — leaf + soil wave */}
        <View style={styles.iconWrapper}>
          <Text style={styles.iconEmoji}>🌱</Text>
        </View>

        <Animated.Text
          style={[
            styles.appName,
            { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
          ]}
        >
          MittiCard
        </Animated.Text>

        <Animated.Text
          style={[
            styles.tagline,
            { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
          ]}
        >
          मिट्टी की सेहत, फसल का भविष्य
        </Animated.Text>
        <Animated.Text
          style={[
            styles.taglineEn,
            { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
          ]}
        >
          Soil Health · Crop Advisory
        </Animated.Text>
      </Animated.View>

      {/* Bottom tagline */}
      <Animated.Text style={[styles.bottomText, { opacity: fadeAnim }]}>
        Powered by AI Rule Engine
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleTop: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.primaryLight,
    opacity: 0.35,
  },
  circleBottom: {
    position: 'absolute',
    bottom: -100,
    left: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.primaryDark,
    opacity: 0.5,
  },
  logoContainer: {
    alignItems: 'center',
  },
  iconWrapper: {
    width: 110,
    height: 110,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  iconEmoji: {
    fontSize: 56,
  },
  appName: {
    fontSize: 42,
    fontWeight: fontWeights.extrabold,
    color: colors.textOnPrimary,
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontSize: fontSizes.lg,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: fontWeights.medium,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  taglineEn: {
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: fontWeights.regular,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bottomText: {
    position: 'absolute',
    bottom: spacing.xxl,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
  },
});
