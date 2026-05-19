const admin = require('firebase-admin');

// Initialize Firebase only once
// Credentials loaded from .env — never from a hardcoded file
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    })
  });
}

// ─── Send push notification to one device ────────────────────────────────────
const sendNotification = async (fcmToken, title, body) => {
  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'soil_reminders'
        }
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 }
        }
      }
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification sent: ${response}`);
    return { success: true, response };

  } catch (err) {
    console.error(`❌ Notification failed: ${err.message}`);
    return { success: false, error: err.message };
  }
};

// ─── Send to multiple devices at once ────────────────────────────────────────
const sendMulticastNotification = async (fcmTokens, title, body) => {
  try {
    const message = {
      tokens: fcmTokens,
      notification: { title, body },
      android: { priority: 'high' }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Multicast sent: ${response.successCount} success, ${response.failureCount} failed`);
    return response;

  } catch (err) {
    console.error(`❌ Multicast failed: ${err.message}`);
    return null;
  }
};

module.exports = { sendNotification, sendMulticastNotification };
