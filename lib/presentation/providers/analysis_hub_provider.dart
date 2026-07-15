import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Qor AI chat tabanlı analiz bildirim merkezi.
///
/// KULLANICI İSTEĞİ (2026-07-12): Ekran ortası popup bildirim KALDIRILDI.
/// Bunun yerine:
/// - Herhangi bir analiz/quiz üretimi SÜRERKEN yüzen Q sohbet butonunda sağ üstte
///   mini bir yükleme işareti döner ([AnalysisHubState.isBusy]).
/// - Quiz veya rapor HAZIR olunca Qor AI chat panelinin içine "Quize git" /
///   "Analize git" / "Sonra" butonlu bir bildirim satırı düşer ([notices]).
/// Tüm akışlar buraya besler: ürün detay, link, abonelik, karşılaştırma.
enum AnalysisFlowKind { product, link, subscription, compare }

enum AnalysisNoticeKind { quiz, report }

@immutable
class AnalysisNotice {
  /// Tekilleştirme anahtarı. Aynı id yeniden basılırsa (quiz→rapor geçişi)
  /// eskisinin YERİNE geçer. Ürün: `product:<id>`; diğerleri akış adı (tekil).
  final String id;
  final AnalysisFlowKind flow;
  final AnalysisNoticeKind kind;
  final String label;

  /// Ürün akışı için hedef ürün id'si (`/product/<id>`e push).
  final String? productId;

  /// Link/abonelik/karşılaştırma için gidilecek sekme index'i (1/2/3).
  final int? tabIndex;

  const AnalysisNotice({
    required this.id,
    required this.flow,
    required this.kind,
    required this.label,
    this.productId,
    this.tabIndex,
  });
}

@immutable
class AnalysisHubState {
  /// Şu an quiz üretilen / analiz koşan akışlar. Boş değilse Q butonu döner.
  final Set<AnalysisFlowKind> busy;

  /// Hazır olup kullanıcının aksiyonunu bekleyen bildirimler (en yeni önde).
  final List<AnalysisNotice> notices;

  /// Geçici uyarı/hata satırı — Qor chat panelinin bandında gösterilir
  /// (ör. "analiz sürüyor" bloğu veya bir analiz hatası "ürün tanınamadı").
  /// Thread'e YAZILMAZ (kalıcı geçmişi kirletmez), yeni analiz başlayınca ya da
  /// sonuç gelince temizlenir.
  final String? alert;

  const AnalysisHubState({
    this.busy = const {},
    this.notices = const [],
    this.alert,
  });

  bool get isBusy => busy.isNotEmpty;

  AnalysisHubState copyWith({
    Set<AnalysisFlowKind>? busy,
    List<AnalysisNotice>? notices,
    Object? alert = _noAlertChange,
  }) {
    return AnalysisHubState(
      busy: busy ?? this.busy,
      notices: notices ?? this.notices,
      alert: identical(alert, _noAlertChange) ? this.alert : alert as String?,
    );
  }
}

/// copyWith'te `alert`'i null'a çekmekle "değiştirme" ayrımı için sentinel.
const Object _noAlertChange = Object();

class AnalysisHubNotifier extends StateNotifier<AnalysisHubState> {
  AnalysisHubNotifier() : super(const AnalysisHubState());

  void setBusy(AnalysisFlowKind flow, bool busy) {
    final next = {...state.busy};
    final changed = busy ? next.add(flow) : next.remove(flow);
    if (!changed) return;
    // Yeni analiz başladıysa eski uyarı/hata satırı bayat → temizle.
    state = state.copyWith(busy: next, alert: busy ? null : state.alert);
  }

  /// Bildirim ekle/güncelle. Aynı [AnalysisNotice.id] varsa YERİNE geçer
  /// (quiz bildirimi → rapor bildirimi dönüşümü tek satır olur) ve en öne alınır.
  /// Sonuç geldi → varsa geçici uyarı/hata satırını temizle.
  void pushNotice(AnalysisNotice n) {
    final list = state.notices.where((x) => x.id != n.id).toList()..insert(0, n);
    state = state.copyWith(notices: list, alert: null);
  }

  /// Geçici uyarı/hata satırı ayarla (chat bandında görünür). Aynı metni tekrar
  /// basma.
  void setAlert(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty || state.alert == trimmed) return;
    state = state.copyWith(alert: trimmed);
  }

  void clearAlert() {
    if (state.alert == null) return;
    state = state.copyWith(alert: null);
  }

  void removeNotice(String id) {
    if (!state.notices.any((x) => x.id == id)) return;
    state = state.copyWith(
      notices: state.notices.where((x) => x.id != id).toList(),
    );
  }

  /// Bir akış tamamen sıfırlanınca (yeni analiz başlarken) eski bildirimi at.
  void clearNotice(AnalysisFlowKind flow, {String? id}) {
    final list = state.notices
        .where((x) => id != null ? x.id != id : x.flow != flow)
        .toList();
    if (list.length == state.notices.length) return;
    state = state.copyWith(notices: list);
  }
}

final analysisHubProvider =
    StateNotifierProvider<AnalysisHubNotifier, AnalysisHubState>(
      (ref) => AnalysisHubNotifier(),
    );
