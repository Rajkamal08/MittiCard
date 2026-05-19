import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisoryHistory, getAdvisory } from '../services/api';
import i18n from '../i18n';

const formatDate = dateStr => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getScoreColor = score => {
  if (score >= 71) return colors.statusGood;
  if (score >= 41) return colors.statusFair;
  return colors.statusPoor;
};

export default function SoilHistoryScreen({ navigation }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const isHindi = i18n.language === 'hi';

  const loadHistory = useCallback(async (showIndicator = true) => {
    if (showIndicator) setLoading(true);
    setError(null);
    try {
      const res = await getAdvisoryHistory();
      if (res.data?.success && res.data?.history) {
        setHistory(res.data.history);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error('History load error:', err);
      setError(isHindi ? 'इतिहास लोड करने में असमर्थ' : 'Could not load soil history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isHindi]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory(false);
  };

  const handleSelectReport = async (item) => {
    setActionLoadingId(item.id);
    try {
      const detailRes = await getAdvisory(item.id);
      if (detailRes.data?.success && detailRes.data?.data) {
        navigation.navigate('AdvisoryResult', {
          advisory: detailRes.data.data,
          scan_id: item.id,
          crop: item.crop,
          farmSize: detailRes.data.data.farm_size_acres || 1,
          sowing_date: item.sowing_date,
        });
      } else {
        alert(isHindi ? 'रिपोर्ट विवरण लोड करने में असमर्थ' : 'Could not load report details');
      }
    } catch (err) {
      console.error('Fetch report detail error:', err);
      alert(isHindi ? 'रिपोर्ट विवरण लोड करने में असमर्थ' : 'Could not load report details');
    } finally {
      setActionLoadingId(null);
    }
  };

  // NPK comparison chart data preparation
  // Take last 4 scans for readability in chart
  const chartItems = history.slice(0, 4).reverse();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {isHindi ? 'मुख्य स्क्रीन' : 'Home'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isHindi ? 'मृदा स्वास्थ्य इतिहास' : 'Soil Health History'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {error && (
        <View style={{ backgroundColor: '#FEF2F2', padding: spacing.sm, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#FEE2E2' }}>
          <Text style={{ color: colors.statusPoor, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold }}>⚠️ {error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>
            {isHindi ? 'इतिहास लोड किया जा रहा है...' : 'Loading history...'}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {history.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🌾</Text>
              <Text style={styles.emptyText}>
                {isHindi ? 'अभी तक कोई मिट्टी जांच इतिहास नहीं मिला।' : 'No soil test history found.'}
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('SoilInput')}
                style={styles.emptyBtn}
              >
                <Text style={styles.emptyBtnText}>
                  {isHindi ? 'पहला मिट्टी परीक्षण दर्ज करें' : 'Create First Soil Entry'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* ── NPK COMPARISON CHART CARD ─────────────────────────────── */}
              {chartItems.length > 0 && (
                <View style={[styles.chartCard, shadows.sm]}>
                  <Text style={styles.chartTitle}>
                    {isHindi ? '📊 पोषक तत्व स्तर तुलना' : '📊 Nutrient Level Comparison'}
                  </Text>
                  
                  {/* Legend */}
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendIndicator, { backgroundColor: '#EF4444' }]} />
                      <Text style={styles.legendLabel}>N (Nitrogen)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendIndicator, { backgroundColor: '#3B82F6' }]} />
                      <Text style={styles.legendLabel}>P (Phosphorus)</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendIndicator, { backgroundColor: '#F59E0B' }]} />
                      <Text style={styles.legendLabel}>K (Potassium)</Text>
                    </View>
                  </View>

                  {/* Bars Container */}
                  <View style={styles.barsContainer}>
                    {chartItems.map((item, index) => {
                      // Normalize heights relative to reference maximums (N:300, P:50, K:300)
                      const nHeight = Math.max(8, Math.min(100, (parseFloat(item.nitrogen) / 300) * 100));
                      const pHeight = Math.max(8, Math.min(100, (parseFloat(item.phosphorus) / 50) * 100));
                      const kHeight = Math.max(8, Math.min(100, (parseFloat(item.potassium) / 300) * 100));

                      return (
                        <View key={item.id} style={styles.chartGroup}>
                          {/* Visual Graph Column */}
                          <View style={styles.graphGroupColumn}>
                            {/* Nitrogen Bar */}
                            <View style={styles.barTrack}>
                              <View style={[styles.barFill, { height: `${nHeight}%`, backgroundColor: '#EF4444' }]} />
                              <Text style={styles.barValText}>{Math.round(item.nitrogen)}</Text>
                            </View>
                            {/* Phosphorus Bar */}
                            <View style={styles.barTrack}>
                              <View style={[styles.barFill, { height: `${pHeight}%`, backgroundColor: '#3B82F6' }]} />
                              <Text style={styles.barValText}>{Math.round(item.phosphorus)}</Text>
                            </View>
                            {/* Potassium Bar */}
                            <View style={styles.barTrack}>
                              <View style={[styles.barFill, { height: `${kHeight}%`, backgroundColor: '#F59E0B' }]} />
                              <Text style={styles.barValText}>{Math.round(item.potassium)}</Text>
                            </View>
                          </View>
                          {/* Label info */}
                          <Text style={styles.chartGroupLabel} numberOfLines={1}>
                            {item.crop ? item.crop.charAt(0).toUpperCase() + item.crop.slice(1) : 'Crop'}
                          </Text>
                          <Text style={styles.chartGroupSubLabel}>
                            {new Date(item.scanned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ── HISTORY REPORT LIST ───────────────────────────────────── */}
              <Text style={styles.sectionTitle}>
                {isHindi ? '📋 सभी पिछले परीक्षण' : '📋 All Past Tests'}
              </Text>
              
              {history.map((item, index) => {
                const score = item.soil_health_score || 0;
                const scoreColor = getScoreColor(score);
                const isLoadingThis = actionLoadingId === item.id;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.historyCard, shadows.sm]}
                    onPress={() => handleSelectReport(item)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardCropTitle}>
                          🌾 {item.crop ? item.crop.charAt(0).toUpperCase() + item.crop.slice(1) : (isHindi ? 'फसल' : 'Crop')}
                        </Text>
                        <Text style={styles.cardDateSub}>
                          📅 {formatDate(item.scanned_at)}
                        </Text>
                      </View>
                      
                      <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '15', borderColor: scoreColor }]}>
                        <Text style={[styles.scoreBadgeText, { color: scoreColor }]}>
                          {isHindi ? `स्कोर: ${score}` : `Score: ${score}`}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.nutrientsGrid}>
                      <View style={styles.nutrientCol}>
                        <Text style={styles.nutrientLabel}>N</Text>
                        <Text style={styles.nutrientVal}>{item.nitrogen} <Text style={styles.nutrientUnit}>kg/ha</Text></Text>
                      </View>
                      <View style={styles.nutrientCol}>
                        <Text style={styles.nutrientLabel}>P</Text>
                        <Text style={styles.nutrientVal}>{item.phosphorus} <Text style={styles.nutrientUnit}>kg/ha</Text></Text>
                      </View>
                      <View style={styles.nutrientCol}>
                        <Text style={styles.nutrientLabel}>K</Text>
                        <Text style={styles.nutrientVal}>{item.potassium} <Text style={styles.nutrientUnit}>kg/ha</Text></Text>
                      </View>
                      <View style={styles.nutrientCol}>
                        <Text style={styles.nutrientLabel}>pH</Text>
                        <Text style={styles.nutrientVal}>{item.ph}</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={styles.costText}>
                        💵 {isHindi ? `उर्वरक खर्च: ₹${Math.round(item.total_cost)}` : `Fertilizer Cost: ₹${Math.round(item.total_cost)}`}
                      </Text>
                      <View style={styles.viewReportAction}>
                        {isLoadingThis ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text style={styles.viewReportText}>
                            {isHindi ? 'विवरण देखें ›' : 'View Details ›'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primaryDark,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.sm,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: '#FFF',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    marginTop: spacing.sm,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
  },
  emptyBtnText: {
    color: '#FFF',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  chartTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendLabel: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 150,
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  chartGroup: {
    alignItems: 'center',
    width: '22%',
  },
  graphGroupColumn: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    height: 90,
    marginBottom: spacing.xs,
  },
  barTrack: {
    width: '28%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 2,
  },
  barValText: {
    fontSize: 7,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  chartGroupLabel: {
    fontSize: fontSizes.xs - 1,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginTop: 4,
  },
  chartGroupSubLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCropTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  cardDateSub: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scoreBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  scoreBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  nutrientsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutrientCol: {
    alignItems: 'center',
    width: '23%',
  },
  nutrientLabel: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
  nutrientVal: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  nutrientUnit: {
    fontSize: 8,
    fontWeight: fontWeights.regular,
    color: colors.textMuted,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: spacing.xs,
  },
  costText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  viewReportAction: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewReportText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
});
