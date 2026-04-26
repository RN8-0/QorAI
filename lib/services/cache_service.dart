/// Qor AI - Cache Service (Local-only Cache)
/// Blueprint Section 7.4
///
/// Hive local cache (single layer — server cache removed in PB migration)
/// Cache key: MD5(productIds + profileHash + country)
/// Cache duration: 24 hours (products), 1 hour (trend analyses)
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'dart:convert';

class CacheService {
  static const String _cacheBoxName = 'qor_ai_cache';
  static const String _settingsBoxName = 'qor_ai_settings';

  late Box<String> _localBox;
  late Box _settingsBox;

  CacheService();

  /// Initialize cache
  Future<void> initialize() async {
    await Hive.initFlutter();
    _localBox = await Hive.openBox<String>(_cacheBoxName);
    _settingsBox = await Hive.openBox(_settingsBoxName);
  }

  // ─── Theme Settings ───
  void saveThemeMode(ThemeMode mode) {
    _settingsBox.put('theme_mode', mode.name);
  }

  ThemeMode getThemeMode() {
    final modeName = _settingsBox.get('theme_mode', defaultValue: 'system');
    return ThemeMode.values.firstWhere(
      (e) => e.name == modeName,
      orElse: () => ThemeMode.system,
    );
  }

  // ─── Language Settings ───
  void saveLanguage(String languageCode) {
    _settingsBox.put('language_code', languageCode);
  }

  String getLanguage() {
    return _settingsBox.get('language_code', defaultValue: '') as String;
  }

  // ─── Country Settings ───
  void saveCountry(String countryCode) {
    _settingsBox.put('country_code', countryCode);
  }

  String getCountry() {
    return _settingsBox.get('country_code', defaultValue: '') as String;
  }

  // ─── Currency Settings ───
  void saveCurrency(String currencyCode) {
    _settingsBox.put('currency_code', currencyCode);
  }

  String getCurrency() {
    return _settingsBox.get('currency_code', defaultValue: '') as String;
  }

  /// Whether country was manually set by user (overrides IP detection)
  void setCountryManuallySet(bool value) {
    _settingsBox.put('country_manually_set', value);
  }

  bool isCountryManuallySet() {
    return _settingsBox.get('country_manually_set', defaultValue: false)
        as bool;
  }

  // ─── Display Settings ───
  void saveTextScale(double value) {
    _settingsBox.put('text_scale', value);
  }

  double getTextScale() {
    final value = _settingsBox.get('text_scale', defaultValue: 1.0);
    if (value is num) return value.toDouble();
    return 1.0;
  }

  /// Get value (local cache only) - Section 7.4
  Future<T?> get<T>(String key) async {
    // Check Hive local cache
    if (!_localBox.isOpen) return null;
    final localData = _localBox.get(key);
    if (localData != null) {
      final cached = jsonDecode(localData) as Map<String, dynamic>;
      final expiresAt = DateTime.parse(cached['expiresAt']);

      if (DateTime.now().isBefore(expiresAt)) {
        return cached['data'] as T;
      } else {
        await _localBox.delete(key);
      }
    }

    return null;
  }

  /// Save value (local cache only) - Section 7.4
  Future<void> set<T>(
    String key,
    T value, {
    Duration duration = const Duration(hours: 24),
  }) async {
    final expiresAt = DateTime.now().add(duration);
    await _setLocal(key, value, expiresAt);
  }

  Future<void> _setLocal<T>(String key, T value, DateTime expiresAt) async {
    if (!_localBox.isOpen) return;
    await _localBox.put(
      key,
      jsonEncode({'data': value, 'expiresAt': expiresAt.toIso8601String()}),
    );
  }

  /// Get value from local Hive cache only (no Firestore fallback)
  T? getLocal<T>(String key) {
    if (!_localBox.isOpen) return null;
    final localData = _localBox.get(key);
    if (localData == null) return null;
    try {
      final cached = jsonDecode(localData) as Map<String, dynamic>;
      final expiresAt = DateTime.parse(cached['expiresAt']);
      if (DateTime.now().isBefore(expiresAt)) {
        return cached['data'] as T;
      } else {
        _localBox.delete(key);
      }
    } catch (_) {}
    return null;
  }

  /// Stale-While-Revalidate: Return cached data even if expired.
  /// Returns (data, isExpired) tuple. Caller should refresh in background if expired.
  ({T? data, bool isStale}) getLocalStale<T>(String key) {
    if (!_localBox.isOpen) return (data: null, isStale: true);
    final localData = _localBox.get(key);
    if (localData == null) return (data: null, isStale: true);
    try {
      final cached = jsonDecode(localData) as Map<String, dynamic>;
      final expiresAt = DateTime.parse(cached['expiresAt']);
      final data = cached['data'] as T?;
      final isStale = DateTime.now().isAfter(expiresAt);
      return (data: data, isStale: isStale);
    } catch (_) {}
    return (data: null, isStale: true);
  }

  /// Async variant: reads the raw JSON string from Hive then decodes it in a
  /// background isolate to avoid blocking the main thread for large payloads
  /// (e.g. the 1500-product home-feed cache).
  Future<({T? data, bool isStale})> getLocalStaleAsync<T>(String key) async {
    if (!_localBox.isOpen) return (data: null, isStale: true);
    final localData = _localBox.get(key);
    if (localData == null || localData is! String) return (data: null, isStale: true);
    try {
      // Parse JSON off the main thread — prevents 200–400 ms jank on low-end
      // devices when the stored string is large (> 500 KB).
      final cached = await compute<String, Map<String, dynamic>>(
        (raw) => jsonDecode(raw) as Map<String, dynamic>,
        localData,
      );
      final expiresAt = DateTime.parse(cached['expiresAt'] as String);
      final data = cached['data'] as T?;
      final isStale = DateTime.now().isAfter(expiresAt);
      return (data: data, isStale: isStale);
    } catch (_) {}
    return (data: null, isStale: true);
  }

  /// Raw variant: returns the stored JSON string + isStale, without decoding.
  /// Caller can pass the raw string to a single isolate that does both decode
  /// and entity construction in one roundtrip (avoids two compute() spawns).
  /// Returns null when the key is missing. `isStale` is determined by reading
  /// only the `expiresAt` portion of the payload (~tens of bytes), keeping
  /// main-thread work negligible.
  Future<({String? raw, bool isStale})> getLocalRawStaleAsync(String key) async {
    if (!_localBox.isOpen) return (raw: null, isStale: true);
    final localData = _localBox.get(key);
    if (localData == null || localData is! String) {
      return (raw: null, isStale: true);
    }
    // Quick stale check: scan only for the expiresAt field rather than
    // decoding the whole JSON. Falls back to a stale=true assumption if
    // the field is missing or unparseable — the isolate will still work.
    bool isStale = true;
    final idx = localData.indexOf('"expiresAt"');
    if (idx >= 0) {
      final colon = localData.indexOf(':', idx);
      final quoteStart = localData.indexOf('"', colon + 1);
      final quoteEnd = quoteStart >= 0
          ? localData.indexOf('"', quoteStart + 1)
          : -1;
      if (quoteStart >= 0 && quoteEnd > quoteStart) {
        try {
          final expiresAt = DateTime.parse(
            localData.substring(quoteStart + 1, quoteEnd),
          );
          isStale = DateTime.now().isAfter(expiresAt);
        } catch (_) {}
      }
    }
    return (raw: localData, isStale: isStale);
  }

  /// Save value to local Hive cache only (no Firestore)
  Future<void> setLocal<T>(
    String key,
    T value, {
    Duration duration = const Duration(hours: 24),
  }) async {
    final expiresAt = DateTime.now().add(duration);
    await _setLocal(key, value, expiresAt);
  }

  /// Delete a specific key
  Future<void> delete(String key) async {
    await _localBox.delete(key);
  }

  /// Clear expired cache entries (batched to avoid UI jank)
  Future<void> clearExpired() async {
    final keysToDelete = <String>[];
    final now = DateTime.now();

    for (final key in _localBox.keys) {
      try {
        final data = _localBox.get(key as String);
        if (data != null) {
          final cached = jsonDecode(data) as Map<String, dynamic>;
          if (cached['expiresAt'] != null) {
            final expiresAt = DateTime.parse(cached['expiresAt']);
            if (now.isAfter(expiresAt)) {
              keysToDelete.add(key);
            }
          }
        }
      } catch (_) {
        keysToDelete.add(key as String);
      }
    }

    // Batch delete in chunks of 50 to avoid blocking UI
    for (int i = 0; i < keysToDelete.length; i += 50) {
      final batch = keysToDelete.skip(i).take(50);
      for (final key in batch) {
        await _localBox.delete(key);
      }
      if (i + 50 < keysToDelete.length) {
        await Future.delayed(const Duration(milliseconds: 10));
      }
    }
  }

  /// Clear all local cache
  Future<void> clearAll() async {
    await _localBox.clear();
  }

  /// Clear all user-specific data on account deletion / sign-out.
  /// Resets country selection so IP-based detection runs again on next launch.
  Future<void> clearUserData() async {
    try {
      // Clear IP location cache so auto-detection runs fresh on next login.
      final ipBox = await Hive.openBox('qor_ai_local_cache');
      await ipBox.delete('ip_location_data');
    } catch (_) {}
    // Reset country to unset so IP detection will re-run.
    _settingsBox.delete('country_code');
    _settingsBox.delete('country_manually_set');
    // Clear local product/recently-viewed cache keys.
    try {
      final keysToDelete = _localBox.keys
          .whereType<String>()
          .where(
            (k) =>
                k.startsWith('recently_viewed') ||
                k.startsWith('viewed_products') ||
                k.startsWith('user_'),
          )
          .toList();
      for (final key in keysToDelete) {
        await _localBox.delete(key);
      }
    } catch (_) {}
  }
}
