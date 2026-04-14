/// Compair - Push Notification Service
/// Firebase Messaging removed. This is a no-op stub kept so existing
/// call sites compile until we wire up a non-Google push provider.
library;

import 'package:flutter/foundation.dart';

class _NotificationInner {
  final String? title;
  final String? body;
  const _NotificationInner({this.title, this.body});
}

class StubMessage {
  final _NotificationInner? notification;
  final Map<String, dynamic> data;
  const StubMessage({this.notification, this.data = const {}});
}

/// Legacy top-level handler kept as no-op for backwards compat.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(StubMessage message) async {}

class NotificationService {
  NotificationService._();
  static final instance = NotificationService._();

  String? get token => null;

  Future<void> initialize() async {}

  final ValueNotifier<StubMessage?> _latestMessage = ValueNotifier(null);
  ValueNotifier<StubMessage?> get latestMessage => _latestMessage;

  Map<String, dynamic>? consumePendingNavigation() => null;

  Future<void> subscribeTo(String topic) async {}
  Future<void> unsubscribeFrom(String topic) async {}
  Future<void> setEnabled(bool enabled) async {}
}
