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

  /// Katalog karşılaştırması için ÜRÜN KÜMESİ (`compareAiKey`, virgüllü sıralı
  /// id listesi). Kullanıcı bu arada karşılaştırmayı kapatmış ya da BAŞKA bir
  /// karşılaştırma kurmuş olabilir — bildirim, havuzu kendi id'leriyle yeniden
  /// kurar, böylece "tıklayınca anında açılır".
  final String? compareIds;

  const AnalysisNotice({
    required this.id,
    required this.flow,
    required this.kind,
    required this.label,
    this.productId,
    this.tabIndex,
    this.compareIds,
  });

  /// Bildirimin GÖTÜRDÜĞÜ içeriğin kimliği. [AnalysisHubState.viewing] ile
  /// karşılaştırılır: kullanıcı zaten oradaysa bildirim basılmaz.
  /// Ürün akışı ürüne özgüdür (`product:<id>`), diğerleri tekil ekrandır.
  String get targetKey {
    if (flow == AnalysisFlowKind.product) {
      return productId != null && productId!.isNotEmpty
          ? 'product:$productId'
          : 'product';
    }
    // Karşılaştırma ürün kümesine özgüdür: kullanıcı BAŞKA bir karşılaştırma
    // ekranındayken bu bildirimin bastırılmaması gerekir.
    if (flow == AnalysisFlowKind.compare &&
        compareIds != null &&
        compareIds!.isNotEmpty) {
      return 'compare:$compareIds';
    }
    return flow.name;
  }
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

  /// Kullanıcının ŞU AN baktığı içeriğin kimliği ([AnalysisNotice.targetKey]
  /// ile aynı biçim). Bildirim bastırma bunun üzerinden çalışır: kullanıcı
  /// zaten link analizi ekranındaysa "link analizin hazır" bildirimi anlamsız
  /// (ve rahatsız edici) — sonucu zaten ekranda görüyor.
  ///
  /// Rota yerine GÖRÜNTÜLENEN İÇERİK kimliği kullanılır: go_router
  /// StatefulShellRoute'ta yalnız aktif SEKME'yi bildirir, shell'in üstüne
  /// push edilen ürün sayfasını değil (bkz. `_routePath` yorumu).
  final String? viewing;

  const AnalysisHubState({
    this.busy = const {},
    this.notices = const [],
    this.alert,
    this.viewing,
  });

  bool get isBusy => busy.isNotEmpty;

  AnalysisHubState copyWith({
    Set<AnalysisFlowKind>? busy,
    List<AnalysisNotice>? notices,
    Object? alert = _noAlertChange,
    Object? viewing = _noAlertChange,
  }) {
    return AnalysisHubState(
      busy: busy ?? this.busy,
      notices: notices ?? this.notices,
      alert: identical(alert, _noAlertChange) ? this.alert : alert as String?,
      viewing: identical(viewing, _noAlertChange)
          ? this.viewing
          : viewing as String?,
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
    // KULLANICI ZATEN ORADAYSA BİLDİRME. Bildirim, kullanıcıyı bulunduğu yerden
    // sonuca ÇAĞIRMAK içindir; sonucu zaten görüntülüyorken basılması yalnızca
    // gürültü (kullanıcı şikâyeti: "bildirim sayfası açıkken bildirim geliyor").
    // Eski bildirim varsa yine de temizlenir: bayat satır ekranda kalmasın.
    if (state.viewing != null && state.viewing == n.targetKey) {
      final cleaned = state.notices.where((x) => x.id != n.id).toList();
      state = state.copyWith(notices: cleaned, alert: null);
      return;
    }
    final list = state.notices.where((x) => x.id != n.id).toList()..insert(0, n);
    state = state.copyWith(notices: list, alert: null);
  }

  /// Ekran açılınca kendi içerik kimliğini bildirir, kapanınca (aynı kimlikle)
  /// bırakır. Kapanışta başka bir ekran araya girmişse üzerine YAZMAZ.
  void setViewing(String? key) {
    if (state.viewing == key) return;
    state = state.copyWith(viewing: key);
    // O ekranın bekleyen bildirimi varsa artık gereksiz — kullanıcı geldi.
    if (key != null && state.notices.any((x) => x.targetKey == key)) {
      state = state.copyWith(
        notices: state.notices.where((x) => x.targetKey != key).toList(),
      );
    }
  }

  void clearViewing(String key) {
    if (state.viewing != key) return;
    state = state.copyWith(viewing: null);
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
