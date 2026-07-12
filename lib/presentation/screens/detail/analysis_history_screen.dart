/// Qor AI — Ürün & Karşılaştırma AI Analiz Geçmişi
///
/// Kullanıcının daha önce analiz ettirdiği tekli ürünleri ve çoklu ürün
/// karşılaştırmalarını listeler. Link/abonelik geçmişiyle AYNI desen:
/// - Ürün öğesine basınca ürün detayına gidilir (orada BİRE BİR aynı analiz açılır).
/// - Karşılaştırma öğesine basınca kayıtlı rapor salt-okunur görüntülenir.
/// - Sola kaydırınca kayıt silinir.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';

/// [initialTab]: 0 = Ürünler, 1 = Karşılaştırmalar
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
      length: 2,
      vsync: this,
      initialIndex: widget.initialTab.clamp(0, 1),
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

  Future<void> _deleteProduct(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    ref
        .read(pendingProductAnalysisHistoryProvider.notifier)
        .update((l) => l.where((e) => e['id'] != id).toList());
    if (id != null && id.isNotEmpty) {
      try {
        await ref.read(pbDataSourceProvider).deleteSavedAnalysis(id);
        ref.invalidate(productAnalysisHistoryProvider);
      } catch (_) {}
    }
  }

  Future<void> _deleteCompare(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    ref
        .read(pendingCompareAnalysisHistoryProvider.notifier)
        .update((l) => l.where((e) => e['id'] != id).toList());
    if (id != null && id.isNotEmpty) {
      try {
        await ref.read(pbDataSourceProvider).deleteSavedAnalysis(id);
        ref.invalidate(compareAnalysisHistoryProvider);
      } catch (_) {}
    }
  }

  String _formatDate(String? ts) {
    final dt = ts != null ? DateTime.tryParse(ts) : null;
    if (dt == null) return '';
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '${dt.day.toString().padLeft(2, '0')}.${dt.month.toString().padLeft(2, '0')}.${dt.year} · $h:$m';
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
          ],
        ),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          _buildList(products, isCompare: false),
          _buildList(compares, isCompare: true),
        ],
      ),
    );
  }

  Widget _buildList(List<Map<String, dynamic>> items, {required bool isCompare}) {
    if (items.isEmpty) {
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
                  isCompare
                      ? Icons.compare_arrows_rounded
                      : Icons.auto_awesome_rounded,
                  size: 38,
                  color: AppTheme.brandBlue.withValues(alpha: 0.55),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                _isTr ? 'Henüz analiz yok' : 'No analyses yet',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isCompare
                    ? (_isTr
                          ? 'Ürünleri karşılaştırıp AI analizi çalıştırın; sonuç burada görünecek.'
                          : 'Compare products and run the AI analysis; results appear here.')
                    : (_isTr
                          ? 'Bir ürünü AI ile analiz edin; sonuç burada saklanır.'
                          : 'Analyze a product with AI; the result is saved here.'),
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
    return ListView.builder(
      padding: EdgeInsets.fromLTRB(
        16,
        14,
        16,
        MediaQuery.of(context).padding.bottom + 24,
      ),
      itemCount: items.length,
      itemBuilder: (_, i) => _buildCard(items[i], isCompare: isCompare),
    );
  }

  Widget _buildCard(Map<String, dynamic> item, {required bool isCompare}) {
    final title = isCompare
        ? ((item['products'] as List?)?.map((e) => e.toString()).join(' vs ') ??
              (_isTr ? 'Karşılaştırma' : 'Comparison'))
        : (item['productName']?.toString() ??
              (_isTr ? 'Ürün' : 'Product'));
    final score = (item['score'] as num?)?.toDouble() ?? 0.0;
    final scoreColor = score >= 80
        ? AppTheme.green500
        : score >= 60
        ? AppTheme.amber500
        : AppTheme.rose500;
    final date = _formatDate(item['timestamp']?.toString());

    return Dismissible(
      key: ValueKey(item['id'] ?? item['timestamp'] ?? title),
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
        if (isCompare) {
          _deleteCompare(item);
        } else {
          _deleteProduct(item);
        }
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          if (isCompare) {
            _openCompare(item);
          } else {
            final pid = item['productId']?.toString();
            if (pid != null && pid.isNotEmpty) context.push('/product/$pid');
          }
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
                child: Icon(
                  isCompare
                      ? Icons.compare_arrows_rounded
                      : Icons.auto_awesome_rounded,
                  color: Colors.white,
                  size: 22,
                ),
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
                    color: scoreColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: scoreColor.withValues(alpha: 0.25),
                    ),
                  ),
                  child: Text(
                    '${score.toInt()}%',
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: scoreColor,
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

  void _openCompare(Map<String, dynamic> item) {
    final report = item['report'];
    if (report is! Map) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _SavedCompareReportScreen(
          title:
              (item['products'] as List?)?.map((e) => e.toString()).join(' vs ') ??
              (_isTr ? 'Karşılaştırma' : 'Comparison'),
          report: Map<String, dynamic>.from(report),
        ),
      ),
    );
  }
}

/// Kayıtlı karşılaştırma raporunu salt-okunur gösteren basit ekran.
class _SavedCompareReportScreen extends ConsumerWidget {
  final String title;
  final Map<String, dynamic> report;
  const _SavedCompareReportScreen({required this.title, required this.report});

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
        children: [
          AiReportView(kind: 'compareFull', data: report, lang: lang),
        ],
      ),
    );
  }
}
