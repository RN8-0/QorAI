/// Compair — Link Analysis History Screen
///
/// Firebase'den gelen geçmiş link analizlerini listeleyen tam ekran.
/// Bir öğeye basınca analiz sonucu yeniden yüklenir; sola kaydırınca silinir.
library;

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/presentation/providers/providers.dart';

bool _isTurkishAnalysisLocale(BuildContext context) =>
    Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

String _analysisText(
  BuildContext context, {
  required String tr,
  required String en,
}) {
  return _isTurkishAnalysisLocale(context) ? tr : en;
}

class LinkAnalysisHistoryScreen extends ConsumerStatefulWidget {
  const LinkAnalysisHistoryScreen({super.key});

  @override
  ConsumerState<LinkAnalysisHistoryScreen> createState() =>
      _LinkAnalysisHistoryScreenState();
}

class _LinkAnalysisHistoryScreenState
    extends ConsumerState<LinkAnalysisHistoryScreen> {
  // Yerel cache key (yedek)
  static const _historyKey = 'link_analysis_history_v1';

  List<Map<String, dynamic>>? _history;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    // Önce pending (optimistic) listesini al
    final pending = ref.read(pendingLinkAnalysisHistoryProvider);
    // Firebase cache kontrol
    final cached = ref.read(linkAnalysisHistoryProvider).valueOrNull;
    if (cached != null || pending.isNotEmpty) {
      _history = _mergeHistory(pending, cached ?? []);
      _isLoading = false;
      _refreshSilently();
    } else {
      _history = List.from(pending);
      _isLoading = pending.isEmpty;
      _fetchFromFirebase();
    }
  }

  List<Map<String, dynamic>> _mergeHistory(
    List<Map<String, dynamic>> pending,
    List<Map<String, dynamic>> firebase,
  ) {
    final seen = <String>{};
    final merged = <Map<String, dynamic>>[];
    for (final item in [...pending, ...firebase]) {
      final key =
          (item['id'] as String?) ?? (item['timestamp'] as String?) ?? '';
      if (seen.add(key)) merged.add(item);
    }
    return merged;
  }

  Future<void> _refreshSilently() async {
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth == null) return;
      final result = await ref
          .read(pbDataSourceProvider)
          .getLinkAnalysisHistory(auth)
          .timeout(const Duration(seconds: 6));
      if (!mounted) return;
      final pending = ref.read(pendingLinkAnalysisHistoryProvider);
      final merged = _mergeHistory(pending, result);
      if (merged.isNotEmpty) {
        setState(() {
          _history = merged;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchFromFirebase() async {
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth == null) {
        final local = await _loadLocalCache();
        if (mounted) {
          setState(() {
            _history = local;
            _isLoading = false;
          });
        }
        return;
      }
      final result = await ref
          .read(pbDataSourceProvider)
          .getLinkAnalysisHistory(auth)
          .timeout(const Duration(seconds: 6));
      if (!mounted) return;
      final pending = ref.read(pendingLinkAnalysisHistoryProvider);
      List<Map<String, dynamic>> merged = _mergeHistory(pending, result);
      if (merged.isEmpty) merged = await _loadLocalCache();
      setState(() {
        _history = merged;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) {
        final local = await _loadLocalCache();
        setState(() {
          _history = local;
          _isLoading = false;
        });
      }
    }
  }

  Future<List<Map<String, dynamic>>> _loadLocalCache() async {
    try {
      final cache = ref.read(cacheServiceProvider);
      final raw = await cache.get<String>(_historyKey);
      if (raw != null && raw.isNotEmpty) {
        return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      }
    } catch (_) {}
    return [];
  }

  Future<void> _deleteItem(int index) async {
    final removed = _history![index];
    setState(() => _history!.removeAt(index));

    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        final allItems = await ref
            .read(pbDataSourceProvider)
            .getLinkAnalysisHistory(auth);
        final ts = removed['timestamp'] as String?;
        final id = removed['id'] as String?;
        final filtered = allItems.where((e) {
          if (id != null && e['id'] != null) return e['id'] != id;
          return e['timestamp'] != ts;
        }).toList();
        await ref
            .read(pbDataSourceProvider)
            .updateLinkAnalysisHistory(auth, filtered);
        ref.invalidate(linkAnalysisHistoryProvider);
      }
    } catch (_) {
      // Geri al
      if (mounted) setState(() => _history!.insert(index, removed));
    }
  }

  Future<void> _clearAll() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: context.backgroundColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text(
          _analysisText(context, tr: 'Geçmişi Temizle', en: 'Clear History'),
          style: GoogleFonts.plusJakartaSans(
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
          ),
        ),
        content: Text(
          _analysisText(
            context,
            tr: 'Tüm analiz geçmişi silinecek. Emin misiniz?',
            en: 'All analysis history will be removed. Are you sure?',
          ),
          style: GoogleFonts.inter(
            color: context.textTertiaryColor,
            height: 1.5,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              _analysisText(context, tr: 'İptal', en: 'Cancel'),
              style: GoogleFonts.inter(color: context.textTertiaryColor),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              _analysisText(context, tr: 'Temizle', en: 'Clear'),
              style: GoogleFonts.inter(
                color: AppTheme.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _history = []);
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        await ref
            .read(pbDataSourceProvider)
            .updateLinkAnalysisHistory(auth, []);
        ref.invalidate(linkAnalysisHistoryProvider);
      }
      // Yerel cache'i de temizle
      final cache = ref.read(cacheServiceProvider);
      await cache.set<String>(
        _historyKey,
        '[]',
        duration: const Duration(days: 30),
      );
    } catch (_) {}
  }

  void _openHistoryItem(Map<String, dynamic> item) {
    final resultJson = item['result'] as Map<String, dynamic>?;
    if (resultJson != null) {
      try {
        final result = EnhancedAnalysisResult.fromJson(resultJson);
        ref.read(linkQuizProvider.notifier).restoreFromHistory(result);
        Navigator.of(context).pop();
        return;
      } catch (_) {}
    }
    // Fallback: metadata'dan kısmi sonuç oluştur
    final url = item['url'] as String? ?? '';
    final productName = item['productName'] as String? ?? '';
    final score = (item['score'] as num?)?.toDouble() ?? 0.0;
    final fallbackResult = EnhancedAnalysisResult(
      baseResult: LinkAnalysisResult(
        url: url,
        metadata: OgMetadata(title: productName),
        aiScore: score,
        aiAnalysis: '',
        analyzedAt: DateTime.now(),
      ),
      enhancedScore: score,
      factors: const [],
      detailedVerdict: '',
    );
    ref.read(linkQuizProvider.notifier).restoreFromHistory(fallbackResult);
    Navigator.of(context).pop();
  }

  String _formatDate(String? ts) {
    if (ts == null) return '';
    final dt = DateTime.tryParse(ts);
    if (dt == null) return '';
    final months = _isTurkishAnalysisLocale(context)
        ? const [
            'Oca',
            'Şub',
            'Mar',
            'Nis',
            'May',
            'Haz',
            'Tem',
            'Ağu',
            'Eyl',
            'Eki',
            'Kas',
            'Ara',
          ]
        : const [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ];
    final month = months[dt.month - 1];
    final hour = dt.hour.toString().padLeft(2, '0');
    final min = dt.minute.toString().padLeft(2, '0');
    return '${dt.day} $month ${dt.year}, $hour:$min';
  }

  String _hostFromUrl(String url) {
    try {
      return Uri.parse(url).host.replaceFirst('www.', '');
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final textTertiary = context.textTertiaryColor;
    final history = _history;

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
            color: textPrimary,
          ),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.history_rounded,
                color: Colors.white,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Text(
              _analysisText(
                context,
                tr: 'Analiz Geçmişi',
                en: 'Analysis History',
              ),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: textPrimary,
              ),
            ),
          ],
        ),
        actions: [
          if (history != null && history.isNotEmpty)
            IconButton(
              onPressed: _clearAll,
              icon: Icon(
                Icons.delete_sweep_rounded,
                size: 22,
                color: AppTheme.error.withValues(alpha: 0.8),
              ),
              tooltip: _analysisText(
                context,
                tr: 'Tamamını Sil',
                en: 'Delete All',
              ),
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.brandBlue),
            )
          : (history == null || history.isEmpty)
          ? _buildEmpty(textPrimary, textTertiary)
          : ListView.builder(
              padding: EdgeInsets.only(
                top: 12,
                left: 16,
                right: 16,
                bottom: MediaQuery.of(context).padding.bottom + 24,
              ),
              itemCount: history.length,
              itemBuilder: (_, i) =>
                  _buildCard(history[i], i, textPrimary, textTertiary),
            ),
    );
  }

  Widget _buildEmpty(Color textPrimary, Color textTertiary) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.brandBlue.withValues(alpha: 0.12),
                    AppTheme.brandCyan.withValues(alpha: 0.06),
                  ],
                ),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.history_rounded,
                size: 42,
                color: AppTheme.brandBlue.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              _analysisText(
                context,
                tr: 'Henüz analiz yapmadınız',
                en: 'No analyses yet',
              ),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: textPrimary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              _analysisText(
                context,
                tr: 'Bir ürün URL\'si yapıştırarak AI analizini başlatın. Sonuçlar burada kaydedilecek.',
                en: 'Paste a product URL to start AI analysis. Results will be saved here.',
              ),
              style: GoogleFonts.inter(
                fontSize: 14,
                color: textTertiary,
                height: 1.6,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 28),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.link_rounded, size: 18),
              label: Text(
                _analysisText(
                  context,
                  tr: 'İlk analizi yap',
                  en: 'Start First Analysis',
                ),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: AppTheme.brandBlue,
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 14,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(
    Map<String, dynamic> item,
    int index,
    Color textPrimary,
    Color textTertiary,
  ) {
    final name =
        item['productName'] as String? ??
        _analysisText(context, tr: 'Ürün', en: 'Product');
    final url = item['url'] as String? ?? '';
    final score = (item['score'] as num?)?.toDouble() ?? 0.0;
    final date = _formatDate(item['timestamp'] as String?);
    final hasFullResult = item['result'] != null;

    final resultJson = item['result'] as Map<String, dynamic>?;
    final siteName =
        (resultJson?['baseResult']
                as Map<String, dynamic>?)?['metadata']?['siteName']
            as String? ??
        _hostFromUrl(url);

    final scoreColor = score >= 80
        ? AppTheme.green500
        : score >= 60
        ? AppTheme.amber500
        : AppTheme.rose500;

    return Dismissible(
      key: ValueKey(item['id'] ?? item['timestamp'] ?? index),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: AppTheme.error.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Icon(
          Icons.delete_rounded,
          color: AppTheme.error,
          size: 24,
        ),
      ),
      onDismissed: (_) {
        HapticFeedback.mediumImpact();
        _deleteItem(index);
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          _openHistoryItem(item);
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: AppTheme.brandBlue.withValues(alpha: 0.08),
              width: 1,
            ),
          ),
          child: Row(
            children: [
              // İkon
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.link_rounded,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              // Bilgi
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (siteName.isNotEmpty) ...[
                          Icon(
                            Icons.language_rounded,
                            size: 11,
                            color: textTertiary,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            siteName,
                            style: GoogleFonts.inter(
                              fontSize: 11,
                              color: textTertiary,
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        if (date.isNotEmpty)
                          Text(
                            date,
                            style: GoogleFonts.inter(
                              fontSize: 11,
                              color: textTertiary,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Skor badge
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
                  hasFullResult
                      ? Icons.arrow_forward_ios_rounded
                      : Icons.replay_rounded,
                  size: 14,
                  color: textTertiary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
