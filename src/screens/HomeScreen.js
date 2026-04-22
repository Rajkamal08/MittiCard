import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform,
  ScrollView, Animated, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisory } from '../services/api';
import { getLastScanId } from '../services/storage';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

// ── Weather helpers ────────────────────────────────────────────────────────────
const wmoLabel = (code, temp) => {
  if (code === 0)            return { emoji: '\u{2600}\uFE0F',  desc: 'Clear Sky' };
  if (code <= 3)             return { emoji: '\u26C5',          desc: 'Partly Cloudy' };
  if (code <= 48)            return { emoji: '\u{1F32B}\uFE0F', desc: 'Foggy' };
  if (code <= 67)            return { emoji: '\u{1F327}\uFE0F', desc: 'Rainy' };
  if (code <= 77)            return { emoji: '\u{1F328}\uFE0F', desc: 'Snowy' };
  if (code <= 99)            return { emoji: '\u26C8\uFE0F',    desc: 'Thunderstorm' };
  if (temp > 35)             return { emoji: '\u{1F321}\uFE0F', desc: 'Very Hot' };
  return                            { emoji: '\u{1F324}\uFE0F', desc: 'Cloudy' };
};

const getFarmingAdvice = (code, temp, wind) => {
  const rainy   = code >= 51 && code <= 99;
  const thunder = code >= 80;
  const hot     = temp > 35;
  const windy   = wind > 25;
  return [
    {
      icon: '\u{1F4A7}',
      text: rainy ? 'Rain expected — skip irrigation today' : hot ? 'Hot day — irrigate in evening' : 'Good soil moisture conditions',
      ok: rainy ? null : !hot,
    },
    {
      icon: '\u{1F33F}',
      text: (rainy || windy) ? 'Avoid spraying — rain/wind will wash off' : 'Good conditions for pesticide spray',
      ok: !(rainy || windy),
    },
    {
      icon: '\u{1F33E}',
      text: thunder ? 'Thunderstorm — stay indoors, halt harvest' : hot ? 'Harvest early morning to avoid heat stress' : 'Good conditions for harvesting',
      ok: !thunder,
    },
  ];
};

// ── Score helpers ──────────────────────────────────────────────────────────────
const scoreColor = s => s >= 70 ? colors.statusGood : s >= 40 ? colors.statusWarning : colors.statusPoor;
const scoreLabel = s => s >= 70 ? 'Good' : s >= 40 ? 'Fair' : 'Poor';

// ── Score Ring (pure CSS circles) ─────────────────────────────────────────────
function ScoreRing({ score = 0, size = 110 }) {
  const anim   = useRef(new Animated.Value(0)).current;
  const radius2 = (size - 16) / 2;
  const circ   = 2 * Math.PI * radius2;
  const color  = scoreColor(score);

  useEffect(() => {
    Animated.timing(anim, { toValue: score, duration: 900, useNativeDriver: false }).start();
  }, [score]);

  const dashOffset = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [circ, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 10, borderColor: colors.divider,
        position: 'absolute',
      }} />
      <View style={{
        width: size - 20, height: size - 20, borderRadius: (size - 20) / 2,
        borderWidth: 10, borderColor: color,
        position: 'absolute',
        borderTopColor: 'transparent', borderRightColor: 'transparent',
        transform: [{ rotate: `${(score / 100) * 360 - 90}deg` }],
      }} />
      <Text style={{ fontSize: size * 0.3, fontWeight: fontWeights.extrabold, color }}>
        {score}
      </Text>
    </View>
  );
}

// ── Action card data ───────────────────────────────────────────────────────────
const getActions = (t) => [
  { id: 'scan',     icon: '\u{1F4F7}', label: 'Scan Card',      sub: 'OCR soil card',       screen: 'OCR',       bg: '#E3F2FD' },
  { id: 'manual',   icon: '\u270F\uFE0F', label: 'Manual Entry',   sub: 'Type soil values',    screen: 'SoilInput', bg: colors.primarySurface },
  { id: 'advisory', icon: '\u{1F4CA}', label: 'Last Advisory',   sub: 'View full report',    screen: 'AdvisoryResult', bg: '#FFF8E1' },
  { id: 'calendar', icon: '\u{1F4C5}', label: 'Crop Calendar',   sub: 'Season timeline',     screen: 'CropCalendar', bg: '#F3E5F5' },
];

// ── Main component ─────────────────────────────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const { t, i18n } = useTranslation();
  const [advisory,   setAdvisory]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [weather,    setWeather]    = useState(null);
  const [weatherLoad,setWeatherLoad]= useState(true);
  const [offline,    setOffline]    = useState(false);
  const [scanId,     setScanId]     = useState(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const ACTIONS   = getActions(t);

  // Load advisory
  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const id = await getLastScanId();
      setScanId(id);
      if (id) {
        const res = await getAdvisory(id);
        if (res.data?.success) setAdvisory(res.data.data);
      }
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load weather
  const loadWeather = useCallback(async () => {
    setWeatherLoad(true);
    try {
      const loc = await axios.get('http://ip-api.com/json/?fields=lat,lon,city', { timeout: 5000 });
      const { lat, lon } = loc.data;
      const wx  = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`, { timeout: 5000 }
      );
      const cw = wx.data.current_weather;
      setWeather({ temperature: cw.temperature, windspeed: cw.windspeed, weathercode: cw.weathercode, city: loc.data.city });
    } catch { /* silent — weather is optional */ }
    finally { setWeatherLoad(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []));

  useEffect(() => { loadWeather(); }, []);

  const onRefresh = () => { setRefreshing(true); loadData(true); };

  const score = advisory?.soil_health_score ?? 0;
  const crop  = advisory?.crop ?? '';
  const wInfo = weather ? wmoLabel(weather.weathercode, weather.temperature) : null;

  const handleAction = (action) => {
    if ((action.id === 'advisory' || action.id === 'calendar') && !scanId) {
      Alert.alert('No Data Yet', 'Please scan or enter soil values first.');
      return;
    }
    if (action.id === 'advisory') navigation.navigate('AdvisoryResult', { advisory, scan_id: scanId });
    else if (action.id === 'calendar') navigation.navigate('CropCalendar', { scan_id: scanId, advisory });
    else navigation.navigate(action.screen);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.scroll}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBlob} />
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{'\u{1F44B}'} {t('home.greeting') || 'Namaste!'}</Text>
              <Text style={styles.greetingSub}>{t('home.question') || 'What would you like to do today?'}</Text>
            </View>
            {/* Notification bell */}
            <TouchableOpacity style={styles.bellBtn}>
              <Text style={{ fontSize: 22 }}>{'\u{1F514}'}</Text>
            </TouchableOpacity>
          </View>

          {/* Weather pill in header */}
          {weather && (
            <View style={styles.weatherPill}>
              <Text style={styles.weatherPillText}>
                {wInfo?.emoji} {Math.round(weather.temperature)}°C  {weather.city || ''}
              </Text>
            </View>
          )}
          {weatherLoad && !weather && (
            <View style={styles.weatherPill}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
              <Text style={[styles.weatherPillText, { marginLeft: 6 }]}>Getting weather…</Text>
            </View>
          )}
        </View>

        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── SCORE CARD (floats over header) ─────────────────────────── */}
          <View style={[styles.scoreCard, shadows.xl]}>
            <View style={styles.scoreLeft}>
              <ScoreRing score={score} size={110} />
              <Text style={[styles.scoreLabel, { color: scoreColor(score) }]}>
                {scoreLabel(score)}
              </Text>
              <Text style={styles.scoreSub}>{t('advisory.score_label') || 'Soil Health Score'}</Text>
            </View>
            <View style={styles.scoreRight}>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : advisory ? (
                <>
                  <View style={[styles.scoreBadge, { backgroundColor: scoreColor(score) + '18' }]}>
                    <Text style={[styles.scoreBadgeText, { color: scoreColor(score) }]}>
                      {crop.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.scoreDetail}>
                    N: {advisory.nutrient_status?.nitrogen?.value ?? '--'} kg/ha
                  </Text>
                  <Text style={styles.scoreDetail}>
                    P: {advisory.nutrient_status?.phosphorus?.value ?? '--'} kg/ha
                  </Text>
                  <Text style={styles.scoreDetail}>
                    K: {advisory.nutrient_status?.potassium?.value ?? '--'} kg/ha
                  </Text>
                  <Text style={styles.scoreDate}>
                    {advisory.generated_at
                      ? new Date(advisory.generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : 'Recent scan'}
                  </Text>
                </>
              ) : (
                <View style={styles.noDataBox}>
                  <Text style={styles.noDataEmoji}>{'\u{1F331}'}</Text>
                  <Text style={styles.noDataText}>No scan yet</Text>
                  <Text style={styles.noDataSub}>Tap Scan to begin</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── ACTION GRID ──────────────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.actionGrid}>
            {ACTIONS.map(action => (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionCard, shadows.sm]}
                onPress={() => handleAction(action)}
                activeOpacity={0.82}
              >
                <View style={[styles.actionIconCircle, { backgroundColor: action.bg }]}>
                  <Text style={styles.actionIcon}>{action.icon}</Text>
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text style={styles.actionSub}>{action.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── WEATHER ADVICE CARD ──────────────────────────────────────── */}
          {offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>{'\u{1F4F4}'} Offline — showing cached data</Text>
            </View>
          )}

          {weather && (
            <>
              <Text style={styles.sectionLabel}>TODAY'S FARMING ADVICE</Text>
              <View style={[styles.weatherCard, shadows.sm]}>
                <View style={styles.weatherTopRow}>
                  <View style={styles.weatherMain}>
                    <Text style={styles.weatherEmoji}>{wInfo?.emoji}</Text>
                    <View>
                      <Text style={styles.weatherTemp}>{Math.round(weather.temperature)}°C</Text>
                      <Text style={styles.weatherDesc}>{wInfo?.desc}</Text>
                    </View>
                  </View>
                  <Text style={styles.weatherWind}>{'\u{1F4A8}'} {Math.round(weather.windspeed)} km/h</Text>
                </View>
                <View style={styles.divider} />
                {getFarmingAdvice(weather.weathercode, weather.temperature, weather.windspeed).map((adv, i) => (
                  <View key={i} style={[
                    styles.adviceRow,
                    adv.ok === true  && styles.adviceRowGood,
                    adv.ok === false && styles.adviceRowBad,
                    adv.ok === null  && styles.adviceRowNeutral,
                  ]}>
                    <Text style={styles.adviceIcon}>{adv.icon}</Text>
                    <Text style={[styles.adviceText,
                      adv.ok === true  && { color: colors.statusGood },
                      adv.ok === false && { color: colors.statusPoor },
                    ]}>{adv.text}</Text>
                    <View style={[styles.adviceBadge,
                      adv.ok === true  && { backgroundColor: colors.badgeGood },
                      adv.ok === false && { backgroundColor: colors.badgeLow },
                      adv.ok === null  && { backgroundColor: colors.badgeMedium },
                    ]}>
                      <Text style={[styles.adviceBadgeText,
                        adv.ok === true  && { color: colors.badgeGoodText },
                        adv.ok === false && { color: colors.badgeLowText },
                        adv.ok === null  && { color: colors.badgeMediumText },
                      ]}>
                        {adv.ok === true ? 'OK' : adv.ok === false ? 'AVOID' : 'CHECK'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── RECENT NUTRIENTS (if advisory exists) ───────────────────── */}
          {advisory?.recommendations?.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>FERTILIZER SUMMARY</Text>
              <View style={[styles.fertCard, shadows.sm]}>
                {advisory.recommendations.slice(0, 3).map((rec, i) => (
                  <View key={i} style={[styles.fertRow, i > 0 && styles.fertRowBorder]}>
                    <Text style={styles.fertName}>{rec.fertilizer}</Text>
                    <Text style={styles.fertQty}>{rec.bags_needed} bags</Text>
                    <Text style={styles.fertCost}>{rec.total_cost_inr}</Text>
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.viewFullBtn}
                  onPress={() => navigation.navigate('AdvisoryResult', { advisory, scan_id: scanId })}
                >
                  <Text style={styles.viewFullText}>View Full Advisory {'\u2192'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const SCREEN_WIDTH = require('react-native').Dimensions.get('window').width;
const CARD_W = (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxxl },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: STATUS_HEIGHT + 12,
    paddingBottom: 60,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerBlob: {
    position: 'absolute', top: -50, right: -40, width: 180, height: 180,
    borderRadius: 90, backgroundColor: colors.primaryLight, opacity: 0.22,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  greeting: { fontSize: fontSizes.xl, fontWeight: fontWeights.extrabold, color: '#fff' },
  greetingSub: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  weatherPill: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 6,
  },
  weatherPillText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.medium },

  // Score card
  scoreCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    marginHorizontal: spacing.lg, marginTop: -40,
    padding: spacing.lg, flexDirection: 'row',
    alignItems: 'center', gap: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  scoreLeft: { alignItems: 'center', gap: 4 },
  scoreLabel: { fontSize: fontSizes.md, fontWeight: fontWeights.bold },
  scoreSub: { fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center' },
  scoreRight: { flex: 1, gap: 4 },
  scoreBadge: {
    alignSelf: 'flex-start', borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4,
  },
  scoreBadgeText: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold },
  scoreDetail: { fontSize: fontSizes.sm, color: colors.textSecondary },
  scoreDate: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 6 },
  noDataBox: { alignItems: 'center', gap: 4 },
  noDataEmoji: { fontSize: 28 },
  noDataText: { fontSize: fontSizes.md, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  noDataSub: { fontSize: fontSizes.sm, color: colors.textMuted },

  // Section label
  sectionLabel: {
    fontSize: fontSizes.xs, fontWeight: fontWeights.bold,
    color: colors.textMuted, letterSpacing: 1.2,
    textTransform: 'uppercase', marginHorizontal: spacing.lg,
    marginBottom: spacing.sm, marginTop: spacing.sm,
  },

  // Action grid
  actionGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.lg, gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionCard: {
    width: CARD_W, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  actionIconCircle: {
    width: 44, height: 44, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionIcon: { fontSize: 22 },
  actionLabel: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  actionSub: { fontSize: fontSizes.xs, color: colors.textMuted },

  // Offline banner
  offlineBanner: {
    backgroundColor: colors.badgeMedium, borderRadius: radius.md,
    padding: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  offlineBannerText: { fontSize: fontSizes.sm, color: colors.badgeMediumText, textAlign: 'center' },

  // Weather advice card
  weatherCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.xl,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  weatherTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  weatherMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherEmoji: { fontSize: 34 },
  weatherTemp: { fontSize: fontSizes.xl, fontWeight: fontWeights.extrabold, color: colors.textPrimary },
  weatherDesc: { fontSize: fontSizes.xs, color: colors.textSecondary },
  weatherWind: { fontSize: fontSizes.sm, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.divider, marginBottom: spacing.sm },
  adviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#F5F5F5', borderRadius: radius.sm,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6,
  },
  adviceRowGood:    { backgroundColor: colors.badgeGood },
  adviceRowBad:     { backgroundColor: colors.badgeLow },
  adviceRowNeutral: { backgroundColor: colors.badgeMedium },
  adviceIcon: { fontSize: 18, width: 24 },
  adviceText: { flex: 1, fontSize: fontSizes.xs, fontWeight: fontWeights.medium, color: colors.textPrimary },
  adviceBadge: {
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: '#E0E0E0',
  },
  adviceBadgeText: { fontSize: 10, fontWeight: fontWeights.bold, color: '#555' },

  // Fertilizer summary
  fertCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    marginHorizontal: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  fertRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: 12,
  },
  fertRowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  fertName: { flex: 1, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  fertQty: { fontSize: fontSizes.sm, color: colors.textSecondary, marginRight: spacing.md },
  fertCost: { fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.primary },
  viewFullBtn: {
    borderTopWidth: 1, borderTopColor: colors.divider,
    paddingVertical: 12, alignItems: 'center',
    backgroundColor: colors.primarySurface,
  },
  viewFullText: { fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.primary },
});
