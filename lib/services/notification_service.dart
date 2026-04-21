/// Compair - Push Notification Service
/// Integrates Firebase Cloud Messaging for Android & iOS push notifications.
library;

import 'dart:io' show Platform;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// FCM background message handler — must be top-level.
@pragma('vm:entry-point')
Future<void> notificationBackgroundHandler(RemoteMessage message) async {
  debugPrint('[FCM] Background message: ${message.notification?.title}');
}

// ─── Local notification channel (Android) ────────────────────────────────────
const _kChannelId = 'compair_default';
const _kChannelName = 'Compair Notifications';
const _kChannelDesc = 'AI product advisor alerts and updates';

// Keep existing stub types for backwards compat at call sites
class NotificationInner {
  final String? title;
  final String? body;
  const NotificationInner({this.title, this.body});
}

class StubMessage {
  final NotificationInner? notification;
  final Map<String, dynamic> data;
  const StubMessage({this.notification, this.data = const {}});
}

class NotificationService {
  NotificationService._();
  static final instance = NotificationService._();

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  String? _token;
  String? get token => _token;

  final ValueNotifier<StubMessage?> _latestMessage = ValueNotifier(null);
  ValueNotifier<StubMessage?> get latestMessage => _latestMessage;

  Map<String, dynamic>? _pendingNavData;
  Map<String, dynamic>? consumePendingNavigation() {
    final d = _pendingNavData;
    _pendingNavData = null;
    return d;
  }

  Future<void> initialize() async {
    // Register background handler
    FirebaseMessaging.onBackgroundMessage(notificationBackgroundHandler);

    // Set up local notification plugin
    const androidInit =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _local.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: (details) {
        if (details.payload != null) {
          // Navigate when user taps notification
          _pendingNavData = {'payload': details.payload};
        }
      },
    );

    // Create Android notification channel
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            _kChannelId,
            _kChannelName,
            description: _kChannelDesc,
            importance: Importance.high,
            playSound: true,
            enableVibration: true,
          ),
        );

    // Request permission
    await _requestPermission();

    // Get token
    await _refreshToken();

    // Handle foreground messages — show local notification
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // Handle notification tap when app is in background (not killed)
    FirebaseMessaging.onMessageOpenedApp.listen((msg) {
      _pendingNavData = msg.data;
    });

    // Check initial message (app opened from terminated via notification tap)
    final initial = await _fcm.getInitialMessage();
    if (initial != null) {
      _pendingNavData = initial.data;
    }

    // Token refresh
    _fcm.onTokenRefresh.listen((newToken) {
      _token = newToken;
      debugPrint('[FCM] Token refreshed: ${newToken.substring(0, 20)}...');
    });

    debugPrint('[FCM] NotificationService initialized, token: ${_token?.substring(0, 20)}...');
  }

  Future<void> _requestPermission() async {
    if (kIsWeb) return;
    final settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    debugPrint('[FCM] Permission: ${settings.authorizationStatus}');
  }

  Future<void> _refreshToken() async {
    try {
      if (!kIsWeb && Platform.isIOS) {
        await _fcm.getAPNSToken();
      }
      _token = await _fcm.getToken();
      debugPrint('[FCM] Token obtained: ${_token?.substring(0, 20)}...');
    } catch (e) {
      debugPrint('[FCM] Token error: $e');
    }
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    debugPrint('[FCM] Foreground message: ${message.notification?.title}');
    final notification = message.notification;
    if (notification == null) return;

    // Show local notification for foreground messages
    await _local.show(
      message.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _kChannelId,
          _kChannelName,
          channelDescription: _kChannelDesc,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: message.data.isNotEmpty ? message.data.toString() : null,
    );

    // Also notify legacy listeners
    _latestMessage.value = StubMessage(
      notification: NotificationInner(
        title: notification.title,
        body: notification.body,
      ),
      data: message.data,
    );
  }

  Future<void> subscribeTo(String topic) async {
    try {
      await _fcm.subscribeToTopic(topic);
    } catch (e) {
      debugPrint('[FCM] subscribeTo error: $e');
    }
  }

  Future<void> unsubscribeFrom(String topic) async {
    try {
      await _fcm.unsubscribeFromTopic(topic);
    } catch (e) {
      debugPrint('[FCM] unsubscribeFrom error: $e');
    }
  }

  Future<void> setEnabled(bool enabled) async {
    try {
      await _fcm.setAutoInitEnabled(enabled);
    } catch (e) {
      debugPrint('[FCM] setEnabled error: $e');
    }
  }
}

