/// Compair - Main Entry Point
/// Blueprint Section 2, 3
///
/// Firebase initialization
/// Hive initialization
/// ProviderScope wrapper
/// Error handling zone
library;

import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:compair/firebase_options.dart';
import 'package:compair/app.dart';
import 'package:compair/services/cache_service.dart';
import 'package:compair/services/remote_config_service.dart';
import 'package:compair/services/spec_translation_service.dart';
import 'package:compair/services/notification_service.dart';
import 'package:compair/data/datasources/hive_ds.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

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

    // Initialize Firebase
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      debugPrint('=== COMPAIR: Firebase initialized ===');

      // Limit Firestore memory/disk cache to prevent OOM on mid-range devices
      FirebaseFirestore.instance.settings = const Settings(
        cacheSizeBytes: 50 * 1024 * 1024, // 50MB — covers ~10K products offline
        persistenceEnabled: true,
      );

      // Register background message handler
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      // Crashlytics settings (mobile only - not supported on web)
      if (!kIsWeb) {
        FlutterError.onError =
            FirebaseCrashlytics.instance.recordFlutterFatalError;
      }
    } catch (e) {
      debugPrint('=== COMPAIR: Firebase FAILED: $e ===');
    }

    // Initialize Cache & Hive - Section 7.4
    final cacheService = CacheService();
    final hiveDS = HiveDataSource();
    try {
      await cacheService.initialize();
      await hiveDS.initialize();
      // Migrate: delete old cache keys so new feed algorithm is used
      cacheService.delete('home_feed_products');
      cacheService.delete('home_feed_v2_techscore');
      cacheService.delete('home_feed_v3_youtube');
      cacheService.delete('home_feed_v5_percat');
      cacheService.delete('home_feed_v11_discover');
      cacheService.delete('home_feed_v12_relaxed');
      cacheService.delete('home_feed_v13_nofilter');
      cacheService.delete('home_feed_v14_quality');
      debugPrint('=== COMPAIR: CacheService + HiveDS initialized ===');
    } catch (e) {
      debugPrint('=== COMPAIR: CacheService FAILED: $e ===');
    }

    // Initialize Remote Config - Section 21.1
    final remoteConfigService = RemoteConfigService(FirebaseRemoteConfig.instance);
    await remoteConfigService.initialize();

    // Initialize spec translation dictionary (EN→TR, 7300+ entries)
    await SpecTranslationService.instance.init();

    // ATT (App Tracking Transparency) — required for iOS 14.5+
    // Request permission for Firebase Analytics. Not needed on Android.
    if (!kIsWeb && Platform.isIOS) {
      try {
        final status = await AppTrackingTransparency.trackingAuthorizationStatus;
        if (status == TrackingStatus.notDetermined) {
          // Short delay — Apple recommends showing the dialog after the app is fully loaded
          await Future<void>.delayed(const Duration(milliseconds: 500));
          await AppTrackingTransparency.requestTrackingAuthorization();
        }
        debugPrint('=== COMPAIR: ATT status: $status ===');
      } catch (e) {
        debugPrint('=== COMPAIR: ATT failed: $e ===');
      }
    }

    // Initialize push notifications (FCM)
    if (!kIsWeb) {
      try {
        await NotificationService.instance.initialize();
        debugPrint('=== COMPAIR: Notifications initialized ===');
      } catch (e) {
        debugPrint('=== COMPAIR: Notification init failed: $e ===');
      }
    }

    debugPrint('=== COMPAIR: Calling runApp ===');

    runApp(
      ProviderScope(
        overrides: [
          cacheServiceProvider.overrideWithValue(cacheService),
          hiveDataSourceProvider.overrideWithValue(hiveDS),
          remoteConfigServiceProvider.overrideWithValue(remoteConfigService),
        ],
        child: const CompairApp(),
      ),
    );
  }, (error, stack) {
    debugPrint('=== COMPAIR: ZONE ERROR: $error ===');
    debugPrint('$stack');
    if (!kIsWeb) {
      try {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      } catch (_) {}
    }
  });
}


