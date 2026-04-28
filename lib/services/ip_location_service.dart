/// User location detection — device locale (primary) → Cloudflare Worker → ipwho.is
///
/// ipapi.co tamamen kaldırıldı: günlük 1000 istek limiti, sık 429 hatası.
/// Cloudflare Worker: günlük 100.000 ücretsiz istek.
/// scripts/cloudflare_location_worker.js → deploy et ve _cloudflareWorkerUrl'i doldur.
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

const _boxName = 'qor_ai_local_cache';
const _cacheKey = 'ip_location_data';
const _cacheTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 gün

/// Cloudflare Worker URL — scripts/cloudflare_location_worker.js dosyasını deploy et.
/// Deploy sonrası buraya kendi Worker URL'ini yaz.
/// Örnek: 'https://qorai-location.your-username.workers.dev'
const _cloudflareWorkerUrl = ''; // <-- BURAYA CLOUDFLARE WORKER URL'İNİ YAZ

/// Desteklenen ülkelerin para birimi ve adı için minimal lookup.
/// Tam liste SupportedCountries.countries içinde mevcuttur.
const _currencyByCountry = <String, String>{
  'US': 'USD',
  'GB': 'GBP',
  'DE': 'EUR',
  'FR': 'EUR',
  'IT': 'EUR',
  'ES': 'EUR',
  'NL': 'EUR',
  'BE': 'EUR',
  'PT': 'EUR',
  'AT': 'EUR',
  'CA': 'CAD',
  'AU': 'AUD',
  'JP': 'JPY',
  'IN': 'INR',
  'TR': 'TRY',
  'SE': 'SEK',
  'PL': 'PLN',
  'MX': 'MXN',
  'BR': 'BRL',
  'SG': 'SGD',
  'AE': 'AED',
  'SA': 'SAR',
  'KR': 'KRW',
  'TW': 'TWD',
  'CH': 'CHF',
  'DK': 'DKK',
  'NO': 'NOK',
  'ZA': 'ZAR',
  'RU': 'RUB',
  'TH': 'THB',
  'ID': 'IDR',
  'MY': 'MYR',
  'PH': 'PHP',
  'VN': 'VND',
  'AR': 'ARS',
  'CL': 'CLP',
  'CO': 'COP',
  'EG': 'EGP',
  'NG': 'NGN',
  'PK': 'PKR',
  'BD': 'BDT',
  'UA': 'UAH',
  'CZ': 'CZK',
  'HU': 'HUF',
  'RO': 'RON',
  'IL': 'ILS',
  'GR': 'EUR',
  'FI': 'EUR',
  'IE': 'EUR',
};

const _nameByCountry = <String, String>{
  'US': 'United States',
  'GB': 'United Kingdom',
  'DE': 'Germany',
  'FR': 'France',
  'IT': 'Italy',
  'ES': 'Spain',
  'CA': 'Canada',
  'AU': 'Australia',
  'JP': 'Japan',
  'IN': 'India',
  'TR': 'Türkiye',
  'NL': 'Netherlands',
  'SE': 'Sweden',
  'PL': 'Poland',
  'MX': 'Mexico',
  'BR': 'Brazil',
  'SG': 'Singapore',
  'AE': 'UAE',
  'SA': 'Saudi Arabia',
  'KR': 'South Korea',
  'TW': 'Taiwan',
  'CH': 'Switzerland',
};

/// Result of location detection
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
    // 1) Hive cache kontrolü (7 günlük TTL) — cache varsa ağa istek atmaz.
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

    // 2) Birincil: Cihaz locale'i — ANLIK, sıfır ağ gecikmesi.
    // Cihaz dili/bölgesi desteklenen ülkelerdeyse hemen kullan ve cache'le.
    try {
      final locale = WidgetsBinding.instance.platformDispatcher.locale;
      final deviceCountry = locale.countryCode?.toUpperCase() ?? '';
      if (deviceCountry.isNotEmpty &&
          _currencyByCountry.containsKey(deviceCountry)) {
        final result = IpLocationResult(
          countryCode: deviceCountry,
          currency: _currencyByCountry[deviceCountry] ?? 'USD',
          countryName: _nameByCountry[deviceCountry] ?? deviceCountry,
        );
        await _saveToCache(result);
        debugPrint(
          '=== QOR AI: Location from device locale: $deviceCountry ===',
        );
        return result;
      }
    } catch (e) {
      debugPrint('=== QOR AI: Device locale detection failed: $e ===');
    }

    // 3) İkincil: Cloudflare Worker — günde 100.000 ücretsiz istek.
    // scripts/cloudflare_location_worker.js'i deploy edip URL'i doldur.
    if (_cloudflareWorkerUrl.isNotEmpty) {
      try {
        final res = await _dio.get<Map<String, dynamic>>(
          _cloudflareWorkerUrl,
          options: Options(
            receiveTimeout: const Duration(seconds: 3),
            sendTimeout: const Duration(seconds: 2),
          ),
        );
        final data = res.data;
        if (data != null &&
            data['success'] == true &&
            data['country_code'] != null) {
          final code = (data['country_code'] as String).toUpperCase();
          final result = IpLocationResult(
            countryCode: code,
            currency: _currencyByCountry[code] ?? 'USD',
            countryName: _nameByCountry[code] ?? code,
          );
          await _saveToCache(result);
          debugPrint('=== QOR AI: Location from Cloudflare Worker: $code ===');
          return result;
        }
      } catch (e) {
        debugPrint('=== QOR AI: Cloudflare Worker failed: $e ===');
      }
    }

    // 4) Son çare: ipwho.is (ücretsiz, kayıt gerektirmez)
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        'https://ipwho.is/',
        options: Options(
          receiveTimeout: const Duration(seconds: 3),
          sendTimeout: const Duration(seconds: 3),
        ),
      );
      final data = res.data;
      final success = data?['success'] == true;
      if (success && data != null && data['country_code'] != null) {
        final code = (data['country_code'] as String).toUpperCase();
        final result = IpLocationResult(
          countryCode: code,
          currency: _currencyByCountry[code] ?? 'USD',
          countryName: _nameByCountry[code] ?? code,
        );
        await _saveToCache(result);
        debugPrint('=== QOR AI: Location from ipwho.is: $code ===');
        return result;
      }
    } catch (e) {
      debugPrint('=== QOR AI: ipwho.is failed: $e ===');
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
