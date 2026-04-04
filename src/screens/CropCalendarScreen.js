import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisory } from '../services/api';

// ─── Event stage emojis ──────────────────────────────────────────────────────
const STAGE_EMOJI = ['🌱', '💧', '🔍', '🌸', '🌾'];

// ─── Event Status ────────────────────────────────────────────────────────────
const getEventStatus = (daysAfterSowing, sowingDate) => {
  if (!sowingDate) return 'future';
  const sow    = new Date(sowingDate);
  const event  = new Date(sow);
  event.setDate(sow.getDate() + daysAfterSowing);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  event.setHours(0, 0, 0, 0);

  const diffDays = Math.round((event - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0)  return { status: 'done',     daysLeft: diffDays,    eventDate: event };
  if (diffDays === 0) return { status: 'today',    daysLeft: 0,           eventDate: event };
  return               { status: 'upcoming',    daysLeft: diffDays,    eventDate: event };
};

const formatDate = date => {
  if (!date) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const formatSowingDate = dateStr => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ─── Timeline Event Card ─────────────────────────────────────────────────────
function EventCard({ event, index, sowingDate, isLast }) {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        delay: index * 120,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const eventInfo = sowingDate ? getEventStatus(event.days_after_sowing, sowingDate) : null;
  const status    = eventInfo?.status || 'future';

  const statusConfig = {
    done:     { dotColor: colors.textMuted,  cardBg: '#F5F5F5', textColor: colors.textMuted,    badge: 'Done',        badgeBg: '#E8E8E8' },
    today:    { dotColor: colors.statusGood, cardBg: '#EAF7EF', textColor: colors.statusGood,   badge: 'Today!',      badgeBg: colors.statusGood },
    upcoming: { dotColor: colors.primary,    cardBg: colors.surface, textColor: colors.textPrimary, badge: null,      badgeBg: null },
    future:   { dotColor: colors.borderFocus, cardBg: colors.surface, textColor: colors.textPrimary, badge: null,     badgeBg: null },
  };

  const cfg = statusConfig[status];

  return (
    <Animated.View
      style={[
        styles.eventRow,
        { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
      ]}
    >
      {/* Timeline line + dot */}
      <View style={styles.timelineCol}>
        <View
          style={[
            styles.timelineDot,
            {
              backgroundColor: status === 'done' ? colors.textMuted : cfg.dotColor,
              borderColor: cfg.dotColor,
              borderWidth: status === 'future' ? 2 : 0,
            },
          ]}
        >
          <Text style={styles.timelineDotIndex}>{index + 1}</Text>
        </View>
        {!isLast && (
          <View
            style={[
              styles.timelineLine,
              { backgroundColor: status === 'done' ? colors.textMuted : colors.border },
            ]}
          />
        )}
      </View>

      {/* Card */}
      <View style={[styles.eventCard, { backgroundColor: cfg.cardBg }, shadows.sm]}>
        {/* Day + date */}
        <View style={styles.eventCardHeader}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeEmoji}>{STAGE_EMOJI[index] || '📌'}</Text>
            <Text style={styles.dayBadgeText}>Day {event.days_after_sowing}</Text>
          </View>

          {/* Status badge */}
          {cfg.badge && (
            <View style={[styles.statusBadge, { backgroundColor: cfg.badgeBg }]}>
              <Text style={styles.statusBadgeText}>{cfg.badge}</Text>
            </View>
          )}

          {/* Countdown */}
          {eventInfo && status === 'upcoming' && (
            <View style={[styles.countdownBadge]}>
              <Text style={styles.countdownText}>
                in {eventInfo.daysLeft} days
              </Text>
            </View>
          )}
          {eventInfo && status === 'done' && (
            <Text style={styles.doneAgoText}>
              {Math.abs(eventInfo.daysLeft)} days ago
            </Text>
          )}
        </View>

        {/* Label */}
        <Text style={[styles.eventLabel, { color: cfg.textColor }]}>
          {event.label}
        </Text>

        {/* Actual date (if sowing date known) */}
        {eventInfo?.eventDate && (
          <Text style={[styles.eventDate, { color: cfg.textColor, opacity: 0.65 }]}>
            {formatDate(eventInfo.eventDate)}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Main CropCalendarScreen ─────────────────────────────────────────────────
export default function CropCalendarScreen({ navigation, route }) {
  const { scan_id, advisory: advisoryParam } = route.params || {};

  // crop_calendar may be missing even if advisory was passed (HomeScreen only stores scan summary)
  // So: if advisory exists but has no crop_calendar, still fetch from API
  const needsFetch = !advisoryParam || !advisoryParam.crop_calendar;
  const [advisory,  setAdvisory]  = useState(advisoryParam && advisoryParam.crop_calendar ? advisoryParam : null);
  const [loading,   setLoading]   = useState(needsFetch);
  const [error,     setError]     = useState(null);

  const headerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  // Fetch advisory when: no advisory passed, OR advisory has no crop_calendar
  useEffect(() => {
    if (needsFetch && scan_id) {
      const fetchAdvisory = async () => {
        try {
          const res = await getAdvisory(scan_id);
          if (res.data.success) {
            setAdvisory(res.data.data);
          } else {
            setError('Could not load calendar data');
          }
        } catch {
          setError('Could not connect to server');
        } finally {
          setLoading(false);
        }
      };
      fetchAdvisory();
    } else if (needsFetch && !scan_id) {
      // No scan_id passed — can't fetch, show error instead of hanging
      setError('No scan data found. Please scan a soil card first.');
      setLoading(false);
    }
  }, [scan_id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading calendar...</Text>
      </View>
    );
  }

  if (error || !advisory) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>📅</Text>
        <Text style={styles.errorTitle}>{error || 'No data available'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const calendar    = advisory.crop_calendar || [];
  const crop        = advisory.crop || '';
  const cropLabel   = crop.charAt(0).toUpperCase() + crop.slice(1);
  const sowingDate  = advisory.sowing_date || null;
  const totalDays   = calendar.length > 0 ? calendar[calendar.length - 1].days_after_sowing : 0;

  // Count events by status
  const statusCounts = calendar.reduce((acc, ev) => {
    const info = sowingDate ? getEventStatus(ev.days_after_sowing, sowingDate) : null;
    const s    = info?.status || 'future';
    acc[s]     = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBubble} />

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Animated.View style={{ opacity: headerFade }}>
            <Text style={styles.headerTitle}>📅 Crop Calendar</Text>
            <Text style={styles.headerCrop}>
              {cropLabel} · {calendar.length} events · {totalDays} days total
            </Text>

            {/* Sowing date status */}
            {sowingDate ? (
              <View style={styles.sowingBadge}>
                <Text style={styles.sowingBadgeText}>
                  Sown: {formatSowingDate(sowingDate)}
                </Text>
              </View>
            ) : (
              <View style={[styles.sowingBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.sowingBadgeText}>
                  No sowing date — enter it next time for countdowns
                </Text>
              </View>
            )}

            {/* Progress summary (only if sowing date set) */}
            {sowingDate && (
              <View style={styles.progressRow}>
                {statusCounts.done > 0 && (
                  <View style={styles.progressChip}>
                    <Text style={styles.progressChipText}>
                      {statusCounts.done} done
                    </Text>
                  </View>
                )}
                {statusCounts.today > 0 && (
                  <View style={[styles.progressChip, { backgroundColor: colors.statusGood }]}>
                    <Text style={[styles.progressChipText, { color: '#fff' }]}>
                      1 today!
                    </Text>
                  </View>
                )}
                {statusCounts.upcoming > 0 && (
                  <View style={[styles.progressChip, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={styles.progressChipText}>
                      {statusCounts.upcoming} upcoming
                    </Text>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        </View>

        {/* ── TIMELINE ──────────────────────────────────────────────── */}
        <View style={styles.timelineSection}>

          {/* No events fallback */}
          {calendar.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyTitle}>No calendar available</Text>
              <Text style={styles.emptySub}>Calendar data for {cropLabel} is coming soon</Text>
            </View>
          ) : (
            calendar.map((event, index) => (
              <EventCard
                key={index}
                event={event}
                index={index}
                sowingDate={sowingDate}
                isLast={index === calendar.length - 1}
              />
            ))
          )}

          {/* ── IMPORTANT NOTE ───────────────────────────────────── */}
          {!sowingDate && (
            <View style={styles.noDateTip}>
              <Text style={styles.noDateTipIcon}>💡</Text>
              <View style={styles.noDateTipText}>
                <Text style={styles.noDateTipTitle}>Want countdowns?</Text>
                <Text style={styles.noDateTipBody}>
                  Enter your sowing date next time you scan. We'll show you exactly how many days until each stage and send you reminders.
                </Text>
              </View>
            </View>
          )}

          {/* ── BACK TO ADVISORY ─────────────────────────────────── */}
          <TouchableOpacity
            style={styles.backToAdvisoryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backToAdvisoryText}>View Fertilizer Advisory</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Loading / error state
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.md,
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
    gap: spacing.sm,
  },
  headerBubble: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.primaryLight,
    opacity: 0.3,
  },
  backBtn: { marginBottom: spacing.xs },
  backText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
  },
  headerTitle: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: colors.textOnPrimary,
    marginBottom: 4,
  },
  headerCrop: {
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: spacing.sm,
  },

  // Sowing date badge
  sowingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  sowingBadgeText: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },

  // Progress chips
  progressRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  progressChip: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  progressChipText: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },

  // Timeline section
  timelineSection: {
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xl,
    gap: 0,
  },

  // Event row (dot + card)
  eventRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: 0,
  },

  // Timeline left column
  timelineCol: {
    alignItems: 'center',
    width: 36,
  },
  timelineDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineDotIndex: {
    color: '#fff',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extrabold,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 24,
    marginVertical: 4,
  },

  // Event card
  eventCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayBadgeEmoji: { fontSize: 16 },
  dayBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extrabold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extrabold,
    color: '#fff',
  },
  countdownBadge: {
    backgroundColor: colors.primary + '18',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  countdownText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  doneAgoText: {
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  eventLabel: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 22,
  },
  eventDate: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // No date tip
  noDateTip: {
    backgroundColor: '#FFF8EC',
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  noDateTipIcon: { fontSize: 22 },
  noDateTipText: { flex: 1, gap: 4 },
  noDateTipTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#7A5200',
  },
  noDateTipBody: {
    fontSize: fontSizes.sm,
    color: '#7A6030',
    lineHeight: 20,
  },

  // Back to advisory button
  backToAdvisoryBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  backToAdvisoryText: {
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
});
