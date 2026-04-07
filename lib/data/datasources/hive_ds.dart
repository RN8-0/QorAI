/// Compair - Hive Local Data Source
/// Blueprint Section 2 (Hive - NoSQL, fast, Flutter-native)

import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';

class HiveDataSource {
  static const String _userBox = 'user_data';
  static const String _settingsBox = 'settings';
  static const String _recentSearchesBox = 'recent_searches';

  late Box<String> _userDataBox;
  late Box<String> _settingsDataBox;
  late Box<String> _recentSearchesDataBox;

  Future<void> initialize() async {
    await Hive.initFlutter();
    _userDataBox = await Hive.openBox<String>(_userBox);
    _settingsDataBox = await Hive.openBox<String>(_settingsBox);
    _recentSearchesDataBox = await Hive.openBox<String>(_recentSearchesBox);
  }

  // ─── User Data ───

  Future<void> saveUserData(Map<String, dynamic> data) async {
    await _userDataBox.put('current_user', jsonEncode(data));
  }

  Map<String, dynamic>? getUserData() {
    final data = _userDataBox.get('current_user');
    if (data == null) return null;
    return jsonDecode(data) as Map<String, dynamic>;
  }

  Future<void> clearUserData() async {
    await _userDataBox.clear();
  }

  // ─── Settings ───

  Future<void> saveSetting(String key, dynamic value) async {
    await _settingsDataBox.put(key, jsonEncode(value));
  }

  Future<void> deleteSetting(String key) async {
    await _settingsDataBox.delete(key);
  }

  T? getSetting<T>(String key) {
    final data = _settingsDataBox.get(key);
    if (data == null) return null;
    return jsonDecode(data) as T;
  }

  // ─── Recent Searches ───

  Future<void> addRecentSearch(String query) async {
    final searches = getRecentSearches();
    searches.remove(query);
    searches.insert(0, query);
    if (searches.length > 20) {
      searches.removeRange(20, searches.length);
    }
    await _recentSearchesDataBox.put(
      'recent',
      jsonEncode(searches),
    );
  }

  List<String> getRecentSearches() {
    final data = _recentSearchesDataBox.get('recent');
    if (data == null) return [];
    return List<String>.from(jsonDecode(data));
  }

  Future<void> clearRecentSearches() async {
    await _recentSearchesDataBox.delete('recent');
  }

  // ─── Recently Viewed Products ───

  Future<void> addViewedProduct(String productId) async {
    final viewed = getViewedProducts();
    viewed.remove(productId);
    viewed.insert(0, productId);
    if (viewed.length > 50) viewed.removeRange(50, viewed.length);
    await _settingsDataBox.put('viewed_products', jsonEncode(viewed));
  }

  List<String> getViewedProducts() {
    final data = _settingsDataBox.get('viewed_products');
    if (data == null) return [];
    return List<String>.from(jsonDecode(data));
  }

  // ─── Freemium Usage Tracking ───

  String _usageKey(String feature, String period) {
    final now = DateTime.now();
    final tag = period == 'daily'
        ? '${now.year}-${now.month}-${now.day}'
        : '${now.year}-W${(now.day ~/ 7)}';
    return 'usage_${feature}_$tag';
  }

  int getUsageCount(String feature, {String period = 'daily'}) {
    final key = _usageKey(feature, period);
    final data = _settingsDataBox.get(key);
    if (data == null) return 0;
    return jsonDecode(data) as int;
  }

  Future<void> incrementUsage(String feature, {String period = 'daily'}) async {
    final key = _usageKey(feature, period);
    final current = getUsageCount(feature, period: period);
    await _settingsDataBox.put(key, jsonEncode(current + 1));
  }

  // ─── Cleanup ───

  Future<void> clearAll() async {
    await _userDataBox.clear();
    await _settingsDataBox.clear();
    await _recentSearchesDataBox.clear();
  }
}
