import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, Platform, ScrollView, Animated, ActivityIndicator, Alert,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { updateProfile } from '../services/api';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;
const STATES = [
  'Andhra Pradesh','Bihar','Chhattisgarh','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Madhya Pradesh',
  'Maharashtra','Odisha','Punjab','Rajasthan','Tamil Nadu',
  'Telangana','Uttar Pradesh','Uttarakhand','West Bengal',
];

export default function ProfileScreen({ navigation }) {
  const [name,  setName]  = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [showStates, setShowStates] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Name Required', 'Please enter your name.'); return; }
    setLoading(true);
    try {
      await updateProfile({ name: name.trim(), district: district.trim(), state });
      navigation.replace('Main');
    } catch (err) {
      Alert.alert('Error', err?.message || 'Could not save. Try again.');
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <View style={styles.header}>
        <View style={styles.blob} />
        <Text style={styles.title}>{'\u{1F468}\u200D\u{1F33E}'} Complete Profile</Text>
        <Text style={styles.sub}>Tell us a bit about yourself</Text>
        <View style={styles.dots}>
          {[1,2,3].map(i => <View key={i} style={[styles.dot, i===2 && styles.dotActive]} />)}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>PERSONAL INFO</Text>
            <Text style={styles.label}>{'\u{1F464}'} Your Name</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} placeholder="e.g. Ramesh Kumar"
                placeholderTextColor={colors.placeholder} value={name}
                onChangeText={setName} autoCapitalize="words" />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>LOCATION</Text>
            <Text style={styles.label}>{'\u{1F4CD}'} State</Text>
            <TouchableOpacity style={styles.inputWrap} onPress={() => setShowStates(v => !v)}>
              <Text style={[styles.input, !state && { color: colors.placeholder }]}>
                {state || 'Select your state'}
              </Text>
              <Text style={{ color: colors.textMuted }}>{showStates ? '\u25B4' : '\u25BE'}</Text>
            </TouchableOpacity>
            {showStates && (
              <View style={styles.dropdown}>
                <ScrollView style={{ maxHeight: 190 }} nestedScrollEnabled>
                  {STATES.map(s => (
                    <TouchableOpacity key={s} style={[styles.stateRow, s===state && styles.stateRowActive]}
                      onPress={() => { setState(s); setShowStates(false); }}>
                      <Text style={[styles.stateText, s===state && { color: colors.primary, fontWeight: fontWeights.bold }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            <Text style={styles.label}>{'\u{1F3D9}'} District</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} placeholder="e.g. Jaipur"
                placeholderTextColor={colors.placeholder} value={district}
                onChangeText={setDistrict} autoCapitalize="words" />
            </View>
          </View>

          <TouchableOpacity style={[styles.saveBtn, loading && { opacity: 0.7 }]}
            onPress={handleSave} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save & Continue {'\u2192'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.replace('Main')}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary, paddingTop: STATUS_HEIGHT + 12,
    paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  blob: {
    position: 'absolute', top: -50, right: -40, width: 160, height: 160,
    borderRadius: 80, backgroundColor: colors.primaryLight, opacity: 0.25,
  },
  title: { fontSize: 26, fontWeight: fontWeights.extrabold, color: '#fff', marginBottom: 4 },
  sub: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)', marginBottom: spacing.lg },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { width: 22, backgroundColor: '#fff', borderRadius: 4 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.sm,
  },
  sectionLabel: {
    fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.md,
  },
  label: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: 6, marginTop: spacing.sm },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  input: { flex: 1, fontSize: fontSizes.md, color: colors.textPrimary, paddingVertical: Platform.OS === 'ios' ? 14 : 10 },
  dropdown: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, ...shadows.sm },
  stateRow: { paddingHorizontal: spacing.lg, paddingVertical: 10 },
  stateRowActive: { backgroundColor: colors.primarySurface },
  stateText: { fontSize: fontSizes.md, color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', ...shadows.md, marginBottom: spacing.md },
  saveBtnText: { fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: fontSizes.sm, color: colors.textMuted, textDecorationLine: 'underline' },
});
