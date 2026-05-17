import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { submitSoilData } from '../services/api';
import { saveLastScanId } from '../services/storage';
import { useTranslation } from 'react-i18next';

// ─── 7 supported crops (translated via t) ───────────────────────────────────
const getCrops = (t) => [
  { id: 'wheat',     label: t('crops.wheat').replace(/ ?🌾/, ''),     emoji: '🌾' },
  { id: 'rice',      label: t('crops.rice').replace(/ ?🍚/, ''),      emoji: '🍚' },
  { id: 'maize',     label: t('crops.maize').replace(/ ?🌽/, ''),     emoji: '🌽' },
  { id: 'cotton',    label: t('crops.cotton').replace(/ ?🌿/, ''),    emoji: '🌿' },
  { id: 'sugarcane', label: t('crops.sugarcane').replace(/ ?🎋/, ''), emoji: '🎋' },
  { id: 'soybean',   label: t('crops.soybean').replace(/ ?🫘/, ''),   emoji: '🫘' },
  { id: 'groundnut', label: t('crops.groundnut').replace(/ ?🥜/, ''), emoji: '🥜' },
];

// ─── Nutrient input fields (labels translated) ───────────────────────────────
const getFields = (t) => [
  { key: 'ph',             label: t('soil_input.ph'),             unit: '',       placeholder: 'e.g. 6.5',  hint: 'Ideal: 6.0 – 7.5', required: true,  min: 0,  max: 14,   emoji: '⚗️' },
  { key: 'nitrogen',       label: t('soil_input.nitrogen'),       unit: 'kg/ha',  placeholder: 'e.g. 180',  hint: 'Low if < 140',     required: true,  min: 0,  max: 1000, emoji: '🟦' },
  { key: 'phosphorus',     label: t('soil_input.phosphorus'),     unit: 'kg/ha',  placeholder: 'e.g. 15',   hint: 'Low if < 11',      required: true,  min: 0,  max: 200,  emoji: '🟧' },
  { key: 'potassium',      label: t('soil_input.potassium'),      unit: 'kg/ha',  placeholder: 'e.g. 120',  hint: 'Low if < 108',     required: true,  min: 0,  max: 1000, emoji: '🟥' },
  { key: 'organic_carbon', label: t('soil_input.organic_carbon'), unit: '%',      placeholder: 'e.g. 0.65', hint: 'Low if < 0.5%',    required: false, min: 0,  max: 10,   emoji: '🟫' },
  { key: 'zinc',           label: t('soil_input.zinc'),           unit: 'ppm',    placeholder: 'e.g. 0.8',  hint: 'Low if < 0.6',     required: false, min: 0,  max: 50,   emoji: '🔵' },
  { key: 'sulfur',         label: t('soil_input.sulfur'),         unit: 'ppm',    placeholder: 'e.g. 12',   hint: 'Low if < 10',      required: false, min: 0,  max: 100,  emoji: '🟡' },
  { key: 'iron',           label: t('soil_input.iron'),           unit: 'ppm',    placeholder: 'e.g. 5.2',  hint: 'Low if < 4.5',     required: false, min: 0,  max: 100,  emoji: '⚫' },
];

// ─── Crop Picker Modal ────────────────────────────────────────────────────────
function CropPickerModal({ visible, selected, onSelect, onClose, crops, isHindi }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{isHindi ? 'फसल का चयन करें' : 'Select Crop'}</Text>
          {crops.map(crop => (
            <TouchableOpacity
              key={crop.id}
              style={[
                styles.cropOption,
                selected === crop.id && styles.cropOptionSelected,
              ]}
              onPress={() => { onSelect(crop.id); onClose(); }}
            >
              <Text style={styles.cropEmoji}>{crop.emoji}</Text>
              <Text
                style={[
                  styles.cropLabel,
                  selected === crop.id && styles.cropLabelSelected,
                ]}
              >
                {crop.label}
              </Text>
              {selected === crop.id && (
                <Text style={styles.cropCheck}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Single nutrient input row ────────────────────────────────────────────────
function NutrientInput({ field, value, onChange, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrapper}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldEmoji}>{field.emoji}</Text>
        <Text style={styles.fieldLabel}>
          {field.label}
          {field.required && <Text style={styles.required}> *</Text>}
        </Text>
        <Text style={styles.fieldHint}>{field.hint}</Text>
      </View>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          error  && styles.inputRowError,
        ]}
      >
        <TextInput
          style={styles.fieldInput}
          placeholder={field.placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="next"
        />
        {field.unit ? (
          <Text style={styles.unitLabel}>{field.unit}</Text>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// ─── Main SoilInputScreen ─────────────────────────────────────────────────────
export default function SoilInputScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';
  const CROPS        = getCrops(t);
  const NUTRIENT_FIELDS = getFields(t);

  // ── Form state
  const [crop,         setCrop]         = useState('');
  const [farmSize,     setFarmSize]     = useState('');
  const [sowingDate,   setSowingDate]   = useState('');
  const [nutrients,    setNutrients]    = useState({
    ph: '', nitrogen: '', phosphorus: '', potassium: '',
    organic_carbon: '', zinc: '', sulfur: '', iron: '',
  });
  const [errors,       setErrors]       = useState({});
  const [loading,      setLoading]      = useState(false);
  const [showCropPicker, setShowCropPicker] = useState(false);

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fadeAnim]);

  // ── Helpers
  const selectedCrop = CROPS.find(c => c.id === crop);

  const setNutrient = (key, val) => {
    setNutrients(prev => ({ ...prev, [key]: val }));
    // Clear error on change
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }));
  };

  // ── Validation
  const validate = () => {
    const newErrors = {};
    if (!crop) newErrors.crop = t('soil_input.crop_label') + ' ' + t('common.error').toLowerCase();
    if (!farmSize || isNaN(farmSize) || Number(farmSize) <= 0) {
      newErrors.farmSize = t('soil_input.farm_size');
    }
    const requiredKeys = ['ph', 'nitrogen', 'phosphorus', 'potassium'];
    requiredKeys.forEach(key => {
      const val = nutrients[key];
      if (!val || isNaN(val)) {
        newErrors[key] = t('soil_input.error_required').split(',')[0];
      } else {
        const field = NUTRIENT_FIELDS.find(f => f.key === key);
        const num = Number(val);
        if (num < field.min || num > field.max) {
          newErrors[key] = `${field.min} – ${field.max}`;
        }
      }
    });
    ['organic_carbon', 'zinc', 'sulfur', 'iron'].forEach(key => {
      const val = nutrients[key];
      if (val && (isNaN(val) || Number(val) < 0)) {
        newErrors[key] = t('common.error');
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit
  const handleSubmit = async () => {
    if (!validate()) {
      Alert.alert(t('common.error'), t('soil_input.error_required'));
      return;
    }

    setLoading(true);
    try {
      const payload = {
        crop,
        farm_size_acres: Number(farmSize),
        sowing_date: sowingDate || null,
        ph:           Number(nutrients.ph),
        nitrogen:     Number(nutrients.nitrogen),
        phosphorus:   Number(nutrients.phosphorus),
        potassium:    Number(nutrients.potassium),
        organic_carbon: nutrients.organic_carbon ? Number(nutrients.organic_carbon) : null,
        zinc:   nutrients.zinc   ? Number(nutrients.zinc)   : null,
        sulfur: nutrients.sulfur ? Number(nutrients.sulfur) : null,
        iron:   nutrients.iron   ? Number(nutrients.iron)   : null,
        language: i18n.language || 'en',
      };

      const response = await submitSoilData(payload);

      if (response.data.success) {
        const { scan_id, advisory } = response.data;

        // Save scan ID so HomeScreen can load it
        await saveLastScanId(scan_id);

        // Go to Advisory Result screen
        navigation.replace('AdvisoryResult', {
          advisory,
          scan_id,
          crop,
          farmSize,
          sowing_date: sowingDate || null,
        });
      }
    } catch (err) {
      Alert.alert(
        'Submission Failed',
        err.message || 'Could not connect to server. Make sure the backend is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Render
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerBubble} />
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backText}>{isHindi ? '‹ पीछे' : '‹ Back'}</Text>
          </TouchableOpacity>

          {/* OCR shortcut button */}
          <TouchableOpacity
            style={styles.ocrShortcut}
            onPress={() => navigation.navigate('OCR')}
          >
            <Text style={styles.ocrShortcutEmoji}>📷</Text>
            <Text style={styles.ocrShortcutText}>{t('soil_input.scan_card')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.headerTitle}>🔬 {t('soil_input.title')}</Text>
        <Text style={styles.headerSub}>{t('soil_input.subtitle')}</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ── SECTION 1: CROP & FARM ─────────────────────────────── */}
            <View style={[styles.card, shadows.sm]}>
              <Text style={styles.cardTitle}>🌾 {t('soil_input.section_farm')}</Text>

              {/* Quick Demo Auto-Fill buttons */}
              <View style={styles.demoRow}>
                <Text style={styles.demoTitle}>⚡ {isHindi ? 'त्वरित डेमो डेटा भरें:' : 'Quick Auto-Fill Test Data:'}</Text>
                <View style={styles.demoButtons}>
                  <TouchableOpacity
                    style={styles.demoBtn}
                    onPress={() => {
                      setCrop('wheat');
                      setFarmSize('2.5');
                      setSowingDate('15/11/2026');
                      setNutrients({
                        ph: '6.8',
                        nitrogen: '280',
                        phosphorus: '18',
                        potassium: '150',
                        organic_carbon: '0.8',
                        zinc: '1.2',
                        sulfur: '15',
                        iron: '6.0',
                      });
                      setErrors({});
                    }}
                  >
                    <Text style={styles.demoBtnText}>🌱 {isHindi ? 'उपजाऊ मिट्टी' : 'Healthy Soil'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.demoBtn, styles.demoBtnPoor]}
                    onPress={() => {
                      setCrop('wheat');
                      setFarmSize('2.5');
                      setSowingDate('15/11/2026');
                      setNutrients({
                        ph: '5.2',
                        nitrogen: '90',
                        phosphorus: '5',
                        potassium: '65',
                        organic_carbon: '0.35',
                        zinc: '0.4',
                        sulfur: '6',
                        iron: '3.5',
                      });
                      setErrors({});
                    }}
                  >
                    <Text style={[styles.demoBtnText, styles.demoBtnTextPoor]}>🔴 {isHindi ? 'कमजोर मिट्टी' : 'Deficient Soil'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Crop Selector */}
              <Text style={styles.fieldLabel}>
                {t('soil_input.crop_label')} <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.cropSelector, errors.crop && styles.inputRowError]}
                onPress={() => setShowCropPicker(true)}
              >
                {selectedCrop ? (
                  <View style={styles.cropSelectorFilled}>
                    <Text style={styles.cropSelectorEmoji}>{selectedCrop.emoji}</Text>
                    <Text style={styles.cropSelectorLabel}>{selectedCrop.label}</Text>
                  </View>
                ) : (
                  <Text style={styles.cropSelectorPlaceholder}>
                    {t('soil_input.crop_placeholder')}
                  </Text>
                )}
                <Text style={styles.cropSelectorArrow}>▾</Text>
              </TouchableOpacity>
              {errors.crop && <Text style={styles.fieldError}>{errors.crop}</Text>}

              <View style={styles.rowInputs}>
                <View style={[styles.halfField, styles.halfFieldLeft]}>
                  <Text style={styles.fieldLabel}>
                    {t('soil_input.farm_size')} <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={[styles.inputRow, errors.farmSize && styles.inputRowError]}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 2.5"
                      placeholderTextColor={colors.placeholder}
                      keyboardType="decimal-pad"
                      value={farmSize}
                      onChangeText={v => { setFarmSize(v); if (errors.farmSize) setErrors(p => ({...p, farmSize: null})); }}
                    />
                    <Text style={styles.unitLabel}>{t('soil_input.farm_size_unit')}</Text>
                  </View>
                  {errors.farmSize && <Text style={styles.fieldError}>{errors.farmSize}</Text>}
                </View>

                {/* Sowing Date */}
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>{t('soil_input.sowing_date')}</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="DD/MM/YYYY"
                      placeholderTextColor={colors.placeholder}
                      value={sowingDate}
                      onChangeText={(text) => {
                        // Auto-format: insert slashes as user types
                        let cleaned = text.replace(/[^0-9]/g, '');
                        if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
                        let formatted = '';
                        if (cleaned.length > 4) {
                          formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4) + '/' + cleaned.slice(4);
                        } else if (cleaned.length > 2) {
                          formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
                        } else {
                          formatted = cleaned;
                        }
                        setSowingDate(formatted);
                      }}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                  <Text style={styles.optionalTag}>Optional · e.g. 15/06/2026</Text>
                </View>
              </View>
            </View>

            {/* ── SECTION 2: REQUIRED NUTRIENTS ─────────────────────── */}
            <View style={[styles.card, shadows.sm]}>
              <Text style={styles.cardTitle}>📊 {t('soil_input.section_nutrients')}</Text>
              <Text style={styles.cardSub}>{t('soil_input.subtitle')} ({t('soil_input.error_required').split(',')[0]})</Text>
              {NUTRIENT_FIELDS.filter(f => f.required).map(field => (
                <NutrientInput key={field.key} field={field} value={nutrients[field.key]} onChange={v => setNutrient(field.key, v)} error={errors[field.key]} />
              ))}
            </View>

            {/* ── SECTION 3: OPTIONAL NUTRIENTS ─────────────────────── */}
            <View style={[styles.card, shadows.sm]}>
              <Text style={styles.cardTitle}>
                🧪 {t('soil_input.section_nutrients')}{' '}
                <Text style={styles.optionalTag}>optional</Text>
              </Text>
              <Text style={styles.cardSub}>Leave blank if not on your card</Text>
              {NUTRIENT_FIELDS.filter(f => !f.required).map(field => (
                <NutrientInput
                  key={field.key}
                  field={field}
                  value={nutrients[field.key]}
                  onChange={v => setNutrient(field.key, v)}
                  error={errors[field.key]}
                />
              ))}
            </View>

            {/* ── SUBMIT BUTTON ──────────────────────────────────────── */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnLoading]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.88}
            >
              {loading ? (
                <ActivityIndicator color={colors.textOnPrimary} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>{t('soil_input.submit')} 🔬</Text>
              )}
            </TouchableOpacity>

            <Text style={styles.submitHint}>{t('soil_input.submitting')}</Text>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Crop Picker Modal */}
      <CropPickerModal
        visible={showCropPicker}
        selected={crop}
        onSelect={setCrop}
        onClose={() => setShowCropPicker(false)}
        crops={CROPS}
        isHindi={isHindi}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerBubble: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.primaryLight,
    opacity: 0.35,
  },
  backBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  backText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  ocrShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  ocrShortcutEmoji: { fontSize: 14, marginRight: 6 },
  ocrShortcutText: {
    fontSize: fontSizes.xs,
    color: '#fff',
    fontWeight: fontWeights.bold,
  },
  headerTitle: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textOnPrimary,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.7)',
  },

  // KAV + Scroll
  kav: { flex: 1 },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cardSub: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },

  // Crop selector
  cropSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  cropSelectorFilled: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cropSelectorEmoji: { fontSize: 22, marginRight: spacing.sm },
  cropSelectorLabel: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  cropSelectorPlaceholder: {
    fontSize: fontSizes.md,
    color: colors.placeholder,
  },
  cropSelectorArrow: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },

  // Row inputs (farm size + date side by side)
  rowInputs: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  halfField: {
    flex: 1,
  },
  halfFieldLeft: {
    marginRight: spacing.md,
  },

  // Field
  fieldWrapper: {
    marginBottom: spacing.md,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldEmoji: { fontSize: 14, marginRight: spacing.xs },
  fieldLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    flex: 1,
  },
  fieldHint: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  required: {
    color: colors.statusPoor,
    fontWeight: fontWeights.bold,
  },
  optionalTag: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.inputBackground,
    overflow: 'hidden',
  },
  inputRowFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.surface,
  },
  inputRowError: {
    borderColor: colors.statusPoor,
  },
  fieldInput: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontWeight: fontWeights.medium,
  },
  unitLabel: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    paddingRight: spacing.md,
    fontWeight: fontWeights.medium,
  },
  fieldError: {
    fontSize: fontSizes.xs,
    color: colors.statusPoor,
    marginTop: 2,
  },

  // Submit
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.md,
  },
  submitBtnLoading: {
    backgroundColor: colors.primaryLight,
  },
  submitBtnText: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textOnPrimary,
    letterSpacing: 0.5,
  },
  submitBtnEmoji: {
    fontSize: fontSizes.xl,
  },
  submitHint: {
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },

  // Crop Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cropOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  cropOptionSelected: {
    backgroundColor: colors.primary + '18',
  },
  cropEmoji: { fontSize: 24, width: 32, marginRight: spacing.md },
  cropLabel: {
    flex: 1,
    fontSize: fontSizes.lg,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
  },
  cropLabelSelected: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  cropCheck: {
    fontSize: fontSizes.lg,
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  demoRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  demoTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  demoBtn: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBtnPoor: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  demoBtnText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#047857',
  },
  demoBtnTextPoor: {
    color: '#B91C1C',
  },
});
