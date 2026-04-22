import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, Platform, ScrollView, KeyboardAvoidingView,
  Animated, ActivityIndicator, Alert, Modal,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { submitSoilData } from '../services/api';
import { saveLastScanId } from '../services/storage';
import { useTranslation } from 'react-i18next';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

const CROPS = [
  { id: 'wheat',     emoji: '\u{1F33E}', label: 'Wheat' },
  { id: 'rice',      emoji: '\u{1F35A}', label: 'Rice' },
  { id: 'maize',     emoji: '\u{1F33D}', label: 'Maize' },
  { id: 'cotton',    emoji: '\u{1F33F}', label: 'Cotton' },
  { id: 'sugarcane', emoji: '\u{1F38B}', label: 'Sugarcane' },
  { id: 'soybean',   emoji: '\u{1FAD8}', label: 'Soybean' },
  { id: 'groundnut', emoji: '\u{1F95C}', label: 'Groundnut' },
];

const REQUIRED = [
  { key: 'ph',         label: 'pH Level',       unit: '',      placeholder: 'e.g. 6.5',  hint: '6.0 – 7.5',  emoji: '\u{1F9EA}' },
  { key: 'nitrogen',   label: 'Nitrogen (N)',    unit: 'kg/ha', placeholder: 'e.g. 180',  hint: '< 140 = Low', emoji: '\u{1F7E1}' },
  { key: 'phosphorus', label: 'Phosphorus (P)',  unit: 'kg/ha', placeholder: 'e.g. 15',   hint: '< 11 = Low',  emoji: '\u{1F7E0}' },
  { key: 'potassium',  label: 'Potassium (K)',   unit: 'kg/ha', placeholder: 'e.g. 120',  hint: '< 108 = Low', emoji: '\u{1F7E3}' },
];
const OPTIONAL = [
  { key: 'organic_carbon', label: 'Organic Carbon', unit: '%',   placeholder: 'e.g. 0.65', emoji: '\u{1F7E4}' },
  { key: 'zinc',           label: 'Zinc',            unit: 'ppm', placeholder: 'e.g. 0.8',  emoji: '\u26AB' },
  { key: 'sulfur',         label: 'Sulfur',          unit: 'ppm', placeholder: 'e.g. 12',   emoji: '\u{1F7E1}' },
  { key: 'iron',           label: 'Iron',            unit: 'ppm', placeholder: 'e.g. 5.2',  emoji: '\u26AB' },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function NutField({ f, value, onChange, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={st.fieldWrap}>
      <View style={st.fieldTop}>
        <Text style={st.fEmoji}>{f.emoji}</Text>
        <Text style={st.fLabel}>{f.label}</Text>
        {f.hint ? <Text style={st.fHint}>{f.hint}</Text> : null}
      </View>
      <View style={[st.inputRow, focused && st.inputFocused, error && st.inputError]}>
        <TextInput
          style={st.input}
          placeholder={f.placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {f.unit ? <Text style={st.unit}>{f.unit}</Text> : null}
      </View>
      {error ? <Text style={st.errorText}>{error}</Text> : null}
    </View>
  );
}

export default function SoilInputScreen({ navigation, route }) {
  const { t, i18n } = useTranslation();
  const prefill = route?.params?.prefill || {};

  const [crop,     setCrop]     = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [sowDate,  setSowDate]  = useState('');
  const [vals,     setVals]     = useState({
    ph: prefill.ph || '', nitrogen: prefill.nitrogen || '',
    phosphorus: prefill.phosphorus || '', potassium: prefill.potassium || '',
    organic_carbon: prefill.organic_carbon || '', zinc: '', sulfur: '', iron: '',
  });
  const [errors,   setErrors]   = useState({});
  const [loading,  setLoading]  = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [pDay,     setPDay]     = useState(new Date().getDate());
  const [pMonth,   setPMonth]   = useState(new Date().getMonth() + 1);
  const [pYear,    setPYear]    = useState(new Date().getFullYear());

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const setVal = (k, v) => {
    setVals(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: null }));
  };

  const confirmDate = () => {
    const iso = `${pYear}-${String(pMonth).padStart(2,'0')}-${String(pDay).padStart(2,'0')}`;
    setSowDate(iso);
    setShowPick(false);
  };

  const validate = () => {
    const e = {};
    if (!crop)                                      e.crop = 'Select a crop';
    if (!farmSize || isNaN(farmSize) || +farmSize<=0) e.farmSize = 'Enter valid farm size';
    ['ph','nitrogen','phosphorus','potassium'].forEach(k => {
      if (!vals[k] || isNaN(vals[k])) e[k] = 'Required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) { Alert.alert('Missing Fields', 'Please fill all required fields.'); return; }
    setLoading(true);
    try {
      const payload = {
        crop, farm_size_acres: +farmSize, sowing_date: sowDate || null,
        ph: +vals.ph, nitrogen: +vals.nitrogen,
        phosphorus: +vals.phosphorus, potassium: +vals.potassium,
        organic_carbon: vals.organic_carbon ? +vals.organic_carbon : null,
        zinc:   vals.zinc   ? +vals.zinc   : null,
        sulfur: vals.sulfur ? +vals.sulfur : null,
        iron:   vals.iron   ? +vals.iron   : null,
        language: i18n.language || 'en',
      };
      const res = await submitSoilData(payload);
      if (res.data?.success) {
        await saveLastScanId(res.data.scan_id);
        navigation.replace('AdvisoryResult', {
          advisory: res.data.advisory, scan_id: res.data.scan_id, crop, farmSize, sowing_date: sowDate || null,
        });
      }
    } catch (err) {
      const msg = err?.status === 401 ? 'Session expired, please login again.'
        : err?.status === 500 ? 'Server error, please try again.'
        : err?.message || 'No connection. Check your internet.';
      Alert.alert('Submission Failed', msg);
    } finally { setLoading(false); }
  };

  const selCrop = CROPS.find(c => c.id === crop);

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <View style={st.header}>
        <View style={st.blob} />
        <View style={st.headerTop}>
          <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()}>
            <Text style={st.backText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.scanShortcut} onPress={() => navigation.navigate('OCR')}>
            <Text style={st.scanShortcutText}>{'\u{1F4F7}'} Scan Card</Text>
          </TouchableOpacity>
        </View>
        <Text style={st.headerTitle}>{'\u{1F52C}'} {t('soil_input.title') || 'Enter Soil Values'}</Text>
        <Text style={st.headerSub}>{t('soil_input.subtitle') || 'Fill in values from your Soil Health Card'}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.ScrollView style={{ opacity: fade }} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* CROP & FARM */}
          <View style={[st.card, shadows.sm]}>
            <Text style={st.secLabel}>CROP & FARM DETAILS</Text>

            <Text style={st.label}>{'\u{1F33E}'} {t('soil_input.crop_label') || 'Select Crop'} <Text style={st.req}>*</Text></Text>
            <TouchableOpacity style={[st.inputRow, errors.crop && st.inputError]} onPress={() => setShowCrop(true)}>
              {selCrop ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Text style={{ fontSize: 20 }}>{selCrop.emoji}</Text>
                  <Text style={{ fontSize: fontSizes.md, fontWeight: fontWeights.semibold, color: colors.textPrimary }}>{selCrop.label}</Text>
                </View>
              ) : (
                <Text style={{ flex: 1, fontSize: fontSizes.md, color: colors.placeholder }}>Tap to select crop…</Text>
              )}
              <Text style={{ color: colors.textMuted }}>{'\u25BE'}</Text>
            </TouchableOpacity>
            {errors.crop ? <Text style={st.errorText}>{errors.crop}</Text> : null}

            {/* Crop chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
              {CROPS.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[st.chip, crop === c.id && st.chipActive]}
                  onPress={() => { setCrop(c.id); setErrors(p => ({ ...p, crop: null })); }}
                >
                  <Text style={{ fontSize: 18, marginRight: 4 }}>{c.emoji}</Text>
                  <Text style={[st.chipText, crop === c.id && st.chipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={st.rowTwo}>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>{t('soil_input.farm_size') || 'Farm Size'} <Text style={st.req}>*</Text></Text>
                <View style={[st.inputRow, errors.farmSize && st.inputError]}>
                  <TextInput style={st.input} placeholder="e.g. 2.5" placeholderTextColor={colors.placeholder}
                    keyboardType="decimal-pad" value={farmSize} onChangeText={v => { setFarmSize(v); setErrors(p => ({ ...p, farmSize: null })); }} />
                  <Text style={st.unit}>acres</Text>
                </View>
                {errors.farmSize ? <Text style={st.errorText}>{errors.farmSize}</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.label}>{'\u{1F4C5}'} Sowing Date</Text>
                <TouchableOpacity style={[st.inputRow, { paddingVertical: 0 }]} onPress={() => setShowPick(true)}>
                  <Text style={[st.input, { paddingVertical: 12 }, !sowDate && { color: colors.placeholder }]}>
                    {sowDate ? `${sowDate.split('-')[2]}/${sowDate.split('-')[1]}/${sowDate.split('-')[0]}` : 'Pick date'}
                  </Text>
                  <Text style={{ fontSize: 18 }}>{'\u{1F4C5}'}</Text>
                </TouchableOpacity>
                <Text style={st.optTag}>optional</Text>
              </View>
            </View>
          </View>

          {/* REQUIRED NUTRIENTS */}
          <View style={[st.card, shadows.sm]}>
            <Text style={st.secLabel}>REQUIRED NUTRIENTS</Text>
            {REQUIRED.map(f => (
              <NutField key={f.key} f={f} value={vals[f.key]} onChange={v => setVal(f.key, v)} error={errors[f.key]} />
            ))}
          </View>

          {/* OPTIONAL NUTRIENTS */}
          <View style={[st.card, shadows.sm]}>
            <Text style={st.secLabel}>OPTIONAL NUTRIENTS <Text style={st.optTag}>(leave blank if not on card)</Text></Text>
            {OPTIONAL.map(f => (
              <NutField key={f.key} f={f} value={vals[f.key]} onChange={v => setVal(f.key, v)} error={errors[f.key]} />
            ))}
          </View>

          {/* SUBMIT */}
          <TouchableOpacity style={[st.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.submitText}>{t('soil_input.submit') || 'Get Advisory'} {'\u{1F52C}'}</Text>}
          </TouchableOpacity>

        </Animated.ScrollView>
      </KeyboardAvoidingView>

      {/* Crop Picker Modal */}
      <Modal visible={showCrop} transparent animationType="slide" onRequestClose={() => setShowCrop(false)}>
        <View style={st.mOverlay}>
          <View style={st.mSheet}>
            <View style={st.mHandle} />
            <Text style={st.mTitle}>Select Crop</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {CROPS.map(c => (
                <TouchableOpacity key={c.id} style={[st.mOption, crop===c.id && st.mOptionActive]}
                  onPress={() => { setCrop(c.id); setShowCrop(false); }}>
                  <Text style={{ fontSize: 24, marginRight: 12 }}>{c.emoji}</Text>
                  <Text style={[st.mOptionText, crop===c.id && { color: colors.primary, fontWeight: fontWeights.bold }]}>{c.label}</Text>
                  {crop===c.id && <Text style={{ color: colors.primary, marginLeft: 'auto', fontWeight: fontWeights.bold }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={showPick} transparent animationType="slide" onRequestClose={() => setShowPick(false)}>
        <View style={st.dpOverlay}>
          <View style={st.dpSheet}>
            <View style={st.dpHandle} />
            <Text style={st.dpTitle}>{'\u{1F4C5}'} Sowing Date</Text>
            <Text style={st.dpSub}>The day you sow / will sow seeds</Text>
            <View style={st.dpCols}>
              <View style={{ flex: 1 }}>
                <Text style={st.dpColLabel}>Day</Text>
                <ScrollView style={st.dpScroll} snapToInterval={44} decelerationRate="fast" showsVerticalScrollIndicator={false}>
                  {Array.from({length:31},(_,i)=>i+1).map(d=>(
                    <TouchableOpacity key={d} style={[st.dpItem, pDay===d&&st.dpActive]} onPress={()=>setPDay(d)}>
                      <Text style={[st.dpText, pDay===d&&st.dpTextActive]}>{String(d).padStart(2,'0')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1.6 }}>
                <Text style={st.dpColLabel}>Month</Text>
                <ScrollView style={st.dpScroll} snapToInterval={44} decelerationRate="fast" showsVerticalScrollIndicator={false}>
                  {MONTHS.map((m,i)=>(
                    <TouchableOpacity key={i} style={[st.dpItem, pMonth===i+1&&st.dpActive]} onPress={()=>setPMonth(i+1)}>
                      <Text style={[st.dpText, pMonth===i+1&&st.dpTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.dpColLabel}>Year</Text>
                <ScrollView style={st.dpScroll} snapToInterval={44} decelerationRate="fast" showsVerticalScrollIndicator={false}>
                  {[2024,2025,2026,2027,2028].map(y=>(
                    <TouchableOpacity key={y} style={[st.dpItem, pYear===y&&st.dpActive]} onPress={()=>setPYear(y)}>
                      <Text style={[st.dpText, pYear===y&&st.dpTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <View style={st.dpPreview}>
              <Text style={st.dpPreviewLabel}>Selected: </Text>
              <Text style={st.dpPreviewDate}>{String(pDay).padStart(2,'0')}/{String(pMonth).padStart(2,'0')}/{pYear}</Text>
            </View>
            <View style={st.dpBtns}>
              <TouchableOpacity style={st.dpCancel} onPress={() => setShowPick(false)}>
                <Text style={st.dpCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.dpConfirm} onPress={confirmDate}>
                <Text style={st.dpConfirmText}>{'\u2713'} Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  backBtn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  backText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  scanShortcut: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  scanShortcutText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  headerTitle: { fontSize: 26, fontWeight: fontWeights.extrabold, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  secLabel: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.md },
  label: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary, marginBottom: 6, marginTop: spacing.sm },
  req: { color: colors.statusPoor },
  optTag: { fontSize: fontSizes.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: 4 },
  inputFocused: { borderColor: colors.borderFocus, backgroundColor: colors.surface },
  inputError: { borderColor: colors.statusPoor, backgroundColor: '#FFF5F5' },
  input: { flex: 1, fontSize: fontSizes.md, color: colors.textPrimary, paddingVertical: Platform.OS === 'ios' ? 14 : 10 },
  unit: { fontSize: fontSizes.sm, color: colors.textMuted, fontWeight: fontWeights.semibold, marginLeft: spacing.xs },
  errorText: { fontSize: fontSizes.xs, color: colors.statusPoor, marginTop: 2 },
  rowTwo: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 7, marginRight: spacing.sm, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSizes.sm, color: colors.textSecondary, fontWeight: fontWeights.medium },
  chipTextActive: { color: '#fff', fontWeight: fontWeights.bold },
  fieldWrap: { marginBottom: spacing.sm },
  fieldTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fEmoji: { fontSize: 18, width: 26 },
  fLabel: { flex: 1, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  fHint: { fontSize: fontSizes.xs, color: colors.textMuted },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 18, alignItems: 'center', ...shadows.md },
  submitText: { fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: '#fff' },
  // Crop modal
  mOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  mSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '70%' },
  mHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  mTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: spacing.md, textAlign: 'center' },
  mOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, marginBottom: 2 },
  mOptionActive: { backgroundColor: colors.primarySurface },
  mOptionText: { fontSize: fontSizes.lg, color: colors.textPrimary, fontWeight: fontWeights.medium },
  // Date picker modal
  dpOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  dpSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.xl, paddingBottom: spacing.xxxl },
  dpHandle: { width: 40, height: 4, backgroundColor: '#DDD', borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  dpTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary, textAlign: 'center', marginBottom: 4 },
  dpSub: { fontSize: fontSizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  dpCols: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  dpColLabel: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  dpScroll: { maxHeight: 176, borderRadius: radius.md, backgroundColor: '#F8FAF9' },
  dpItem: { height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.sm },
  dpActive: { backgroundColor: colors.primary },
  dpText: { fontSize: fontSizes.md, color: colors.textSecondary, fontWeight: fontWeights.medium },
  dpTextActive: { color: '#fff', fontWeight: fontWeights.bold },
  dpPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primarySurface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  dpPreviewLabel: { fontSize: fontSizes.sm, color: colors.textSecondary },
  dpPreviewDate: { fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.primary },
  dpBtns: { flexDirection: 'row', gap: spacing.md },
  dpCancel: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingVertical: spacing.md, alignItems: 'center' },
  dpCancelText: { fontSize: fontSizes.md, color: colors.textSecondary, fontWeight: fontWeights.semibold },
  dpConfirm: { flex: 2, borderRadius: radius.md, backgroundColor: colors.primary, paddingVertical: spacing.md, alignItems: 'center' },
  dpConfirmText: { fontSize: fontSizes.md, color: '#fff', fontWeight: fontWeights.bold },
});
