/// Compair - Main Entry Point
library;

import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:compair/app.dart';
import 'package:compair/services/cache_service.dart';
import 'package:compair/services/remote_config_service.dart';
import 'package:compair/services/spec_translation_service.dart';
import 'package:compair/services/notification_service.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:compair/core/pb_client.dart' as pb_client;
import 'package:compair/data/datasources/hive_ds.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/presentation/providers/providers.dart';

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

    // Initialize PocketBase with persistent auth store (SharedPreferences).
    // This must happen before any provider reads `pb` global singleton.
    try {
      pb_client.pb = await pb_client.createPbClientWithPersistence();
      debugPrint('=== COMPAIR: PocketBase client initialized with persistent auth ===');
    } catch (e) {
      // Fallback: in-memory auth (no persistence but app still works)
      debugPrint('=== COMPAIR: PocketBase persistence init failed, using in-memory: $e ===');
      pb_client.pb = PocketBase(pb_client.kPbBaseUrl);
    }

    // Initialize Remote Config via PocketBase
    final remoteConfigService = RemoteConfigService.fromPb(PbDataSource());
    await remoteConfigService.initialize();

    // Initialize spec translation dictionary (EN→TR, 7300+ entries)
    await SpecTranslationService.instance.init();

    // ATT (App Tracking Transparency) — required for iOS 14.5+
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
  });
}


