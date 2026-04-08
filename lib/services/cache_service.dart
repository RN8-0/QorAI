/// Compair - Cache Service (Two-Layer Cache)
/// Blueprint Section 7.4
///
/// Hive local cache + Firestore server cache (two layers)
/// Cache key: MD5(productIds + profileHash + country)
/// Cache duration: 24 hours (products), 1 hour (trend analyses)

import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:convert';

class CacheService {
  static const String _cacheBoxName = 'compair_cache';
  static const String _settingsBoxName = 'compair_settings';
  
  late Box<String> _localBox;
  late Box _settingsBox;
  final FirebaseFirestore _firestore;

  CacheService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

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
    return _settingsBox.get('country_manually_set', defaultValue: false) as bool;
  }

  /// Get value (local first, then server) - Section 7.4
  Future<T?> get<T>(String key) async {
    // 1. Check Hive local cache
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

    // 2. Check Firestore server cache
    try {
      final doc = await _firestore.collection('cache').doc(key).get();
      if (doc.exists) {
        final data = doc.data()!;
        final expiresAt = (data['expiresAt'] as Timestamp).toDate();

        if (DateTime.now().isBefore(expiresAt)) {
          // Also save to local cache
          await _setLocal(key, data['data'], expiresAt);
          return data['data'] as T;
        }
      }
    } catch (_) {
      // Firestore access error - silently skip
    }

    return null;
  }

  /// Save value (to both layers) - Section 7.4
  Future<void> set<T>(
    String key,
    T value, {
    Duration duration = const Duration(hours: 24),
  }) async {
    final expiresAt = DateTime.now().add(duration);

    // 1. Hive local cache
    await _setLocal(key, value, expiresAt);

    // 2. Firestore server cache
    try {
      await _firestore.collection('cache').doc(key).set({
        'data': value,
        'expiresAt': Timestamp.fromDate(expiresAt),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {
      // Firestore write error - local cache is sufficient
    }
  }

  Future<void> _setLocal<T>(String key, T value, DateTime expiresAt) async {
    if (!_localBox.isOpen) return;
    await _localBox.put(
      key,
      jsonEncode({
        'data': value,
        'expiresAt': expiresAt.toIso8601String(),
      }),
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
    try {
      await _firestore.collection('cache').doc(key).delete();
    } catch (_) {}
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
}
