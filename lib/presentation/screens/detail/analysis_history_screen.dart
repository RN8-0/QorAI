/// Qor AI — Birleşik AI Analiz Geçmişi (Profil'den erişilir)
///
/// Tüm analiz akışlarının geçmişi TEK yerde: Ürün, Karşılaştırma, Abonelik, Link.
/// Kullanıcı isteği: geçmiş, ürün/compare/abonelik/link sayfalarından KALDIRILDI;
/// yalnız Profil > "Analiz Geçmişi" altında toplandı. Bir öğeye basınca BİRE BİR
/// aynı analiz gösterilir (ürün detayına gider / abonelik-link sonucunu geri
/// yükler / karşılaştırma raporunu salt-okunur açar). Sola kaydırınca silinir.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';
import 'package:qor_ai/routing/router.dart';

/// [initialTab]: 0=Ürünler, 1=Karşılaştırmalar, 2=Abonelikler, 3=Linkler
class AnalysisHistoryScreen extends ConsumerStatefulWidget {
  final int initialTab;
  const AnalysisHistoryScreen({super.key, this.initialTab = 0});

  @override
  ConsumerState<AnalysisHistoryScreen> createState() =>
      _AnalysisHistoryScreenState();
}

class _AnalysisHistoryScreenState extends ConsumerState<AnalysisHistoryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  bool get _isTr =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  @override
  void initState() {
    super.initState();
    _tab = TabController(
      length: 4,
      vsync: this,
      initialIndex: widget.initialTab.clamp(0, 3),
    );
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _merge(
    List<Map<String, dynamic>> pending,
    List<Map<String, dynamic>> saved,
    String key,
  ) {
    final seen = <String>{};
    final out = <Map<String, dynamic>>[];
    for (final e in [...pending, ...saved]) {
      final k =
          (e[key] as String?) ??
          (e['id'] as String?) ??
          (e['timestamp'] as String?) ??
          '';
      if (seen.add(k)) out.add(e);
    }
    out.sort((a, b) {
      final at =
          DateTime.tryParse(a['timestamp']?.toString() ?? '') ??
          DateTime(2000);
      final bt =
          DateTime.tryParse(b['timestamp']?.toString() ?? '') ??
          DateTime(2000);
      return bt.compareTo(at);
    });
    return out;
  }

  String _formatDate(String? ts) {
    final dt = ts != null ? DateTime.tryParse(ts) : null;
    if (dt == null) return '';
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year} · $h:$m';
  }

  Color _scoreColor(double s) => s >= 80
      ? AppTheme.green500
      : s >= 60
      ? AppTheme.amber500
      : AppTheme.rose500;

  /// Kök navigatördeki push'lanmış sayfaları (bu ekran + profil) kapatıp ilgili
  /// sekmeye (abonelik/link) geç → geri yüklenen sonuç orada gösterilir.
  void _goBranch(String route) {
    Navigator.of(context, rootNavigator: true).popUntil((r) => r.isFirst);
    ref.read(routerProvider).go(route);
  }

  Future<void> _delete(
    Map<String, dynamic> item,
    StateProvider<List<Map<String, dynamic>>> pendingProvider,
    ProviderBase<AsyncValue<List<Map<String, dynamic>>>> savedProvider,
  ) async {
    final id = item['id']?.toString();
    ref
        .read(pendingProvider.notifier)
        .update((l) => l.where((e) => e['id'] != id).toList());
    if (id != null && id.isNotEmpty) {
      try {
        await ref.read(pbDataSourceProvider).deleteSavedAnalysis(id);
        ref.invalidate(savedProvider);
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final products = _merge(
      ref.watch(pendingProductAnalysisHistoryProvider),
      ref.watch(productAnalysisHistoryProvider).valueOrNull ?? const [],
      'productId',
    );
    final compares = _merge(
      ref.watch(pendingCompareAnalysisHistoryProvider),
      ref.watch(compareAnalysisHistoryProvider).valueOrNull ?? const [],
      'signature',
    );
    final subs = _merge(
      ref.watch(pendingSubscriptionHistoryProvider),
      ref.watch(subscriptionHistoryProvider).valueOrNull ?? const [],
      'id',
    );
    final links = _merge(
      ref.watch(pendingLinkAnalysisHistoryProvider),
      ref.watch(linkAnalysisHistoryProvider).valueOrNull ?? const [],
      'id',
    );

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 20,
            color: context.textPrimary,
          ),
        ),
        title: Text(
          _isTr ? 'Analiz Geçmişi' : 'Analysis History',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
          ),
        ),
        bottom: TabBar(
          controller: _tab,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: AppTheme.brandBlue,
          unselectedLabelColor: context.textTertiaryColor,
          indicatorColor: AppTheme.brandBlue,
          labelStyle: GoogleFonts.plusJakartaSans(
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
          ),
          tabs: [
            Tab(text: _isTr ? 'Ürünler' : 'Products'),
            Tab(text: _isTr ? 'Karşılaştırmalar' : 'Comparisons'),
            Tab(text: _isTr ? 'Abonelikler' : 'Subscriptions'),
            Tab(text: _isTr ? 'Linkler' : 'Links'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _buildProductList(products),
          _buildCompareList(compares),
          _buildSubList(subs),
          _buildLinkList(links),
        ],
      ),
    );
  }

  Widget _emptyState(IconData icon, String title, String subtitle) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: AppTheme.brandBlue.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(
                icon,
                size: 38,
                color: AppTheme.brandBlue.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: context.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 13.5,
                height: 1.5,
                color: context.textTertiaryColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _listShell(List<Widget> children) {
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        14,
        16,
        MediaQuery.of(context).padding.bottom + 24,
      ),
      children: children,
    );
  }

  Widget _card({
    required Key key,
    required IconData icon,
    required String title,
    required String date,
    required double score,
    required VoidCallback onTap,
    required VoidCallback onDelete,
  }) {
    return Dismissible(
      key: key,
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppTheme.error.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Icon(Icons.delete_rounded, color: AppTheme.error),
      ),
      onDismissed: (_) {
        HapticFeedback.mediumImpact();
        onDelete();
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: AppTheme.brandBlue.withValues(alpha: 0.08),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                        height: 1.25,
                      ),
                    ),
                    if (date.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        date,
                        style: GoogleFonts.inter(
                          fontSize: 11.5,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (score > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: _scoreColor(score).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: _scoreColor(score).withValues(alpha: 0.25),
                    ),
                  ),
                  child: Text(
                    '${score.toInt()}%',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: _scoreColor(score),
                    ),
                  ),
                )
              else
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 14,
                  color: context.textTertiaryColor,
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Ürünler ──
  Widget _buildProductList(List<Map<String, dynamic>> items) {
    if (items.isEmpty) {
      return _emptyState(
        Icons.auto_awesome_rounded,
        _isTr ? 'Henüz ürün analizi yok' : 'No product analyses yet',
        _isTr
            ? 'Bir ürünü AI ile analiz edin; sonuç burada saklanır.'
            : 'Analyze a product with AI; results are saved here.',
      );
    }
    return _listShell([
      for (final it in items)
        _card(
          key: ValueKey('p_${it['id'] ?? it['productId']}'),
          icon: Icons.auto_awesome_rounded,
          title:
              it['productName']?.toString() ?? (_isTr ? 'Ürün' : 'Product'),
          date: _formatDate(it['timestamp']?.toString()),
          score: (it['score'] as num?)?.toDouble() ?? 0,
          onTap: () => _openProduct(it),
          onDelete: () => _delete(
            it,
            pendingProductAnalysisHistoryProvider,
            productAnalysisHistoryProvider,
          ),
        ),
    ]);
  }

  /// Ürün analizine dokununca ÜRÜN SAYFASINA değil, DOĞRUDAN kaydedilen AI
  /// analizine (bire bir aynı rapor) gider. Rapor JSON'u varsa salt-okunur
  /// AiReportView ile açılır; yoksa (eski kayıt) ürün sayfasına düşer.
  void _openProduct(Map<String, dynamic> item) {
    final report = item['report'];
    if (report is Map) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _SavedReportScreen(
            kind: 'productFull',
            title:
                item['productName']?.toString() ??
                (_isTr ? 'Ürün analizi' : 'Product analysis'),
            report: Map<String, dynamic>.from(report),
          ),
        ),
      );
      return;
    }
    final pid = item['productId']?.toString();
    if (pid != null && pid.isNotEmpty) context.push('/product/$pid');
  }

  // ── Karşılaştırmalar ──
  Widget _buildCompareList(List<Map<String, dynamic>> items) {
    if (items.isEmpty) {
      return _emptyState(
        Icons.compare_arrows_rounded,
        _isTr ? 'Henüz karşılaştırma analizi yok' : 'No comparison analyses yet',
        _isTr
            ? 'Ürünleri karşılaştırıp AI analizi çalıştırın.'
            : 'Compare products and run the AI analysis.',
      );
    }
    return _listShell([
      for (final it in items)
        _card(
          key: ValueKey('c_${it['id'] ?? it['signature']}'),
          icon: Icons.compare_arrows_rounded,
          title:
              (it['products'] as List?)?.map((e) => e.toString()).join(' vs ') ??
              (_isTr ? 'Karşılaştırma' : 'Comparison'),
          date: _formatDate(it['timestamp']?.toString()),
          score: (it['score'] as num?)?.toDouble() ?? 0,
          onTap: () => _openCompare(it),
          onDelete: () => _delete(
            it,
            pendingCompareAnalysisHistoryProvider,
            compareAnalysisHistoryProvider,
          ),
        ),
    ]);
  }

  void _openCompare(Map<String, dynamic> item) {
    final report = item['report'];
    if (report is! Map) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _SavedReportScreen(
          kind: 'compareFull',
          title:
              (item['products'] as List?)?.map((e) => e.toString()).join(' vs ') ??
              (_isTr ? 'Karşılaştırma' : 'Comparison'),
          report: Map<String, dynamic>.from(report),
        ),
      ),
    );
  }

  // ── Abonelikler ──
  Widget _buildSubList(List<Map<String, dynamic>> items) {
    if (items.isEmpty) {
      return _emptyState(
        Icons.subscriptions_rounded,
        _isTr ? 'Henüz abonelik analizi yok' : 'No subscription analyses yet',
        _isTr
            ? 'Abonelik Karşılaştır ekranından analiz çalıştırın.'
            : 'Run an analysis from the Subscription screen.',
      );
    }
    return _listShell([
      for (final it in items)
        _card(
          key: ValueKey('s_${it['id'] ?? it['timestamp']}'),
          icon: Icons.subscriptions_rounded,
          title:
              (it['services'] as List?)?.map((e) => e.toString()).join(' vs ') ??
              (_isTr ? 'Abonelik analizi' : 'Subscription analysis'),
          date: _formatDate(it['timestamp']?.toString()),
          score: _subScore(it),
          onTap: () => _openSub(it),
          onDelete: () => _delete(
            it,
            pendingSubscriptionHistoryProvider,
            subscriptionHistoryProvider,
          ),
        ),
    ]);
  }

  double _subScore(Map<String, dynamic> it) {
    final raw = it['scores'];
    if (raw is! Map) return 0;
    final scores = raw.map(
      (k, v) => MapEntry(k.toString(), (v as num?)?.toDouble() ?? 0),
    );
    final winner = it['winner']?.toString();
    if (winner != null && scores[winner] != null) return scores[winner]!;
    if (scores.isEmpty) return 0;
    return scores.values.reduce((a, b) => a > b ? a : b);
  }

  void _openSub(Map<String, dynamic> item) {
    final services =
        (item['services'] as List?)?.map((e) => e.toString()).toList() ??
        const <String>[];
    final rawScores = item['scores'];
    final scores = rawScores is Map
        ? rawScores.map(
            (k, v) => MapEntry(k.toString(), (v as num?)?.toDouble() ?? 0.0),
          )
        : <String, double>{};
    ref
        .read(subQuizProvider.notifier)
        .restoreFromHistory(
          services: services,
          analysisResult: item['analysisResult']?.toString() ?? '',
          scores: scores,
          structured: item['structured'] as Map<String, dynamic>?,
        );
    _goBranch(AppRoutes.subscriptions);
  }

  // ── Linkler ──
  Widget _buildLinkList(List<Map<String, dynamic>> items) {
    if (items.isEmpty) {
      return _emptyState(
        Icons.link_rounded,
        _isTr ? 'Henüz link analizi yok' : 'No link analyses yet',
        _isTr
            ? 'Bir ürün linkini yapıştırıp AI analizi çalıştırın.'
            : 'Paste a product link and run the AI analysis.',
      );
    }
    return _listShell([
      for (final it in items)
        _card(
          key: ValueKey('l_${it['id'] ?? it['timestamp']}'),
          icon: (it['type'] == 'compare')
              ? Icons.compare_arrows_rounded
              : Icons.link_rounded,
          title:
              it['productName']?.toString() ??
              (it['products'] as List?)?.map((e) => e.toString()).join(' vs ') ??
              (_isTr ? 'Link analizi' : 'Link analysis'),
          date: _formatDate(it['timestamp']?.toString()),
          score: (it['score'] as num?)?.toDouble() ?? 0,
          onTap: () => _openLink(it),
          onDelete: () => _delete(
            it,
            pendingLinkAnalysisHistoryProvider,
            linkAnalysisHistoryProvider,
          ),
        ),
    ]);
  }

  void _openLink(Map<String, dynamic> item) {
    final type = item['type'] as String? ?? 'single';
    if (type == 'compare') {
      final rawResults = item['results'] as List?;
      if (rawResults != null && rawResults.length >= 2) {
        try {
          final results = rawResults
              .whereType<Map>()
              .map(
                (e) => EnhancedAnalysisResult.fromJson(
                  Map<String, dynamic>.from(e),
                ),
              )
              .toList();
          if (results.length >= 2) {
            ref
                .read(compareAnalysisProvider.notifier)
                .restoreFromHistory(results);
            _goBranch(AppRoutes.linkPaste);
            return;
          }
        } catch (_) {}
      }
    }
    final resultJson = item['result'];
    if (resultJson is Map) {
      try {
        final result = EnhancedAnalysisResult.fromJson(
          Map<String, dynamic>.from(resultJson),
        );
        ref.read(linkQuizProvider.notifier).restoreFromHistory(result);
        _goBranch(AppRoutes.linkPaste);
        return;
      } catch (_) {}
    }
    // Fallback: metadata'dan kısmi sonuç
    final score = (item['score'] as num?)?.toDouble() ?? 0.0;
    final fallback = EnhancedAnalysisResult(
      baseResult: LinkAnalysisResult(
        url: item['url']?.toString() ?? '',
        metadata: OgMetadata(title: item['productName']?.toString() ?? ''),
        aiScore: score,
        aiAnalysis: '',
        analyzedAt: DateTime.now(),
      ),
      enhancedScore: score,
      factors: const [],
      detailedVerdict: '',
    );
    ref.read(linkQuizProvider.notifier).restoreFromHistory(fallback);
    _goBranch(AppRoutes.linkPaste);
  }
}

/// Kayıtlı raporu (ürün/karşılaştırma) salt-okunur gösteren basit ekran.
class _SavedReportScreen extends ConsumerWidget {
  final String kind; // 'productFull' | 'compareFull'
  final String title;
  final Map<String, dynamic> report;
  const _SavedReportScreen({
    required this.kind,
    required this.title,
    required this.report,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = Localizations.localeOf(context).languageCode;
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.backgroundColor,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 20,
            color: context.textPrimary,
          ),
        ),
        title: Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
          ),
        ),
      ),
      body: ListView(
        padding: EdgeInsets.fromLTRB(
          16,
          12,
          16,
          MediaQuery.of(context).padding.bottom + 24,
        ),
        children: [AiReportView(kind: kind, data: report, lang: lang)],
      ),
    );
  }
}
