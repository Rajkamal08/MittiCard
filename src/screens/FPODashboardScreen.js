/**
 * FPODashboardScreen.js — MittiCard
 *
 * FPO Manager sees:
 *   - Summary stats (farms, avg health score, top deficiency)
 *   - Per-farm soil data cards
 *   - Deficiency breakdown chart
 *   - Add Farmer button → browse district farms
 *   - Export CSV button
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, StatusBar, Alert,
  Modal, ScrollView, Animated, Linking, Platform,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getFPOFarms, getFPOStats, getFPODistrictFarms, addFarmToFPO } from '../services/api';

const HEADER_PADDING_TOP = Platform.OS === 'android' ? 48 : 52;

// ─── Nutrient Status Badge ─────────────────────────────────────────────────────
const Badge = ({ label, value, low }) => (
  <View style={[styles.badge, { backgroundColor: low ? '#FEE2E2' : '#DCFCE7' }]}>
    <Text style={[styles.badgeText, { color: low ? colors.statusPoor : colors.statusGood }]}>
      {label}: {value ?? '—'}
    </Text>
  </View>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color }) => (
  <View style={[styles.statCard, { borderTopColor: color || colors.primary }]}>
    <Text style={[styles.statValue, { color: color || colors.primary }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
  </View>
);

// ─── Farm Card ────────────────────────────────────────────────────────────────
const FarmCard = ({ farm }) => {
  const score = farm.soil_health_score ?? '—';
  const scoreColor =
    score === '—' ? colors.textMuted :
    score >= 70 ? colors.statusGood :
    score >= 40 ? colors.statusWarning : colors.statusPoor;

  const isNLow  = farm.nitrogen   != null && farm.nitrogen   < 140;
  const isPLow  = farm.phosphorus != null && farm.phosphorus < 11;
  const isKLow  = farm.potassium  != null && farm.potassium  < 108;
  const isPhLow = farm.ph         != null && (farm.ph < 6.0 || farm.ph > 8.0);

  return (
    <View style={styles.farmCard}>
      {/* Header row */}
      <View style={styles.farmHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.farmName}>{farm.farm_name || 'Unnamed Farm'}</Text>
          <Text style={styles.farmerName}>👤 {farm.farmer_name || '—'} · {farm.farmer_phone || '—'}</Text>
          {farm.district ? <Text style={styles.farmDistrict}>📍 {farm.district}</Text> : null}
        </View>
        <View style={[styles.scorePill, { backgroundColor: scoreColor + '20' }]}>
          <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>Score</Text>
        </View>
      </View>

      {/* Crop + cost row */}
      {farm.crop ? (
        <View style={styles.cropRow}>
          <Text style={styles.cropTag}>🌾 {farm.crop}</Text>
          {farm.total_cost ? (
            <Text style={styles.costTag}>₹{Number(farm.total_cost).toLocaleString('en-IN')}</Text>
          ) : null}
          {farm.size_acres ? (
            <Text style={styles.acreTag}>{farm.size_acres} acres</Text>
          ) : null}
        </View>
      ) : null}

      {/* Nutrient badges */}
      {(farm.nitrogen != null || farm.ph != null) ? (
        <View style={styles.badgeRow}>
          {farm.ph        != null && <Badge label="pH"  value={Number(farm.ph).toFixed(1)} low={isPhLow} />}
          {farm.nitrogen  != null && <Badge label="N"   value={farm.nitrogen}  low={isNLow} />}
          {farm.phosphorus!= null && <Badge label="P"   value={farm.phosphorus} low={isPLow} />}
          {farm.potassium != null && <Badge label="K"   value={farm.potassium}  low={isKLow} />}
        </View>
      ) : (
        <Text style={styles.noScanText}>No soil scan yet</Text>
      )}

      {/* Last scanned */}
      {farm.scanned_at ? (
        <Text style={styles.scanDate}>
          Last scan: {new Date(farm.scanned_at).toLocaleDateString('en-IN')}
        </Text>
      ) : null}
    </View>
  );
};

// ─── Add Farm Modal ───────────────────────────────────────────────────────────
const AddFarmModal = ({ visible, onClose, onAdded }) => {
  const [farms,   setFarms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(null); // farm_id being added

  useEffect(() => {
    if (visible) loadDistrictFarms();
  }, [visible]);

  const loadDistrictFarms = async () => {
    try {
      setLoading(true);
      const res = await getFPODistrictFarms();
      setFarms(res.data.farms || []);
    } catch { setFarms([]); }
    finally  { setLoading(false); }
  };

  const handleAdd = async (farm_id) => {
    try {
      setAdding(farm_id);
      await addFarmToFPO(farm_id);
      setFarms(prev => prev.map(f =>
        f.farm_id === farm_id ? { ...f, already_added: true } : f
      ));
      onAdded();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not add farm');
    } finally { setAdding(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Add Farmers Near You</Text>
          <Text style={styles.modalSub}>Farmers in your district who have used MittiCard</Text>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : farms.length === 0 ? (
            <View style={styles.emptyModal}>
              <Text style={styles.emptyIcon}>🌾</Text>
              <Text style={styles.emptyText}>No farmers found in your district yet.</Text>
              <Text style={styles.emptySubText}>When farmers in your area log in and scan, they'll appear here.</Text>
            </View>
          ) : (
            <FlatList
              data={farms}
              keyExtractor={i => i.farm_id}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item }) => (
                <View style={styles.districtFarmRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dfName}>{item.farmer_name || '—'}</Text>
                    <Text style={styles.dfPhone}>{item.farmer_phone} · {item.farm_name}</Text>
                    {item.district ? <Text style={styles.dfDistrict}>📍 {item.district}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.addBtn,
                      item.already_added && styles.addBtnDone,
                    ]}
                    onPress={() => !item.already_added && handleAdd(item.farm_id)}
                    disabled={item.already_added || adding === item.farm_id}
                  >
                    {adding === item.farm_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.addBtnText}>
                        {item.already_added ? '✓ Added' : '+ Add'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function FPODashboardScreen({ navigation }) {
  const [farms,     setFarms]     = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [addModal,  setAddModal]  = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [farmsRes, statsRes] = await Promise.all([
        getFPOFarms(),
        getFPOStats(),
      ]);
      setFarms(farmsRes.data.farms || []);
      setStats(statsRes.data);
    } catch (e) {
      Alert.alert('Error', 'Could not load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }).start();
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleExport = () => {
    Alert.alert(
      'Export CSV',
      'This will download a CSV file with all farm data for bulk fertilizer ordering.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () => {
            // Open the export URL in browser (downloads CSV)
            const token = ''; // token passed via header in real impl
            Alert.alert('Note', 'Open Render URL /fpo/export with your auth token in a browser or Postman to download CSV.');
          },
        },
      ]
    );
  };

  // ─── Deficiency bar ─────────────────────────────────────────────────────────
  const DefBar = ({ label, pct }) => {
    const num = parseInt(pct) || 0;
    const barColor = num > 60 ? colors.statusPoor : num > 30 ? colors.statusWarning : colors.statusGood;
    return (
      <View style={styles.defRow}>
        <Text style={styles.defLabel}>{label}</Text>
        <View style={styles.defBarBg}>
          <View style={[styles.defBarFill, { width: `${num}%`, backgroundColor: barColor }]} />
        </View>
        <Text style={[styles.defPct, { color: barColor }]}>{pct}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard…</Text>
      </View>
    );
  }

  const def = stats?.deficiency_breakdown || {};
  const totalFarms = stats?.total_farms_scanned ?? farms.length;
  const avgScore   = stats?.average_soil_health_score ?? '—';
  const topCrop    = stats?.crop_distribution
    ? Object.entries(stats.crop_distribution).sort((a, b) => b[1] - a[1])[0]?.[0]
    : '—';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>FPO Dashboard</Text>
          <Text style={styles.headerSub}>Farmer Producer Organisation</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
          <Text style={styles.exportIcon}>📥</Text>
          <Text style={styles.exportText}>CSV</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={farms}
          keyExtractor={(item, i) => item.farm_id?.toString() || i.toString()}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          ListHeaderComponent={() => (
            <>
              {/* ── Stats row ── */}
              <View style={styles.statsRow}>
                <StatCard
                  label="Farms Tracked"
                  value={farms.length}
                  sub={`${totalFarms} scanned`}
                  color={colors.primary}
                />
                <StatCard
                  label="Avg Score"
                  value={avgScore === '—' ? '—' : `${avgScore}/100`}
                  color={avgScore >= 70 ? colors.statusGood : avgScore >= 40 ? colors.statusWarning : colors.statusPoor}
                />
                <StatCard
                  label="Top Crop"
                  value={topCrop}
                  color={colors.accent}
                />
              </View>

              {/* ── Deficiency breakdown ── */}
              {stats && totalFarms > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>⚠️ District Deficiency Report</Text>
                  <Text style={styles.sectionSub}>% of farms with low nutrient levels</Text>
                  <DefBar label="Nitrogen (N)"  pct={def.nitrogen_low?.percentage      || '0%'} />
                  <DefBar label="Phosphorus (P)" pct={def.phosphorus_low?.percentage   || '0%'} />
                  <DefBar label="Potassium (K)"  pct={def.potassium_low?.percentage    || '0%'} />
                  <DefBar label="Organic Carbon" pct={def.organic_carbon_low?.percentage || '0%'} />
                  <DefBar label="Zinc"            pct={def.zinc_deficient?.percentage   || '0%'} />
                  <DefBar label="Sulfur"          pct={def.sulfur_deficient?.percentage || '0%'} />
                </View>
              )}

              {/* ── Farm list header ── */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🌾 Your Farms ({farms.length})</Text>
                <TouchableOpacity style={styles.addFarmBtn} onPress={() => setAddModal(true)}>
                  <Text style={styles.addFarmBtnText}>+ Add Farmer</Text>
                </TouchableOpacity>
              </View>

              {farms.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🌱</Text>
                  <Text style={styles.emptyTitle}>No farms yet</Text>
                  <Text style={styles.emptyDesc}>
                    Tap "+ Add Farmer" to add farmers from your district.{'\n'}
                    Once farmers scan their soil, data appears here.
                  </Text>
                  <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setAddModal(true)}>
                    <Text style={styles.emptyAddBtnText}>+ Add Farmer Now</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
          renderItem={({ item }) => <FarmCard farm={item} />}
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      </Animated.View>

      {/* Add Farm Modal */}
      <AddFarmModal
        visible={addModal}
        onClose={() => setAddModal(false)}
        onAdded={() => { setAddModal(false); load(); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.background },
  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText:    { marginTop: 12, color: colors.textSecondary, fontSize: fontSizes.md },

  // Header
  header: {
    backgroundColor: colors.primary,
    paddingTop: HEADER_PADDING_TOP,
    paddingBottom: 22,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...shadows.md,
  },
  headerBubble: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.primaryLight,
    opacity: 0.3,
  },
  backBtn:       { padding: 8, marginRight: 8 },
  backArrow:     { fontSize: 22, color: '#fff', fontWeight: fontWeights.bold },
  headerTitle:   { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: '#fff' },
  headerSub:     { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  exportBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  exportIcon:    { fontSize: 14, marginRight: 4 },
  exportText:    { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },

  listContent:   { padding: spacing.md },

  // Stats
  statsRow:      { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderTopWidth: 3, ...shadows.sm, alignItems: 'center',
  },
  statValue:     { fontSize: fontSizes.xl, fontWeight: fontWeights.extrabold },
  statLabel:     { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  statSub:       { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },

  // Section
  section:       { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, ...shadows.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle:  { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textPrimary },
  sectionSub:    { fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: spacing.sm },

  addFarmBtn:    { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 6 },
  addFarmBtnText:{ color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },

  // Deficiency bar
  defRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  defLabel:      { width: 120, fontSize: fontSizes.xs, color: colors.textSecondary },
  defBarBg:      { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' },
  defBarFill:    { height: '100%', borderRadius: 4 },
  defPct:        { width: 36, textAlign: 'right', fontSize: fontSizes.xs, fontWeight: fontWeights.semibold },

  // Farm card
  farmCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
  },
  farmHeader:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  farmName:      { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: colors.textPrimary },
  farmerName:    { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
  farmDistrict:  { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  scorePill:     { borderRadius: radius.md, padding: 8, alignItems: 'center', minWidth: 56 },
  scoreNum:      { fontSize: fontSizes.lg, fontWeight: fontWeights.extrabold },
  scoreLabel:    { fontSize: fontSizes.xs },

  cropRow:       { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  cropTag:       { backgroundColor: colors.primaryLight + '20', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, fontSize: fontSizes.xs, color: colors.primaryDark, fontWeight: fontWeights.medium },
  costTag:       { backgroundColor: colors.accent + '20', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, fontSize: fontSizes.xs, color: colors.accentDark, fontWeight: fontWeights.medium },
  acreTag:       { backgroundColor: colors.border, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, fontSize: fontSizes.xs, color: colors.textSecondary },

  badgeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge:         { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: fontSizes.xs, fontWeight: fontWeights.semibold },
  noScanText:    { fontSize: fontSizes.xs, color: colors.textMuted, fontStyle: 'italic' },
  scanDate:      { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 8 },

  // Empty state
  emptyState:    { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.textPrimary },
  emptyDesc:     { fontSize: fontSizes.sm, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyAddBtn:   { marginTop: 20, backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 24, paddingVertical: 12 },
  emptyAddBtnText:{ color: '#fff', fontWeight: fontWeights.semibold, fontSize: fontSizes.md },

  // Add Farm Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.md, maxHeight: '85%',
  },
  modalHandle:   { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:    { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: 4 },
  modalSub:      { fontSize: fontSizes.sm, color: colors.textSecondary, marginBottom: 16 },
  emptyModal:    { alignItems: 'center', paddingVertical: 32 },
  emptyText:     { fontSize: fontSizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
  emptySubText:  { fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center', marginTop: 6 },

  districtFarmRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dfName:        { fontSize: fontSizes.md, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  dfPhone:       { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
  dfDistrict:    { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },

  addBtn:        { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, minWidth: 70, alignItems: 'center' },
  addBtnDone:    { backgroundColor: colors.statusGood },
  addBtnText:    { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },

  closeBtn:      { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  closeBtnText:  { color: '#fff', fontSize: fontSizes.md, fontWeight: fontWeights.bold },
});
