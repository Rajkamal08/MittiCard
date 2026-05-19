/**
 * App.js — MittiCard Root Component
 *
 * On every app start, this does 3 checks in order:
 *   1. Is JWT token saved?   → No  → go to Splash/Login
 *   2. Is language saved?    → No  → go to LanguageScreen (first login)
 *   3. Is profile done?      → No  → go to ProfileScreen  (first login)
 *   4. All done              → go straight to Home
 *
 * i18n is imported here so it initializes BEFORE any screen renders.
 */

// ─── i18n must be imported FIRST — before any screen ────────────────────────
import './src/i18n';           // initializes i18next with hi + en translations

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';

// Screens
import SplashScreen          from './src/screens/SplashScreen';
import LoginScreen           from './src/screens/LoginScreen';
import OTPScreen             from './src/screens/OTPScreen';
import LanguageScreen        from './src/screens/LanguageScreen';
import ProfileScreen         from './src/screens/ProfileScreen';
import HomeScreen            from './src/screens/HomeScreen';
import SoilInputScreen       from './src/screens/SoilInputScreen';
import AdvisoryResultScreen  from './src/screens/AdvisoryResultScreen';
import CropCalendarScreen    from './src/screens/CropCalendarScreen';
import OCRScreen             from './src/screens/OCRScreen';
import SoilHistoryScreen     from './src/screens/SoilHistoryScreen';
import WeatherForecastScreen from './src/screens/WeatherForecastScreen';
import AgriServicesScreen    from './src/screens/AgriServicesScreen';

// Services
import {
  getToken,
  getUser,
  getLanguage,
  isProfileDone,
} from './src/services/storage';
import { setAuthToken }    from './src/services/api';
import { changeLanguage }  from './src/i18n';
import { colors }          from './src/theme';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading,     setIsLoading]     = useState(true);
  const [initialRoute,  setInitialRoute]  = useState('Splash');
  const [storedUser,    setStoredUser]    = useState(null);

  // ─── Run all startup checks ────────────────────────────────────────────────
  useEffect(() => {
    const bootstrap = async () => {
      try {
        // 1. Check JWT
        const token = await getToken();
        const user  = await getUser();

        if (!token || !user) {
          // Not logged in → start from Splash
          setInitialRoute('Splash');
          return;
        }

        // Logged in — restore API auth header
        setAuthToken(token);
        setStoredUser(user);

        // 2. Apply saved language BEFORE any screen renders
        const savedLang = await getLanguage();
        if (savedLang) {
          await changeLanguage(savedLang);
        }
        // If no saved language → i18n defaults to 'hi' (set in i18n/index.js)

        // 3. Check if language was ever chosen
        if (!savedLang) {
          // First login after OTP — language not picked yet
          // This path only happens if tokenexists but language not saved
          // (can occur if something went wrong on first run)
          setInitialRoute('Language');
          return;
        }

        // 4. Check if profile was filled
        const profileDone = await isProfileDone();
        if (!profileDone) {
          setInitialRoute('Profile');
          return;
        }

        // 5. All checks passed → go straight to Home
        setInitialRoute('Home');

      } catch (err) {
        console.warn('App bootstrap error:', err);
        setInitialRoute('Splash');
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  // Show a spinner while bootstrap checks run (~300ms)
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
          cardStyle: { backgroundColor: colors.background },
          // Smooth slide-in transition for all screens
          transitionSpec: {
            open:  { animation: 'timing', config: { duration: 300 } },
            close: { animation: 'timing', config: { duration: 260 } },
          },
          cardStyleInterpolator: ({ current, layouts }) => ({
            cardStyle: {
              opacity: current.progress.interpolate({
                inputRange:  [0, 1],
                outputRange: [0, 1],
              }),
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange:  [0, 1],
                    outputRange: [layouts.screen.width * 0.12, 0],
                  }),
                },
              ],
            },
          }),
        }}
      >
        {/* ── Auth flow ──────────────────────────────────────────────── */}
        <Stack.Screen name="Splash"   component={SplashScreen} />
        <Stack.Screen name="Login"    component={LoginScreen} />
        <Stack.Screen
          name="OTP"
          component={OTPScreen}
          initialParams={{ phone: '', dev_otp: null }}
        />

        {/* ── First-login onboarding ─────────────────────────────────── */}
        {/* Shown ONCE, then never again */}
        <Stack.Screen name="Language" component={LanguageScreen} />
        <Stack.Screen name="Profile"  component={ProfileScreen} />

        {/* ── Main app ───────────────────────────────────────────────── */}
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          initialParams={{ user: storedUser }}
        />
        <Stack.Screen name="SoilInput"      component={SoilInputScreen} />
        <Stack.Screen name="AdvisoryResult" component={AdvisoryResultScreen} />
        <Stack.Screen name="CropCalendar"   component={CropCalendarScreen} />
        <Stack.Screen name="OCR"            component={OCRScreen} />
        <Stack.Screen name="SoilHistory"    component={SoilHistoryScreen} />
        <Stack.Screen name="WeatherForecast" component={WeatherForecastScreen} />
        <Stack.Screen name="AgriServices"   component={AgriServicesScreen} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
