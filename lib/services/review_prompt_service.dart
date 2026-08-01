/// Qor AI - Play In-App Review Prompt
///
/// NEDEN: Play arama algoritması puanı olmayan uygulamayı organik olarak
/// neredeyse hiç göstermez. Anahtar kelime/ASO çalışması bu tavanı aşamaz —
/// ilk yorumlar gelmeden mağaza görünürlüğü açılmıyor. Bu servis, kullanıcı
/// uygulamadan GERÇEKTEN değer aldığı anda (karşılaştırma/analiz tamamlandı)
/// Play'in yerel puanlama sayfasını açar.
///
/// Play kotası: `requestReview` sessizce yok sayılabilir (kullanıcı başına
/// yıllık sınır var). Bu yüzden "gösterildi mi" değil "istendi mi" saklanır ve
/// asla döngüye sokulmaz.
library;

import 'package:flutter/foundation.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Kullanıcı bu kadar değerli eylemi tamamlamadan puan istenmez. Erken sorulan
/// puan isteği düşük yıldız getirir — asıl riskimiz bu, sessizlik değil.
const int _kMinValuableActions = 3;

/// Kurulumdan sonra en az bu kadar zaman geçmeden sorulmaz.
const Duration _kMinAgeSinceFirstUse = Duration(days: 2);

const String _kActionCountKey = 'review_prompt_action_count';
const String _kFirstUseKey = 'review_prompt_first_use_ms';
const String _kAskedVersionKey = 'review_prompt_asked_version';

class ReviewPromptService {
  ReviewPromptService._();
  static final instance = ReviewPromptService._();

  final InAppReview _inAppReview = InAppReview.instance;
  bool _askedThisSession = false;

  /// Kullanıcı değerli bir eylemi tamamladığında çağrılır (karşılaştırma
  /// sonucu, link analizi, AI raporu). Koşullar tutmazsa hiçbir şey yapmaz.
  ///
  /// Asla exception fırlatmaz — puan istemi çağrı yerindeki akışı bozmamalı.
  Future<void> registerValuableAction() async {
    if (_askedThisSession) return;
    try {
      final prefs = await SharedPreferences.getInstance();

      // Sürüm başına tek istek: kullanıcı bir kez "hayır" dediyse her açılışta
      // tekrar rahatsız etmeyiz.
      final currentVersion = (await PackageInfo.fromPlatform()).version;
      if (prefs.getString(_kAskedVersionKey) == currentVersion) return;

      final nowMs = DateTime.now().millisecondsSinceEpoch;
      final firstUseMs = prefs.getInt(_kFirstUseKey);
      if (firstUseMs == null) {
        await prefs.setInt(_kFirstUseKey, nowMs);
        return;
      }
      final age = Duration(milliseconds: nowMs - firstUseMs);
      if (age < _kMinAgeSinceFirstUse) return;

      final count = (prefs.getInt(_kActionCountKey) ?? 0) + 1;
      await prefs.setInt(_kActionCountKey, count);
      if (count < _kMinValuableActions) return;

      if (!await _inAppReview.isAvailable()) return;

      _askedThisSession = true;
      await prefs.setString(_kAskedVersionKey, currentVersion);
      await _inAppReview.requestReview();
      debugPrint('=== QOR AI: Review prompt requested (actions=$count) ===');
    } catch (e) {
      debugPrint('=== QOR AI: Review prompt skipped: $e ===');
    }
  }

  /// Ayarlar/profil ekranındaki "Bizi değerlendir" butonu için — burada
  /// koşul yok, kullanıcı bilerek bastı, doğrudan mağaza sayfasını açar.
  Future<void> openStoreListing() async {
    try {
      await _inAppReview.openStoreListing();
    } catch (e) {
      debugPrint('=== QOR AI: openStoreListing failed: $e ===');
    }
  }
}
