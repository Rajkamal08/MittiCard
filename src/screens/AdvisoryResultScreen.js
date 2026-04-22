import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Platform, ScrollView, Animated,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;
const scoreColor = s => s >= 70 ? colors.statusGood : s >= 40 ? colors.statusWarning : colors.statusPoor;
const scoreLabel = s => s >= 70 ? 'Good' : s >= 40 ? 'Fair' : 'Poor';
const statusBadge = level => {
  const l = (level || '').toLowerCase();
  if (l === 'low')    return { bg: colors.badgeLow,    text: colors.badgeLowText,    label: 'LOW' };
  if (l === 'medium') return { bg: colors.badgeMedium, text: colors.badgeMediumText, label: 'MED' };
  return                     { bg: colors.badgeGood,   text: colors.badgeGoodText,   label: 'OK'  };
};

function ScoreRing({ score }) {
  const color = scoreColor(score);
  const deg   = (score / 100) * 360 - 90;
  return (
    <View style={R.wrap}>
      <View style={R.track} />
      <View style={[R.fill, { borderColor: color, transform: [{ rotate: `${deg}deg` }] }]} />
      <View style={R.center}>
        <Text style={[R.num, { color }]}>{score}</Text>
        <Text style={R.sub}>/ 100</Text>
      </View>
    </View>
  );
}
const R = StyleSheet.create({
  wrap:   { width: 130, height: 130, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  track:  { position: 'absolute', width: 130, height: 130, borderRadius: 65, borderWidth: 12, borderColor: colors.divider },
  fill:   { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 12, borderColor: colors.statusGood, borderTopColor: 'transparent', borderRightColor: 'transparent' },
  center: { alignItems: 'center' },
  num:    { fontSize: fontSizes.xxxl, fontWeight: fontWeights.extrabold },
  sub:    { fontSize: fontSizes.xs, color: colors.textMuted },
});

export default function AdvisoryResultScreen({ route, navigation }) {
  const { advisory, scan_id, crop, farmSize, sowing_date } = route.params || {};
  const [openRec, setOpenRec] = useState(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  if (!advisory) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backText}>{'\u2190'} Back</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{'\u{1F4CA}'} Soil Advisory</Text>
        </View>
        <View style={s.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F33F}'}</Text>
          <Text style={s.emptyTitle}>No Advisory Found</Text>
          <Text style={s.emptySub}>Scan or enter soil values first</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.navigate('SoilInput')}>
            <Text style={s.emptyBtnText}>Enter Soil Values</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const score   = advisory.soil_health_score ?? 0;
  const sc      = scoreColor(score);
  const sl      = scoreLabel(score);
  const recs    = advisory.recommendations || [];
  const nut     = advisory.nutrient_status  || {};
  const total   = advisory.total_cost_inr   ?? 0;
  const tip     = advisory.budget_tip       || '';

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <View style={s.header}>
        <View style={s.blob} />
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{'\u{1F4CA}'} Soil Advisory</Text>
        <Text style={s.headerSub}>
          {crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : ''}
          {farmSize ? `  \u00B7  ${farmSize} acres` : ''}
        </Text>
      </View>

      <Animated.ScrollView style={{ opacity: fade }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Score */}
        <View style={[s.card, shadows.lg, { alignItems: 'center', gap: 10 }]}>
          <ScoreRing score={score} />
          <View style={[s.pill, { backgroundColor: sc + '20' }]}>
            <Text style={[s.pillText, { color: sc }]}>{sl}</Text>
          </View>
          <Text style={s.scoreCaption}>Soil Health Score</Text>
        </View>

        {/* Nutrient Status */}
        {Object.keys(nut).length > 0 && (
          <View style={[s.card, shadows.sm]}>
            <Text style={s.secLabel}>NUTRIENT STATUS</Text>
            {Object.entries(nut).map(([key, info], i) => {
              const b = statusBadge(info?.status);
              return (
                <View key={key} style={[s.nutRow, i > 0 && s.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.nutName}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                    <Text style={s.nutVal}>{info?.value != null ? `${info.value} ${info?.unit || ''}` : '–'}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: b.bg }]}>
                    <Text style={[s.badgeText, { color: b.text }]}>{b.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Fertilizer Plan */}
        {recs.length > 0 && (
          <View style={[s.card, shadows.sm]}>
            <Text style={s.secLabel}>FERTILIZER PLAN</Text>
            {recs.map((rec, i) => (
              <View key={i}>
                <TouchableOpacity
                  style={[s.recRow, i > 0 && s.rowBorder]}
                  onPress={() => setOpenRec(openRec === i ? null : i)}
                  activeOpacity={0.8}
                >
                  <View style={s.recP}>
                    <Text style={s.recPText}>P{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={s.recName}>{rec.fertilizer}</Text>
                    <Text style={s.recSub}>{rec.total_qty}  ·  {rec.bags_needed} bags</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.recCost}>{rec.total_cost_inr}</Text>
                    <Text style={s.recBag}>{rec.price_per_bag}/bag</Text>
                  </View>
                  <Text style={s.recArrow}>{openRec === i ? '\u25B4' : '\u25BE'}</Text>
                </TouchableOpacity>
                {openRec === i && (
                  <View style={s.recExp}>
                    <Text style={s.recReason}>{'\u{1F4A1}'} {rec.reason}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Cost */}
        <View style={[s.card, shadows.sm]}>
          <Text style={s.secLabel}>ESTIMATED COST</Text>
          <Text style={s.totalCost}>{'\u20B9'}{Number(total).toLocaleString('en-IN')}</Text>
          <Text style={s.totalSub}>Total fertilizer cost</Text>
          {tip ? (
            <View style={s.tipBox}>
              <Text style={s.tipText}>{'\u{1F4B0}'} {tip}</Text>
            </View>
          ) : null}
        </View>

        {/* Buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity style={s.btnPrimary}
            onPress={() => navigation.navigate('CropCalendar', { scan_id, advisory, sowing_date })}
            activeOpacity={0.85}>
            <Text style={s.btnPrimaryText}>{'\u{1F4C5}'} Crop Calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnOutline}
            onPress={() => navigation.navigate('Main')} activeOpacity={0.85}>
            <Text style={s.btnOutlineText}>{'\u{1F3E0}'} Home</Text>
          </TouchableOpacity>
        </View>

      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primary, paddingTop: STATUS_HEIGHT + 12,
    paddingBottom: spacing.xxl, paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  blob: { position: 'absolute', top: -50, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: colors.primaryLight, opacity: 0.25 },
  backBtn: { alignSelf: 'flex-start', marginBottom: spacing.sm, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  backText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  headerTitle: { fontSize: 26, fontWeight: fontWeights.extrabold, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  pill: { borderRadius: radius.full, paddingHorizontal: 18, paddingVertical: 5 },
  pillText: { fontSize: fontSizes.md, fontWeight: fontWeights.bold },
  scoreCaption: { fontSize: fontSizes.sm, color: colors.textMuted },
  secLabel: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.md },
  nutRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  nutName: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  nutVal: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold },
  recRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  recP: { width: 28, height: 28, borderRadius: 6, backgroundColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  recPText: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.accentDark },
  recName: { fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.textPrimary },
  recSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  recCost: { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.primary },
  recBag: { fontSize: fontSizes.xs, color: colors.textMuted },
  recArrow: { fontSize: 12, color: colors.textMuted, marginLeft: spacing.xs },
  recExp: { backgroundColor: colors.primarySurface, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.xs },
  recReason: { fontSize: fontSizes.sm, color: colors.textSecondary },
  totalCost: { fontSize: 32, fontWeight: fontWeights.extrabold, color: colors.textPrimary, marginBottom: 4 },
  totalSub: { fontSize: fontSizes.sm, color: colors.textMuted, marginBottom: spacing.md },
  tipBox: { backgroundColor: colors.accentSurface, borderRadius: radius.md, padding: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.accent },
  tipText: { fontSize: fontSizes.sm, color: colors.textSecondary },
  btnRow: { flexDirection: 'row', gap: spacing.md },
  btnPrimary: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', ...shadows.md },
  btnPrimaryText: { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: '#fff' },
  btnOutline: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary },
  btnOutlineText: { fontSize: fontSizes.md, fontWeight: fontWeights.semibold, color: colors.primary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: 8 },
  emptySub: { fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.xxl, ...shadows.sm },
  emptyBtnText: { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: '#fff' },
});
