import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart'
    show AiReportStageLite;

/// KATALOG KARŞILAŞTIRMA (ürün-vs-ürün) AI analizinin GLOBAL durumu.
///
/// NEDEN: analiz tamamen `SpecComparisonWidget`'ın State'inde koşuyordu.
/// Kullanıcı karşılaştırma sekmesinden çıkınca widget dispose oluyor,
/// `if (!mounted) return;` dalları devreye giriyor ve ÜRETİLEN QUIZ/RAPOR
/// ÇÖPE GİDİYORDU: Qor AI baloncuğu dönüyor ama iş hiç "hazır" olmuyordu.
///
/// Artık durum burada, motoru (async) her zaman canlı olan `MainShell`
/// yürütüyor — tekli ürün analizindeki (`productAnalysisProvider`) ile
/// BİREBİR aynı desen. Böylece:
/// - Kullanıcı karşılaştırmadan çıksa, hatta karşılaştırmayı KAPATSA bile iş sürer.
/// - Quiz/rapor hazır olunca bildirim düşer, tıklayınca ANINDA açılır.
/// - Kullanıcı BAŞKA bir karşılaştırma başlatırsa: yeni iş eskisinin yerine
///   geçer ([key] değişir) ve eski işin geç dönen sonucu YOK SAYILIR.
enum CompareAiPhase {
  idle,
  startRequested, // görünüm başlat dedi; motor quiz üretmeli
  quizLoading,
  quiz, // quiz hazır, cevap bekliyor
  reportRequested, // cevaplar gönderildi; motor raporu koşmalı
  running,
  done,
  error,
}

/// Karşılaştırılan ürün kümesinin kimliği — sıra bağımsız.
String compareAiKey(Iterable<String> productIds) {
  final ids = productIds.where((x) => x.trim().isNotEmpty).toList()..sort();
  return ids.join(',');
}

@immutable
class CompareAiState {
  final CompareAiPhase phase;

  /// Hangi karşılaştırmaya ait olduğu (sıralı id listesi). Geç dönen sonuçlar
  /// bununla elenir.
  final String key;
  final List<ProductEntity> products;
  final String label; // "A vs B" — bildirim metni
  final String lang;
  final Map<String, dynamic> profile;
  final ProductQuiz? quiz;
  final List<QuizQuestion> answers;
  final int quizIndex;
  final AiReportStageLite stage;
  final Map<String, dynamic>? report;

  /// Workboard'un GERÇEK başlangıcı — ekrandan çıkıp dönünce sayaç sıfırlanmasın.
  final DateTime? workStartedAt;

  /// Ekranda AÇIK olan karşılaştırmanın anahtarı (bildirim bastırma).
  final String? viewingKey;

  /// "Bildirmeye değer" geçiş sayaçları — MainShell tek seferlik bildirim basar.
  final int quizReadySeq;
  final int reportReadySeq;

  const CompareAiState({
    this.phase = CompareAiPhase.idle,
    this.key = '',
    this.products = const [],
    this.label = '',
    this.lang = 'en',
    this.profile = const {},
    this.quiz,
    this.answers = const [],
    this.quizIndex = 0,
    this.stage = AiReportStageLite.prep,
    this.report,
    this.workStartedAt,
    this.viewingKey,
    this.quizReadySeq = 0,
    this.reportReadySeq = 0,
  });

  /// Bu ekranın (ürün kümesinin) işi mi?
  bool matches(String otherKey) => key.isNotEmpty && key == otherKey;

  bool get isBusy =>
      phase == CompareAiPhase.startRequested ||
      phase == CompareAiPhase.quizLoading ||
      phase == CompareAiPhase.reportRequested ||
      phase == CompareAiPhase.running;

  CompareAiState copyWith({
    CompareAiPhase? phase,
    String? key,
    List<ProductEntity>? products,
    String? label,
    String? lang,
    Map<String, dynamic>? profile,
    Object? quiz = _sentinel,
    List<QuizQuestion>? answers,
    int? quizIndex,
    AiReportStageLite? stage,
    Map<String, dynamic>? report,
    DateTime? workStartedAt,
    int? quizReadySeq,
    int? reportReadySeq,
    Object? viewingKey = _sentinel,
  }) {
    return CompareAiState(
      phase: phase ?? this.phase,
      key: key ?? this.key,
      products: products ?? this.products,
      label: label ?? this.label,
      lang: lang ?? this.lang,
      profile: profile ?? this.profile,
      quiz: quiz == _sentinel ? this.quiz : quiz as ProductQuiz?,
      answers: answers ?? this.answers,
      quizIndex: quizIndex ?? this.quizIndex,
      stage: stage ?? this.stage,
      report: report ?? this.report,
      workStartedAt: workStartedAt ?? this.workStartedAt,
      viewingKey: viewingKey == _sentinel
          ? this.viewingKey
          : viewingKey as String?,
      quizReadySeq: quizReadySeq ?? this.quizReadySeq,
      reportReadySeq: reportReadySeq ?? this.reportReadySeq,
    );
  }

  static const Object _sentinel = Object();
}

class CompareAiNotifier extends StateNotifier<CompareAiState> {
  CompareAiNotifier() : super(const CompareAiState());

  /// Görünüm: "Analizi başlat" (kapı kontrolleri + ücret geçildi).
  void requestStart({
    required List<ProductEntity> products,
    required String label,
    required String lang,
    required Map<String, dynamic> profile,
  }) {
    state = CompareAiState(
      phase: CompareAiPhase.startRequested,
      key: compareAiKey(products.map((p) => p.id)),
      products: products,
      label: label,
      lang: lang,
      profile: profile,
      viewingKey: state.viewingKey,
    );
  }

  void setQuizLoading(String key) {
    if (!state.matches(key)) return;
    state = state.copyWith(
      phase: CompareAiPhase.quizLoading,
      workStartedAt: DateTime.now(),
    );
  }

  void setQuiz(String key, ProductQuiz quiz) {
    if (!state.matches(key)) return;
    state = state.copyWith(
      phase: CompareAiPhase.quiz,
      quiz: quiz,
      answers: quiz.questions.map((q) => q.copyWith()).toList(),
      quizIndex: 0,
      quizReadySeq: state.quizReadySeq + 1,
    );
  }

  void answer(int index, String selectedOption) {
    if (index < 0 || index >= state.answers.length) return;
    final updated = [...state.answers];
    updated[index] = updated[index].copyWith(selectedOption: selectedOption);
    var next = state.quizIndex;
    if (index == state.quizIndex && state.quizIndex < updated.length - 1) {
      next++;
    }
    state = state.copyWith(answers: updated, quizIndex: next);
  }

  /// Görünüm: quiz gönderildi (ya da atlandı) → motor raporu koşsun.
  void requestReport({bool skipQuiz = false}) {
    state = state.copyWith(
      phase: CompareAiPhase.reportRequested,
      quiz: null,
      answers: skipQuiz ? const <QuizQuestion>[] : state.answers,
    );
  }

  void setRunning(String key) {
    if (!state.matches(key)) return;
    state = state.copyWith(
      phase: CompareAiPhase.running,
      stage: AiReportStageLite.prep,
      workStartedAt: DateTime.now(),
    );
  }

  void setStage(String key, AiReportStageLite s) {
    if (!state.matches(key) || state.phase != CompareAiPhase.running) return;
    state = state.copyWith(stage: s);
  }

  void setReport(String key, Map<String, dynamic> report) {
    if (!state.matches(key)) return;
    state = state.copyWith(
      phase: CompareAiPhase.done,
      report: report,
      reportReadySeq: state.reportReadySeq + 1,
    );
  }

  void setError(String key) {
    if (!state.matches(key)) return;
    state = state.copyWith(phase: CompareAiPhase.error);
  }

  /// Ekran mount/dispose: hangi karşılaştırmanın açık olduğu (bildirim bastırma).
  void setViewing(String? key) {
    if (state.viewingKey == key) return;
    state = state.copyWith(viewingKey: key);
  }

  void clearViewingIfMatches(String key) {
    if (state.viewingKey == key) state = state.copyWith(viewingKey: null);
  }

  /// Kullanıcı "yeniden analiz" / "çık" dedi. Yalnız AYNI karşılaştırma
  /// sıfırlanır — başka bir karşılaştırmanın koşan işi ÖLDÜRÜLMEZ.
  void resetIfMatches(String key) {
    if (!state.matches(key)) return;
    state = CompareAiState(viewingKey: state.viewingKey);
  }
}

final compareAiProvider =
    StateNotifierProvider<CompareAiNotifier, CompareAiState>(
      (ref) => CompareAiNotifier(),
    );
