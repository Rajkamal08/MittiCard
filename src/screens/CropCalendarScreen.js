import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Platform, ScrollView, Animated, ActivityIndicator,
  Alert, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisory, setSowingDate } from '../services/api';
import { useTranslation } from 'react-i18next';

const STATUS_HEIGHT = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 44;

const daysBetween = (a, b) => {
  const ms = new Date(b) - new Date(a);
  return Math.round(ms / 86400000);
};

const eventStatus = (evDate, sowDate) => {
  if (!evDate) return 'unknown';
  const today = new Date();
  const ev    = new Date(evDate);
  const diff  = daysBetween(today, ev);
  if (diff < -1)  return 'done';
  if (diff <= 1)  return 'today';
  return 'upcoming';
};

const statusStyle = status => {
  if (status === 'done')    return { dot: colors.statusGood,    badge: colors.badgeGood,    text: colors.badgeGoodText,    label: 'Completed' };
  if (status === 'today')   return { dot: colors.accent,        badge: colors.accentSurface, text: colors.accentDark,       label: 'Today!' };
  return                           { dot: colors.border,        badge: '#F0F0F0',            text: '#666',                  label: null };
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function CropCalendarScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { scan_id, advisory: advisoryParam, sowing_date: sowParam } = route.params || {};

  const [advisory,  setAdvisory]  = useState(advisoryParam || null);
  const [loading,   setLoading]   = useState(!advisoryParam);
  const [sowDate,   setSowDate]   = useState(sowParam || advisory?.sowing_date || null);
  const [showPicker,setShowPicker]= useState(false);
  const [pDay,      setPDay]      = useState(new Date().getDate());
  const [pMonth,    setPMonth]    = useState(new Date().getMonth() + 1);
  const [pYear,     setPYear]     = useState(new Date().getFullYear());
  const [saving,    setSaving]    = useState(false);

  const fade = useRef(new Animated.Value(0)).current;

  const loadAdvisory = useCallback(async () => {
    if (!scan_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getAdvisory(scan_id);
      if (res.data?.success) {
        const d = res.data.data;
        setAdvisory(d);
        if (d.sowing_date) setSowDate(d.sowing_date);
      }
    } catch {
      Alert.alert('Error', 'Could not load calendar. Check your internet.');
    } finally {
      setLoading(false);
    }
  }, [scan_id]);

  useFocusEffect(useCallback(() => {
    if (!advisoryParam) loadAdvisory();
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []));

  const confirmSowDate = async () => {
    const iso = `${pYear}-${String(pMonth).padStart(2,'0')}-${String(pDay).padStart(2,'0')}`;
    setSaving(true);
    try {
      if (scan_id) await setSowingDate(scan_id, iso);
      setSowDate(iso);
      setShowPicker(false);
      if (scan_id) loadAdvisory();
    } catch {
      Alert.alert('Error', 'Could not save sowing date.');
    } finally {
      setSaving(false); }
  };

  const calendar = advisory?.crop_calendar || [];
  const crop     = advisory?.crop          || '';
  const farmSize = advisory?.farm_size_acres || '';

  const totalEvents    = calendar.length;
  const upcomingEvents = calendar.filter(e => eventStatus(e.event_date) !== 'done').length;

  const formatDate = iso => {
    if (!iso) return '–';
    const d = new Date(iso + 'T00:00:00Z');
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={st.header}>
        <View style={st.blob} />
        <TouchableOpacity style={st.backBtn} onPress={() => navigation.goBack()}>
          <Text style={st.backText}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>{'\u{1F4C5}'} {t('crop_calendar.title') || 'Crop Calendar'}</Text>
        <Text style={st.headerSub}>
          {crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : ''}
          {totalEvents > 0 ? `  \u00B7  ${totalEvents} events` : ''}
          {farmSize ? `  \u00B7  ${farmSize} acres` : ''}
        </Text>

        {/* Sowing date pill */}
        <TouchableOpacity style={st.sowPill} onPress={() => setShowPicker(true)}>
          <Text style={st.sowPillEmoji}>{'\u{1F331}'}</Text>
          <Text style={st.sowPillText}>
            {sowDate ? formatDate(sowDate) : 'Set Sowing Date'}
          </Text>
          <Text style={st.sowPillEdit}>{sowDate ? '\u270F\uFE0F' : '+'}</Text>
        </TouchableOpacity>

        {upcomingEvents > 0 && (
          <View style={st.upcomingBadge}>
            <Text style={st.upcomingText}>{upcomingEvents} upcoming</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={st.loadingBox}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={st.loadingText}>Loading calendar…</Text>
        </View>
      ) : calendar.length === 0 ? (
        <View style={st.emptyBox}>
          <Text style={st.emptyEmoji}>{'\u{1F4C5}'}</Text>
          <Text style={st.emptyTitle}>No Calendar Data</Text>
          <Text style={st.emptySub}>
            {sowDate
              ? 'No events found. Try re-generating your advisory.'
              : 'Set your sowing date to generate a crop schedule.'}
          </Text>
          {!sowDate && (
            <TouchableOpacity style={st.emptyBtn} onPress={() => setShowPicker(true)}>
              <Text style={st.emptyBtnText}>{'\u{1F4C5}'} Set Sowing Date</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <Animated.ScrollView
          style={{ opacity: fade }}
          contentContainerStyle={st.scroll}
          showsVerticalScrollIndicator={false}
        >
          {!sowDate && (
            <TouchableOpacity style={[st.setSowBanner, shadows.sm]} onPress={() => setShowPicker(true)}>
              <Text style={st.setSowBannerText}>{'\u{1F331}'} Set your sowing date to see exact dates</Text>
              <Text style={st.setSowBannerCta}>Set Now {'\u2192'}</Text>
            </TouchableOpacity>
          )}

          {/* Timeline */}
          <View style={st.timeline}>
            {/* Vertical line */}
            <View style={st.timelineLine} />

            {calendar.map((ev, idx) => {
              const evDate = ev.event_date;
              const status = eventStatus(evDate, sowDate);
              const ss     = statusStyle(status);
              const label  = ev.label || ev.event_label || 'Event';
              const days   = ev.days_after_sowing;
              const diff   = evDate ? daysBetween(new Date(), new Date(evDate)) : null;

              return (
                <View key={idx} style={st.eventWrap}>
                  {/* Dot on timeline */}
                  <View style={[st.dot, { backgroundColor: ss.dot }]}>
                    {status === 'today' && <View style={st.dotPulse} />}
                  </View>

                  {/* Event card */}
                  <View style={[st.eventCard, shadows.sm, { borderLeftColor: ss.dot }]}>
                    <View style={st.eventHeader}>
                      <Text style={st.eventLabel} numberOfLines={2}>{label}</Text>
                      {/* Countdown */}
                      {diff !== null && (
                        <View style={[st.countBadge, { backgroundColor: ss.badge }]}>
                          <Text style={[st.countText, { color: ss.text }]}>
                            {status === 'done'  ? 'Completed'
                            : status === 'today' ? 'Today!'
                            : `In ${diff} days`}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Date */}
                    <Text style={st.eventDate}>
                      {evDate ? formatDate(evDate)
                        : days != null ? `Day ${days} after sowing`
                        : '–'}
                    </Text>

                    {/* Reminder status */}
                    <Text style={st.reminderStatus}>
                      {ev.reminder_sent
                        ? '\u2705 Reminder sent'
                        : '\u{1F514} Reminder pending'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.ScrollView>
      )}

      {/* ── Sowing Date Picker Modal ─────────────────────────────────────── */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={st.dpOverlay}>
          <View style={st.dpSheet}>
            <View style={st.dpHandle} />
            <Text style={st.dpTitle}>{'\u{1F331}'} Set Sowing Date</Text>
            <Text style={st.dpSub}>When did / will you sow seeds?</Text>

            <View style={st.dpCols}>
              {/* Day */}
              <View style={{ flex: 1 }}>
                <Text style={st.dpColLabel}>Day</Text>
                <ScrollView style={st.dpScroll} snapToInterval={44} decelerationRate="fast" showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <TouchableOpacity key={d} style={[st.dpItem, pDay===d && st.dpItemActive]} onPress={() => setPDay(d)}>
                      <Text style={[st.dpItemText, pDay===d && st.dpItemTextActive]}>{String(d).padStart(2,'0')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Month */}
              <View style={{ flex: 1.6 }}>
                <Text style={st.dpColLabel}>Month</Text>
                <ScrollView style={st.dpScroll} snapToInterval={44} decelerationRate="fast" showsVerticalScrollIndicator={false}>
                  {MONTHS.map((m, i) => (
                    <TouchableOpacity key={i} style={[st.dpItem, pMonth===i+1 && st.dpItemActive]} onPress={() => setPMonth(i+1)}>
                      <Text style={[st.dpItemText, pMonth===i+1 && st.dpItemTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              {/* Year */}
              <View style={{ flex: 1 }}>
                <Text style={st.dpColLabel}>Year</Text>
                <ScrollView style={st.dpScroll} snapToInterval={44} decelerationRate="fast" showsVerticalScrollIndicator={false}>
                  {[2024,2025,2026,2027,2028].map(y => (
                    <TouchableOpacity key={y} style={[st.dpItem, pYear===y && st.dpItemActive]} onPress={() => setPYear(y)}>
                      <Text style={[st.dpItemText, pYear===y && st.dpItemTextActive]}>{y}</Text>
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
              <TouchableOpacity style={st.dpCancel} onPress={() => setShowPicker(false)}>
                <Text style={st.dpCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.dpConfirm, saving && { opacity: 0.7 }]} onPress={confirmSowDate} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.dpConfirmText}>{'\u2713'} Confirm</Text>}
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
    paddingBottom: spacing.xl, paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden',
  },
  blob: { position: 'absolute', top: -50, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: colors.primaryLight, opacity: 0.25 },
  backBtn: { alignSelf: 'flex-start', marginBottom: spacing.sm, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  backText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: fontWeights.semibold },
  headerTitle: { fontSize: 26, fontWeight: fontWeights.extrabold, color: '#fff', marginBottom: 4 },
  headerSub: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)', marginBottom: spacing.sm },
  sowPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7, marginBottom: spacing.sm },
  sowPillEmoji: { fontSize: 16 },
  sowPillText: { fontSize: fontSizes.sm, color: '#fff', fontWeight: fontWeights.semibold },
  sowPillEdit: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  upcomingBadge: { alignSelf: 'flex-start', backgroundColor: colors.accent, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  upcomingText: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold, color: colors.textOnAccent },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxxl },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontSize: fontSizes.sm, color: colors.textMuted },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyEmoji: { fontSize: 56, marginBottom: spacing.lg },
  emptyTitle: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  emptySub: { fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.xl },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.xxl, ...shadows.sm },
  emptyBtnText: { fontSize: fontSizes.md, fontWeight: fontWeights.bold, color: '#fff' },

  setSowBanner: { backgroundColor: colors.primarySurface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.primaryMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setSowBannerText: { fontSize: fontSizes.sm, color: colors.primary, fontWeight: fontWeights.medium, flex: 1 },
  setSowBannerCta: { fontSize: fontSizes.sm, fontWeight: fontWeights.bold, color: colors.primary },

  // Timeline
  timeline: { position: 'relative', paddingLeft: 28 },
  timelineLine: { position: 'absolute', left: 11, top: 16, bottom: 16, width: 2, backgroundColor: colors.primaryMuted },
  eventWrap: { flexDirection: 'row', marginBottom: spacing.md, alignItems: 'flex-start' },
  dot: { width: 14, height: 14, borderRadius: 7, position: 'absolute', left: -21, top: 14, zIndex: 1 },
  dotPulse: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, opacity: 0.3, top: -4, left: -4 },
  eventCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
    borderWidth: 1, borderColor: colors.border,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 4 },
  eventLabel: { flex: 1, fontSize: fontSizes.sm, fontWeight: fontWeights.semibold, color: colors.textPrimary },
  countBadge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  countText: { fontSize: fontSizes.xs, fontWeight: fontWeights.bold },
  eventDate: { fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: 4 },
  reminderStatus: { fontSize: fontSizes.xs, color: colors.textMuted },

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
  dpItemActive: { backgroundColor: colors.primary },
  dpItemText: { fontSize: fontSizes.md, color: colors.textSecondary, fontWeight: fontWeights.medium },
  dpItemTextActive: { color: '#fff', fontWeight: fontWeights.bold },
  dpPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.primarySurface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  dpPreviewLabel: { fontSize: fontSizes.sm, color: colors.textSecondary },
  dpPreviewDate: { fontSize: fontSizes.lg, fontWeight: fontWeights.bold, color: colors.primary },
  dpBtns: { flexDirection: 'row', gap: spacing.md },
  dpCancel: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingVertical: spacing.md, alignItems: 'center' },
  dpCancelText: { fontSize: fontSizes.md, color: colors.textSecondary, fontWeight: fontWeights.semibold },
  dpConfirm: { flex: 2, borderRadius: radius.md, backgroundColor: colors.primary, paddingVertical: spacing.md, alignItems: 'center' },
  dpConfirmText: { fontSize: fontSizes.md, color: '#fff', fontWeight: fontWeights.bold },
});
