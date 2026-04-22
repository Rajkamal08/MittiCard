import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Platform, ScrollView, Animated, ActivityIndicator,
  Alert, Image,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { scanSoilCard, submitOCRData } from '../services/api';
import { saveLastScanId } from '../services/storage';
import { useTranslation } from 'react-i18next';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

const TIPS = [
  'Place card on a flat, well-lit surface',
  'Keep the camera steady and focused',
  'Crop image to show only the card',
  'Avoid glare or shadows on the card',
];

function StepDot({ index, active }) {
  return (
    <View style={[sd.dot, active && sd.active, active && { width: 22 }]} />
  );
}
const sd = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: 3 },
  active: { backgroundColor: '#fff', borderRadius: 4 },
});

export default function OCRScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const [step,      setStep]      = useState(1);
  const [imageUri,  setImageUri]  = useState(null);
  const [scanning,  setScanning]  = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [confidence,setConfidence]= useState(null);
  const [submitting,setSubmitting]= useState(false);
  const [editValues,setEditValues]= useState({});

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [step]);

  const goStep = (n) => {
    Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(n);
    });
  };

  const pickImage = (useCamera) => {
    const opts = { mediaType: 'photo', quality: 0.85, includeBase64: true, maxWidth: 1200, maxHeight: 1600 };
    const fn   = useCamera ? launchCamera : launchImageLibrary;
    fn(opts, (res) => {
      if (res.didCancel || res.errorCode) return;
      const asset = res.assets?.[0];
      if (!asset) return;
      setImageUri(asset.uri);
      goStep(2);
    });
  };

  const runScan = async () => {
    if (!imageUri) return;
    setScanning(true);
    try {
      const b64 = await (async () => {
        const RNFS = require('react-native-fs');
        const raw  = await RNFS.readFile(imageUri, 'base64');
        return raw;
      })();
      const res = await scanSoilCard(b64);
      if (res.data?.success) {
        const ext = res.data.extracted;
        setExtracted(ext);
        setConfidence(ext.confidence ?? 0);
        setEditValues(ext);
        goStep(3);
      } else {
        Alert.alert('Scan Failed', res.data?.error || 'Could not read card. Try again.');
      }
    } catch (err) {
      const msg = err?.status === 413
        ? 'Image too large. Please crop and retry.'
        : err?.status === 500
        ? 'Server error. Please try again.'
        : err?.message || 'Could not connect to server.';
      Alert.alert('Scan Error', msg);
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async () => {
    if (!editValues.ph || !editValues.nitrogen || !editValues.phosphorus || !editValues.potassium) {
      Alert.alert('Missing Values', 'Please fill in pH, N, P, K before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitOCRData({
        ...editValues,
        ph:          Number(editValues.ph),
        nitrogen:    Number(editValues.nitrogen),
        phosphorus:  Number(editValues.phosphorus),
        potassium:   Number(editValues.potassium),
        organic_carbon: editValues.organic_carbon ? Number(editValues.organic_carbon) : null,
        language:    i18n.language || 'en',
      });
      if (res.data?.success) {
        await saveLastScanId(res.data.scan_id);
        navigation.replace('AdvisoryResult', {
          advisory: res.data.advisory,
          scan_id:  res.data.scan_id,
        });
      }
    } catch (err) {
      Alert.alert('Submission Failed', err?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={st.header}>
        <View style={st.blob} />
        <TouchableOpacity style={st.backBtn} onPress={() => step > 1 ? goStep(step - 1) : navigation.goBack()}>
          <Text style={st.backText}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{'\u{1F4F7}'} {t('ocr.title') || 'Scan Soil Card'}</Text>
        <View style={st.stepDots}>
          {[1,2,3].map(i => <StepDot key={i} index={i} active={step === i} />)}
        </View>
      </View>

      <Animated.ScrollView style={{ opacity: fade }} contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── STEP 1: CAPTURE ─────────────────────────────────────────────── */}
        {step === 1 && (
          <>
            {/* Preview area */}
            <View style={st.previewBox}>
              <Text style={st.previewEmoji}>{'\u{1F4CB}'}</Text>
              <Text style={st.previewLabel}>Soil Health Card</Text>
              <Text style={st.previewSub}>Position your card here</Text>
            </View>

            <TouchableOpacity style={[st.btnPrimary, shadows.md]} onPress={() => pickImage(true)}>
              <Text style={st.btnPrimaryText}>{'\u{1F4F7}'} {t('ocr.open_camera') || 'Open Camera'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.btnOutline} onPress={() => pickImage(false)}>
              <Text style={st.btnOutlineText}>{'\u{1F5BC}\uFE0F'} {t('ocr.choose_gallery') || 'Choose from Gallery'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.manualLink} onPress={() => navigation.navigate('SoilInput')}>
              <Text style={st.manualLinkText}>{t('ocr.manual_link') || 'Enter values manually instead'}</Text>
            </TouchableOpacity>

            {/* Tips */}
            <View style={st.tipsCard}>
              <Text style={st.tipsTitle}>{'\u{1F4A1}'} Tips for best results</Text>
              {TIPS.map((tip, i) => (
                <View key={i} style={st.tipRow}>
                  <Text style={st.tipBullet}>{'\u2022'}</Text>
                  <Text style={st.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── STEP 2: SCAN ────────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            {imageUri && (
              <Image source={{ uri: imageUri }} style={st.imagePreview} resizeMode="contain" />
            )}

            <TouchableOpacity
              style={[st.btnPrimary, shadows.md, scanning && { opacity: 0.7 }]}
              onPress={runScan}
              disabled={scanning}
              activeOpacity={0.85}
            >
              {scanning
                ? <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={st.btnPrimaryText}>AI is reading your card…</Text>
                  </View>
                : <Text style={st.btnPrimaryText}>{'\u{1F50D}'} {t('ocr.scan_button') || 'Scan Card'}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={st.btnOutline} onPress={() => { setImageUri(null); goStep(1); }}>
              <Text style={st.btnOutlineText}>Choose Different Image</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 3: CONFIRM ─────────────────────────────────────────────── */}
        {step === 3 && extracted && (
          <>
            {/* Confidence banner */}
            <View style={[st.confBanner, confidence >= 80 ? st.confGood : st.confWarn]}>
              <Text style={st.confIcon}>{confidence >= 80 ? '\u2705' : '\u26A0\uFE0F'}</Text>
              <View>
                <Text style={[st.confTitle, confidence >= 80 ? { color: colors.statusGood } : { color: colors.statusWarning }]}>
                  {confidence >= 80 ? 'High Confidence Scan' : 'Low Confidence — Please Review'}
                </Text>
                <Text style={st.confSub}>{confidence}% accuracy · Edit any incorrect values below</Text>
              </View>
            </View>

            {/* Extracted fields */}
            <View style={[st.card, shadows.sm]}>
              <Text style={st.secLabel}>EXTRACTED VALUES</Text>
              {[
                { key: 'ph',             label: 'pH Level',         unit: '' },
                { key: 'nitrogen',       label: 'Nitrogen (N)',      unit: 'kg/ha' },
                { key: 'phosphorus',     label: 'Phosphorus (P)',    unit: 'kg/ha' },
                { key: 'potassium',      label: 'Potassium (K)',     unit: 'kg/ha' },
                { key: 'organic_carbon', label: 'Organic Carbon',   unit: '%' },
              ].map(field => {
                const detected = extracted[field.key] != null;
                return (
                  <View key={field.key} style={st.fieldWrap}>
                    <View style={st.fieldHeader}>
                      <Text style={st.fieldLabel}>{field.label}</Text>
                      <View style={[st.detectedBadge, detected ? { backgroundColor: colors.badgeGood } : { backgroundColor: colors.badgeMedium }]}>
                        <Text style={[st.detectedText, detected ? { color: colors.badgeGoodText } : { color: colors.badgeMediumText }]}>
                          {detected ? 'Detected' : 'Not found'}
                        </Text>
                      </View>
                    </View>
                    <View style={[st.inputWrap, !detected && st.inputWrapMissing]}>
                      <Text style={[st.inputText, !editValues[field.key] && { color: colors.placeholder }]}>
                        {editValues[field.key] != null ? String(editValues[field.key]) : 'Enter manually'}
                      </Text>
                      {field.unit ? <Text style={st.unit}>{field.unit}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={[st.btnPrimary, shadows.md, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.btnPrimaryText}>Get Advisory {'\u{1F52C}'}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={st.btnOutline} onPress={() => navigation.navigate('SoilInput', { prefill: editValues })}>
              <Text style={st.btnOutlineText}>Edit Values Manually</Text>
            </TouchableOpacity>
          </>
        )}

      </Animated.ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary, paddingTop: STATUS_HEIGHT + 12,
    paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  blob: { position: 'absolute', top: -50, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: colors.primaryLight, opacity: 0.25 },
  backBtn: { alignSelf: 'flex-start', marginBottom: spacing.sm, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  backText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  headerTitle: { fontSize: 26, fontWeight: fontWeights.extrabold, color: '#fff', marginBottom: spacing.md },
  stepDots: { flexDirection: 'row' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  previewBox: {
    backgroundColor: colors.primarySurface, borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.primaryMuted, borderStyle: 'dashed',
    height: 180, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  previewEmoji: { fontSize: 44, marginBottom: spacing.sm },
  previewLabel: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, color: colors.primary },
  previewSub: { fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 4 },
  btnPrimary: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center', marginBottom: spacing.md },
  btnPrimaryText: { fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: '#fff' },
  btnOutline: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: spacing.md, backgroundColor: colors.surface },
  btnOutlineText: { fontSize: fontSizes.md, fontWeight: fontWeights.semibold, color: colors.primary },
  manualLink: { alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.lg },
  manualLinkText: { fontSize: fontSizes.sm, color: colors.textMuted, textDecorationLine: 'underline' },
  tipsCard: { backgroundColor: colors.accentSurface, borderRadius: radius.lg, padding: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent },
  tipsTitle: { fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.accentDark, marginBottom: spacing.sm },
  tipRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  tipBullet: { fontSize: fontSizes.sm, color: colors.textSecondary },
  tipText: { flex: 1, fontSize: fontSizes.sm, color: colors.textSecondary },
  imagePreview: { width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: '#000', marginBottom: spacing.lg },
  confBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  confGood: { backgroundColor: colors.badgeGood },
  confWarn: { backgroundColor: colors.badgeMedium },
  confIcon: { fontSize: 24 },
  confTitle: { fontSize: fontSizes.sm, fontWeight: fontWeights.bold },
  confSub: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  secLabel: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.md },
  fieldWrap: { marginBottom: spacing.sm },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  fieldLabel: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  detectedBadge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  detectedText: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  inputWrapMissing: { backgroundColor: '#FFFBF0', borderColor: colors.statusWarning + '80' },
  inputText: { flex: 1, fontSize: fontSizes.md, color: colors.textPrimary },
  unit: { fontSize: fontSizes.sm, color: colors.textMuted, fontWeight: fontWeights.semibold },
});
