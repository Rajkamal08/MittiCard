/**
 * reminderCron.js
 * ────────────────
 * Runs EVERY DAY at 8:00 AM IST
 * Fetches all users with FCM tokens → sends reminder via Firebase Admin SDK
 *
 * HOW FCM WORKS:
 *   1. User logs in → device token saved to DB (/auth/save-fcm-token)
 *   2. This cron runs daily → sends push notification to each token
 *   3. Firebase delivers the push to their phone (works even if app is closed)
 *
 * SETUP NEEDED TO ENABLE REAL PUSH:
 *   - FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in Render env
 *   - google-services.json in android/app/ on the mobile app
 *   - @react-native-firebase/messaging installed in soilapp
 */

const cron = require('node-cron');
const pool = require('../db');

// ─── Firebase Admin SDK setup ─────────────────────────────────────────────────
let admin;
try {
  admin = require('firebase-admin');
  const serviceAccount = {
    type: 'service_account',
    project_id:   process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  if (!admin.apps.length && serviceAccount.project_id) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized');
  }
} catch (err) {
  console.log('⚠️  Firebase Admin SDK not available — push notifications disabled');
  admin = null;
}

// ─── Send a single push notification ─────────────────────────────────────────
const sendPush = async (fcmToken, title, body) => {
  if (!admin || !fcmToken) return;
  try {
    const message = {
      notification: { title, body },
      android: {
        notification: {
          icon:  'ic_notification',
          color: '#2D6A4F',
          sound: 'default',
        },
      },
      token: fcmToken,
    };
    const result = await admin.messaging().send(message);
    console.log(`📲 Push sent: ${result}`);
    return result;
  } catch (err) {
    console.log(`⚠️  Push failed for token: ${err.message}`);
  }
};

// ─── Daily 8 AM IST reminder ──────────────────────────────────────────────────
// Cron format: minute hour day month weekday — timezone: Asia/Kolkata handles IST automatically
// '0 8 * * *' = fires at 8:00 AM IST every day
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ [ReminderCron] Running daily 8 AM reminder...');

  try {
    // Ensure fcm_token column exists
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;`);

    // Fetch users who have FCM tokens
    const { rows: users } = await pool.query(`
      SELECT u.id, u.name, u.phone, u.fcm_token, u.language,
             s.crop, s.scanned_at
      FROM users u
      LEFT JOIN LATERAL (
        SELECT ss.crop, ss.scanned_at
        FROM soil_scans ss
        JOIN farms f ON ss.farm_id = f.id
        WHERE f.user_id = u.id
        ORDER BY ss.scanned_at DESC
        LIMIT 1
      ) s ON true
      WHERE u.fcm_token IS NOT NULL
        AND u.fcm_token != ''
    `);

    console.log(`📢 Sending reminders to ${users.length} farmers...`);

    for (const user of users) {
      const isHindi = user.language === 'hi';
      const cropName = user.crop
        ? user.crop.charAt(0).toUpperCase() + user.crop.slice(1)
        : (isHindi ? 'आपकी फसल' : 'your crop');

      const title = isHindi
        ? '🌱 मिट्टी स्वास्थ्य अनुस्मारक'
        : '🌱 Soil Health Reminder';

      const body = isHindi
        ? `${user.name?.split(' ')[0] || 'किसान'} जी, ${cropName} के लिए उर्वरक का समय आ गया है। MittiCard खोलें।`
        : `${user.name?.split(' ')[0] || 'Farmer'}, time to apply fertilizer for ${cropName}. Open MittiCard for your advisory.`;

      await sendPush(user.fcm_token, title, body);
    }

    console.log(`✅ [ReminderCron] Done — ${users.length} reminders sent`);
  } catch (err) {
    console.error('❌ [ReminderCron] Error:', err.message);
  }
}, {
  timezone: 'Asia/Kolkata',
});

console.log('🔔 Reminder cron scheduled: runs every day at 8:00 AM IST');

module.exports = { sendPush };
