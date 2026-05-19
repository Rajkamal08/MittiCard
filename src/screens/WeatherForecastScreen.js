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
import i18n from '../i18n';
import { getUser } from '../services/storage';
import api from '../services/api';

const isHindi = i18n.language === 'hi';

// Helper: WMO Weather code mapper
const getWeatherInfo = (code) => {
  const isHi = i18n.language === 'hi';
  if (code === 0) return { emoji: '☀️', desc: isHi ? 'साफ आसमान' : 'Clear Sky' };
  if (code <= 2) return { emoji: '⛅', desc: isHi ? 'आंशिक बादल' : 'Partly Cloudy' };
  if (code === 3) return { emoji: '☁️', desc: isHi ? 'घने बादल' : 'Overcast' };
  if (code <= 48) return { emoji: '🌫️', desc: isHi ? 'कोहरा' : 'Foggy' };
  if (code <= 67) return { emoji: '🌧️', desc: isHi ? 'बारिश' : 'Rainy' };
  if (code <= 77) return { emoji: '❄️', desc: isHi ? 'बर्फबारी' : 'Snowy' };
  if (code <= 82) return { emoji: '🌦️', desc: isHi ? 'हल्की बौछारें' : 'Rain Showers' };
  if (code <= 99) return { emoji: '⛈️', desc: isHi ? 'आंधी-तूफान' : 'Thunderstorm' };
  return { emoji: '🌤️', desc: isHi ? 'सुहावना मौसम' : 'Mild Weather' };
};

// Helper: Calculate sowing suitability score & advisory tips
const calculateSowingScore = (maxTemp, rainProb, windSpeed) => {
  const isHi = i18n.language === 'hi';
  let score = 100;
  const warnings = [];

  // 1. Rain probability penalties
  if (rainProb >= 80) {
    score -= 45;
    warnings.push(isHi ? 'भारी बारिश: बीज बहने का जोखिम' : 'Heavy rain: Seeds may wash away');
  } else if (rainProb >= 50) {
    score -= 20;
    warnings.push(isHi ? 'मध्यम बारिश: जल निकासी की व्यवस्था करें' : 'Moderate rain: Arrange proper drainage');
  } else if (rainProb >= 25) {
    score -= 5;
    warnings.push(isHi ? 'हल्की फुहार: बुवाई के लिए नमी अनुकूल' : 'Light shower: Favorable moisture for sowing');
  }

  // 2. Temp penalties
  if (maxTemp > 40) {
    score -= 30;
    warnings.push(isHi ? 'अत्यधिक तापमान: मिट्टी की नमी तेजी से सूखेगी' : 'Extreme heat: Soil moisture evaporates fast');
  } else if (maxTemp > 35) {
    score -= 10;
    warnings.push(isHi ? 'उच्च तापमान: सुबह या शाम को बुवाई करें' : 'High temperature: Sow in morning/evening');
  } else if (maxTemp < 18) {
    score -= 25;
    warnings.push(isHi ? 'कम तापमान: अंकुरण धीमा हो सकता है' : 'Low temp: Seed germination may slow down');
  }

  // 3. Wind speed penalties
  if (windSpeed > 25) {
    score -= 20;
    warnings.push(isHi ? 'तेज हवा: बीज बिखरने और मिट्टी के कटाव का खतरा' : 'Strong wind: Risk of seed drift/erosion');
  } else if (windSpeed > 15) {
    score -= 8;
    warnings.push(isHi ? 'मध्यम हवा: बुवाई सावधानी से करें' : 'Moderate wind: Sow seeds with caution');
  }

  score = Math.max(15, score);

  let status = 'Good';
  let statusText = isHi ? 'उत्कृष्ट' : 'Excellent';
  let color = colors.statusGood;

  if (score < 45) {
    status = 'Poor';
    statusText = isHi ? 'असुरक्षित' : 'Unsafe';
    color = colors.statusPoor;
  } else if (score < 75) {
    status = 'Fair';
    statusText = isHi ? 'मध्यम' : 'Moderate';
    color = colors.statusWarning;
  }

  return {
    score,
    status,
    statusText,
    color,
    tip: warnings.length > 0 ? warnings.join(' • ') : (isHi ? 'मौसम बुवाई के लिए बिल्कुल सही है!' : 'Weather is perfect for sowing!')
  };
};

export default function WeatherForecastScreen({ navigation, route }) {
  const [, setUser] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [districtName, setDistrictName] = useState('Raipur');

  const fetchForecast = useCallback(async (showIndicator = true) => {
    if (showIndicator) setLoading(true);
    try {
      // 1. Get user details for location
      let currUser = null;
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data?.success && meRes.data?.user) {
          currUser = meRes.data.user;
          setUser(currUser);
        }
      } catch {}

      if (!currUser) {
        currUser = await getUser();
        if (currUser) setUser(currUser);
      }

      const userDistrict = currUser?.district || 'Raipur';
      setDistrictName(userDistrict);

      // 2. Fetch coordinates via Geocoding
      let lat = 21.25;
      let lon = 81.63;
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(userDistrict.trim())}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results[0]) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
        }
      } catch (err) {
        console.warn('Geocoding failed, using defaults:', err);
      }

      // 3. Fetch 7-day weather forecast
      const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Asia%2FKolkata`;
      const fRes = await fetch(forecastUrl);
      const fData = await fRes.json();

      if (fData.daily) {
        const list = [];
        const days = fData.daily.time;
        for (let i = 0; i < days.length; i++) {
          const maxTemp = fData.daily.temperature_2m_max[i];
          const minTemp = fData.daily.temperature_2m_min[i];
          const rainProb = fData.daily.precipitation_probability_max[i] || 0;
          const wind = fData.daily.windspeed_10m_max[i] || 0;
          const code = fData.daily.weathercode[i];

          const sowingData = calculateSowingScore(maxTemp, rainProb, wind);

          list.push({
            date: days[i],
            maxTemp,
            minTemp,
            rainProb,
            windSpeed: wind,
            weatherCode: code,
            sowing: sowingData,
          });
        }
        setForecast(list);
      }
    } catch (err) {
      console.error('Weather forecast fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchForecast(false);
  };

  const getDayName = (dateStr) => {
    const isHi = i18n.language === 'hi';
    const date = new Date(dateStr);
    const day = date.getDay();
    const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const daysHi = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];
    return isHi ? daysHi[day] : daysEn[day];
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {isHindi ? 'मुख्य स्क्रीन' : 'Home'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isHindi ? '7-दिवसीय बुवाई मौसम' : '7-Day Sowing Weather'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loaderText}>
            {isHindi ? 'मौसम पूर्वानुमान लोड हो रहा है...' : 'Fetching weather forecast...'}
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
          {/* Location details card */}
          <View style={[styles.locationCard, shadows.sm]}>
            <Text style={styles.locationLabel}>{isHindi ? '📍 आपका वर्तमान क्षेत्र' : '📍 Your Current Region'}</Text>
            <Text style={styles.locationValue}>{districtName}, Chhattisgarh</Text>
            <Text style={styles.locationNote}>
              {isHindi ? 'बुवाई का स्कोर तापमान, हवा की गति और वर्षा की संभावना के आधार पर तय किया जाता है।' : 'Sowing score is calculated based on temperature, wind speed, and rain probability.'}
            </Text>
          </View>

          {/* Forecast title */}
          <Text style={styles.sectionTitle}>
            {isHindi ? '📅 7 दिनों का पूर्वानुमान' : '📅 7-Day Forecast'}
          </Text>

          {forecast.map((item, index) => {
            const wInfo = getWeatherInfo(item.weatherCode);
            const formattedDate = new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

            return (
              <View key={item.date} style={[styles.forecastCard, shadows.sm]}>
                
                {/* Top header row */}
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.dayText}>{getDayName(item.date)}</Text>
                    <Text style={styles.dateText}>{formattedDate}</Text>
                  </View>
                  
                  {/* Sowing Score Badge */}
                  <View style={[styles.sowingBadge, { backgroundColor: item.sowing.color + '15', borderColor: item.sowing.color }]}>
                    <Text style={[styles.sowingBadgeText, { color: item.sowing.color }]}>
                      {isHindi ? `बुवाई स्कोर: ${item.sowing.score}` : `Sowing Score: ${item.sowing.score}`}
                    </Text>
                    <View style={[styles.statusDot, { backgroundColor: item.sowing.color }]} />
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Weather details columns */}
                <View style={styles.detailsRow}>
                  <View style={styles.weatherMajorCol}>
                    <Text style={styles.weatherEmoji}>{wInfo.emoji}</Text>
                    <Text style={styles.weatherDesc}>{wInfo.desc}</Text>
                  </View>
                  
                  <View style={styles.statsCol}>
                    <Text style={styles.statLabel}>{isHindi ? 'तापमान' : 'Temp'}</Text>
                    <Text style={styles.statVal}>{Math.round(item.minTemp)}° – {Math.round(item.maxTemp)}°C</Text>
                  </View>

                  <View style={styles.statsCol}>
                    <Text style={styles.statLabel}>{isHindi ? 'बारिश संभ.' : 'Rain Prob.'}</Text>
                    <Text style={styles.statVal}>{item.rainProb}%</Text>
                  </View>

                  <View style={styles.statsCol}>
                    <Text style={styles.statLabel}>{isHindi ? 'हवा' : 'Wind'}</Text>
                    <Text style={styles.statVal}>{Math.round(item.windSpeed)} km/h</Text>
                  </View>
                </View>

                {/* Advisory Tip banner */}
                <View style={[styles.advisoryTipBox, { backgroundColor: item.sowing.color + '0C' }]}>
                  <Text style={[styles.advisoryTipText, { color: colors.textPrimary }]}>
                    💡 <Text style={{ fontWeight: fontWeights.bold }}>{item.sowing.statusText}:</Text> {item.sowing.tip}
                  </Text>
                </View>

              </View>
            );
          })}
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
  locationCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  locationLabel: {
    color: '#A7F3D0',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  locationValue: {
    color: '#FFF',
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    marginTop: 2,
  },
  locationNote: {
    color: '#D1FAE5',
    fontSize: fontSizes.xs - 1,
    marginTop: spacing.sm,
    lineHeight: 14,
    opacity: 0.9,
  },
  sectionTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  forecastCard: {
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
  dayText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sowingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  sowingBadgeText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weatherMajorCol: {
    width: '32%',
    alignItems: 'center',
  },
  weatherEmoji: {
    fontSize: 26,
  },
  weatherDesc: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginTop: 2,
    textAlign: 'center',
  },
  statsCol: {
    width: '21%',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
  statVal: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginTop: 2,
    textAlign: 'center',
  },
  advisoryTipBox: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  advisoryTipText: {
    fontSize: fontSizes.xs,
    lineHeight: 15,
  },
});
