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

  const AnalysisHubState({this.busy = const {}, this.notices = const []});

  bool get isBusy => busy.isNotEmpty;

  AnalysisHubState copyWith({
    Set<AnalysisFlowKind>? busy,
    List<AnalysisNotice>? notices,
  }) {
    return AnalysisHubState(
      busy: busy ?? this.busy,
      notices: notices ?? this.notices,
    );
  }
}

class AnalysisHubNotifier extends StateNotifier<AnalysisHubState> {
  AnalysisHubNotifier() : super(const AnalysisHubState());

  void setBusy(AnalysisFlowKind flow, bool busy) {
    final next = {...state.busy};
    final changed = busy ? next.add(flow) : next.remove(flow);
    if (!changed) return;
    state = state.copyWith(busy: next);
  }

  /// Bildirim ekle/güncelle. Aynı [AnalysisNotice.id] varsa YERİNE geçer
  /// (quiz bildirimi → rapor bildirimi dönüşümü tek satır olur) ve en öne alınır.
  void pushNotice(AnalysisNotice n) {
    final list = state.notices.where((x) => x.id != n.id).toList()..insert(0, n);
    state = state.copyWith(notices: list);
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
