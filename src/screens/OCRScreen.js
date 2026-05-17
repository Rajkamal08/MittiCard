import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Animated,
  Image,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { scanImageForOCR, submitOCRSoilData } from '../services/api';
import { saveLastScanId } from '../services/storage';
import { useTranslation } from 'react-i18next';

// ─── 7 supported crops (translated) ─────────────────────────────────────────
const getCrops = (t) => [
  { id: 'wheat',     label: t('crops.wheat').replace(/ ?🌾/, ''),     emoji: '🌾' },
  { id: 'rice',      label: t('crops.rice').replace(/ ?🍚/, ''),      emoji: '🍚' },
  { id: 'maize',     label: t('crops.maize').replace(/ ?🌽/, ''),     emoji: '🌽' },
  { id: 'cotton',    label: t('crops.cotton').replace(/ ?🌿/, ''),    emoji: '🌿' },
  { id: 'sugarcane', label: t('crops.sugarcane').replace(/ ?🎋/, ''), emoji: '🎋' },
  { id: 'soybean',   label: t('crops.soybean').replace(/ ?🫘/, ''),   emoji: '🫘' },
  { id: 'groundnut', label: t('crops.groundnut').replace(/ ?🥜/, ''), emoji: '🥜' },
];

// ─── Steps ────────────────────────────────────────────────────────────────────
const STEP_CAPTURE = 'capture';
const STEP_SCAN    = 'scan';
const STEP_CONFIRM = 'confirm';
const STEP_SUBMIT  = 'submit';

// ─── Editable field row ───────────────────────────────────────────────────────
function EditableField({ label, value, onChangeText, unit }) {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== null && value !== '' && value !== undefined;

  return (
    <View style={styles.editField}>
      <View style={styles.editFieldHeader}>
        <Text style={styles.editFieldLabel}>{label}</Text>
        {hasValue ? (
          <View style={styles.detectedBadge}>
            <Text style={styles.detectedText}>Detected ✓</Text>
          </View>
        ) : (
          <View style={styles.missingBadge}>
            <Text style={styles.missingText}>Not found</Text>
          </View>
        )}
      </View>
      <View style={[styles.editInputRow, focused && styles.editInputFocused, !hasValue && styles.editInputMissing]}>
        <TextInput
          style={styles.editInput}
          value={value !== null && value !== undefined ? String(value) : ''}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={hasValue ? '' : 'Enter manually'}
          placeholderTextColor={colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {unit ? <Text style={styles.editUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// ─── Main OCRScreen ───────────────────────────────────────────────────────────
export default function OCRScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const CROPS = getCrops(t);
  const [step,         setStep]         = useState(STEP_CAPTURE);
  const [imageUri,     setImageUri]     = useState(null);
  const [imageBase64,  setImageBase64]  = useState(null);
  const [scanning,     setScanning]     = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [confidence,   setConfidence]   = useState(0);
  const [rawText,      setRawText]      = useState('');
  const [showRaw,      setShowRaw]      = useState(false);
  const [selectedCrop, setSelectedCrop] = useState('wheat');

  // Extracted / editable values
  const [ph,           setPh]           = useState('');
  const [nitrogen,     setNitrogen]     = useState('');
  const [phosphorus,   setPhosphorus]   = useState('');
  const [potassium,    setPotassium]    = useState('');
  const [organicCarbon,setOrganicCarbon]= useState('');
  const [farmSize,     setFarmSize]     = useState('');  // user must enter their farm size

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [step]);

  // ── Reset animations when step changes
  const goToStep = (newStep) => {
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    setStep(newStep);
  };

  // ── Request camera permission then open camera ────────────────────────────────
  const handleCamera = async () => {
    // Explicitly request camera permission on Android
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'MittiCard needs camera access to scan your Soil Health Card.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Camera access is needed to scan cards.');
          return;
        }
      } catch (err) {
        console.warn('Camera permission error:', err);
      }
    }
    const result = await launchCamera({
      mediaType: 'photo',
      quality: 0.3,       // compress heavily — Tesseract only needs text legible, not photo quality
      maxWidth: 1200,    // 1200px wide is enough for card text; reduces file from ~4MB → ~200KB
      maxHeight: 1600,
      includeBase64: true,
      saveToPhotos: false,
    });

    if (result.didCancel || result.errorCode) return;

    const asset = result.assets?.[0];
    if (!asset) return;

    setImageUri(asset.uri);
    setImageBase64(asset.base64);
    goToStep(STEP_SCAN);
  };

  // ── Pick from gallery ──────────────────────────────────────────────────────
  const handleGallery = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.3,
      maxWidth: 1200,
      maxHeight: 1600,
      includeBase64: true,
    });

    if (result.didCancel || result.errorCode) return;

    const asset = result.assets?.[0];
    if (!asset) return;

    setImageUri(asset.uri);
    setImageBase64(asset.base64);
    goToStep(STEP_SCAN);
  };

  // ── Send image to backend OCR ──────────────────────────────────────────────
  const handleScan = async () => {
    if (!imageBase64) return;
    setScanning(true);

    try {
      const response = await scanImageForOCR(imageBase64);
      const { extracted, raw_text } = response.data;

      // Pre-fill extracted values
      if (extracted.ph           !== null) setPh(String(extracted.ph));
      if (extracted.nitrogen     !== null) setNitrogen(String(extracted.nitrogen));
      if (extracted.phosphorus   !== null) setPhosphorus(String(extracted.phosphorus));
      if (extracted.potassium    !== null) setPotassium(String(extracted.potassium));
      if (extracted.organic_carbon !== null) setOrganicCarbon(String(extracted.organic_carbon));

      setConfidence(extracted.confidence || 0);
      setRawText(raw_text || '');
      goToStep(STEP_CONFIRM);

    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.message || 'Unknown error';
      Alert.alert(
        'OCR Failed',
        `Error: ${errMsg}\n\nTip: First run downloads language data (~30MB). Wait 1 min and try again, or enter values manually.`,
        [
          { text: 'Try Again', onPress: () => goToStep(STEP_CAPTURE) },
          { text: 'Enter Manually', onPress: () => navigation.navigate('SoilInput') },
        ]
      );
    } finally {
      setScanning(false);
    }
  };

  // ── Submit confirmed values ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!ph || !nitrogen || !phosphorus || !potassium) {
      Alert.alert('Missing Values', 'pH, N, P, K are required. Please fill them in.');
      return;
    }

    setSubmitting(true);
    goToStep(STEP_SUBMIT);

    try {
      const payload = {
        crop: selectedCrop,
        farm_size_acres: Number(farmSize) || 1,
        ph:           Number(ph),
        nitrogen:     Number(nitrogen),
        phosphorus:   Number(phosphorus),
        potassium:    Number(potassium),
        organic_carbon: organicCarbon ? Number(organicCarbon) : null,
        language: 'en',
      };

      const response = await submitOCRSoilData(payload);

      if (response.data.success) {
        const { scan_id, advisory } = response.data;
        await saveLastScanId(scan_id);
        navigation.replace('AdvisoryResult', {
          advisory,
          scan_id,
          crop: selectedCrop,
          farmSize: farmSize,
        });
      }
    } catch (err) {
      Alert.alert('Submission Failed', err.message || 'Could not submit. Please try again.');
      goToStep(STEP_CONFIRM);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Soil Card</Text>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              {step === STEP_CAPTURE ? '1/3' : step === STEP_SCAN ? '2/3' : '3/3'}
            </Text>
          </View>
        </View>
        <Text style={styles.headerSub}>
          {step === STEP_CAPTURE 
            ? 'Take a photo of your Soil Health Card to start' 
            : step === STEP_SCAN 
              ? 'Review the photo before reading values' 
              : 'Confirm the extracted values below'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── STEP 1: CAPTURE ─────────────────────────────────────── */}
          {step === STEP_CAPTURE && (
            <View style={styles.stepSection}>
              <Text style={styles.stepTitle}>Step 1 — Take a Photo</Text>
              <Text style={styles.stepSub}>
                Place your Soil Health Card on a flat surface with good lighting and take a clear photo.
              </Text>

              <View style={styles.cameraIllustration}>
                <Text style={styles.cameraEmoji}>📋</Text>
                <Text style={styles.cameraIllustrationText}>Soil Health Card</Text>
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={handleCamera}>
                <Text style={styles.primaryBtnEmoji}>📷</Text>
                <View>
                  <Text style={styles.primaryBtnText}>Open Camera</Text>
                  <Text style={styles.primaryBtnSub}>Take a new photo</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={handleGallery}>
                <Text style={styles.secondaryBtnEmoji}>🖼️</Text>
                <Text style={styles.secondaryBtnText}>Choose from Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.manualBtn}
                onPress={() => navigation.navigate('SoilInput')}
              >
                <Text style={styles.manualBtnText}>Enter values manually instead</Text>
              </TouchableOpacity>

              <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>Tips for best results</Text>
                {[
                  'Good lighting — avoid shadows',
                  'Keep card flat — avoid angles',
                  'All 4 corners visible in frame',
                  'Text must be sharp and focused',
                ].map((tip, i) => (
                  <Text key={i} style={styles.tipItem}>• {tip}</Text>
                ))}
              </View>
            </View>
          )}

          {/* ── STEP 2: SCAN ──────────────────────────────────────────── */}
          {step === STEP_SCAN && (
            <View style={styles.stepSection}>
              <Text style={styles.stepTitle}>Step 2 — Review & Scan</Text>

              {imageUri && (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.imagePreview}
                  resizeMode="contain"
                />
              )}

              {scanning ? (
                <View style={styles.scanningState}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.scanningTitle}>AI is reading your card...</Text>
                  <Text style={styles.scanningSub}>
                    Groq Vision AI is extracting values.{'\n'}This takes 5–15 seconds.
                  </Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleScan}>
                    <Text style={styles.primaryBtnEmoji}>🔍</Text>
                    <View>
                      <Text style={styles.primaryBtnText}>Scan for Values</Text>
                      <Text style={styles.primaryBtnSub}>Extract N, P, K, pH automatically</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => goToStep(STEP_CAPTURE)}>
                    <Text style={styles.secondaryBtnEmoji}>🔄</Text>
                    <Text style={styles.secondaryBtnText}>Retake Photo</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* ── STEP 3: CONFIRM ─────────────────────────────────────── */}
          {(step === STEP_CONFIRM || step === STEP_SUBMIT) && (
            <View style={styles.stepSection}>
              <Text style={styles.stepTitle}>Step 3 — Confirm Values</Text>
              <Text style={styles.stepSub}>
                Review the extracted values. Edit any that look wrong.
              </Text>

              {/* Confidence banner */}
              <View style={[
                styles.confidenceBanner,
                { backgroundColor: confidence >= 60 ? '#EAF7EF' : '#FFF5E6' }
              ]}>
                <Text style={styles.confidenceEmoji}>
                  {confidence >= 60 ? '✅' : '⚠️'}
                </Text>
                <View style={styles.confidenceText}>
                  <Text style={[
                    styles.confidenceTitle,
                    { color: confidence >= 60 ? colors.statusGood : colors.statusWarning }
                  ]}>
                    {confidence >= 60
                      ? `${confidence}% confidence — looks good!`
                      : `${confidence}% confidence — please verify`}
                  </Text>
                  <Text style={styles.confidenceSub}>
                    {confidence >= 60
                      ? 'Most values were detected. Review before submitting.'
                      : 'Some values could not be read. Fill them in manually.'}
                  </Text>
                </View>
              </View>

              {/* Crop selector */}
              <View style={[styles.card, shadows.sm]}>
                <Text style={styles.cardLabel}>Select Crop</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {CROPS.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.cropChip, selectedCrop === c.id && styles.cropChipSelected]}
                      onPress={() => setSelectedCrop(c.id)}
                    >
                      <Text style={styles.cropChipEmoji}>{c.emoji}</Text>
                      <Text style={[
                        styles.cropChipLabel,
                        selectedCrop === c.id && styles.cropChipLabelSelected
                      ]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.farmSizeRow}>
                  <Text style={styles.cardLabel}>Farm Size</Text>
                  <View style={styles.farmSizeInput}>
                    <TextInput
                      style={styles.farmSizeField}
                      value={farmSize}
                      onChangeText={setFarmSize}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 2.5"
                      placeholderTextColor={colors.textMuted}
                    />
                    <Text style={styles.farmSizeUnit}>acres</Text>
                  </View>
                </View>
              </View>

              {/* Extracted values */}
              <View style={[styles.card, shadows.sm]}>
                <Text style={styles.cardLabel}>Extracted Values</Text>
                <EditableField label="pH Level"       value={ph}           onChangeText={setPh}           unit=""       />
                <EditableField label="Nitrogen (N)"   value={nitrogen}     onChangeText={setNitrogen}     unit="kg/ha"  />
                <EditableField label="Phosphorus (P)" value={phosphorus}   onChangeText={setPhosphorus}   unit="kg/ha"  />
                <EditableField label="Potassium (K)"  value={potassium}    onChangeText={setPotassium}    unit="kg/ha"  />
                <EditableField label="Organic Carbon" value={organicCarbon}onChangeText={setOrganicCarbon}unit="%"      />
              </View>

              {/* Raw OCR Text — so user can verify what was read */}
              {rawText ? (
                <View style={[styles.card, shadows.sm]}>
                  <TouchableOpacity
                    style={styles.rawToggleRow}
                    onPress={() => setShowRaw(v => !v)}
                  >
                    <Text style={styles.cardLabel}>What OCR Read</Text>
                    <Text style={styles.rawToggleIcon}>{showRaw ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.rawHint}>
                    Tap to {showRaw ? 'hide' : 'see'} raw text extracted from your card.
                    If values look wrong, check here to understand why.
                  </Text>
                  {showRaw && (
                    <View style={styles.rawTextBox}>
                      <Text style={styles.rawTextContent}>
                        {rawText.slice(0, 1200)}
                        {rawText.length > 1200 ? '\n... (truncated)' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/* Submit button */}
              {step === STEP_SUBMIT ? (
                <View style={styles.submittingState}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.submittingText}>Generating advisory...</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
                    <Text style={styles.submitBtnText}>Get Advisory</Text>
                    <Text style={styles.submitBtnEmoji}>🔬</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => goToStep(STEP_CAPTURE)}
                  >
                    <Text style={styles.secondaryBtnEmoji}>📷</Text>
                    <Text style={styles.secondaryBtnText}>Scan a Different Image</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5', // Off-white mint background
  },

  // Premium Forest Green Header
  header: {
    backgroundColor: '#1B4D3E', // Slate Forest Green
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: fontWeights.extrabold,
  },
  stepBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stepBadgeText: {
    fontSize: 10,
    color: '#15803D',
    fontWeight: fontWeights.extrabold,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 2,
  },

  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  stepSection: {
    gap: spacing.md,
  },

  stepTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#334155',
    marginTop: spacing.xs,
  },
  stepSub: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    lineHeight: 18,
  },

  // Camera illustration
  cameraIllustration: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#16A34A50',
    borderStyle: 'dashed',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cameraEmoji: {
    fontSize: 42,
  },
  cameraIllustrationText: {
    fontSize: fontSizes.sm,
    color: '#166534',
    fontWeight: fontWeights.semibold,
  },

  // Image preview
  imagePreview: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // Scanning state
  scanningState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  scanningTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#1E293B',
  },
  scanningSub: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Submitting state
  submittingState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  submittingText: {
    fontSize: fontSizes.sm,
    color: '#64748B',
    fontWeight: fontWeights.semibold,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: '#1F6E43', // MittiCard brand primary green
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.md,
  },
  primaryBtnEmoji: {
    fontSize: 24,
  },
  primaryBtnText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  primaryBtnSub: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryBtnEmoji: {
    fontSize: 18,
  },
  secondaryBtnText: {
    fontSize: fontSizes.sm,
    color: '#475569',
    fontWeight: fontWeights.bold,
  },
  manualBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  manualBtnText: {
    fontSize: fontSizes.xs,
    color: '#1F6E43',
    fontWeight: fontWeights.bold,
  },

  submitBtn: {
    backgroundColor: '#1F6E43',
    borderRadius: 16,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadows.md,
  },
  submitBtnText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  submitBtnEmoji: {
    fontSize: 20,
  },

  // Tips Card
  tipsCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
  },
  tipsTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#166534',
  },
  tipItem: {
    fontSize: fontSizes.xs,
    color: '#15803D',
    lineHeight: 18,
  },

  // Confidence banner
  confidenceBanner: {
    borderRadius: 16,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  confidenceEmoji: {
    fontSize: 20,
    marginTop: 2,
  },
  confidenceText: {
    flex: 1,
    gap: 2,
  },
  confidenceTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  confidenceSub: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    lineHeight: 16,
  },

  // Card Container (Matches HomeScreen)
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.md,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },

  // Crop chips
  cropChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
    backgroundColor: '#F8FAF9',
  },
  cropChipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
  },
  cropChipEmoji: {
    fontSize: 14,
  },
  cropChipLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: fontWeights.semibold,
  },
  cropChipLabelSelected: {
    color: '#15803D',
    fontWeight: fontWeights.bold,
  },

  // Farm size
  farmSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  farmSizeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FAF9',
  },
  farmSizeField: {
    fontSize: fontSizes.sm,
    color: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 70,
    fontWeight: fontWeights.bold,
  },
  farmSizeUnit: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    paddingRight: spacing.sm,
    fontWeight: fontWeights.semibold,
  },

  // Editable field row
  editField: {
    gap: 6,
    marginBottom: spacing.xs,
  },
  editFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editFieldLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#475569',
  },
  detectedBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  detectedText: {
    fontSize: 9,
    fontWeight: fontWeights.extrabold,
    color: '#15803D',
  },
  missingBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  missingText: {
    fontSize: 9,
    fontWeight: fontWeights.extrabold,
    color: '#B45309',
  },
  editInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAF9',
    overflow: 'hidden',
    height: 46,
  },
  editInputFocused: {
    borderColor: '#1F6E43',
    backgroundColor: '#FFFFFF',
  },
  editInputMissing: {
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
  },
  editInput: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: '#1E293B',
    paddingHorizontal: spacing.md,
    fontWeight: fontWeights.bold,
  },
  editUnit: {
    fontSize: 11,
    color: '#64748B',
    paddingRight: spacing.md,
    fontWeight: fontWeights.semibold,
  },

  // Raw OCR text viewer
  rawToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rawToggleIcon: {
    fontSize: 12,
    color: '#64748B',
  },
  rawHint: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 2,
  },
  rawTextBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: spacing.md,
    maxHeight: 180,
    marginTop: spacing.sm,
  },
  rawTextContent: {
    fontSize: 10,
    color: '#34D399',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 16,
  },
});
