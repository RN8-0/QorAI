/// Qor AI - Utility Functions
/// Blueprint Section 7.4, 8.1, 11.2
library;

import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:intl/intl.dart';
import 'package:qor_ai/core/constants.dart';

class AppUtils {
  AppUtils._();

  /// Generate cache key - Section 7.4
  /// Cache key: MD5(productIds + profileHash + country)
  static String generateCacheKey({
    required List<String> productIds,
    required String profileHash,
    required String country,
  }) {
    final input = '${productIds.join('_')}_${profileHash}_$country';
    return md5.convert(utf8.encode(input)).toString();
  }

  /// Generate profile hash
  static String generateProfileHash({
    required String ecosystem,
    required String budgetRange,
    required List<String> priorities,
  }) {
    final input = '${ecosystem}_${budgetRange}_${priorities.join('_')}';
    return md5.convert(utf8.encode(input)).toString();
  }

  /// Currency formatting - Section 11.3
  static String formatCurrency(double amount, String currencyCode) {
    final format = NumberFormat.currency(
      locale: _getLocaleForCurrency(currencyCode),
      symbol: _getCurrencySymbol(currencyCode),
      decimalDigits: currencyCode == 'JPY' || currencyCode == 'KRW' ? 0 : 2,
    );
    return format.format(amount);
  }

  static String _getLocaleForCurrency(String currency) {
    switch (currency) {
      case 'USD':
        return 'en_US';
      case 'GBP':
        return 'en_GB';
      case 'EUR':
        return 'de_DE';
      case 'TRY':
        return 'tr_TR';
      case 'JPY':
        return 'ja_JP';
      case 'KRW':
        return 'ko_KR';
      case 'CAD':
        return 'en_CA';
      case 'AUD':
        return 'en_AU';
      default:
        return 'en_US';
    }
  }

  static String _getCurrencySymbol(String currency) {
    switch (currency) {
      case 'USD':
        return '\$';
      case 'GBP':
        return '£';
      case 'EUR':
        return '€';
      case 'TRY':
        return '₺';
      case 'JPY':
        return '¥';
      case 'KRW':
        return '₩';
      case 'CAD':
        return 'CA\$';
      case 'AUD':
        return 'A\$';
      default:
        return '\$';
    }
  }

  /// Compatibility percentage format
  static String formatScore(double score) {
    return '%${score.toStringAsFixed(0)}';
  }

  /// Time format (relative)
  static String timeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inDays > 365) {
      return '${(diff.inDays / 365).floor()} years ago';
    } else if (diff.inDays > 30) {
      return '${(diff.inDays / 30).floor()} months ago';
    } else if (diff.inDays > 7) {
      return '${(diff.inDays / 7).floor()} weeks ago';
    } else if (diff.inDays > 0) {
      return '${diff.inDays} days ago';
    } else if (diff.inHours > 0) {
      return '${diff.inHours} hours ago';
    } else if (diff.inMinutes > 0) {
      return '${diff.inMinutes} minutes ago';
    } else {
      return 'Just now';
    }
  }

  /// Country code validation - Section 11.1
  static bool isValidCountryCode(String code) {
    return SupportedCountries.countries.containsKey(code.toUpperCase());
  }

  /// Country priority order - Section 11.2
  /// Manual selection > Quiz answer > IP > Locale
  static String resolveCountry({
    String? manualSelection,
    String? quizAnswer,
    String? ipCountry,
    String? localeCountry,
  }) {
    final priority = manualSelection ?? quizAnswer ?? ipCountry ?? localeCountry ?? 'US';
    return isValidCountryCode(priority) ? priority.toUpperCase() : 'US';
  }
}
