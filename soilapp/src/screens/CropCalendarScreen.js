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
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Tts from 'react-native-tts';
import i18n from '../i18n';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisory, api } from '../services/api';
import { useTranslation } from 'react-i18next';

// ─── Event stage emojis ──────────────────────────────────────────────────────
const STAGE_EMOJI = ['🌱', '💧', '🔍', '🌸', '🌾'];

// ─── Parse sowing date from multiple formats ─────────────────────────────────
// Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
const parseDateStr = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  // DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return new Date(slashMatch[3], slashMatch[2] - 1, slashMatch[1]);
  // DD-MM-YYYY
  const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) return new Date(dashMatch[3], dashMatch[2] - 1, dashMatch[1]);
  // YYYY-MM-DD (ISO from backend)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(isoMatch[1], isoMatch[2] - 1, isoMatch[3]);
  // Fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// ─── Event Status ────────────────────────────────────────────────────────────
const getEventStatus = (daysAfterSowing, sowingDate) => {
  const sow = parseDateStr(sowingDate);
  if (!sow) return { status: 'future', daysLeft: null, eventDate: null };
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
  if (!date || isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const formatSowingDate = dateStr => {
  const d = parseDateStr(dateStr);
  if (!d) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ─── Timeline Event Stage Translations ────────────────────────────────────────
const STAGE_TRANSLATIONS = {
  sowing:          { en: 'Land prep & sowing',           hi: 'भूमि की तैयारी और बुवाई' },
  germination:     { en: 'Germination & emergence',      hi: 'अंकुरण और सिंचाई' },
  top_dressing:    { en: 'Fertilizer top dressing',      hi: 'उर्वरक अनुप्रयोग (टॉप ड्रेसिंग)' },
  irrigation:      { en: 'Irrigation stage',             hi: 'सिंचाई का चरण' },
  weeding:         { en: 'Weeding & cultivation',        hi: 'निराई-गुड़ाई (खरपतवार नियंत्रण)' },
  pest_monitoring: { en: 'Pest monitoring & control',    hi: 'कीट नियंत्रण और फसल निगरानी' },
  flowering:       { en: 'Critical flowering stage',     hi: 'फूल आने का चरण' },
  harvesting:      { en: 'Harvesting & storage prep',    hi: 'फसल की कटाई और भंडारण' },
};

// ─── Timeline Event Card ─────────────────────────────────────────────────────
function EventCard({ 
  event, 
  index, 
  sowingDate, 
  isLast, 
  completedEvents, 
  toggleEventComplete, 
  speakingIndex, 
  setSpeakingIndex 
}) {
  const { t }     = useTranslation();
  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 100, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHindi = i18n.language === 'hi';
  const isCompleted = completedEvents.includes(index);
  const eventInfo   = sowingDate ? getEventStatus(event.days_after_sowing, sowingDate) : null;
  
  // Override status to 'done' if user manually checked it
  const status      = isCompleted ? 'done' : (eventInfo?.status || 'future');

  const statusConfig = {
    done:     { dotColor: colors.textMuted,    cardBg: '#F5F7F6',        textColor: colors.textMuted,      badge: isHindi ? 'पूरा ✓' : 'Done ✓', badgeBg: colors.statusGood + '15' },
    today:    { dotColor: colors.statusGood,   cardBg: '#EAF7EF',        textColor: colors.statusGood,     badge: isHindi ? 'आज' : t('calendar.today'),                         badgeBg: colors.statusGood },
    upcoming: { dotColor: colors.primary,      cardBg: colors.surface,   textColor: colors.textPrimary,    badge: null, badgeBg: null },
    future:   { dotColor: colors.borderFocus,  cardBg: colors.surface,   textColor: colors.textPrimary,    badge: null, badgeBg: null },
  };
  const cfg = statusConfig[status];

  // Bilingual details extraction
  const details = isHindi
    ? (event.details_hi || { what: event.label, why: 'अपनी फसल के लिए अनुशंसित कृषि विज्ञान पद्धतियों का पालन करें।', tip: 'क्षेत्र-विशिष्ट सलाह के लिए अपने स्थानीय KVK से परामर्श करें।' })
    : (event.details_en || { what: event.label, why: 'Follow recommended agronomic practices for your crop.', tip: 'Consult your local KVK for region-specific advice.' });

  // Resolve Stage translations to simplify English stage names and perfectly show Hindi titles
  const stageKey = (() => {
    const l = (event.label || '').toLowerCase();
    if (l.includes('sow') || l.includes('plant') || l.includes('prep')) return 'sowing';
    if (l.includes('germin') || l.includes('emerg'))                    return 'germination';
    if (l.includes('top') || l.includes('dressing'))                    return 'top_dressing';
    if (l.includes('irrig') || l.includes('water'))                     return 'irrigation';
    if (l.includes('weed'))                                             return 'weeding';
    if (l.includes('pest') || l.includes('spray') || l.includes('monitor')) return 'pest_monitoring';
    if (l.includes('flower') || l.includes('bloom'))                    return 'flowering';
    if (l.includes('harvest') || l.includes('reap'))                    return 'harvesting';
    return null;
  })();

  const displayLabel = stageKey 
    ? (isHindi ? STAGE_TRANSLATIONS[stageKey].hi : STAGE_TRANSLATIONS[stageKey].en)
    : event.label;

  const isSpeaking = speakingIndex === index;

  const handleSpeakEvent = async () => {
    if (isSpeaking) {
      Tts.stop();
      setSpeakingIndex(null);
    } else {
      Tts.stop();
      setSpeakingIndex(index);
      
      const textToSpeak = isHindi
        ? `दिन ${event.days_after_sowing}। कार्य: ${details.what}। महत्व: ${details.why}। सुझाव: ${details.tip}`
        : `Day ${event.days_after_sowing}. Task: ${details.what}. Importance: ${details.why}. Expert tip: ${details.tip}`;
      
      try {
        await Tts.getInitStatus();
        const lang = isHindi ? 'hi-IN' : 'en-IN';
        await Tts.setDefaultLanguage(lang);
        await Tts.setDefaultRate(0.48);
        await Tts.setDefaultPitch(1.0);
        await Tts.setDucking(true);
        
        Tts.speak(textToSpeak, {
          androidParams: {
            KEY_PARAM_PAN: 0.0,
            KEY_PARAM_VOLUME: 1.0,
            KEY_PARAM_STREAM: 'STREAM_MUSIC',
          }
        });
      } catch (err) {
        Tts.setDefaultLanguage('en-US').then(() => {
          Tts.speak(textToSpeak);
        }).catch(() => {});
      }
    }
  };

  useEffect(() => {
    // If speaking finished/cancelled by other screens or events, reset our speakingIndex
    const finishSub = Tts.addEventListener('tts-finish', () => {
      if (speakingIndex === index) setSpeakingIndex(null);
    });
    const cancelSub = Tts.addEventListener('tts-cancel', () => {
      if (speakingIndex === index) setSpeakingIndex(null);
    });
    const errorSub = Tts.addEventListener('tts-error', () => {
      if (speakingIndex === index) setSpeakingIndex(null);
    });

    return () => {
      finishSub.remove();
      cancelSub.remove();
      errorSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingIndex]);

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
      <TouchableOpacity 
        style={[
          styles.eventCard, 
          { backgroundColor: cfg.cardBg, borderColor: isCompleted ? '#E2E8F0' : isSpeaking ? colors.primary : 'transparent', borderWidth: 1 }, 
          shadows.sm,
          isCompleted && { opacity: 0.8 }
        ]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.92}
      >
        <View style={styles.eventCardHeaderRow}>
          {/* Day + date */}
          <View style={styles.eventCardHeader}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeEmoji}>{STAGE_EMOJI[index % STAGE_EMOJI.length] || '📌'}</Text>
              <Text style={[styles.dayBadgeText, isCompleted && { color: colors.textMuted }]}>
                {isHindi ? 'दिन' : 'Day'} {event.days_after_sowing}
              </Text>
            </View>

            {/* Status badge */}
            {cfg.badge && (
              <View style={[styles.statusBadge, { backgroundColor: cfg.badgeBg }]}>
                <Text style={[styles.statusBadgeText, { color: isCompleted ? colors.statusGood : '#fff' }]}>
                  {cfg.badge}
                </Text>
              </View>
            )}

            {/* Countdown */}
            {eventInfo && status === 'upcoming' && (
              <View style={[styles.countdownBadge]}>
                <Text style={styles.countdownText}>
                  {t('calendar.in_days', { n: eventInfo.daysLeft })}
                </Text>
              </View>
            )}
            {eventInfo && status === 'done' && !isCompleted && (
              <Text style={styles.doneAgoText}>
                {t('calendar.days_ago', { n: Math.abs(eventInfo.daysLeft) })}
              </Text>
            )}
          </View>

          {/* Interactive Checkbox completed toggle */}
          <TouchableOpacity 
            style={[styles.checkboxContainer, isCompleted && styles.checkboxContainerChecked]}
            onPress={() => toggleEventComplete(index)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            {isCompleted && <Text style={styles.checkboxCheckmark}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Label */}
        <Text style={[
          styles.eventLabel, 
          { color: isCompleted ? colors.textMuted : cfg.textColor },
          isCompleted && { textDecorationLine: 'line-through' }
        ]}>
          {displayLabel}
        </Text>

        {/* Actual date (if sowing date known) */}
        {eventInfo?.eventDate && (
          <Text style={[styles.eventDate, { color: isCompleted ? colors.textMuted : cfg.textColor, opacity: 0.65 }]}>
            📅 {formatDate(eventInfo.eventDate)}
          </Text>
        )}

        <Text style={styles.expandHint}>
          {expanded 
            ? (isHindi ? '▲ बंद करने के लिए टैप करें' : '▲ Tap to collapse') 
            : (isHindi ? '▼ दिशानिर्देश और ऑडियो देखने के लिए टैप करें' : '▼ Tap to open guidelines & audio')}
        </Text>

        {/* Accordion Expandable drawer */}
        {expanded && (
          <View style={styles.expandedContent}>
            <View style={styles.expandedDivider} />
            
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>🌾 {isHindi ? 'क्या करें (Instruction):' : 'What to Do:'}</Text>
              <Text style={styles.detailBody}>{details.what}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>🎯 {isHindi ? 'क्यों महत्वपूर्ण है (Importance):' : 'Why it Matters:'}</Text>
              <Text style={styles.detailBody}>{details.why}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>💡 {isHindi ? 'किसान सुझाव (Farmer Tip):' : 'Pro Farmer Tip:'}</Text>
              <Text style={styles.detailBody}>{details.tip}</Text>
            </View>

            {/* Audio Voice Guide Button */}
            <TouchableOpacity 
              style={[styles.audioGuideBtn, isSpeaking && styles.audioGuideBtnActive]}
              onPress={handleSpeakEvent}
            >
              <Text style={styles.audioGuideBtnEmoji}>{isSpeaking ? '⏹' : '🔊'}</Text>
              <Text style={styles.audioGuideBtnText}>
                {isSpeaking ? (isHindi ? 'बंद करें (Stop)' : 'Stop Guide') : (isHindi ? 'दिशानिर्देश सुनें (Listen Guide)' : 'Listen to Guide')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main CropCalendarScreen ─────────────────────────────────────────────────
export default function CropCalendarScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { scan_id, advisory: advisoryParam } = route.params || {};

  // crop_calendar may be missing even if advisory was passed (HomeScreen only stores scan summary)
  // So: if advisory exists but has no crop_calendar, still fetch from API
  const needsFetch = !advisoryParam || !advisoryParam.crop_calendar;
  const [advisory,  setAdvisory]  = useState(advisoryParam && advisoryParam.crop_calendar ? advisoryParam : null);
  const [loading,   setLoading]   = useState(needsFetch);
  const [error,     setError]     = useState(null);

  // Interactivity states
  const [localSowingDate, setLocalSowingDate] = useState(null);
  const [completedEvents, setCompletedEvents] = useState([]);
  const [speakingIndex, setSpeakingIndex]     = useState(null);
  const [showDatePicker, setShowDatePicker]   = useState(false);
  const [customDateInput, setCustomDateInput] = useState('');

  // 🔔 Floating In-App Push Notification State & Animations
  const [notification, setNotification]       = useState(null);
  const notificationAnim                      = useRef(new Animated.Value(-150)).current;
  const autoDismissTimer                      = useRef(null);

  const triggerPushNotification = (title, msg) => {
    // Clear old timer if any
    if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);

    setNotification({ title, msg });

    // Smooth Spring slide-down animation
    Animated.spring(notificationAnim, {
      toValue: 20, // Slide down floating near the top header
      tension: 40,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Auto dismiss after 4.5 seconds
    autoDismissTimer.current = setTimeout(() => {
      dismissNotification();
    }, 4500);
  };

  const dismissNotification = () => {
    Animated.timing(notificationAnim, {
      toValue: -150, // Slide up out of view
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setNotification(null);
    });
  };

  const headerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    
    // Clean up timers on unmount
    return () => {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError('No scan data found. Please scan a soil card first.');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan_id]);

  // Sync sowing_date and load completed events on mount/load
  useEffect(() => {
    if (advisory) {
      setLocalSowingDate(advisory.sowing_date || null);
    }
  }, [advisory]);

  useEffect(() => {
    const loadCompleted = async () => {
      try {
        const raw = await AsyncStorage.getItem(`@completed_tasks_${scan_id}`);
        if (raw) {
          setCompletedEvents(JSON.parse(raw));
        }
      } catch (err) {
        console.warn('Failed to load completed events:', err);
      }
    };
    if (scan_id) loadCompleted();
  }, [scan_id]);

  // Checklist handler
  const toggleEventComplete = async (eventIndex) => {
    const isChecking = !completedEvents.includes(eventIndex);
    const updated = isChecking
      ? [...completedEvents, eventIndex]
      : completedEvents.filter(idx => idx !== eventIndex);
    
    setCompletedEvents(updated);
    try {
      await AsyncStorage.setItem(`@completed_tasks_${scan_id}`, JSON.stringify(updated));

      // Trigger gorgeous slide-down push notification upon completion
      if (isChecking) {
        const isHindi = i18n.language === 'hi';
        const calendarList = advisory?.crop_calendar || [];
        const event = calendarList[eventIndex];
        const days = event?.days_after_sowing || 0;

        let title, msg;
        if (eventIndex === 0 || days <= 1) {
          title = isHindi ? '🔔 MittiCard सूचना' : '🔔 MittiCard Alert';
          msg = isHindi
            ? `पहला कदम पूरा हुआ! दिन ${days} का बुवाई कार्य पूरा हुआ। आपका कैलेंडर अपडेट हो गया है! 🌱`
            : `First step done! Day ${days} sowing task marked as completed. Plant calendar updated! 🌱`;
        } else {
          title = isHindi ? '🔔 MittiCard सूचना' : '🔔 MittiCard Alert';
          msg = isHindi
            ? `बधाई हो! दिन ${days} का कार्य पूरा हुआ। आपकी प्रगति सुरक्षित कर ली गई है। 📈`
            : `Congratulations! Day ${days} task marked as completed. Progress saved! 📈`;
        }
        triggerPushNotification(title, msg);
      }
    } catch (err) {
      console.warn('Failed to save completed events:', err);
    }
  };

  // Date selection helpers
  const handleQuickDateSelect = async (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const formatted = `${d}/${m}/${y}`;
    
    await saveNewSowingDate(formatted);
  };

  const handleCustomDateSave = async () => {
    if (!customDateInput || customDateInput.length < 10) {
      Alert.alert('Invalid Date', 'Please enter a valid date in DD/MM/YYYY format.');
      return;
    }
    await saveNewSowingDate(customDateInput);
  };

  const saveNewSowingDate = async (formattedDate) => {
    try {
      setLocalSowingDate(formattedDate);
      setShowDatePicker(false);
      
      if (scan_id) {
        await api.put(`/advisory/${scan_id}/sowing-date`, { sowing_date: formattedDate });
        // Fetch refreshed advisory with updated event dates
        const res = await getAdvisory(scan_id);
        if (res.data.success) {
          setAdvisory(res.data.data);
        }
      }
    } catch (err) {
      console.warn('Backend sowing date update failed:', err);
    }
  };

  // Safety cleanup for Text-to-Speech
  useEffect(() => {
    return () => {
      Tts.stop();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error || !advisory) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>📅</Text>
        <Text style={styles.errorTitle}>{error || t('calendar.empty')}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isHindi     = i18n.language === 'hi';
  const calendar    = advisory.crop_calendar || [];
  const crop        = advisory.crop || '';
  const cropLabel   = t('crops.' + crop.toLowerCase()) || crop.charAt(0).toUpperCase() + crop.slice(1);
  const sowingDate  = localSowingDate;
  const totalDays   = calendar.length > 0 ? calendar[calendar.length - 1].days_after_sowing : 0;

  // Count events by status (incorporating checkmarks)
  const statusCounts = calendar.reduce((acc, ev, idx) => {
    const isDone = completedEvents.includes(idx);
    if (isDone) {
      acc.done = (acc.done || 0) + 1;
    } else {
      const info = sowingDate ? getEventStatus(ev.days_after_sowing, sowingDate) : null;
      const s    = info?.status || 'future';
      acc[s]     = (acc[s] || 0) + 1;
    }
    return acc;
  }, { done: 0, today: 0, upcoming: 0, future: 0 });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* 🔔 Sliding In-App Push Notification Alert Banner */}
      {notification && (
        <Animated.View 
          style={[
            styles.notificationBanner, 
            shadows.md,
            { transform: [{ translateY: notificationAnim }] }
          ]}
        >
          <View style={styles.notificationContent}>
            <Text style={styles.notificationTitle}>{notification.title}</Text>
            <Text style={styles.notificationMsg}>{notification.msg}</Text>
          </View>
          <TouchableOpacity onPress={dismissNotification} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.notificationClose}>×</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HEADER ────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerBubble} />

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>{t('common.back')}</Text>
          </TouchableOpacity>

          <Animated.View style={{ opacity: headerFade }}>
            <Text style={styles.headerTitle}>📅 {t('calendar.title')}</Text>
            <Text style={styles.headerCrop}>
              {cropLabel} · {isHindi ? 'कैलेंडर कार्यक्रम' : 'Calendar Events'}: {calendar.length} · {totalDays} {isHindi ? 'दिन' : 'days'}
            </Text>

            {sowingDate ? (
              <TouchableOpacity 
                style={[styles.sowingBadge, { backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }]}
                onPress={() => {
                  setCustomDateInput('');
                  setShowDatePicker(true);
                }}
              >
                <Text style={styles.sowingBadgeText}>🌱 {formatSowingDate(sowingDate)}  ▾</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.sowingBadge, { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }]}
                onPress={() => {
                  setCustomDateInput('');
                  setShowDatePicker(true);
                }}
              >
                <Text style={styles.sowingBadgeText}>📅 {t('soil_input.sowing_date_placeholder')}  ▾</Text>
              </TouchableOpacity>
            )}

            {/* Progress summary (only if sowing date set) */}
            {sowingDate && (
              <View style={styles.progressRow}>
                {statusCounts.done > 0 && (
                  <View style={[styles.progressChip, { backgroundColor: colors.statusGood }]}>
                    <Text style={styles.progressChipText}>
                      {statusCounts.done} {isHindi ? 'पूरा' : 'done'}
                    </Text>
                  </View>
                )}
                {statusCounts.today > 0 && (
                  <View style={[styles.progressChip, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.progressChipText, { color: '#fff' }]}>
                      {statusCounts.today} {isHindi ? 'आज!' : 'today!'}
                    </Text>
                  </View>
                )}
                {statusCounts.upcoming > 0 && (
                  <View style={[styles.progressChip, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={styles.progressChipText}>
                      {statusCounts.upcoming} {isHindi ? 'आगामी' : 'upcoming'}
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
              <Text style={styles.emptyTitle}>{t('calendar.empty')}</Text>
              <Text style={styles.emptySub}>{cropLabel}</Text>
            </View>
          ) : (
            calendar.map((event, index) => (
              <EventCard 
                key={index} 
                event={event} 
                index={index} 
                sowingDate={sowingDate} 
                isLast={index === calendar.length - 1} 
                completedEvents={completedEvents}
                toggleEventComplete={toggleEventComplete}
                speakingIndex={speakingIndex}
                setSpeakingIndex={setSpeakingIndex}
              />
            ))
          )}

          {!sowingDate && (
            <TouchableOpacity 
              style={styles.noDateTip}
              onPress={() => {
                setCustomDateInput('');
                setShowDatePicker(true);
              }}
            >
              <Text style={styles.noDateTipIcon}>💡</Text>
              <View style={styles.noDateTipText}>
                <Text style={styles.noDateTipTitle}>{t('soil_input.sowing_date')}</Text>
                <Text style={styles.noDateTipBody}>
                  {isHindi 
                    ? 'कैलेंडर पर वास्तविक तारीखें देखने के लिए अपनी फसल की बुवाई की तारीख चुनने के लिए यहां टैप करें!' 
                    : 'Tap here to select your crop sowing date and unlock real dates on your calendar!'}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.backToAdvisoryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backToAdvisoryText}>{t('advisory.go_home')}</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* ─── SOWING DATE PICKER BOTTOM-SHEET ─────────────────────────────────── */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity 
          style={styles.pickerOverlay} 
          activeOpacity={1} 
          onPress={() => setShowDatePicker(false)}
        >
          <View style={[styles.pickerSheet, shadows.lg]}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>
              {isHindi ? '📅 बुवाई की तारीख चुनें' : '📅 Select Sowing Date'}
            </Text>
            <Text style={styles.pickerSub}>
              {isHindi ? 'चुनें कि आपने यह फसल कब बोई या बोने की योजना बना रहे हैं' : 'Select when you planted or plan to plant this crop'}
            </Text>

            {/* Quick selectors (Chips) */}
            <View style={styles.quickChipsRow}>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => handleQuickDateSelect(0)}
              >
                <Text style={styles.quickChipText}>{isHindi ? 'आज (Today)' : 'Today'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => handleQuickDateSelect(1)}
              >
                <Text style={styles.quickChipText}>{isHindi ? 'कल (Yesterday)' : 'Yesterday'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => handleQuickDateSelect(3)}
              >
                <Text style={styles.quickChipText}>{isHindi ? '3 दिन पहले' : '3 Days Ago'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.quickChip}
                onPress={() => handleQuickDateSelect(7)}
              >
                <Text style={styles.quickChipText}>{isHindi ? '1 हफ्ता पहले' : '1 Week Ago'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.pickerOrText}>
              {isHindi ? '— या कस्टम तारीख दर्ज करें —' : '— OR ENTER CUSTOM DATE —'}
            </Text>

            {/* Custom text entry input */}
            <View style={styles.pickerInputRow}>
              <TextInput
                style={styles.pickerInput}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={colors.placeholder}
                value={customDateInput}
                onChangeText={(text) => {
                  let cleaned = text.replace(/[^0-9]/g, '');
                  if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
                  let formatted = '';
                  if (cleaned.length > 4) {
                    formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4) + '/' + cleaned.slice(4);
                  } else if (cleaned.length > 2) {
                    formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
                  } else {
                    formatted = cleaned;
                  }
                  setCustomDateInput(formatted);
                }}
                keyboardType="number-pad"
                maxLength={10}
              />
              <TouchableOpacity 
                style={styles.pickerSaveBtn}
                onPress={handleCustomDateSave}
              >
                <Text style={styles.pickerSaveText}>{isHindi ? 'सहेजें' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.pickerCloseBtn} 
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.pickerCloseText}>{isHindi ? 'रद्द करें' : 'Cancel'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // 🔔 Sliding Push Notification styles
  notificationBanner: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: '#EAF7EF',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.statusGood,
    padding: spacing.md,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  notificationContent: {
    flex: 1,
    gap: 2,
  },
  notificationTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extrabold,
    color: colors.primaryDark,
  },
  notificationMsg: {
    fontSize: fontSizes.xs,
    color: '#165A36',
    lineHeight: 16,
    fontWeight: fontWeights.medium,
  },
  notificationClose: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
    paddingHorizontal: 6,
    marginTop: -4,
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
  eventCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    flex: 1,
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

  // Collapsible Accordion Guidelines
  expandHint: {
    fontSize: fontSizes.xs - 1,
    color: colors.textSecondary,
    opacity: 0.7,
    marginTop: 4,
    fontWeight: fontWeights.bold,
    textAlign: 'right',
  },
  expandedContent: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  detailItem: {
    gap: 2,
  },
  detailLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  detailBody: {
    fontSize: fontSizes.sm - 1,
    color: colors.textSecondary,
    lineHeight: 18,
  },

  // Checkbox completed toggle
  checkboxContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderFocus,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxContainerChecked: {
    backgroundColor: colors.statusGood,
    borderColor: colors.statusGood,
  },
  checkboxCheckmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: fontWeights.extrabold,
  },

  // Audio Guide Button
  audioGuideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '35',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  audioGuideBtnActive: {
    backgroundColor: colors.statusGood,
    borderColor: colors.statusGood,
  },
  audioGuideBtnEmoji: {
    fontSize: 15,
  },
  audioGuideBtnText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },

  // Sowing Date Picker Bottom Sheet Modal styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
  },
  pickerTitle: {
    fontSize: fontSizes.lg + 1,
    fontWeight: fontWeights.extrabold,
    color: colors.textPrimary,
    marginTop: 4,
  },
  pickerSub: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  quickChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickChipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  pickerOrText: {
    fontSize: fontSizes.xs - 1,
    fontWeight: fontWeights.extrabold,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  pickerInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  pickerInput: {
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  pickerSaveBtn: {
    width: 80,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSaveText: {
    color: '#fff',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  pickerCloseBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  pickerCloseText: {
    fontSize: fontSizes.md,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
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
