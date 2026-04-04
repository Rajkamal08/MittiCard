import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Tts from 'react-native-tts';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';

// ─── Score helpers ─────────────────────────────────────────────────────────
const getScoreColor = score => {
  if (score >= 71) return colors.statusGood;
  if (score >= 41) return colors.statusFair;
  return colors.statusPoor;
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

  useEffect(() => {
    // Set TTS language based on user's chosen language
    // hi-IN = Hindi voice, en-IN = English (Indian accent)
    const lang = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
    Tts.setDefaultLanguage(lang).catch(() => {
      Tts.setDefaultLanguage('en-US').catch(() => {});
    });
    Tts.setDefaultRate(0.5);   // Slow — easier for farmers to follow
    Tts.setDefaultPitch(1.0);

    const finishSub = Tts.addEventListener('tts-finish', () => setSpeaking(false));
    const cancelSub = Tts.addEventListener('tts-cancel', () => setSpeaking(false));
    return () => {
      finishSub.remove();
      cancelSub.remove();
      Tts.stop();
    };
  }, []);

  const handlePress = useCallback(() => {
    if (speaking) {
      Tts.stop();
      setSpeaking(false);
    } else {
      const text = buildSpeechText(advisory, crop, farmSize);
      setSpeaking(true);
      Tts.speak(text);
    }
  }, [speaking, advisory, crop, farmSize]);

  return (
    <TouchableOpacity
      style={[styles.ttsBtn, speaking && styles.ttsBtnActive]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <Text style={styles.ttsBtnEmoji}>{speaking ? '⏹' : '🔊'}</Text>
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
  }, []);

  return (
    <Animated.View
      style={[
        styles.scoreRingOuter,
        { borderColor: color, transform: [{ scale: scaleAnim }], opacity: fadeAnim },
      ]}
    >
      <View style={[styles.scoreRingInner, { backgroundColor: color + '22' }]}>
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={[styles.scoreOutOf, { color }]}>/100</Text>
      </View>
    </Animated.View>
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
  }, []);

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
function FertilizerCard({ rec, index }) {
  // Use values already calculated by backend costCalculator.js
  // Fields: total_qty ("87.5 kg"), bags_needed (number), total_cost (number)
  const totalCost = rec.total_cost || 0;
  const bagsNeeded = rec.bags_needed || 0;
  const totalQty  = rec.total_qty  || '—';

  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 450, delay: index * 100, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 450, delay: index * 100, useNativeDriver: true }),
    ]).start();
  }, []);

  const priorityColor = index === 0 ? colors.statusPoor : index === 1 ? colors.statusWarning : colors.statusGood;
  const priorityLabel = index === 0 ? '🔥 High' : index === 1 ? '⚡ Medium' : '✅ Low';

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
          {priorityLabel} Priority
        </Text>
      </View>

      {/* Fertilizer name + reason */}
      <Text style={styles.fertName}>{rec.fertilizer}</Text>
      <Text style={styles.fertReason}>{rec.reason}</Text>

      {/* Stats row */}
      <View style={styles.fertStatsRow}>
        <View style={styles.fertStat}>
          <Text style={styles.fertStatValue} numberOfLines={1} adjustsFontSizeToFit>{totalQty}</Text>
          <Text style={styles.fertStatLabel}>total qty</Text>
        </View>
        <View style={styles.fertStatDivider} />
        <View style={styles.fertStat}>
          <Text style={styles.fertStatValue} numberOfLines={1} adjustsFontSizeToFit>{bagsNeeded}</Text>
          <Text style={styles.fertStatLabel}>{rec.bag_size || 'bags'}</Text>
        </View>
        <View style={styles.fertStatDivider} />
        <View style={styles.fertStat}>
          <Text style={[styles.fertStatValue, styles.fertCost]} numberOfLines={1} adjustsFontSizeToFit>
            {'₹'}{totalCost.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.fertStatLabel}>estimated</Text>
        </View>
      </View>

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

  const headerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

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
  const scoreColor   = getScoreColor(score);
  const nutrientKeys = Object.keys(advisory.nutrient_status || {});
  const recs         = advisory.recommendations || [];
  const farmSizeNum  = Number(farmSize) || 1;
  const cropLabel    = crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : 'Crop';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: scoreColor }]}>
          <View style={styles.headerBubble} />

          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            style={styles.backBtn}
          >
          <Text style={styles.backText}>Home</Text>
          </TouchableOpacity>

          <Animated.View style={[styles.headerContent, { opacity: headerFade }]}>
            {/* Score ring */}
            <ScoreRing score={score} />

            {/* Score label */}
            <View style={styles.scoreMeta}>
              <View style={[styles.scoreLabelBadge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={styles.scoreLabelText}>
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

          {/* ── FERTILIZER RECOMMENDATIONS ──────────────────────────── */}
          {recs.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🧪 {t('advisory.section_recommendations')}</Text>
              <Text style={styles.sectionSub}>
                {farmSizeNum} {t('soil_input.farm_size_unit')} · {t('advisory.per_acre')}
              </Text>
              {recs.map((rec, i) => (
                <FertilizerCard
                  key={i}
                  rec={rec}
                  index={i}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.section, styles.goodSoilCard]}>
              <Text style={styles.goodSoilEmoji}>🎉</Text>
              <Text style={styles.goodSoilTitle}>{t('advisory.no_recommendations')}</Text>
              <Text style={styles.goodSoilSub}>{t('advisory.score_excellent')} — {t('advisory.score_label')}</Text>
            </View>
          )}

          {/* ── BUDGET PRIORITY TIP ─────────────────────────────────── */}
          {advisory.budget_tip && recs.length > 0 && (
            <View style={styles.budgetTipCard}>
              <Text style={styles.budgetTipIcon}>💰</Text>
              <View style={styles.budgetTipText}>
                <Text style={styles.budgetTipTitle}>{t('advisory.section_budget_tip')}</Text>
                <Text style={styles.budgetTipBody}>{advisory.budget_tip}</Text>
              </View>
            </View>
          )}

          {/* ── TOTAL COST BANNER ───────────────────────────────────── */}
          <View style={[styles.totalCostCard, { borderColor: scoreColor }]}>
            <View style={styles.totalCostLeft}>
              <Text style={styles.totalCostLabel}>{t('advisory.total_cost')}</Text>
              <Text style={styles.totalCostSub}>
                {farmSizeNum} {t('soil_input.farm_size_unit')}
              </Text>
            </View>
            <Text style={[styles.totalCostValue, { color: scoreColor }]}>
              ₹{(advisory.total_cost_inr || 0).toLocaleString('en-IN')}
            </Text>
          </View>

          {/* ── SCORE DEDUCTIONS (viva detail) ──────────────────────── */}
          {advisory.score_deductions?.length > 0 && (
            <View style={styles.deductionsCard}>
              <Text style={styles.deductionsTitle}>📉 Why your score is {score}/100</Text>
              {advisory.score_deductions.map((d, i) => (
                <Text key={i} style={styles.deductionItem}>
                  • {d.factor}: {d.issue} (-{d.penalty} pts)
                </Text>
              ))}
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

  // Header (color changes based on score)
  header: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  headerBubble: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  backBtn: { marginBottom: spacing.md },
  backText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },

  // Score ring
  scoreRingOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  scoreRingInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNum: {
    fontSize: 32,
    fontWeight: fontWeights.extrabold,
    color: '#fff',
    lineHeight: 36,
  },
  scoreOutOf: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: fontWeights.semibold,
  },

  // Score meta
  scoreMeta: { flex: 1, gap: spacing.sm },
  scoreLabelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  scoreLabelText: {
    color: '#fff',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  cropLine: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  scanIdLine: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: fontSizes.xs,
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

  // Total cost
  totalCostCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    ...shadows.sm,
  },
  totalCostLeft: { gap: 2 },
  totalCostLabel: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  totalCostSub: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  totalCostValue: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.extrabold,
  },

  // Score deductions
  deductionsCard: {
    backgroundColor: '#FFF0F0',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.statusPoor,
  },
  deductionsTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.statusPoor,
    marginBottom: spacing.xs,
  },
  deductionItem: {
    fontSize: fontSizes.sm,
    color: '#8B1A1A',
    lineHeight: 20,
  },

  // Action buttons
  actionBtns: { gap: spacing.md },
  calendarBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.md,
  },
  calendarBtnEmoji: { fontSize: 28 },
  calendarBtnTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: '#fff',
  },
  calendarBtnSub: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  calendarBtnArrow: {
    fontSize: fontSizes.xxl,
    color: '#fff',
    fontWeight: fontWeights.bold,
    marginLeft: 'auto',
  },
  scanAgainBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  scanAgainText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },

  // TTS Read Aloud button
  ttsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
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
