/// Qor AI - Main Entry Point
library;

import 'dart:async';
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:qor_ai/app.dart';
import 'package:qor_ai/firebase_options.dart';
import 'package:qor_ai/services/cache_service.dart';
import 'package:qor_ai/services/remote_config_service.dart';
import 'package:qor_ai/services/spec_translation_service.dart';
import 'package:qor_ai/services/notification_service.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/core/pb_client.dart' as pb_client;
import 'package:qor_ai/data/datasources/hive_ds.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

Future<void> _clearLegacyFeedCache(CacheService cacheService) async {
  await Future.wait([
    cacheService.delete('home_feed_products'),
    cacheService.delete('home_feed_v2_techscore'),
    cacheService.delete('home_feed_v3_youtube'),
    cacheService.delete('home_feed_v5_percat'),
    cacheService.delete('home_feed_v11_discover'),
    cacheService.delete('home_feed_v12_relaxed'),
    cacheService.delete('home_feed_v13_nofilter'),
    cacheService.delete('home_feed_v14_quality'),
  ]);
}

void _scheduleDeferredStartupTasks() {
  Future.delayed(const Duration(milliseconds: 900), () {
    unawaited(_initializeSpecTranslations());
  });
  if (!kIsWeb) {
    Future.delayed(const Duration(seconds: 4), () {
      unawaited(_initializeNotifications());
    });
  }
  if (!kIsWeb && Platform.isIOS) {
    Future.delayed(const Duration(seconds: 5), () {
      unawaited(_requestTrackingTransparency());
    });
  }
}

Future<void> _initializeSpecTranslations() async {
  try {
    await SpecTranslationService.instance.init();
    debugPrint('=== QOR AI: Spec translations initialized ===');
  } catch (e) {
    debugPrint('=== QOR AI: Spec translations failed: $e ===');
  }
}

Future<void> _initializeNotifications() async {
  try {
    await NotificationService.instance.initialize();
    debugPrint('=== QOR AI: Notifications initialized ===');
  } catch (e) {
    debugPrint('=== QOR AI: Notification init failed: $e ===');
  }
}

Future<void> _requestTrackingTransparency() async {
  try {
    final status = await AppTrackingTransparency.trackingAuthorizationStatus;
    if (status == TrackingStatus.notDetermined) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      await AppTrackingTransparency.requestTrackingAuthorization();
    }
    debugPrint('=== QOR AI: ATT status: $status ===');
  } catch (e) {
    debugPrint('=== QOR AI: ATT failed: $e ===');
  }
}

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // Initialize Firebase (required for FCM push notifications)
    if (!kIsWeb) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }

    // System UI settings (mobile only)
    if (!kIsWeb) {
      SystemChrome.setSystemUIOverlayStyle(
        const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
        ),
      );

      // Disable landscape modes (portrait only)
      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]);
    }

    // Initialize Cache & Hive - Section 7.4
    final cacheService = CacheService();
    final hiveDS = HiveDataSource();
    try {
      await Future.wait([
        cacheService.initialize(),
        hiveDS.initialize(),
      ]);
      unawaited(_clearLegacyFeedCache(cacheService));
      debugPrint('=== QOR AI: CacheService + HiveDS initialized ===');
    } catch (e) {
      debugPrint('=== QOR AI: CacheService FAILED: $e ===');
    }

    // Initialize PocketBase with persistent auth store (SharedPreferences).
    // This must happen before any provider reads `pb` global singleton.
    try {
      pb_client.pb = await pb_client.createPbClientWithPersistence();
      debugPrint('=== QOR AI: PocketBase client initialized with persistent auth ===');
    } catch (e) {
      // Fallback: in-memory auth (no persistence but app still works)
      debugPrint('=== QOR AI: PocketBase persistence init failed, using in-memory: $e ===');
      pb_client.pb = PocketBase(pb_client.kPbBaseUrl);
    }

    // Initialize Remote Config via PocketBase
    final remoteConfigService = RemoteConfigService.fromPb(PbDataSource());

    debugPrint('=== QOR AI: Calling runApp ===');

    runApp(
      ProviderScope(
        overrides: [
          cacheServiceProvider.overrideWithValue(cacheService),
          hiveDataSourceProvider.overrideWithValue(hiveDS),
          remoteConfigServiceProvider.overrideWithValue(remoteConfigService),
        ],
        child: const QorAiApp(),
      ),
    );
    _scheduleDeferredStartupTasks();
  }, (error, stack) {
    debugPrint('=== QOR AI: ZONE ERROR: $error ===');
    debugPrint('$stack');
  });
}


