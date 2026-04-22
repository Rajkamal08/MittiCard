import React, { useEffect, useRef } from 'react';
import {
  View, Text, Animated, StyleSheet, StatusBar, Platform,
} from 'react-native';
import { colors, fontSizes, fontWeights, spacing } from '../theme';

export default function SplashScreen({ navigation }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Logo entrance
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1,    duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 60, friction: 7 }),
    ]).start();

    // Pulsing dots
    const pulse = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1,   duration: 380, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 380, useNativeDriver: true }),
        ])
      ).start();
    pulse(dot1, 0);
    pulse(dot2, 200);
    pulse(dot3, 400);

    // Navigate after 2.4s
    const timer = setTimeout(() => navigation.replace('Language'), 2400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Decorative blobs */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      {/* Center content */}
      <Animated.View style={[styles.center, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Logo */}
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>{'\u{1F331}'}</Text>
        </View>

        <Text style={styles.appName}>MittiCard</Text>
        <Text style={styles.tagline}>
          {'\u092E\u093F\u091F\u094D\u091F\u0940 \u0915\u0940 \u0938\u0947\u0939\u0924, \u092B\u0938\u0932 \u0915\u093E \u092D\u0935\u093F\u0937\u094D\u092F'}
        </Text>
        <Text style={styles.taglineEn}>Soil Health · Crop Future</Text>
      </Animated.View>

      {/* Pulsing dots */}
      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((d, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: d }]} />
        ))}
      </View>
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
  blobTopRight: {
    position: 'absolute', top: -60, right: -60,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: colors.primaryLight,
    opacity: 0.22,
  },
  blobBottomLeft: {
    position: 'absolute', bottom: -50, left: -50,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: colors.primaryDark,
    opacity: 0.35,
  },
  center: { alignItems: 'center' },
  logoCircle: {
    width: 108, height: 108,
    backgroundColor: '#fff',
    borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18, shadowRadius: 12,
    marginBottom: spacing.xl,
  },
  logoEmoji: { fontSize: 54 },
  appName: {
    fontSize: 36, fontWeight: fontWeights.extrabold,
    color: '#fff', letterSpacing: 1.8, marginBottom: spacing.sm,
  },
  tagline: {
    fontSize: fontSizes.md, color: 'rgba(255,255,255,0.75)',
    textAlign: 'center', marginBottom: 4,
  },
  taglineEn: {
    fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', letterSpacing: 0.6,
  },
  dotsRow: {
    position: 'absolute', bottom: 60,
    flexDirection: 'row', gap: 10,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
