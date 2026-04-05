import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisory }    from '../services/api';
import { getUser, getLastScanId, clearStorage } from '../services/storage';
import { setAuthToken }   from '../services/api';
import { useTranslation } from 'react-i18next';

// ─── Score helpers ────────────────────────────────────────────────────────────
const getScoreColor = score => {
  if (score >= 71) return colors.statusGood;
  if (score >= 41) return colors.statusFair;
  return colors.statusPoor;
};

const getScoreLabel = (score, t) => {
  if (score >= 71) return t('advisory.score_good');
  if (score >= 41) return t('advisory.score_fair');
  if (score >= 1)  return t('advisory.score_poor');
  return '—';
};

const getScoreEmoji = score => {
  if (score >= 71) return '🟢';
  if (score >= 41) return '🟡';
  if (score >= 1)  return '🔴';
  return '🌱';
};

const formatDate = dateStr => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ─── Animated Score Ring ──────────────────────────────────────────────────────
function ScoreRing({ score, color }) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [score]);

  return (
    <Animated.View style={[styles.scoreRingOuter, { borderColor: color, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.scoreRingInner, { backgroundColor: color + '18' }]}>
        <Text style={[styles.scoreNumber, { color }]}>
          {score > 0 ? score : '—'}
        </Text>
        {score > 0 && <Text style={[styles.scoreOutOf, { color }]}>/100</Text>}
      </View>
    </Animated.View>
  );
}

// ─── Nutrient Status Badge ─────────────────────────────────────────────────────
function NutrientBadge({ label, value, unit, threshold }) {
  const isLow = value !== null && value < threshold;
  const bg    = isLow ? '#FFF0F0' : '#F0FAF4';
  const fg    = isLow ? colors.statusPoor : colors.statusGood;
  const tag   = isLow ? 'LOW' : 'OK';

  return (
    <View style={[styles.nutrientBadge, { backgroundColor: bg }]}>
      <Text style={[styles.nutrientLabel, { color: fg }]}>{label}</Text>
      {value !== null && (
        <Text style={[styles.nutrientValue, { color: fg }]}>{value}{unit}</Text>
      )}
      <View style={[styles.nutrientTagBox, { backgroundColor: fg + '22' }]}>
        <Text style={[styles.nutrientTag, { color: fg }]}>{tag}</Text>
      </View>
    </View>
  );
}

// ─── Main HomeScreen ──────────────────────────────────────────────────────────
export default function HomeScreen({ navigation, route }) {
  const { t } = useTranslation();
  const [user,        setUser]        = useState(route?.params?.user || null);
  const [lastScan,    setLastScan]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState(null);

  // ── Weather state ──────────────────────────────────────────────────────────
  const [weather,     setWeather]     = useState(null);
  const [weatherLoad, setWeatherLoad] = useState(false);

  // ── Notification panel state ───────────────────────────────────────────────
  const [showNotif,   setShowNotif]   = useState(false);
  const [notifBadge,  setNotifBadge]  = useState(0);

  const headerFade   = useRef(new Animated.Value(0)).current;
  const cardSlide    = useRef(new Animated.Value(40)).current;
  const cardFade     = useRef(new Animated.Value(0)).current;

  // ─── Run entrance animation ─────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(cardFade,   { toValue: 1, duration: 700, delay: 200, useNativeDriver: true }),
      Animated.timing(cardSlide,  { toValue: 0, duration: 600, delay: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // ─── Load user + last scan on mount ────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // Get user from storage if not in route params
      if (!user) {
        const storedUser = await getUser();
        if (storedUser) setUser(storedUser);
      }

      // Get last scan ID → fetch advisory
      const scanId = await getLastScanId();
      if (scanId) {
        const response = await getAdvisory(scanId);
        if (response.data.success) {
          setLastScan(response.data.data);
        }
      }
      setError(null);
    } catch (err) {
      // Don't show error if it's just "no scan yet"
      if (err?.status !== 404) {
        setError('Could not load latest scan');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, []);

  // ─── Refresh when navigating back to Home after a new scan ─────────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { loadData(false); });
    return unsubscribe;
  }, [navigation, loadData]);

  // ─── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await clearStorage();
    setAuthToken(null);
    navigation.replace('Login');
  };

  // ─── Fetch weather using IP-based location (no GPS permission needed) ────────
  useEffect(() => {
    const fetchWeather = async () => {
      setWeatherLoad(true);
      try {
        // Step 1: Get lat/lon from IP address (free, no key, no permission)
        const locRes  = await fetch('https://ip-api.com/json/');
        const locData = await locRes.json();
        if (!locData.lat) throw new Error('Location unavailable');

        // Step 2: Fetch weather from Open-Meteo (free, no key)
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${locData.lat.toFixed(2)}&longitude=${locData.lon.toFixed(2)}&current_weather=true&timezone=Asia%2FKolkata`;
        const wRes  = await fetch(url);
        const wData = await wRes.json();
        if (wData.current_weather) setWeather(wData.current_weather);
      } catch { /* fail silently — weather is optional */ }
      setWeatherLoad(false);
    };
    fetchWeather();
  }, []);

  // ─── Build notifications from scan data ─────────────────────────────────────
  useEffect(() => {
    if (!lastScan) { setNotifBadge(0); return; }
    const alerts = [];
    const ns = lastScan;
    if (ns.nitrogen        !== null && ns.nitrogen        < 140) alerts.push(1);
    if (ns.phosphorus      !== null && ns.phosphorus      < 11)  alerts.push(1);
    if (ns.potassium       !== null && ns.potassium       < 108) alerts.push(1);
    if (ns.organic_carbon  !== null && ns.organic_carbon  < 0.5) alerts.push(1);
    if (ns.zinc            !== null && ns.zinc            < 0.6) alerts.push(1);
    if (ns.ph !== null && (ns.ph < 5.5 || ns.ph > 8.0))          alerts.push(1);
    setNotifBadge(alerts.length);
  }, [lastScan]);

  // ─── WMO weather code → emoji + description ──────────────────────────────
  const wmoWeather = (code, temp) => {
    if (code === 0)              return { emoji: '☀️', desc: 'Clear sky' };
    if (code <= 2)               return { emoji: '⛅', desc: 'Partly cloudy' };
    if (code === 3)              return { emoji: '☁️', desc: 'Overcast' };
    if (code <= 48)              return { emoji: '🌫️', desc: 'Foggy' };
    if (code <= 67)              return { emoji: '🌧️', desc: 'Rainy' };
    if (code <= 77)              return { emoji: '❄️', desc: 'Snowy' };
    if (code <= 82)              return { emoji: '🌦️', desc: 'Rain showers' };
    if (code <= 99)              return { emoji: '⛈️', desc: 'Thunderstorm' };
    return { emoji: temp > 35 ? '🌡️' : '🌤️', desc: 'Variable' };
  };

  // ─── Notification items built from scan ──────────────────────────────────
  const buildNotifications = () => {
    const list = [];
    if (!lastScan) {
      list.push({ id: 1, icon: '📋', title: 'No scan yet', body: 'Scan your soil card to get personalized alerts.' });
      return list;
    }
    const ns = lastScan;
    if (ns.nitrogen       !== null && ns.nitrogen       < 140)
      list.push({ id: 2, icon: '🔴', title: 'Nitrogen is LOW', body: `Your N is ${ns.nitrogen} kg/ha. Ideal: ≥140. Apply Urea or DAP this season.` });
    if (ns.phosphorus     !== null && ns.phosphorus     < 11)
      list.push({ id: 3, icon: '🔴', title: 'Phosphorus is LOW', body: `Your P is ${ns.phosphorus} kg/ha. Apply SSP or DAP.` });
    if (ns.potassium      !== null && ns.potassium      < 108)
      list.push({ id: 4, icon: '🟠', title: 'Potassium is LOW', body: `Your K is ${ns.potassium} kg/ha. Apply MOP (Muriate of Potash).` });
    if (ns.organic_carbon !== null && ns.organic_carbon < 0.5)
      list.push({ id: 5, icon: '🟠', title: 'Organic Carbon LOW', body: 'Add compost or green manure to improve OC levels.' });
    if (ns.zinc           !== null && ns.zinc           < 0.6)
      list.push({ id: 6, icon: '🟡', title: 'Zinc Deficient', body: 'Apply Zinc Sulphate @ 25 kg/ha to correct deficiency.' });
    if (ns.ph !== null && (ns.ph < 5.5 || ns.ph > 8.0))
      list.push({ id: 7, icon: '⚠️', title: `pH is ${ns.ph < 5.5 ? 'too Acidic' : 'too Alkaline'}`, body: ns.ph < 5.5 ? 'Apply Agricultural Lime to neutralize acidity.' : 'Apply Gypsum to correct alkalinity.' });
    if (list.length === 0)
      list.push({ id: 8, icon: '✅', title: 'All nutrients healthy!', body: 'Your soil is in great condition. Keep scanning every season.' });
    list.push({ id: 9, icon: '💡', title: 'Tip: Best time to apply', body: 'Apply fertilizers early morning or after rain for best absorption.' });
    return list;
  };

  // ─── Greeting based on time ─────────────────────────────────────────────────
  const hour      = new Date().getHours();
  const greetEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';
  const firstName  = user?.name?.split(' ')[0] || t('home.greeting_default').replace('नमस्ते, ', '').replace('Hello, ', '');
  const greeting   = t('home.greeting', { name: firstName });

  const score      = lastScan?.soil_health_score || 0;
  const scoreColor = getScoreColor(score);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBubble} />

          <Animated.View style={[styles.headerTop, { opacity: headerFade }]}>
            {/* Greeting row */}
            <View style={styles.greetingRow}>
              <View>
                <Text style={styles.greetingText}>{greetEmoji} {greeting}</Text>
                <Text style={styles.farmerName}>{firstName}</Text>
                {user?.phone && (
                  <Text style={styles.farmerPhone}>+91 {user.phone}</Text>
                )}
              </View>
              {/* Notification bell + logout */}
              <View style={styles.headerActions}>
                {/* Bell with badge */}
                <TouchableOpacity style={styles.iconBtnRelative} onPress={() => setShowNotif(true)}>
                  <Text style={styles.iconBtnText}>🔔</Text>
                  {notifBadge > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>{notifBadge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
                  <Text style={styles.iconBtnText}>↩️</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── WEATHER WIDGET ─────────────────────────────────────────── */}
            {(weather || weatherLoad) && (
              <View style={styles.weatherWidget}>
                {weatherLoad ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : weather ? (
                  <>
                    <View style={styles.weatherLeft}>
                      <Text style={styles.weatherEmoji}>{wmoWeather(weather.weathercode, weather.temperature).emoji}</Text>
                      <View>
                        <Text style={styles.weatherTemp}>{Math.round(weather.temperature)}°C</Text>
                        <Text style={styles.weatherDesc}>{wmoWeather(weather.weathercode, weather.temperature).desc}</Text>
                      </View>
                    </View>
                    <View style={styles.weatherRight}>
                      <Text style={styles.weatherWind}>💨 {weather.windspeed} km/h</Text>
                      <Text style={styles.weatherTip}>
                        {weather.temperature > 35 ? '🌡️ Hot — irrigate crops' : weather.temperature < 15 ? '🥶 Cold — protect seedlings' : '✅ Good conditions'}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
            )}

            {/* ── SCORE CARD ───────────────────────────────────────────────── */}
            <View style={[styles.scoreCard, shadows.lg]}>
              <Text style={styles.scoreCardTitle}>🌿 {t('advisory.score_label')}</Text>

              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
              ) : (
                <View style={styles.scoreCardBody}>
                  {/* Big animated score ring */}
                  <ScoreRing score={score} color={scoreColor} />

                  {/* Right side info */}
                  <View style={styles.scoreCardRight}>
                    {lastScan ? (
                      <>
                        <View style={[styles.scoreLabelBadge, { backgroundColor: scoreColor + '20' }]}>
                          <Text style={[styles.scoreLabelText, { color: scoreColor }]}>
                            {getScoreEmoji(score)} {getScoreLabel(score, t)}
                          </Text>
                        </View>

                        <Text style={styles.scanInfoText}>
                          🌾 Crop:{' '}
                          <Text style={styles.scanInfoBold}>
                            {lastScan.crop?.charAt(0).toUpperCase() + lastScan.crop?.slice(1)}
                          </Text>
                        </Text>
                        <Text style={styles.scanInfoText}>
                          📅 Scanned:{' '}
                          <Text style={styles.scanInfoBold}>
                            {formatDate(lastScan.scanned_at)}
                          </Text>
                        </Text>
                        <Text style={styles.scanInfoText}>
                          💰 Est. cost:{' '}
                          <Text style={styles.scanInfoBold}>
                            ₹{lastScan.total_cost?.toLocaleString('en-IN') || '—'}
                          </Text>
                        </Text>
                      </>
                    ) : (
                      <View style={styles.noScanInfo}>
                        <Text style={styles.noScanText}>{t('home.no_advisory').split('.')[0]}</Text>
                        <Text style={styles.noScanSub}>{t('home.no_advisory').split('. ').slice(1).join('. ')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* pH bar (only if scan exists) */}
              {lastScan?.ph && (
                <View style={styles.phRow}>
                  <Text style={styles.phLabel}>pH Level</Text>
                  <View style={styles.phBarBg}>
                    <View
                      style={[
                        styles.phBarFill,
                        {
                          width: `${Math.min((lastScan.ph / 14) * 100, 100)}%`,
                          backgroundColor:
                            lastScan.ph >= 6 && lastScan.ph <= 7.5
                              ? colors.statusGood
                              : lastScan.ph >= 5.5
                              ? colors.statusFair
                              : colors.statusPoor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.phValue}>{lastScan.ph}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* ── BODY CONTENT ───────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.body,
            { opacity: cardFade, transform: [{ translateY: cardSlide }] },
          ]}
        >
          {/* ── NUTRIENT QUICK BADGES (if scan exists) ─────────────────── */}
          {lastScan && (
            <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('advisory.section_status')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
                <NutrientBadge label="N"  value={lastScan.nitrogen}        unit=" kg/ha" threshold={140} />
                <NutrientBadge label="P"  value={lastScan.phosphorus}      unit=" kg/ha" threshold={11} />
                <NutrientBadge label="K"  value={lastScan.potassium}       unit=" kg/ha" threshold={108} />
                <NutrientBadge label="OC" value={lastScan.organic_carbon}  unit="%"      threshold={0.5} />
                {lastScan.zinc   && <NutrientBadge label="Zn" value={lastScan.zinc}   unit="" threshold={0.6} />}
                {lastScan.sulfur && <NutrientBadge label="S"  value={lastScan.sulfur} unit="" threshold={10} />}
              </ScrollView>
            </View>
          )}

          {/* ── PRIMARY ACTIONS — TWO EQUAL BUTTONS ────────────────────── */}
          <View style={styles.primaryActionsRow}>
            {/* Manual entry */}
            <TouchableOpacity
              style={[styles.scanBtn, { flex: 1 }]}
              onPress={() => navigation.navigate('SoilInput')}
              activeOpacity={0.88}
            >
              <Text style={styles.scanBtnEmoji}>🔬</Text>
              <Text style={styles.scanBtnTitle}>
                {lastScan ? t('home.scan_card') : t('home.enter_manual')}
              </Text>
              <Text style={styles.scanBtnSub}>{t('home.enter_manual_sub')}</Text>
            </TouchableOpacity>

            {/* OCR camera */}
            <TouchableOpacity
              style={[styles.scanBtn, styles.ocrBtn, { flex: 1 }]}
              onPress={() => navigation.navigate('OCR')}
              activeOpacity={0.88}
            >
              <Text style={styles.scanBtnEmoji}>📷</Text>
              <Text style={styles.scanBtnTitle}>{t('home.scan_card')}</Text>
              <Text style={styles.scanBtnSub}>{t('home.scan_card_sub')}</Text>
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>NEW</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* ── SECONDARY ACTIONS GRID ───────────────────────────────────── */}
          <View style={styles.actionsRow}>
            {/* View Last Report */}
            <TouchableOpacity
              style={[styles.actionCard, !lastScan && styles.actionCardDisabled]}
              onPress={() =>
                lastScan
                  ? navigation.navigate('AdvisoryResult', {
                      advisory:  lastScan,
                      scan_id:   lastScan.id,
                      crop:      lastScan.crop,
                      farmSize:  lastScan.farm_size_acres,
                    })
                  : null
              }
              activeOpacity={lastScan ? 0.85 : 1}
            >
              <Text style={styles.actionEmoji}>📋</Text>
              <Text style={styles.actionTitle}>{t('home.last_advisory')}</Text>
              <Text style={styles.actionSub}>
                {lastScan ? `${t('advisory.score_label')}: ${score}/100` : t('home.no_advisory').split('.')[0]}
              </Text>
            </TouchableOpacity>

            {/* Crop Calendar */}
            <TouchableOpacity
              style={[styles.actionCard, !lastScan && styles.actionCardDisabled]}
              onPress={() =>
                lastScan
                  ? navigation.navigate('CropCalendar', { scan_id: lastScan.id })
                  : null
              }
              activeOpacity={lastScan ? 0.85 : 1}
            >
              <Text style={styles.actionEmoji}>📅</Text>
              <Text style={styles.actionTitle}>{t('home.crop_calendar')}</Text>
              <Text style={styles.actionSub}>
                {lastScan?.crop
                  ? `${lastScan.crop.charAt(0).toUpperCase() + lastScan.crop.slice(1)} ${t('calendar.subtitle', { crop: '' }).replace(' ', '')}`
                  : t('home.no_advisory').split('.')[0]}
              </Text>
            </TouchableOpacity>
          </View>



          {/* ── TIPS CARD ────────────────────────────────────────────────── */}
          <View style={styles.tipCard}>
            <Text style={styles.tipIcon}>💡</Text>
            <View style={styles.tipTextBlock}>
              <Text style={styles.tipTitle}>Did you know?</Text>
              <Text style={styles.tipBody}>
                Soil with pH between 6.0–7.5 gives the best crop yield. Test your soil every season for best results.
              </Text>
            </View>
          </View>

          {/* ── ERROR STATE ──────────────────────────────────────────────── */}
          {error && (
            <Text style={styles.errorText}>⚠️ {error}</Text>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── NOTIFICATION MODAL ────────────────────────────────────────── */}
      <Modal
        visible={showNotif}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotif(false)}
      >
        <TouchableOpacity
          style={styles.notifOverlay}
          activeOpacity={1}
          onPress={() => setShowNotif(false)}
        >
          <View style={styles.notifSheet}>
            {/* Handle */}
            <View style={styles.notifHandleRow}>
              <View style={styles.notifHandle} />
            </View>

            {/* Header */}
            <View style={styles.notifSheetHeader}>
              <Text style={styles.notifSheetTitle}>🔔 Soil Alerts</Text>
              {notifBadge > 0 && (
                <View style={styles.notifCountPill}>
                  <Text style={styles.notifCountText}>{notifBadge} alerts</Text>
                </View>
              )}
            </View>

            {/* Notification list */}
            <ScrollView style={styles.notifScroll} showsVerticalScrollIndicator={false}>
              {buildNotifications().map(n => (
                <View key={n.id} style={styles.notifItem}>
                  <Text style={styles.notifItemIcon}>{n.icon}</Text>
                  <View style={styles.notifItemBody}>
                    <Text style={styles.notifItemTitle}>{n.title}</Text>
                    <Text style={styles.notifItemText}>{n.body}</Text>
                  </View>
                </View>
              ))}
              <View style={styles.notifListFooter} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingBottom: spacing.xxl + spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  headerBubble: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.primaryLight,
    opacity: 0.35,
  },
  headerTop: {
    gap: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingText: {
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: fontWeights.medium,
  },
  farmerName: {
    fontSize: fontSizes.xxxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textOnPrimary,
    marginTop: 2,
  },
  farmerPhone: {
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnRelative: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnText: {
    fontSize: 18,
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#E63946',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  // Weather widget
  weatherWidget: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherEmoji: {
    fontSize: 28,
    marginRight: 10,
  },
  weatherTemp: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  weatherDesc: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    marginTop: 1,
  },
  weatherRight: {
    alignItems: 'flex-end',
  },
  weatherWind: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
  },
  weatherTip: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    marginTop: 3,
  },
  // Notification modal
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  notifSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '76%',
    paddingBottom: 32,
  },
  notifHandleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  notifHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E2EBE7',
    borderRadius: 2,
  },
  notifSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F7F4',
  },
  notifSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1B2E25',
  },
  notifCountPill: {
    backgroundColor: '#E63946',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  notifCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  notifScroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  notifItem: {
    flexDirection: 'row',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F7F4',
  },
  notifItemIcon: {
    fontSize: 22,
    marginTop: 2,
    marginRight: 12,
  },
  notifItemBody: {
    flex: 1,
  },
  notifItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B2E25',
    marginBottom: 3,
  },
  notifItemText: {
    fontSize: 13,
    color: '#6B8F7A',
    lineHeight: 19,
  },
  notifListFooter: {
    height: 24,
  },

  // Score Card inside header
  scoreCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  scoreCardTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: 0.5,
  },
  scoreCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },

  // Score Ring
  scoreRingOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 30,
    fontWeight: fontWeights.extrabold,
    lineHeight: 34,
  },
  scoreOutOf: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },

  // Score right panel
  scoreCardRight: {
    flex: 1,
    gap: spacing.sm,
  },
  scoreLabelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  scoreLabelText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  scanInfoText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  scanInfoBold: {
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  noScanInfo: {
    gap: spacing.xs,
  },
  noScanText: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textMuted,
  },
  noScanSub: {
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },

  // pH bar
  phRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  phLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    width: 36,
  },
  phBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  phBarFill: {
    height: 8,
    borderRadius: 4,
  },
  phValue: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    width: 28,
    textAlign: 'right',
  },

  // Body
  body: {
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  // Section
  section: {
    paddingTop: spacing.xl + spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  badgeScroll: {
    flexDirection: 'row',
  },

  // Nutrient Badge
  nutrientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginRight: spacing.sm,
    gap: 4,
  },
  nutrientIcon: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extrabold,
  },
  nutrientLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  nutrientValue: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
  },
  nutrientTagBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  nutrientTag: {
    fontSize: 9,
    fontWeight: fontWeights.extrabold,
    letterSpacing: 0.5,
  },

  // Primary Actions Row (two equal buttons side by side)
  primaryActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  scanBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    ...shadows.md,
    position: 'relative',
  },
  ocrBtn: {
    backgroundColor: colors.primaryDark,
  },
  scanBtnEmoji: { fontSize: 28 },
  scanBtnTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textOnPrimary,
    textAlign: 'center',
  },
  scanBtnSub: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  newPill: {
    position: 'absolute',
    top: 8, right: 8,
    backgroundColor: '#FFD700',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newPillText: {
    fontSize: 9,
    fontWeight: fontWeights.extrabold,
    color: '#333',
    letterSpacing: 0.5,
  },

  // Actions Grid
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.sm,
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  actionEmoji: {
    fontSize: 28,
  },
  actionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  actionSub: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Tip Card
  tipCard: {
    backgroundColor: '#FFF8EC',
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  tipIcon: {
    fontSize: 24,
  },
  tipTextBlock: {
    flex: 1,
    gap: 4,
  },
  tipTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#7A5200',
  },
  tipBody: {
    fontSize: fontSizes.sm,
    color: '#7A6030',
    lineHeight: 20,
  },

  // Error
  errorText: {
    textAlign: 'center',
    fontSize: fontSizes.sm,
    color: colors.statusPoor,
  },

  // OCR Card
  ocrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    ...shadows.sm,
  },
  ocrCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  ocrCardEmoji: { fontSize: 28 },
  ocrCardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  ocrCardSub: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ocrCardBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  ocrCardBadgeText: {
    fontSize: 10,
    fontWeight: fontWeights.extrabold,
    color: '#fff',
    letterSpacing: 0.5,
  },
});
