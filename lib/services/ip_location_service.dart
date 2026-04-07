/// IP-based user location detection using ip-api.com (free, no key required)
library;

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

const _boxName = 'compair_local_cache';
const _cacheKey = 'ip_location_country';
const _cacheTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 days

class IpLocationService {
  final Dio _dio;
  IpLocationService(this._dio);

  Future<String> detectCountry() async {
    // 1) Check Hive cache (7-day TTL)
    try {
      final box = await Hive.openBox(_boxName);
      final raw = box.get(_cacheKey);
      if (raw is Map) {
        final ts = (raw['ts'] as int?) ?? 0;
        if (DateTime.now().millisecondsSinceEpoch - ts < _cacheTtlMs) {
          return (raw['country'] as String?) ?? 'US';
        }
      }
    } catch (_) {}

    // 2) Primary: ip-api.com (free, no API key, ~50ms)
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        'http://ip-api.com/json/',
        queryParameters: {'fields': 'countryCode,status'},
        options: Options(
          receiveTimeout: const Duration(seconds: 5),
          sendTimeout: const Duration(seconds: 5),
        ),
      );
      final data = res.data;
      if (data != null && data['status'] == 'success') {
        final country = (data['countryCode'] as String?) ?? 'US';
        await _saveToCache(country);
        return country;
      }
    } catch (_) {}

    // 3) Fallback: ipapi.co
    try {
      final res = await _dio.get<String>(
        'https://ipapi.co/country_code/',
        options: Options(
          receiveTimeout: const Duration(seconds: 5),
          sendTimeout: const Duration(seconds: 5),
        ),
      );
      final body = (res.data ?? '').trim();
      if (body.length == 2 && RegExp(r'^[A-Z]{2}$').hasMatch(body)) {
        await _saveToCache(body);
        return body;
      }
    } catch (_) {}

    return 'US';
  }

  Future<void> _saveToCache(String country) async {
    try {
      final box = await Hive.openBox(_boxName);
      await box.put(_cacheKey, {
        'country': country,
        'ts': DateTime.now().millisecondsSinceEpoch,
      });
    } catch (_) {}
  }
}

final ipLocationServiceProvider = Provider<IpLocationService>((ref) {
  return IpLocationService(Dio());
});

final detectedCountryProvider = FutureProvider<String>((ref) async {
  return ref.read(ipLocationServiceProvider).detectCountry();
});
