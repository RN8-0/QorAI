/// Compair - Push Notification Service
/// Handles FCM token management, permission requests, and notification display.
library;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Background message handler — must be top-level function
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('=== COMPAIR: Background notification: ${message.notification?.title} ===');
}

class NotificationService {
  NotificationService._();
  static final instance = NotificationService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  String? _token;
  String? get token => _token;

  bool _initialized = false;

  /// Initialize FCM: request permission, get token, save to Firestore, listen
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    try {
      // Request notification permission
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        announcement: false,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
      );

      debugPrint('=== COMPAIR: Notification permission: ${settings.authorizationStatus} ===');

      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        // Get FCM token
        _token = await _messaging.getToken();
        debugPrint('=== COMPAIR: FCM token: ${_token?.substring(0, 20)}... ===');

        // Save token to Firestore
        await _saveTokenToFirestore();

        // Listen for token refresh
        _messaging.onTokenRefresh.listen((newToken) {
          _token = newToken;
          _saveTokenToFirestore();
        });

        // Subscribe to 'all' topic (for broadcast notifications)
        await _messaging.subscribeToTopic('all');

        // Handle foreground messages
        FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

        // Handle background message tap (app was in background)
        FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

        // Check if app was opened from a notification (terminated state)
        final initialMessage = await _messaging.getInitialMessage();
        if (initialMessage != null) {
          _handleMessageTap(initialMessage);
        }
      }
    } catch (e) {
      debugPrint('=== COMPAIR: Notification init error: $e ===');
    }
  }

  /// Save FCM token to user's Firestore document
  Future<void> _saveTokenToFirestore() async {
    if (_token == null) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      await _db.collection('users').doc(user.uid).set({
        'fcmToken': _token,
        'fcmTokenUpdatedAt': FieldValue.serverTimestamp(),
        'platform': defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
      }, SetOptions(merge: true));
      debugPrint('=== COMPAIR: FCM token saved to Firestore ===');
    } catch (e) {
      debugPrint('=== COMPAIR: FCM token save error: $e ===');
    }
  }

  /// Handle foreground notification
  void _handleForegroundMessage(RemoteMessage message) {
    debugPrint('=== COMPAIR: Foreground notification: ${message.notification?.title} ===');
    // The notification is shown by the _foregroundNotificationKey overlay
    _latestMessage.value = message;
  }

  /// Handle notification tap (opens specific screen)
  void _handleMessageTap(RemoteMessage message) {
    debugPrint('=== COMPAIR: Notification tapped: ${message.data} ===');
    _pendingNavigation = message.data;
  }

  /// Latest foreground message for overlay display
  final ValueNotifier<RemoteMessage?> _latestMessage = ValueNotifier(null);
  ValueNotifier<RemoteMessage?> get latestMessage => _latestMessage;

  /// Pending navigation from notification tap
  Map<String, dynamic>? _pendingNavigation;
  Map<String, dynamic>? consumePendingNavigation() {
    final nav = _pendingNavigation;
    _pendingNavigation = null;
    return nav;
  }

  /// Subscribe to a topic
  Future<void> subscribeTo(String topic) async {
    try {
      await _messaging.subscribeToTopic(topic);
    } catch (_) {}
  }

  /// Unsubscribe from a topic
  Future<void> unsubscribeFrom(String topic) async {
    try {
      await _messaging.unsubscribeFromTopic(topic);
    } catch (_) {}
  }

  /// Toggle push notifications on/off
  Future<void> setEnabled(bool enabled) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    try {
      await _db.collection('users').doc(user.uid).set({
        'notificationsEnabled': enabled,
      }, SetOptions(merge: true));

      if (enabled) {
        await _messaging.subscribeToTopic('all');
      } else {
        await _messaging.unsubscribeFromTopic('all');
      }
    } catch (e) {
      debugPrint('=== COMPAIR: Notification toggle error: $e ===');
    }
  }
}
