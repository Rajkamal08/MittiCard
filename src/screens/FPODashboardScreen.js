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
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

// ─── API base ─────────────────────────────────────────────────────────────────
import { api } from '../services/api';

// ─── Score helpers ────────────────────────────────────────────────────────────
const scoreColor = s => s >= 71 ? '#2ECC71' : s >= 41 ? '#F1C40F' : '#E74C3C';
const scoreEmoji = s => s >= 71 ? '🟢' : s >= 41 ? '🟡' : '🔴';

const formatDate = ds => {
  if (!ds) return '—';
  return new Date(ds).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
};

// ─── Deficiency bar ───────────────────────────────────────────────────────────
function DefBar({ label, count, total, color }) {
  const pct   = total > 0 ? count / total : 0;
  const fill  = `${Math.round(pct * 100)}%`;
  const scaleX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(scaleX, { toValue: pct, duration: 900, delay: 200, useNativeDriver: false }).start();
  }, [pct]);

  return (
    <View style={sb.defRow}>
      <Text style={sb.defLabel}>{label}</Text>
      <View style={sb.defBarBg}>
        <Animated.View style={[sb.defBarFill, { backgroundColor: color, width: scaleX.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Text style={[sb.defPct, { color }]}>{fill}</Text>
      <Text style={sb.defCount}>{count}/{total}</Text>
    </View>
  );
}

// ─── Farm card ────────────────────────────────────────────────────────────────
function FarmCard({ farm, onPress }) {
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const s         = farm.soil_health_score || 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity style={[fc.card, shadows.sm]} onPress={onPress} activeOpacity={0.85}>
        {/* Coloured score strip */}
        <View style={[fc.strip, { backgroundColor: scoreColor(s) }]} />

        <View style={fc.body}>
          {/* Left */}
          <View style={fc.left}>
            <Text style={fc.farmName} numberOfLines={1}>{farm.farm_name || 'Farm'}</Text>
            <Text style={fc.farmerName}>👤 {farm.farmer_name || '—'}</Text>
            {farm.farmer_phone && <Text style={fc.phone}>📞 {farm.farmer_phone}</Text>}
            <Text style={fc.meta}>
              {farm.crop ? `🌾 ${farm.crop.charAt(0).toUpperCase() + farm.crop.slice(1)}` : '🌾 No crop'}
              {farm.district ? `  📍 ${farm.district}` : ''}
            </Text>
            <Text style={fc.scanDate}>🕒 {formatDate(farm.scanned_at)}</Text>
          </View>

          {/* Right — score */}
          <View style={fc.right}>
            <View style={[fc.scoreBadge, { borderColor: scoreColor(s) }]}>
              <Text style={fc.scoreEmoji}>{scoreEmoji(s)}</Text>
              <Text style={[fc.scoreNum, { color: scoreColor(s) }]}>{s || '—'}</Text>
              <Text style={fc.scoreLabel}>/100</Text>
            </View>
            {farm.size_acres && <Text style={fc.acres}>{farm.size_acres} acres</Text>}
          </View>
        </View>

        {/* Low nutrient chips */}
        <View style={fc.chips}>
          {farm.nitrogen   != null && farm.nitrogen   < 140 && <View style={fc.lowChip}><Text style={fc.lowChipText}>N↓</Text></View>}
          {farm.phosphorus != null && farm.phosphorus < 11  && <View style={fc.lowChip}><Text style={fc.lowChipText}>P↓</Text></View>}
          {farm.potassium  != null && farm.potassium  < 108 && <View style={fc.lowChip}><Text style={fc.lowChipText}>K↓</Text></View>}
          {farm.zinc       != null && farm.zinc        < 0.6 && <View style={fc.lowChip}><Text style={fc.lowChipText}>Zn↓</Text></View>}
          {farm.organic_carbon != null && farm.organic_carbon < 0.5 && <View style={fc.lowChip}><Text style={fc.lowChipText}>OC↓</Text></View>}
          {farm.ph != null && (farm.ph < 5.5 || farm.ph > 8.0) && <View style={[fc.lowChip, { backgroundColor: '#FEF3C7' }]}><Text style={[fc.lowChipText, { color: '#92400E' }]}>pH⚠</Text></View>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ icon, value, label, color, anim }) {
  const scale = useRef(new Animated.Value(0.7)).current;
  useEffect(() => { Animated.spring(scale, { toValue: 1, tension: 70, friction: 6, useNativeDriver: true }).start(); }, []);
  return (
    <Animated.View style={[st.tile, { transform: [{ scale }] }, shadows.sm]}>
      <Text style={st.icon}>{icon}</Text>
      <Text style={[st.value, { color }]}>{value}</Text>
      <Text style={st.label}>{label}</Text>
    </Animated.View>
  );
}

// ─── Main FPO Dashboard ───────────────────────────────────────────────────────
export default function FPODashboardScreen({ navigation }) {
  const { t }      = useTranslation();
  const isHindi    = i18n.language === 'hi';

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [farms,      setFarms]      = useState([]);
  const [stats,      setStats]      = useState(null);
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState('all');  // all | low | good
  const [showAddModal, setShowAddModal] = useState(false);
  const [districtFarms, setDistrictFarms] = useState([]);
  const [addingId, setAddingId]     = useState(null);

  const headerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // ── Fetch farms + stats ───────────────────────────────────────────────────
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [farmsRes, statsRes] = await Promise.all([
        api.get('/fpo/farms'),
        api.get('/fpo/stats'),
      ]);
      setFarms(farmsRes.data.farms || []);
      setStats(statsRes.data);
    } catch (err) {
      setError(isHindi ? 'डेटा लोड नहीं हो सका। दोबारा कोशिश करें।' : 'Could not load FPO data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, []);

  // ── Fetch district farms for Add Farmer modal ────────────────────────────
  const fetchDistrictFarms = async () => {
    try {
      const res = await api.get('/fpo/district-farms');
      setDistrictFarms(res.data.farms || []);
    } catch { setDistrictFarms([]); }
  };

  const openAddModal = () => {
    fetchDistrictFarms();
    setShowAddModal(true);
  };

  const addFarm = async (farmId) => {
    setAddingId(farmId);
    try {
      await api.post('/fpo/members', { farm_id: farmId });
      Alert.alert('✅ Success', isHindi ? 'खेत आपके डैशबोर्ड में जोड़ा गया।' : 'Farm added to your dashboard.');
      setShowAddModal(false);
      fetchData(true);
    } catch {
      Alert.alert('Error', isHindi ? 'खेत जोड़ने में विफल।' : 'Failed to add farm.');
    } finally { setAddingId(null); }
  };

  // ── Filtered + searched farms ────────────────────────────────────────────
  const filteredFarms = farms
    .filter(f => {
      const q = search.toLowerCase();
      if (q) {
        return (
          (f.farm_name    || '').toLowerCase().includes(q) ||
          (f.farmer_name  || '').toLowerCase().includes(q) ||
          (f.district     || '').toLowerCase().includes(q) ||
          (f.crop         || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .filter(f => {
      if (filter === 'low')  return (f.soil_health_score || 0) < 41;
      if (filter === 'good') return (f.soil_health_score || 0) >= 71;
      return true;
    });

  const db = stats?.deficiency_breakdown || {};
  const total = stats?.total_farms_scanned || 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{isHindi ? 'डेटा लोड हो रहा है…' : 'Loading FPO data…'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} colors={[colors.primary]} tintColor={colors.primary} />
        }
      >
        {/* ── HEADER ────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.bubble1} />
          <View style={styles.bubble2} />

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← {isHindi ? 'वापस' : 'Back'}</Text>
          </TouchableOpacity>

          <Animated.View style={{ opacity: headerFade }}>
            <Text style={styles.headerMeta}>{isHindi ? 'FPO प्रबंधक डैशबोर्ड' : 'FPO Manager Dashboard'}</Text>
            <Text style={styles.headerTitle}>🌾 {isHindi ? 'मेरे खेत' : 'My Farms'}</Text>

            {/* Stat tiles */}
            <View style={styles.statsRow}>
              <StatTile icon="🏡" value={farms.length}            label={isHindi ? 'खेत' : 'Farms'}     color={colors.primary} />
              <StatTile icon="📊" value={stats?.average_soil_health_score ?? '—'} label={isHindi ? 'औसत स्कोर' : 'Avg Score'} color={scoreColor(stats?.average_soil_health_score || 0)} />
              <StatTile icon="⚠️" value={
                Object.values(db).reduce((sum, v) => Math.max(sum, v.count || 0), 0)
              } label={isHindi ? 'कमी' : 'Deficient'} color="#E74C3C" />
            </View>
          </Animated.View>

          {/* Search + Add */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder={isHindi ? '🔍 खोजें…' : '🔍 Search farms…'}
              placeholderTextColor="rgba(255,255,255,0.55)"
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
              <Text style={styles.addBtnText}>+ {isHindi ? 'जोड़ें' : 'Add'}</Text>
            </TouchableOpacity>
          </View>

          {/* Filter tabs */}
          <View style={styles.filterRow}>
            {['all', 'low', 'good'].map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterTab, filter === f && styles.filterTabActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                  {f === 'all'  ? (isHindi ? 'सभी'   : 'All')
                   : f === 'low'  ? (isHindi ? 'कमजोर' : 'Low Score')
                                  : (isHindi ? 'स्वस्थ' : 'Healthy')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── BODY ──────────────────────────────────────────────────── */}
        <View style={styles.body}>

          {/* ── Error ─────────────────────────────────────────────── */}
          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => fetchData()} style={styles.retryBtn}>
                <Text style={styles.retryText}>{isHindi ? 'दोबारा कोशिश करें' : 'Retry'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Deficiency analytics ───────────────────────────────── */}
          {stats && total > 0 && (
            <View style={[styles.card, shadows.sm]}>
              <Text style={styles.sectionTitle}>📊 {isHindi ? 'पोषक तत्व विश्लेषण' : 'Nutrient Analysis'}</Text>
              <Text style={styles.sectionSub}>
                {isHindi ? `${total} खेतों के नवीनतम स्कैन के आधार पर` : `Based on latest scan from ${total} farms`}
              </Text>

              {/* Crop distribution */}
              {stats.crop_distribution && Object.keys(stats.crop_distribution).length > 0 && (
                <View style={styles.cropDist}>
                  <Text style={styles.distLabel}>{isHindi ? 'फसल वितरण:' : 'Crop distribution:'}</Text>
                  <View style={styles.cropChips}>
                    {Object.entries(stats.crop_distribution).map(([crop, cnt]) => (
                      <View key={crop} style={styles.cropChip}>
                        <Text style={styles.cropChipText}>
                          {crop.charAt(0).toUpperCase() + crop.slice(1)} · {cnt}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.defBars}>
                <DefBar label={isHindi ? 'नाइट्रोजन कम' : 'Nitrogen Low'}      count={db.nitrogen_low?.count || 0}       total={total} color="#E74C3C" />
                <DefBar label={isHindi ? 'फॉस्फोरस कम' : 'Phosphorus Low'}    count={db.phosphorus_low?.count || 0}     total={total} color="#E67E22" />
                <DefBar label={isHindi ? 'पोटेशियम कम' : 'Potassium Low'}      count={db.potassium_low?.count || 0}      total={total} color="#F1C40F" />
                <DefBar label={isHindi ? 'OC कम' : 'Organic Carbon Low'}       count={db.organic_carbon_low?.count || 0} total={total} color="#9B59B6" />
                <DefBar label={isHindi ? 'जिंक की कमी' : 'Zinc Deficient'}     count={db.zinc_deficient?.count || 0}     total={total} color="#2980B9" />
                <DefBar label={isHindi ? 'आयरन की कमी' : 'Iron Deficient'}     count={db.iron_deficient?.count || 0}     total={total} color="#16A085" />
              </View>
            </View>
          )}

          {/* ── Farm list ───────────────────────────────────────────── */}
          <Text style={styles.farmListTitle}>
            🏡 {isHindi ? `${filteredFarms.length} खेत` : `${filteredFarms.length} Farm${filteredFarms.length !== 1 ? 's' : ''}`}
            {search ? ` · "${search}"` : ''}
          </Text>

          {filteredFarms.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={{ fontSize: 48, textAlign: 'center' }}>🌾</Text>
              <Text style={styles.emptyTitle}>
                {farms.length === 0
                  ? (isHindi ? 'अभी कोई खेत नहीं' : 'No farms yet')
                  : (isHindi ? 'कोई परिणाम नहीं' : 'No results found')}
              </Text>
              <Text style={styles.emptySub}>
                {farms.length === 0
                  ? (isHindi ? '+ जोड़ें बटन से किसान जोड़ें।' : 'Tap + Add to add farmers from your district.')
                  : (isHindi ? 'खोज कम करें।' : 'Try a different search.')}
              </Text>
              {farms.length === 0 && (
                <TouchableOpacity style={styles.ctaBtn} onPress={openAddModal}>
                  <Text style={styles.ctaBtnText}>{isHindi ? '+ किसान जोड़ें' : '+ Add Farmer'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredFarms.map(farm => (
              <FarmCard
                key={farm.farm_id}
                farm={farm}
                onPress={() => {/* Future: drill into farm detail */}}
              />
            ))
          )}

          <View style={styles.bottomPad} />
        </View>
      </ScrollView>

      {/* ── ADD FARMER MODAL ─────────────────────────────────────────── */}
      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{isHindi ? '+ किसान जोड़ें' : '+ Add Farmer'}</Text>
            <Text style={styles.modalSub}>
              {isHindi ? 'अपने जिले के खेत' : 'Farms in your district'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {districtFarms.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ color: colors.textMuted, marginTop: spacing.sm }}>
                    {isHindi ? 'लोड हो रहा है…' : 'Loading…'}
                  </Text>
                </View>
              ) : (
                districtFarms.map(f => (
                  <View key={f.farm_id} style={styles.districtFarmRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.distFarmName}>{f.farm_name}</Text>
                      <Text style={styles.distFarmerName}>👤 {f.farmer_name} · 📞 {f.farmer_phone || '—'}</Text>
                      {f.district && <Text style={styles.distMeta}>📍 {f.district}</Text>}
                    </View>
                    {f.already_added ? (
                      <View style={styles.alreadyBadge}><Text style={styles.alreadyText}>{isHindi ? 'जोड़ा' : 'Added'}</Text></View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addFarmBtn}
                        onPress={() => addFarm(f.farm_id)}
                        disabled={addingId === f.farm_id}
                      >
                        {addingId === f.farm_id
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.addFarmBtnText}>{isHindi ? 'जोड़ें' : 'Add'}</Text>
                        }
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowAddModal(false)}>
              <Text style={styles.closeBtnText}>{isHindi ? 'बंद करें' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.background },
  loadingText: { fontSize: fontSizes.md, color: colors.textSecondary },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl + spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  bubble1: { position: 'absolute', top: -50, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.primaryLight, opacity: 0.3 },
  bubble2: { position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primaryLight, opacity: 0.18 },
  backBtn:  { marginBottom: spacing.xs },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: fontSizes.md, fontWeight: fontWeights.medium },
  headerMeta:  { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.65)', fontWeight: fontWeights.medium, textTransform: 'uppercase', letterSpacing: 1 },
  headerTitle: { fontSize: fontSizes.xxxl, fontWeight: fontWeights.extrabold, color: colors.textOnPrimary, marginTop: 4, marginBottom: spacing.sm },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },

  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: '#fff',
    fontSize: fontSizes.md,
  },
  addBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  addBtnText: { color: '#fff', fontWeight: fontWeights.bold, fontSize: fontSizes.md },

  filterRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterTabActive: { backgroundColor: '#fff' },
  filterTabText:       { color: 'rgba(255,255,255,0.8)', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  filterTabTextActive: { color: colors.primary, fontWeight: fontWeights.extrabold },

  // Body
  body:          { marginTop: -spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  card:          { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
  sectionTitle:  { fontSize: fontSizes.lg, fontWeight: fontWeights.extrabold, color: colors.textPrimary, marginBottom: 4 },
  sectionSub:    { fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: spacing.md },
  cropDist:      { marginBottom: spacing.md },
  distLabel:     { fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: spacing.xs },
  cropChips:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  cropChip:      { backgroundColor: colors.primaryLight + '33', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  cropChipText:  { fontSize: fontSizes.xs, color: colors.primary, fontWeight: fontWeights.semibold },
  defBars:       { gap: spacing.sm },

  farmListTitle: { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textSecondary, marginBottom: spacing.md },

  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary },
  emptySub:   { fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  ctaBtn:     { marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  ctaBtnText: { color: '#fff', fontWeight: fontWeights.bold, fontSize: fontSizes.md },

  errorCard: { backgroundColor: '#FEF0F0', borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderLeftWidth: 4, borderLeftColor: '#E74C3C', gap: spacing.sm },
  errorText: { color: '#B91C1C', fontSize: fontSizes.sm },
  retryBtn:  { alignSelf: 'flex-start', backgroundColor: '#E74C3C', borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  retryText: { color: '#fff', fontWeight: fontWeights.bold, fontSize: fontSizes.sm },

  bottomPad: { height: spacing.xxl },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '80%',
  },
  modalHandle:   { width: 40, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  modalTitle:    { fontSize: fontSizes.xl, fontWeight: fontWeights.extrabold, color: colors.textPrimary, marginBottom: 4 },
  modalSub:      { fontSize: fontSizes.sm, color: colors.textMuted, marginBottom: spacing.lg },

  districtFarmRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: spacing.md },
  distFarmName:  { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textPrimary },
  distFarmerName:{ fontSize: fontSizes.sm, color: colors.textSecondary },
  distMeta:      { fontSize: fontSizes.xs, color: colors.textMuted },

  alreadyBadge:  { backgroundColor: '#E8F8F0', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  alreadyText:   { color: colors.statusGood, fontWeight: fontWeights.bold, fontSize: fontSizes.xs },
  addFarmBtn:    { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minWidth: 60, alignItems: 'center' },
  addFarmBtnText:{ color: '#fff', fontWeight: fontWeights.bold, fontSize: fontSizes.sm },

  closeBtn:     { marginTop: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingVertical: spacing.md, alignItems: 'center' },
  closeBtnText: { fontSize: fontSizes.md, fontWeight: fontWeights.semibold, color: colors.textSecondary },
});

// Sub-component styles
const st = StyleSheet.create({
  tile:  { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: 4 },
  icon:  { fontSize: 22 },
  value: { fontSize: fontSizes.xxl, fontWeight: fontWeights.extrabold },
  label: { fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center', fontWeight: fontWeights.medium },
});

const fc = StyleSheet.create({
  card:       { backgroundColor: colors.surface, borderRadius: radius.xl, marginBottom: spacing.md, overflow: 'hidden', flexDirection: 'row' },
  strip:      { width: 6 },
  body:       { flex: 1, padding: spacing.md, flexDirection: 'row' },
  left:       { flex: 1, gap: 3 },
  right:      { alignItems: 'center', justifyContent: 'center', marginLeft: spacing.md, gap: 4 },
  farmName:   { fontSize: fontSizes.md, fontWeight: fontWeights.extrabold, color: colors.textPrimary },
  farmerName: { fontSize: fontSizes.sm, color: colors.textSecondary },
  phone:      { fontSize: fontSizes.xs, color: colors.textMuted },
  meta:       { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
  scanDate:   { fontSize: fontSizes.xs, color: colors.textMuted },
  scoreBadge: { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 0 },
  scoreEmoji: { fontSize: 14 },
  scoreNum:   { fontSize: fontSizes.lg, fontWeight: fontWeights.extrabold, lineHeight: 22 },
  scoreLabel: { fontSize: fontSizes.xs, color: colors.textMuted },
  acres:      { fontSize: fontSizes.xs, color: colors.textMuted },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  lowChip:    { backgroundColor: '#FEE2E2', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  lowChipText:{ fontSize: fontSizes.xs, color: '#B91C1C', fontWeight: fontWeights.bold },
});

const sb = StyleSheet.create({
  defRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  defLabel:  { fontSize: fontSizes.xs, color: colors.textSecondary, width: 110, fontWeight: fontWeights.medium },
  defBarBg:  { flex: 1, height: 8, backgroundColor: '#F0F0F0', borderRadius: 4, overflow: 'hidden' },
  defBarFill:{ height: 8, borderRadius: 4 },
  defPct:    { fontSize: fontSizes.xs, fontWeight: fontWeights.extrabold, width: 36, textAlign: 'right' },
  defCount:  { fontSize: fontSizes.xs, color: colors.textMuted, width: 36, textAlign: 'right' },
});
