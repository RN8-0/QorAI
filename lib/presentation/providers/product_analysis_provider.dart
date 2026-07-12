import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart'
    show AiReportStageLite;

/// Ürün (tekli) AI analizinin GLOBAL durumu.
///
/// Neden global provider? Ürün detay ekranı PUSH edilmiş bir rota — geri
/// tuşuyla veya sekme değişiminde widget DISPOSE olunca eski tasarımda analiz
/// İPTAL oluyordu. Artık durum burada, motoru (async) ise her zaman canlı olan
/// `MainShell` yürütüyor (link/abonelik akışlarıyla birebir desen). Böylece:
/// - Kullanıcı üründen çıksa bile analiz sürer.
/// - Quiz hazır / rapor bitince MainShell ürün adıyla bildirim gösterir.
/// - Kullanıcı geri dönünce (thin view) provider'dan durumu okuyup gösterir.
enum ProductAnalysisPhase {
  idle,
  startRequested, // görünüm başlat dedi; motor quiz üretmeye başlamalı
  quizLoading,
  quiz, // quiz hazır, cevap bekliyor
  reportRequested, // cevaplar gönderildi; motor raporu koşmalı
  running,
  done,
  error,
}

@immutable
class ProductAnalysisState {
  final ProductAnalysisPhase phase;
  final String? productId;
  final String? productName;
  final ProductEntity? product; // motorun ihtiyacı
  final String lang;
  final Map<String, dynamic> profile;
  final ProductQuiz? quiz;
  final List<QuizQuestion> answers;
  final int quizIndex;
  final AiReportStageLite stage;
  final Map<String, dynamic>? report;
  final bool skipQuizAnswers; // quiz atlandıysa rapor boş cevapla koşulur

  /// Workboard'un GERÇEK başlama zamanı (quiz üretimi / rapor koşumu). Görünüm
  /// ilerlemeyi bundan türetir → üründen çıkıp dönünce ilerleme senkron kalır.
  final DateTime? workStartedAt;

  /// Hangi ürünün detayının EKRANDA açık olduğu (bildirimleri bastırmak için).
  final String? viewingProductId;

  /// "Bildirmeye değer" geçişlerde artan sayaçlar — MainShell bunları izleyip
  /// tek seferlik bildirim gösterir.
  final int quizReadySeq;
  final int reportReadySeq;

  const ProductAnalysisState({
    this.phase = ProductAnalysisPhase.idle,
    this.productId,
    this.productName,
    this.product,
    this.lang = 'en',
    this.profile = const {},
    this.quiz,
    this.answers = const [],
    this.quizIndex = 0,
    this.stage = AiReportStageLite.prep,
    this.report,
    this.skipQuizAnswers = false,
    this.workStartedAt,
    this.viewingProductId,
    this.quizReadySeq = 0,
    this.reportReadySeq = 0,
  });

  bool get isActive =>
      phase != ProductAnalysisPhase.idle &&
      phase != ProductAnalysisPhase.error;

  ProductAnalysisState copyWith({
    ProductAnalysisPhase? phase,
    String? productId,
    String? productName,
    ProductEntity? product,
    String? lang,
    Map<String, dynamic>? profile,
    ProductQuiz? quiz,
    List<QuizQuestion>? answers,
    int? quizIndex,
    AiReportStageLite? stage,
    Map<String, dynamic>? report,
    bool? skipQuizAnswers,
    DateTime? workStartedAt,
    int? quizReadySeq,
    int? reportReadySeq,
    Object? viewingProductId = _sentinel,
  }) {
    return ProductAnalysisState(
      phase: phase ?? this.phase,
      productId: productId ?? this.productId,
      productName: productName ?? this.productName,
      product: product ?? this.product,
      lang: lang ?? this.lang,
      profile: profile ?? this.profile,
      quiz: quiz ?? this.quiz,
      answers: answers ?? this.answers,
      quizIndex: quizIndex ?? this.quizIndex,
      stage: stage ?? this.stage,
      report: report ?? this.report,
      skipQuizAnswers: skipQuizAnswers ?? this.skipQuizAnswers,
      workStartedAt: workStartedAt ?? this.workStartedAt,
      viewingProductId: viewingProductId == _sentinel
          ? this.viewingProductId
          : viewingProductId as String?,
      quizReadySeq: quizReadySeq ?? this.quizReadySeq,
      reportReadySeq: reportReadySeq ?? this.reportReadySeq,
    );
  }

  static const Object _sentinel = Object();
}

class ProductAnalysisNotifier extends StateNotifier<ProductAnalysisState> {
  ProductAnalysisNotifier() : super(const ProductAnalysisState());

  /// Motorun (MainShell) quiz üretimiyle paralel başlattığı araştırma future'ı.
  /// State'te tutulmaz (serialleşmez) — sadece motorun kısa-ömürlü referansı.
  Future<String>? researchFuture;

  /// Görünüm: kullanıcı "Analizi Başlat"a bastı (kapı kontrolleri geçti).
  void requestStart(
    ProductEntity product,
    String lang,
    Map<String, dynamic> profile,
  ) {
    researchFuture = null;
    state = ProductAnalysisState(
      phase: ProductAnalysisPhase.startRequested,
      productId: product.id,
      productName: product.nameForLanguage(lang),
      product: product,
      lang: lang,
      profile: profile,
      viewingProductId: state.viewingProductId,
    );
  }

  void setQuizLoading() {
    state = state.copyWith(
      phase: ProductAnalysisPhase.quizLoading,
      workStartedAt: DateTime.now(),
    );
  }

  void setQuiz(ProductQuiz quiz) {
    state = state.copyWith(
      phase: ProductAnalysisPhase.quiz,
      quiz: quiz,
      answers: quiz.questions.map((q) => q.copyWith()).toList(),
      quizIndex: 0,
      quizReadySeq: state.quizReadySeq + 1,
    );
  }

  /// Görünüm: kullanıcı bir soruyu yanıtladı.
  void answer(int index, String selectedOption) {
    if (index < 0 || index >= state.answers.length) return;
    final updated = [...state.answers];
    updated[index] = updated[index].copyWith(selectedOption: selectedOption);
    var nextIndex = state.quizIndex;
    if (index == state.quizIndex && state.quizIndex < updated.length - 1) {
      nextIndex++;
    }
    state = state.copyWith(answers: updated, quizIndex: nextIndex);
  }

  /// Görünüm: quiz gönderildi → motor raporu koşsun (mevcut cevaplarla).
  void requestReport() {
    state = state.copyWith(phase: ProductAnalysisPhase.reportRequested);
  }

  /// Görünüm: quiz atlandı → motor raporu BOŞ cevapla koşsun.
  void requestReportSkippingQuiz() {
    state = state.copyWith(
      phase: ProductAnalysisPhase.reportRequested,
      answers: const [],
      skipQuizAnswers: true,
    );
  }

  void setRunning() {
    state = state.copyWith(
      phase: ProductAnalysisPhase.running,
      stage: AiReportStageLite.prep,
      workStartedAt: DateTime.now(),
    );
  }

  void setStage(AiReportStageLite s) {
    if (state.phase != ProductAnalysisPhase.running) return;
    state = state.copyWith(stage: s);
  }

  void setReport(Map<String, dynamic> report) {
    state = state.copyWith(
      phase: ProductAnalysisPhase.done,
      report: report,
      reportReadySeq: state.reportReadySeq + 1,
    );
  }

  void setError() {
    state = state.copyWith(phase: ProductAnalysisPhase.error);
  }

  /// Görünüm mount/dispose: hangi ürünün açık olduğunu işaretle (bildirim
  /// bastırma). Boş geçilirse (null) ürün ekranından çıkıldı demektir.
  void setViewing(String? productId) {
    if (state.viewingProductId == productId) return;
    state = state.copyWith(viewingProductId: productId);
  }

  /// Ürün ekranı DISPOSE olurken çağrılır. Riverpod'da `dispose()` içinde `ref`
  /// KULLANILAMAZ ("Cannot use ref after the widget was disposed") — bu yüzden
  /// görünüm, notifier referansını önceden saklayıp bunu çağırır. Yalnız hâlâ
  /// BU ürün işaretliyse temizler (kullanıcı başka ürüne geçtiyse dokunma).
  void clearViewingIfMatches(String productId) {
    if (state.viewingProductId == productId) {
      state = state.copyWith(viewingProductId: null);
    }
  }

  void reset() {
    researchFuture = null;
    state = ProductAnalysisState(viewingProductId: state.viewingProductId);
  }
}

final productAnalysisProvider =
    StateNotifierProvider<ProductAnalysisNotifier, ProductAnalysisState>(
      (ref) => ProductAnalysisNotifier(),
    );
