/// Qor AI — Hesap Kapsamı Sıfırlama
///
/// NEDEN VAR: Kullanıcıya ÖZEL provider'ların hiçbiri `autoDispose` değil ve
/// çıkışta hiçbiri invalidate edilmiyordu. Yani A hesabı çıkıp B hesabı
/// girdiğinde A'nın verisi bellekte kalmaya devam ediyordu:
///   • eşleşme puanı ve gerekçesi (A'nın quiz profiline göre hesaplanmış),
///   • ürün/karşılaştırma AI raporları, yorum ve fiyat tahmini analizleri,
///   • Qor AI sohbet oturumu, link/abonelik analiz akışları,
///   • karşılaştırma oturumu (seçili ürünler + AI sonuçları).
///
/// Bu, Play aboneliğinin yanlış hesaba geçmesiyle AYNI hata sınıfı: hesap
/// değişiyor ama hesaba bağlı durum değişmiyor. Cache anahtarları ürün+dil
/// bazlı olduğu için kullanıcı ayrımı hiç yapılmıyordu.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/presentation/providers/product_analysis_provider.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

/// Oturum değiştiğinde (çıkış, hesap silme, farklı hesapla giriş) kullanıcıya
/// bağlı TÜM önbellekleri düşürür. Family provider'ları invalidate etmek tüm
/// parametre kombinasyonlarını da düşürür.
void resetUserScopedState(WidgetRef ref) => _reset(ref.invalidate);

/// Provider/notifier içinden aynı sıfırlama.
void resetUserScopedStateRef(Ref ref) => _reset(ref.invalidate);

void _reset(void Function(ProviderOrFamily) invalidate) {
  // AI çıktıları — hepsi kullanıcı profiline göre üretiliyor.
  invalidate(geminiMatchScoreProvider);
  invalidate(aiReviewCacheProvider);
  invalidate(predictionCacheProvider);
  invalidate(productAnalysisProvider);

  // Sohbet ve analiz akışları.
  invalidate(chatSessionProvider);
  invalidate(linkQuizProvider);
  invalidate(compareAnalysisProvider);
  invalidate(subQuizProvider);

  // Karşılaştırma oturumu (seçili ürünler + AI sonuçları).
  invalidate(compareSessionProvider);
  invalidate(comparisonStateProvider);

  // Kullanıcıya bağlı listeler.
  invalidate(viewedProductsProvider);
  invalidate(productAnalysisHistoryProvider);
  invalidate(userProfileProvider);
}
