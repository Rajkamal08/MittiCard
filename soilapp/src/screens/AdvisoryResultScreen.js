import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import Tts from 'react-native-tts';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';

// ─── Score helpers ─────────────────────────────────────────────────────────
const getScoreColor = score => {
  if (score >= 71) return '#4ADE80'; // Minty emerald green
  if (score >= 41) return '#FCD34D'; // Golden warm yellow
  return '#FF8E8E'; // Beautiful soft warm coral rose
};

// getScoreLabel now needs t() — called from inside component
// defined as a helper that takes t as param (same pattern as HomeScreen)
const getScoreLabel = (score, t) => {
  if (score >= 71) return t ? t('advisory.score_excellent') : 'Excellent';
  if (score >= 41) return t ? t('advisory.score_good')      : 'Good';
  return t ? t('advisory.score_poor') : 'Poor';
};

const getScoreEmoji = score => {
  if (score >= 71) return '🟢';
  if (score >= 41) return '🟡';
  return '🔴';
};

// ─── Nutrient status helpers ───────────────────────────────────────────────
const NUTRIENT_LABELS = {
  ph:             { label: 'pH Level',        unit: '' },
  nitrogen:       { label: 'Nitrogen (N)',     unit: ' kg/ha' },
  phosphorus:     { label: 'Phosphorus (P)',   unit: ' kg/ha' },
  potassium:      { label: 'Potassium (K)',    unit: ' kg/ha' },
  organic_carbon: { label: 'Organic Carbon',  unit: '%' },
  zinc:           { label: 'Zinc (Zn)',        unit: ' ppm' },
  sulfur:         { label: 'Sulfur (S)',       unit: ' ppm' },
  iron:           { label: 'Iron (Fe)',         unit: ' ppm' },
};

const STATUS_CONFIG = {
  OK:       { color: colors.statusGood,    bg: '#EAF7EF', icon: 'OK',  label: 'OK' },
  MEDIUM:   { color: colors.statusWarning, bg: '#FFF5E6', icon: 'MED', label: 'Medium' },
  LOW:      { color: colors.statusPoor,    bg: '#FEF0F0', icon: 'LOW', label: 'Low' },
  HIGH:     { color: colors.statusWarning, bg: '#FFF5E6', icon: 'HI',  label: 'High' },
  DEFICIENT:{ color: colors.statusPoor,    bg: '#FEF0F0', icon: 'DEF', label: 'Deficient' },
};

// ─── Build TTS speech string — bilingual ──────────────────────────────────
// Detects i18n.language and speaks in Hindi or English accordingly
const buildSpeechText = (advisory, crop, farmSize) => {
  const isHindi = i18n.language === 'hi';
  const score = advisory.soil_health_score || 0;
  const cropName = crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : '';

  if (isHindi) {
    let speech = `${cropName} की मिट्टी की रिपोर्ट। `;
    speech += `आपका मिट्टी स्वास्थ्य स्कोर ${score} है। `;
    const scoreText = score >= 71 ? 'उत्कृष्ट' : score >= 41 ? 'ठीक-ठाक' : 'खराब';
    speech += `स्वास्थ्य स्थिति: ${scoreText}। `;

    const nutrients = advisory.nutrient_status || {};
    const lowNutrients = Object.entries(nutrients)
      .filter(([, v]) => v.status === 'LOW' || v.status === 'DEFICIENT')
      .map(([k]) => {
        const names = {
          nitrogen:       'नाइट्रोजन',
          phosphorus:     'फॉस्फोरस',
          potassium:      'पोटैशियम',
          organic_carbon: 'कार्बनिक कार्बन',
          zinc:           'जिंक',
          sulfur:         'सल्फर',
          iron:           'आयरन',
          ph:             'पी एच',
        };
        return names[k] || k;
      });

    if (lowNutrients.length > 0) {
      speech += `कम पोषक तत्व: ${lowNutrients.join(', ')}। `;
    } else {
      speech += 'सभी पोषक तत्व सही स्तर पर हैं। ';
    }

    const recs = advisory.recommendations || [];
    if (recs.length > 0) {
      speech += `पहली सिफारिश: ${recs[0].fertilizer} डालें। `;
      speech += `कुल अनुमानित लागत: ${advisory.total_cost_inr} रुपये। `;
    } else {
      speech += 'इस सीजन कोई उर्वरक नहीं चाहिए। आपकी मिट्टी अच्छी है। ';
    }

    speech += 'बेहतर फसल के लिए नियमित मिट्टी जांच करें।';
    return speech;
  }

  // ── English speech ────────────────────────────────────────────────────────
  const scoreText = score >= 71 ? 'Excellent' : score >= 41 ? 'Fair' : 'Poor';
  const recs      = advisory.recommendations || [];
  const totalCost = advisory.total_cost_inr || 0;

  let speech = `Soil health report for ${cropName}. `;
  speech += `Your soil health score is ${score} out of 100. Health status: ${scoreText}. `;

  const nutrients = advisory.nutrient_status || {};
  const lowNutrients = Object.entries(nutrients)
    .filter(([, v]) => v.status === 'LOW' || v.status === 'DEFICIENT')
    .map(([k]) => k.replace('_', ' '));

  if (lowNutrients.length > 0) {
    speech += `Low nutrients found: ${lowNutrients.join(', ')}. `;
  } else {
    speech += 'All nutrients are at healthy levels. ';
  }

  if (recs.length > 0) {
    const top = recs[0];
    speech += `Top recommendation: Apply ${top.fertilizer}. ${top.reason}. `;
    speech += `Quantity needed: ${top.total_qty} for ${farmSize} acres. `;
  } else {
    speech += 'No fertilizers needed this season. Your soil is in excellent condition. ';
  }

  if (totalCost > 0) speech += `Total estimated cost: Rupees ${totalCost}. `;
  speech += 'Scan your soil regularly for best crop yield.';
  return speech;
};

// ─── Read Aloud Button ─────────────────────────────────────────────────────
function ReadAloudButton({ advisory, crop, farmSize }) {
  const { t } = useTranslation();
  const [speaking, setSpeaking] = useState(false);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    const initTts = async () => {
      try {
        // Wait for TTS engine initialization status
        await Tts.getInitStatus();
        
        // Set default language bilingual configuration
        const lang = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
        await Tts.setDefaultLanguage(lang);
        
        // Configure audio settings
        await Tts.setDefaultRate(0.48); // slow rate for clear farm instruction
        await Tts.setDefaultPitch(1.0);
        await Tts.setDucking(true); // lower other background app sounds
        
        setEngineReady(true);
      } catch (err) {
        console.warn('TTS Initialization failed:', err);
        // If Google TTS engine is completely missing, prompt user to install it
        if (err && err.code === 'no_engine') {
          Tts.requestInstallEngine();
        } else {
          // fallback to en-US standard engine
          Tts.setDefaultLanguage('en-US')
            .then(() => setEngineReady(true))
            .catch(() => {});
        }
      }
    };

    initTts();

    // Event listeners
    const finishSub = Tts.addEventListener('tts-finish', () => setSpeaking(false));
    const cancelSub = Tts.addEventListener('tts-cancel', () => setSpeaking(false));
    const errorSub  = Tts.addEventListener('tts-error', (error) => {
      console.warn('TTS Event error:', error);
      setSpeaking(false);
    });

    return () => {
      finishSub.remove();
      cancelSub.remove();
      errorSub.remove();
      Tts.stop();
    };
  }, []);

  const handlePress = useCallback(() => {
    if (speaking) {
      Tts.stop();
      setSpeaking(false);
    } else {
      if (!engineReady) {
        Alert.alert(
          'TTS Engine Setting Up',
          'Please ensure Google Text-to-Speech is enabled in your phone Settings -> Language & Input -> Text-to-Speech output.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      const text = buildSpeechText(advisory, crop, farmSize);
      setSpeaking(true);
      
      // Speak with direct volume configurations
      Tts.speak(text, {
        androidParams: {
          KEY_PARAM_PAN: 0.0,
          KEY_PARAM_VOLUME: 1.0,
          KEY_PARAM_STREAM: 'STREAM_MUSIC',
        }
      });
    }
  }, [speaking, engineReady, advisory, crop, farmSize]);

  return (
    <TouchableOpacity
      style={[styles.ttsBtn, speaking && styles.ttsBtnActive]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <Text style={[styles.ttsBtnText, speaking && styles.ttsBtnTextActive]}>
        {speaking ? t('advisory.stop') : t('advisory.speak')}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Animated Score Ring ───────────────────────────────────────────────────
function ScoreRing({ score }) {
  const color    = getScoreColor(score);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return (
    <Animated.View
      style={[
        styles.scoreRingOuter,
        { borderColor: color, transform: [{ scale: scaleAnim }], opacity: fadeAnim },
      ]}
    >
      <View style={[styles.scoreRingInner, { backgroundColor: color + '22' }]}>
        <Text style={styles.scoreNum}>{score}</Text>
        <Text style={styles.scoreOutOf}>/100</Text>
      </View>
    </Animated.View>
  );
}

// ─── Ideal reference values for each nutrient ─────────────────────────────
const IDEAL_VALUES = {
  ph:             6.5,
  nitrogen:       280,
  phosphorus:     25,
  potassium:      280,
  organic_carbon: 0.75,
  zinc:           1.2,
  sulfur:         20,
  iron:           10,
};

const NUTRIENT_ABBR = {
  nitrogen: 'N', phosphorus: 'P', potassium: 'K',
  organic_carbon: 'OC', ph: 'pH', zinc: 'Zn', sulfur: 'S', iron: 'Fe',
};

// ─── Circular Gauge Ring (% of ideal) ─────────────────────────────────────
function NutrientGauge({ nutrientKey, value, index }) {
  const ideal   = IDEAL_VALUES[nutrientKey] || 1;
  const pct     = value != null ? Math.min(Math.round((value / ideal) * 100), 150) : null;
  const color   = pct == null ? '#ccc'
                : pct >= 90  ? '#40916C'
                : pct >= 50  ? '#F4A261'
                :              '#E63946';
  const abbr    = NUTRIENT_ABBR[nutrientKey] || nutrientKey;
  const meta    = NUTRIENT_LABELS[nutrientKey] || { label: nutrientKey, unit: '' };

  const scaleAnim = useRef(new Animated.Value(0.4)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 7, delay: index * 70, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, index, scaleAnim]);

  return (
    <Animated.View style={{ alignItems: 'center', width: 72, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
      <View style={{
        width: 62, height: 62, borderRadius: 31,
        borderWidth: 5, borderColor: color,
        backgroundColor: color + '15',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color, lineHeight: 16 }}>
          {pct != null ? `${pct}%` : '—'}
        </Text>
        <Text style={{ fontSize: 8, color: '#999', lineHeight: 11 }}>of ideal</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#333', marginTop: 5 }}>{abbr}</Text>
      {value != null && (
        <Text style={{ fontSize: 9, color: '#999', marginTop: 1 }}>
          {value} / {ideal}
        </Text>
      )}
    </Animated.View>
  );
}

// ─── Current vs Ideal Vertical Bar Chart ──────────────────────────────────
function NutrientBarChart({ nutrientStatus }) {
  const BAR_KEYS = [
    { key: 'nitrogen',       label: 'N' },
    { key: 'phosphorus',     label: 'P' },
    { key: 'potassium',      label: 'K' },
    { key: 'organic_carbon', label: 'OC' },
    { key: 'ph',             label: 'pH' },
  ];
  const MAX_H = 110;

  const allVals = BAR_KEYS.flatMap(({ key }) => [
    nutrientStatus[key]?.value || 0,
    IDEAL_VALUES[key] || 0,
  ]);
  const maxVal = Math.max(...allVals, 1);

  const [selectedBar, setSelectedBar] = useState(null);

  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1B2E25', marginBottom: 14 }}>
        📈 Current vs Ideal Levels
      </Text>

      {/* Tooltip */}
      {selectedBar && (
        <View style={{
          backgroundColor: '#1B2E25', borderRadius: 8, padding: 8,
          marginBottom: 10, alignSelf: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{selectedBar.label}</Text>
          <Text style={{ color: '#95D5B2', fontSize: 11 }}>Current: {selectedBar.current ?? '—'}</Text>
          <Text style={{ color: '#D8F3DC', fontSize: 11 }}>Ideal: {selectedBar.ideal}</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: MAX_H + 32, paddingHorizontal: 8 }}>
        {BAR_KEYS.map(({ key, label }) => {
          const current = nutrientStatus[key]?.value;
          const ideal   = IDEAL_VALUES[key] || 1;
          const curH    = current != null ? Math.max(Math.round((current / maxVal) * MAX_H), 4) : 0;
          const idealH  = Math.max(Math.round((ideal / maxVal) * MAX_H), 4);
          const color   = current == null ? '#ddd'
                        : current >= ideal * 0.9 ? '#40916C'
                        : current >= ideal * 0.5 ? '#F4A261'
                        :                          '#E63946';
          return (
            <View key={key} style={{ flex: 1, alignItems: 'center' }}>
              {current != null && (
                <Text style={{ fontSize: 8, color, fontWeight: '700', marginBottom: 2 }}>
                  {current}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
                {/* Ideal bar */}
                <View style={{
                  width: 12, height: idealH,
                  backgroundColor: '#D8F3DC', borderRadius: 3,
                  borderWidth: 1, borderColor: '#52B788',
                }} />
                {/* Current bar — tappable */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => setSelectedBar({ label, current, ideal })}
                >
                  <View style={{
                    width: 12, height: current != null ? curH : 4,
                    backgroundColor: color, borderRadius: 3,
                  }} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 9, color: '#6B8F7A', fontWeight: '600', marginTop: 4 }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E63946' }} />
          <Text style={{ fontSize: 10, color: '#999' }}>Current</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#D8F3DC', borderWidth: 1, borderColor: '#52B788' }} />
          <Text style={{ fontSize: 10, color: '#999' }}>Ideal</Text>
        </View>
      </View>
    </View>
  );
}


// ─── Nutrient Row ──────────────────────────────────────────────────────────
function NutrientRow({ nutrientKey, data, index }) {
  const meta   = NUTRIENT_LABELS[nutrientKey] || { label: nutrientKey, unit: '' };
  const config = STATUS_CONFIG[data.status] || STATUS_CONFIG.OK;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 80, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, index, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.nutrientRow,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
    >
      <View style={[styles.statusIconBox, { backgroundColor: config.bg }]}>
        <Text style={[styles.statusIcon, { color: config.color }]}>{config.icon}</Text>
      </View>
      <View style={styles.nutrientInfo}>
        <Text style={styles.nutrientName}>{meta.label}</Text>
        {data.advice && (
          <Text style={styles.nutrientAdvice}>{data.advice}</Text>
        )}
        {data.ideal && (
          <Text style={styles.nutrientIdeal}>Ideal: {data.ideal}</Text>
        )}
      </View>
      <View style={styles.nutrientRight}>
        <Text style={[styles.nutrientValue, { color: config.color }]}>
          {data.value}{meta.unit}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusBadgeText, { color: config.color }]}>
            {config.label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Fertilizer Card ───────────────────────────────────────────────────────
// ─── Organic Alternatives Mapper ──────────────────────────────────────────
const getOrganicAlternative = (fertilizerName, isHindi) => {
  const name = String(fertilizerName).toUpperCase();
  if (name.includes('UREA')) {
    return isHindi 
      ? '🌿 जैविक विकल्प: नीम खली खाद (20 किलो), गोबर की खाद या केंचुआ खाद (250 किलो) प्रति एकड़ डालें। यह कार्बनिक स्तर बढ़ाता है।'
      : '🌿 Natural Alternatives: Neem Cake manure (20 kg), compost or Vermicompost (250 kg) per acre. Enhances organic carbon naturally.';
  }
  if (name.includes('DAP') || name.includes('SSP') || name.includes('SUPER PHOSPHATE') || name.includes('PHOSPHATE')) {
    return isHindi
      ? '🌿 जैविक विकल्प: हड्डी की खाद (हड्डी का चूरा) (50 किलो) या रॉक फॉस्फेट (75 किलो) प्रति एकड़ डालें। फॉस्फोरस का प्राकृतिक स्रोत।'
      : '🌿 Natural Alternatives: Bone Meal (50 kg) or Rock Phosphate (75 kg) per acre. Excellent natural phosphorus source.';
  }
  if (name.includes('MOP') || name.includes('POTASH') || name.includes('POTASSIUM')) {
    return isHindi
      ? '🌿 जैविक विकल्प: लकड़ी की राख (60 किलो) या केले के छिलके की खाद प्रति एकड़ डालें। पोटैशियम का प्रचुर जैविक स्रोत।'
      : '🌿 Natural Alternatives: Wood Ash (60 kg) or Banana peel compost per acre. Plentiful in organic potassium.';
  }
  if (name.includes('ZINC')) {
    return isHindi
      ? '🌿 जैविक विकल्प: जिंक घोलक बैक्टीरिया (ZSB) से समृद्ध कम्पोस्ट या जैविक कचरा मल्चिंग (Mulching) अपनाएं।'
      : '🌿 Natural Alternatives: Compost enriched with zinc-solubilizing bacteria (ZSB) or dynamic organic mulch.';
  }
  return isHindi
    ? '🌿 जैविक विकल्प: अच्छी तरह सड़ी हुई गोबर की खाद या केंचुआ खाद डालें। यह मिट्टी की जैविक गतिविधि को पुनर्जीवित करता है।'
    : '🌿 Natural Alternatives: Well-rotted Cow dung manure (FYM) or Vermicompost. Restores overall soil biology.';
};

// ─── Fertilizer Card ───────────────────────────────────────────────────────
function FertilizerCard({ rec, index, scaleMultiplier = 1, organicMode = false }) {
  const isHindi = i18n.language === 'hi';
  
  // Use values dynamically calculated based on farm scale
  const totalCost = Math.round((rec.total_cost || 0) * scaleMultiplier);
  const bagsNeeded = Math.round((rec.bags_needed || 0) * scaleMultiplier * 10) / 10;
  
  const originalQtyVal = parseFloat(rec.total_qty);
  let totalQty = rec.total_qty || '—';
  if (!isNaN(originalQtyVal)) {
    const unit = rec.total_qty.replace(originalQtyVal.toString(), '').trim() || ' kg';
    totalQty = `${(Math.round(originalQtyVal * scaleMultiplier * 10) / 10)}${unit}`;
  }

  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 450, delay: index * 100, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 450, delay: index * 100, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, index, slideAnim]);

  const priorityColor = index === 0 ? colors.statusPoor : index === 1 ? colors.statusWarning : colors.statusGood;
  const priorityLabel = index === 0 
    ? (isHindi ? '🔥 उच्च' : '🔥 High') 
    : index === 1 
      ? (isHindi ? '⚡ मध्यम' : '⚡ Medium') 
      : (isHindi ? '✅ निम्न' : '✅ Low');

  return (
    <Animated.View
      style={[
        styles.fertCard,
        shadows.sm,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Priority ribbon */}
      <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20', borderColor: priorityColor }]}>
        <Text style={[styles.priorityText, { color: priorityColor }]}>
          {priorityLabel} {isHindi ? 'प्राथमिकता' : 'Priority'}
        </Text>
      </View>

      {/* Fertilizer name + reason */}
      <Text style={styles.fertName}>{rec.fertilizer}</Text>
      <Text style={styles.fertReason}>{rec.reason}</Text>

      {/* Stats row */}
      <View style={styles.fertStatsRow}>
        <View style={styles.fertStat}>
          <Text style={styles.fertStatValue} numberOfLines={1} adjustsFontSizeToFit>{totalQty}</Text>
          <Text style={styles.fertStatLabel}>{isHindi ? 'कुल मात्रा' : 'total qty'}</Text>
        </View>
        <View style={styles.fertStatDivider} />
        <View style={styles.fertStat}>
          <Text style={styles.fertStatValue} numberOfLines={1} adjustsFontSizeToFit>{bagsNeeded}</Text>
          <Text style={styles.fertStatLabel}>{rec.bag_size || (isHindi ? 'बोरी' : 'bags')}</Text>
        </View>
        <View style={styles.fertStatDivider} />
        <View style={styles.fertStat}>
          <Text style={[styles.fertStatValue, styles.fertCost]} numberOfLines={1} adjustsFontSizeToFit>
            {'₹'}{totalCost.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.fertStatLabel}>{isHindi ? 'अनुमानित लागत' : 'estimated'}</Text>
        </View>
      </View>

      {/* Organic alternative box */}
      {organicMode && (
        <View style={styles.organicBox}>
          <Text style={styles.organicText}>
            {getOrganicAlternative(rec.fertilizer, isHindi)}
          </Text>
        </View>
      )}

      {/* Application note */}
      {rec.application_note && (
        <View style={styles.appNoteBox}>
          <Text style={styles.appNoteText}>📌 {rec.application_note}</Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main AdvisoryResultScreen ─────────────────────────────────────────────
export default function AdvisoryResultScreen({ navigation, route }) {
  const { advisory, scan_id, crop, farmSize, sowing_date } = route.params || {};
  const { t } = useTranslation();
  const isHindi = i18n.language === 'hi';

  const farmSizeNum  = Number(farmSize) || 1;
  const [liveFarmSize, setLiveFarmSize] = useState(farmSizeNum);
  const [organicMode, setOrganicMode] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const [nutrientTab, setNutrientTab] = useState('chart'); // 'chart' | 'gauges'
  const [deductionsExpanded, setDeductionsExpanded] = useState(false);

  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [headerFade]);

  if (!advisory) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorTitle}>No advisory data</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.errorBtn}>
          <Text style={styles.errorBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const score        = advisory.soil_health_score || 0;
  const nutrientKeys = Object.keys(advisory.nutrient_status || {});
  const recs         = advisory.recommendations || [];
  const cropLabel    = crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : 'Crop';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBubble} />

          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>‹ Home</Text>
          </TouchableOpacity>

          <Animated.View style={[styles.headerContent, { opacity: headerFade }]}>
            {/* Score ring */}
            <ScoreRing score={score} />

            {/* Score label */}
            <View style={styles.scoreMeta}>
              <View style={[
                styles.scoreLabelBadge, 
                { 
                  backgroundColor: 'rgba(255, 255, 255, 0.16)',
                  borderColor: 'rgba(255, 255, 255, 0.28)',
                  borderWidth: 1.2,
                }
              ]}>
                <Text style={[
                  styles.scoreLabelText, 
                  { 
                    color: '#FFFFFF' 
                  }
                ]}>
                  {getScoreEmoji(score)} {getScoreLabel(score, t)} {t('advisory.score_label')}
                </Text>
              </View>
              <Text style={styles.cropLine}>
                🌾 {cropLabel} · {farmSizeNum} acres
              </Text>
              <Text style={styles.scanIdLine}>
                Scan #{String(scan_id).slice(0, 8).toUpperCase()}
              </Text>
            </View>
          </Animated.View>

          {/* Read Aloud Button */}
          <ReadAloudButton advisory={advisory} crop={crop} farmSize={farmSizeNum} />
        </View>

        <View style={styles.body}>

          {/* ── NUTRIENT SEGMENTED CONTROL DASHBOARD ────────────────── */}
          <View style={[styles.section, shadows.sm]}>
            <View style={styles.tabHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>
                  {isHindi ? '🎯 पोषक तत्व डैशबोर्ड' : '🎯 Nutrient Dashboard'}
                </Text>
                <Text style={styles.sectionSub}>
                  {nutrientTab === 'chart' 
                    ? (isHindi ? 'वास्तविक बनाम आदर्श मिट्टी मूल्यों की तुलना' : 'Comparison of actual vs ideal soil values') 
                    : (isHindi ? 'आदर्श स्तरों के प्रतिशत के रूप में पोषक मूल्य' : 'Soil nutrient values as % of ideal levels')}
                </Text>
              </View>
            </View>

            {/* Segmented Control Bar */}
            <View style={styles.segmentBar}>
              <TouchableOpacity 
                style={[styles.segmentBtn, nutrientTab === 'chart' && styles.segmentBtnActive]}
                onPress={() => setNutrientTab('chart')}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentBtnText, nutrientTab === 'chart' && styles.segmentBtnTextActive]}>
                  {isHindi ? '📊 तुलनात्मक ग्राफ़' : '📊 Visual Trends'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.segmentBtn, nutrientTab === 'gauges' && styles.segmentBtnActive]}
                onPress={() => setNutrientTab('gauges')}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentBtnText, nutrientTab === 'gauges' && styles.segmentBtnTextActive]}>
                  {isHindi ? '🎯 आदर्श प्रतिशत' : '🎯 Ideal Gauges'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Contents */}
            {nutrientTab === 'chart' ? (
              <View style={{ marginTop: 6 }}>
                <NutrientBarChart nutrientStatus={advisory.nutrient_status || {}} />
              </View>
            ) : (
              <View style={{ marginTop: 6 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 2, paddingBottom: 6 }}>
                    {nutrientKeys.map((key, i) => {
                      const val = advisory.nutrient_status[key]?.value;
                      if (!IDEAL_VALUES[key]) return null;
                      return (
                        <NutrientGauge
                          key={key}
                          nutrientKey={key}
                          value={val}
                          index={i}
                        />
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>

          {/* ── SCORE DEDUCTIONS ACCORDION CARD ────────────────────── */}
          {advisory.score_deductions?.length > 0 && (
            <TouchableOpacity 
              style={[
                styles.deductionsCard, 
                shadows.sm,
                deductionsExpanded && { paddingBottom: spacing.lg }
              ]}
              onPress={() => setDeductionsExpanded(!deductionsExpanded)}
              activeOpacity={0.92}
            >
              <View style={styles.deductionsHeaderRow}>
                <Text style={styles.deductionsTitle}>
                  {isHindi 
                    ? `📉 स्वास्थ्य स्कोर ${score}/100 क्यों है?` 
                    : `📉 Why your score is ${score}/100`}
                </Text>
                <Text style={styles.deductionsArrow}>
                  {deductionsExpanded 
                    ? (isHindi ? '▲ बंद करें' : '▲ Collapse') 
                    : (isHindi ? '▼ विवरण देखें' : '▼ View Details')}
                </Text>
              </View>

              {deductionsExpanded && (
                <View style={styles.deductionsExpandedList}>
                  <View style={styles.deductionsDivider} />
                  {advisory.score_deductions.map((d, idx) => (
                    <View key={idx} style={styles.deductionItemRow}>
                      <View style={styles.deductionBullet}>
                        <Text style={styles.deductionBulletText}>⚠️</Text>
                      </View>
                      <View style={styles.deductionTextCol}>
                        <Text style={styles.deductionFactorText}>{d.factor}</Text>
                        <Text style={styles.deductionIssueText}>{d.issue}</Text>
                      </View>
                      <View style={styles.penaltyBadge}>
                        <Text style={styles.penaltyBadgeText}>-{d.penalty} pts</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* ── NUTRIENT STATUS ─────────────────────────────────────── */}
          <View style={[styles.section, shadows.sm]}>
            <Text style={styles.sectionTitle}>📊 {t('advisory.section_status')}</Text>
            <Text style={styles.sectionSub}>{t('advisory.score_label')} — {cropLabel}</Text>
            {nutrientKeys.map((key, i) => (
              <NutrientRow
                key={key}
                nutrientKey={key}
                data={advisory.nutrient_status[key]}
                index={i}
              />
            ))}
          </View>


          {/* ── SMART FERTILIZER & COST PLAN ────────────────────────── */}
          {recs.length > 0 ? (
            <View style={styles.planContainer}>
              <View style={styles.planHeader}>
                <View style={styles.planTitleRow}>
                  <Text style={styles.planTitle}>🌾 {isHindi ? 'उर्वरक एवं लागत योजना' : 'Fertilizer & Cost Plan'}</Text>
                  
                  {/* Organic Toggle Pill */}
                  <TouchableOpacity 
                    onPress={() => setOrganicMode(!organicMode)}
                    style={[styles.organicToggleBtn, organicMode && styles.organicToggleBtnActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.organicToggleText, organicMode && styles.organicToggleTextActive]}>
                      🌿 {isHindi ? 'जैविक' : 'Organic'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Farm Size Live Calculator Stepper Panel */}
                <View style={styles.stepperContainer}>
                  <Text style={styles.stepperLabel}>
                    {isHindi ? '📊 खेत का आकार:' : '📊 Farm Size:'}
                  </Text>
                  <View style={styles.stepperActions}>
                    <TouchableOpacity
                      onPress={() => setLiveFarmSize(prev => Math.max(0.5, prev - 0.5))}
                      style={styles.stepperBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.stepperValueContainer}>
                      <Text style={styles.stepperValue}>{liveFarmSize}</Text>
                      <Text style={styles.stepperUnit}>{isHindi ? 'एकड़' : 'acres'}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setLiveFarmSize(prev => Math.min(50, prev + 0.5))}
                      style={styles.stepperBtn}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Fertilizer Recommendation Cards */}
              <View style={styles.planList}>
                {recs.map((rec, i) => (
                  <FertilizerCard
                    key={i}
                    rec={rec}
                    index={i}
                    scaleMultiplier={liveFarmSize / farmSizeNum}
                    organicMode={organicMode}
                  />
                ))}
              </View>

              {/* Budget priority tip */}
              {advisory.budget_tip && (
                <View style={styles.budgetTipCard}>
                  <Text style={styles.budgetTipIcon}>💡</Text>
                  <View style={styles.budgetTipText}>
                    <Text style={styles.budgetTipTitle}>{t('advisory.section_budget_tip')}</Text>
                    <Text style={styles.budgetTipBody}>{advisory.budget_tip}</Text>
                    
                    {/* Agricultural savings bullets */}
                    <View style={styles.budgetBulletList}>
                      <Text style={styles.budgetBullet}>
                        • {isHindi 
                          ? 'सहकारी खरीद: यूरिया/डीएपी को नजदीकी सहकारी समितियों से थोक में (50kg बैग) खरीदने से परिवहन लागत में 10% की अतिरिक्त बचत होगी।' 
                          : 'Cooperative Benefit: Buying Urea/DAP in bulk (50kg bags) from local co-ops saves up to 10% on transport.'}
                      </Text>
                      <Text style={styles.budgetBullet}>
                        • {isHindi 
                          ? 'सरकारी सब्सिडी: पीएम-किसान योजना के तहत स्थानीय उर्वरक केंद्रों पर सब्सिडी दरों की उपलब्धता की जांच करना सुनिश्चित करें।' 
                          : 'Subsidy Alert: Verify subsidized rates under PM-KISAN at licensed centers for direct reimbursement benefit.'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Invoice styled Total Cost Banner */}
              <View style={styles.totalCostCard}>
                <View style={styles.totalCostLeft}>
                  <Text style={styles.totalCostLabel}>{t('advisory.total_cost')}</Text>
                  <Text style={styles.totalCostSub}>
                    {liveFarmSize} {t('soil_input.farm_size_unit')} {isHindi ? 'के लिए कुल' : 'total estimation'}
                  </Text>
                </View>
                <Text style={styles.totalCostValue}>
                  ₹{Math.round((advisory.total_cost_inr || 0) * (liveFarmSize / farmSizeNum)).toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.section, styles.goodSoilCard]}>
              <Text style={styles.goodSoilEmoji}>🎉</Text>
              <Text style={styles.goodSoilTitle}>{t('advisory.no_recommendations')}</Text>
              <Text style={styles.goodSoilSub}>{t('advisory.score_excellent')} — {t('advisory.score_label')}</Text>
            </View>
          )}

          {/* ── ACTION BUTTONS ──────────────────────────────────────── */}
          <View style={styles.actionBtns}>
            {/* Crop Calendar */}
            <TouchableOpacity
              style={styles.calendarBtn}
              onPress={() => navigation.navigate('CropCalendar', {
                scan_id,
                advisory: { ...advisory, sowing_date: sowing_date || null },
              })}
              activeOpacity={0.88}
            >
              <Text style={styles.calendarBtnEmoji}>📅</Text>
              <View>
                <Text style={styles.calendarBtnTitle}>{t('advisory.view_calendar')}</Text>
                <Text style={styles.calendarBtnSub}>
                  {advisory.crop_calendar?.length || 0} events scheduled
                </Text>
              </View>
              <Text style={styles.calendarBtnArrow}>{'>'}</Text>
            </TouchableOpacity>

            {/* Scan Again */}
            <TouchableOpacity
              style={styles.scanAgainBtn}
              onPress={() => navigation.navigate('SoilInput')}
            >
              <Text style={styles.scanAgainText}>🔄 {t('home.scan_card')}</Text>
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Error state
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary },
  errorBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  errorBtnText: { color: '#fff', fontWeight: fontWeights.bold },

  // Premium Forest Green Header
  header: {
    backgroundColor: '#1B4D3E', // Sleek forest green theme
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerBubble: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: spacing.md,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },

  // Score ring
  scoreRingOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  scoreRingInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 30,
    fontWeight: fontWeights.extrabold,
    color: '#FFFFFF', // Clean readable white
    lineHeight: 34,
  },
  scoreOutOf: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: fontWeights.semibold,
  },

  // Score meta
  scoreMeta: { flex: 1, gap: spacing.sm },
  scoreLabelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreLabelText: {
    fontSize: fontSizes.xs + 1,
    fontWeight: fontWeights.extrabold,
  },
  cropLine: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  scanIdLine: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },

  // Body
  body: {
    marginTop: -spacing.xl,
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // Section card
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  sectionSub: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: -spacing.xs,
  },

  // Nutrient row
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extrabold,
  },
  nutrientInfo: { flex: 1, gap: 2 },
  nutrientName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  nutrientAdvice: {
    fontSize: fontSizes.xs,
    color: colors.statusPoor,
    fontStyle: 'italic',
  },
  nutrientIdeal: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  nutrientRight: { alignItems: 'flex-end', gap: 4 },
  nutrientValue: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },

  // Good soil card
  goodSoilCard: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  goodSoilEmoji: { fontSize: 48 },
  goodSoilTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.statusGood,
  },
  goodSoilSub: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Fertilizer card
  fertCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  priorityText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fertName: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
  },
  fertReason: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  fertStatsRow: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  fertStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  fertStatValue: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
  },
  fertCost: { color: colors.primary },
  fertStatLabel: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  fertStatDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  appNoteBox: {
    backgroundColor: '#FFF8EC',
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    marginTop: spacing.xs,
  },
  appNoteText: {
    fontSize: fontSizes.sm,
    color: '#7A5200',
    lineHeight: 20,
  },

  // Budget tip
  budgetTipCard: {
    backgroundColor: '#FFF8EC',
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  budgetTipIcon: { fontSize: 28 },
  budgetTipText: { flex: 1, gap: 4 },
  budgetTipTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#7A5200',
  },
  budgetTipBody: {
    fontSize: fontSizes.sm,
    color: '#7A6030',
    lineHeight: 20,
  },
  budgetBulletList: {
    marginTop: spacing.sm,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#FFEBD0',
    paddingTop: spacing.sm,
  },
  budgetBullet: {
    fontSize: fontSizes.xs + 1,
    color: '#8A6020',
    lineHeight: 18,
    fontWeight: fontWeights.semibold,
  },

  // Total cost
  totalCostCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A', // Money green border
    ...shadows.sm,
  },
  totalCostLeft: { gap: 2 },
  totalCostLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  totalCostSub: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    fontWeight: fontWeights.semibold,
  },
  totalCostValue: {
    fontSize: 28,
    fontWeight: fontWeights.extrabold,
    color: '#15803D', // Beautiful rich Money green
  },

  // Smart Plan Group Container
  planContainer: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#EAF7EF',
    backgroundColor: '#F6FCF8',
  },
  planHeader: {
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: spacing.md,
  },
  planTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planTitle: {
    fontSize: fontSizes.lg - 2,
    fontWeight: fontWeights.extrabold,
    color: colors.primaryDark,
    flex: 1,
    marginRight: spacing.sm,
  },
  
  // Organic Toggle Switch Pill
  organicToggleBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#D8F3DC',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    ...shadows.sm,
  },
  organicToggleBtnActive: {
    backgroundColor: '#D8F3DC',
    borderColor: '#52B788',
  },
  organicToggleText: {
    fontSize: fontSizes.xs + 1,
    fontWeight: fontWeights.bold,
    color: '#52B788',
  },
  organicToggleTextActive: {
    color: '#1B4332',
  },

  // Live farm size stepper panel
  stepperContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: '#EAF7EF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    ...shadows.sm,
  },
  stepperLabel: {
    fontSize: fontSizes.xs + 1,
    fontWeight: fontWeights.bold,
    color: '#475569',
  },
  stepperActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.inputBackground,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtnText: {
    fontSize: 20,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  stepperValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    minWidth: 46,
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: fontSizes.md + 1,
    fontWeight: fontWeights.extrabold,
    color: colors.primaryDark,
  },
  stepperUnit: {
    fontSize: 10,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },

  // Organic alternative box inside Fertilizer Card
  organicBox: {
    backgroundColor: '#EBFCEF',
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 3.5,
    borderLeftColor: '#2D6A4F',
    marginTop: spacing.xs,
  },
  organicText: {
    fontSize: fontSizes.sm - 0.5,
    color: '#1B4332',
    lineHeight: 18,
    fontWeight: fontWeights.semibold,
  },
  planList: {
    gap: spacing.md,
  },

  // Segmented Control Tabs
  tabHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: colors.inputBackground,
    borderRadius: radius.md,
    padding: 3,
    gap: 4,
    marginTop: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  segmentBtnText: {
    fontSize: fontSizes.xs + 1,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  segmentBtnTextActive: {
    color: colors.primaryDark,
  },

  // Score Deductions Accordion Card
  deductionsCard: {
    backgroundColor: '#FFF5F5', // Soft crimson red background
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#FFE3E3',
    borderLeftWidth: 5,
    borderLeftColor: '#EF4444', // Crimson left border
  },
  deductionsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deductionsTitle: {
    fontSize: fontSizes.sm + 1,
    fontWeight: fontWeights.bold,
    color: '#991B1B', // Rich dark readable red
  },
  deductionsArrow: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extrabold,
    color: '#B91C1C',
  },
  deductionsExpandedList: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  deductionsDivider: {
    height: 1,
    backgroundColor: '#FEE2E2',
  },
  deductionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deductionBullet: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deductionBulletText: {
    fontSize: 13,
  },
  deductionTextCol: {
    flex: 1,
    gap: 1,
  },
  deductionFactorText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#7F1D1D',
  },
  deductionIssueText: {
    fontSize: fontSizes.xs,
    color: '#991B1B',
    lineHeight: 16,
    fontWeight: fontWeights.medium,
  },
  penaltyBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.22)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  penaltyBadgeText: {
    fontSize: 10,
    fontWeight: fontWeights.extrabold,
    color: '#DC2626',
  },

  // Action buttons
  actionBtns: { gap: spacing.md },
  calendarBtn: {
    backgroundColor: '#1F6E43', // Forest green
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.md,
  },
  calendarBtnEmoji: { fontSize: 24 },
  calendarBtnTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  calendarBtnSub: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: fontWeights.medium,
  },
  calendarBtnArrow: {
    fontSize: fontSizes.lg,
    color: '#FFFFFF',
    fontWeight: fontWeights.bold,
    marginLeft: 'auto',
  },
  scanAgainBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanAgainText: {
    fontSize: fontSizes.sm,
    color: '#475569',
    fontWeight: fontWeights.bold,
  },

  // TTS Read Aloud button
  ttsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  ttsBtnActive: {
    backgroundColor: 'rgba(220,53,69,0.85)',
    borderColor: 'rgba(220,53,69,0.5)',
  },
  ttsBtnEmoji: { fontSize: 16 },
  ttsBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: 'rgba(255,255,255,0.9)',
  },
  ttsBtnTextActive: {
    color: '#fff',
  },
});
