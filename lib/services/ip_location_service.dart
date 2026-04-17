/// IP-based user location detection using ip-api.com + ipapi.co
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

const _boxName = 'compair_local_cache';
const _cacheKey = 'ip_location_data';
const _cacheTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days

/// Result of IP-based location detection
class IpLocationResult {
  final String countryCode;
  final String currency;
  final String countryName;

  const IpLocationResult({
    this.countryCode = 'US',
    this.currency = 'USD',
    this.countryName = 'United States',
  });
}

class IpLocationService {
  final Dio _dio;
  IpLocationService(this._dio);

  Future<IpLocationResult> detectLocation() async {
    // 1) Check Hive cache (7-day TTL)
    try {
      final box = await Hive.openBox(_boxName);
      final raw = box.get(_cacheKey);
      if (raw is Map) {
        final ts = (raw['ts'] as int?) ?? 0;
        if (DateTime.now().millisecondsSinceEpoch - ts < _cacheTtlMs) {
          return IpLocationResult(
            countryCode: (raw['country'] as String?) ?? 'US',
            currency: (raw['currency'] as String?) ?? 'USD',
            countryName: (raw['countryName'] as String?) ?? 'United States',
          );
        }
      }
    } catch (_) {}

    // 2) Primary: ipapi.co/json/ (returns country, currency, country_name)
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        'https://ipapi.co/json/',
        options: Options(
          receiveTimeout: const Duration(seconds: 5),
          sendTimeout: const Duration(seconds: 5),
        ),
      );
      final data = res.data;
      if (data != null && data['country_code'] != null) {
        final result = IpLocationResult(
          countryCode: (data['country_code'] as String?) ?? 'US',
          currency: (data['currency'] as String?) ?? 'USD',
          countryName: (data['country_name'] as String?) ?? 'United States',
        );
        await _saveToCache(result);
        return result;
      }
    } catch (e) {
      debugPrint('=== COMPAIR: ipapi.co failed: $e ===');
    }

    return const IpLocationResult();
  }

  /// Legacy helper for backward compatibility
  Future<String> detectCountry() async {
    final result = await detectLocation();
    return result.countryCode;
  }

  Future<void> _saveToCache(IpLocationResult result) async {
    try {
      final box = await Hive.openBox(_boxName);
      await box.put(_cacheKey, {
        'country': result.countryCode,
        'currency': result.currency,
        'countryName': result.countryName,
        'ts': DateTime.now().millisecondsSinceEpoch,
      });
    } catch (_) {}
  }
}

final ipLocationServiceProvider = Provider<IpLocationService>((ref) {
  return IpLocationService(Dio());
});

final detectedCountryProvider = FutureProvider<String>((ref) async {
  final result = await ref.read(ipLocationServiceProvider).detectLocation();
  return result.countryCode;
});

final detectedLocationProvider = FutureProvider<IpLocationResult>((ref) async {
  return ref.read(ipLocationServiceProvider).detectLocation();
});
