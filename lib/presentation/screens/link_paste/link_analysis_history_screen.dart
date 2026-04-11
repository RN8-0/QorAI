/// Compair — Link Analysis History Screen
///
/// Geçmiş link analizlerini listeleyen tam ekran.
/// Bir öğeye basınca analiz sonucu yeniden yüklenir.
library;

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/presentation/providers/providers.dart';

class LinkAnalysisHistoryScreen extends ConsumerStatefulWidget {
  const LinkAnalysisHistoryScreen({super.key});

  @override
  ConsumerState<LinkAnalysisHistoryScreen> createState() =>
      _LinkAnalysisHistoryScreenState();
}

class _LinkAnalysisHistoryScreenState
    extends ConsumerState<LinkAnalysisHistoryScreen> {
  static const _historyKey = 'link_analysis_history_v1';

  List<Map<String, dynamic>> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    try {
      final cache = ref.read(cacheServiceProvider);
      final raw = await cache.get<String>(_historyKey);
      if (raw != null && raw.isNotEmpty) {
        final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
        if (mounted) setState(() { _history = list; _loading = false; });
        return;
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _clearHistory() async {
    final cache = ref.read(cacheServiceProvider);
    await cache.set<String>(_historyKey, '[]',
        duration: const Duration(days: 30));
    if (mounted) setState(() => _history = []);
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Az önce';
    if (diff.inHours < 1) return '${diff.inMinutes}dk önce';
    if (diff.inDays < 1) return '${diff.inHours}sa önce';
    if (diff.inDays < 7) return '${diff.inDays}g önce';
    return '${dt.day}/${dt.month}/${dt.year}';
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
    // Fallback: sadece metadatadan kısmi sonuç oluştur
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

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final textTertiary = context.textTertiaryColor;

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [AppTheme.brandBlue, AppTheme.brandCyan]),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.history_rounded,
                  color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Text(
              'Analiz Geçmişi',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: textPrimary),
            ),
          ],
        ),
        actions: [
          if (_history.isNotEmpty)
            TextButton(
              onPressed: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: bg,
                    title: Text('Geçmişi Temizle',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700, color: textPrimary)),
                    content: Text(
                        'Tüm analiz geçmişi silinecek. Emin misiniz?',
                        style: GoogleFonts.inter(color: textTertiary)),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.of(ctx).pop(false),
                          child: const Text('İptal')),
                      TextButton(
                          onPressed: () => Navigator.of(ctx).pop(true),
                          child: Text('Temizle',
                              style: TextStyle(color: AppTheme.error))),
                    ],
                  ),
                );
                if (confirm == true) await _clearHistory();
              },
              child: Text('Temizle',
                  style: GoogleFonts.inter(
                      fontSize: 13, color: AppTheme.error)),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _history.isEmpty
              ? _buildEmptyState(textPrimary, textTertiary)
              : ListView.separated(
                  padding: EdgeInsets.only(
                      top: 8,
                      bottom: AppTheme.navBarTotalClearance +
                          MediaQuery.of(context).padding.bottom +
                          24),
                  itemCount: _history.length,
                  separatorBuilder: (a, b) =>
                      const Divider(height: 1, indent: 72),
                  itemBuilder: (_, i) =>
                      _buildHistoryTile(_history[i], textPrimary, textTertiary),
                ),
    );
  }

  Widget _buildEmptyState(Color textPrimary, Color textTertiary) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppTheme.brandBlue.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.history_rounded,
                  size: 40,
                  color: AppTheme.brandBlue.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 20),
            Text(
              'Henüz analiz yapmadınız',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              'Bir ürün URL\'si yapıştırarak AI analizini başlatın. '
              'Sonuçlar burada kaydedilecek.',
              style: GoogleFonts.inter(
                  fontSize: 14,
                  color: textTertiary,
                  height: 1.5),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.link_rounded, size: 18),
              label: const Text('İlk analizi yap'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.brandBlue,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryTile(
      Map<String, dynamic> item, Color textPrimary, Color textTertiary) {
    final name = item['productName'] as String? ?? 'Ürün';
    final url = item['url'] as String? ?? '';
    final score = (item['score'] as num?)?.toDouble() ?? 0.0;
    final ts = item['timestamp'] as String?;
    final date = _formatDate(ts != null ? DateTime.tryParse(ts) : null);
    final hasFullResult = item['result'] != null;

    final scoreColor = score >= 80
        ? AppTheme.green500
        : score >= 60
            ? AppTheme.amber500
            : AppTheme.rose500;

    // Show site name from saved result if available
    final resultJson = item['result'] as Map<String, dynamic>?;
    final siteName = (resultJson?['baseResult'] as Map<String, dynamic>?)?
            ['metadata']?['siteName'] as String? ??
        _hostFromUrl(url);

    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppTheme.brandBlue.withValues(alpha: 0.15),
              AppTheme.brandCyan.withValues(alpha: 0.1),
            ],
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.link_rounded,
            color: AppTheme.brandBlue, size: 22),
      ),
      title: Text(
        name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: textPrimary),
      ),
      subtitle: Text(
        [if (siteName.isNotEmpty) siteName, if (date.isNotEmpty) date]
            .join(' • '),
        style: GoogleFonts.inter(fontSize: 11, color: textTertiary),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (score > 0)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: scoreColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${score.toStringAsFixed(0)}%',
                style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: scoreColor),
              ),
            ),
          const SizedBox(width: 6),
          Icon(
            hasFullResult
                ? Icons.arrow_forward_ios_rounded
                : Icons.replay_rounded,
            size: 14,
            color: textTertiary,
          ),
        ],
      ),
      onTap: () => _openHistoryItem(item),
    );
  }

  String _hostFromUrl(String url) {
    try {
      return Uri.parse(url).host.replaceFirst('www.', '');
    } catch (_) {
      return '';
    }
  }
}
