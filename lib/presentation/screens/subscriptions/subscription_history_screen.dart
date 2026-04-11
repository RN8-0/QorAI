/// Compair — Subscription Analysis History Screen
///
/// Geçmiş abonelik karşılaştırmalarını listeleyen tam ekran.
/// Bir öğeye basınca sonuç yeniden yüklenir.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/providers/providers.dart';

const _kPrimary = AppTheme.brandBlue;
const _kAccent = AppTheme.brandCyan;

class SubscriptionHistoryScreen extends ConsumerStatefulWidget {
  const SubscriptionHistoryScreen({super.key});

  @override
  ConsumerState<SubscriptionHistoryScreen> createState() =>
      _SubscriptionHistoryScreenState();
}

class _SubscriptionHistoryScreenState
    extends ConsumerState<SubscriptionHistoryScreen> {
  List<Map<String, dynamic>>? _cachedHistory;
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    final cached = ref.read(subscriptionHistoryProvider).valueOrNull;
    if (cached != null) {
      _cachedHistory = cached;
    } else {
      _refresh();
    }
  }

  Future<void> _refresh() async {
    if (_isRefreshing) return;
    setState(() => _isRefreshing = true);
    ref.invalidate(subscriptionHistoryProvider);
    try {
      final result = await ref
          .read(subscriptionHistoryProvider.future)
          .timeout(const Duration(seconds: 10));
      if (mounted) setState(() { _cachedHistory = result; _isRefreshing = false; });
    } catch (_) {
      if (mounted) setState(() { _cachedHistory = _cachedHistory ?? []; _isRefreshing = false; });
    }
  }

  String _formatDate(String? ts) {
    if (ts == null) return '';
    final dt = DateTime.tryParse(ts);
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Az once';
    if (diff.inHours < 1) return '${diff.inMinutes}dk once';
    if (diff.inDays < 1) return '${diff.inHours}sa once';
    if (diff.inDays < 7) return '${diff.inDays}g once';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  void _openEntry(Map<String, dynamic> entry) {
    final services = (entry['services'] as List?)?.cast<String>() ?? <String>[];
    if (services.isEmpty) return;

    final analysisResult = entry['analysisResult'] as String?;
    final structured = entry['structured'] as Map<String, dynamic>?;
    final rawScores = entry['scores'];
    final Map<String, double> scores;
    if (rawScores is Map) {
      scores = rawScores.map((k, v) => MapEntry(k.toString(), (v as num).toDouble()));
    } else {
      scores = {};
    }

    final hasFullResult = analysisResult != null && analysisResult.isNotEmpty;

    ref.read(subQuizProvider.notifier).restoreFromHistory(
          services: services,
          // Boş ise structured'dan _readableAnalysis üretecek; raw JSON değilse direkt göster
          analysisResult: hasFullResult ? analysisResult : '',
          scores: scores,
          structured: structured,
        );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final textTertiary = context.textTertiaryColor;

    final liveData = ref.watch(subscriptionHistoryProvider).valueOrNull;
    if (liveData != null && liveData != _cachedHistory && !_isRefreshing) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _cachedHistory = liveData);
      });
    }

    final history = _cachedHistory;

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
                gradient: const LinearGradient(colors: [_kPrimary, _kAccent]),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.history_rounded, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Text(
              'Gecmis Karsilastirmalar',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 17, fontWeight: FontWeight.w800, color: textPrimary),
            ),
          ],
        ),
        actions: [
          if (_isRefreshing)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: _kPrimary)),
            )
          else
            IconButton(
              onPressed: _refresh,
              icon: const Icon(Icons.refresh_rounded, size: 20),
            ),
        ],
      ),
      body: history == null
          ? const Center(child: CircularProgressIndicator(color: _kPrimary))
          : history.isEmpty
              ? _buildEmptyState(textPrimary, textTertiary)
              : ListView.separated(
                  padding: EdgeInsets.only(
                      top: 8,
                      bottom: MediaQuery.of(context).padding.bottom + 24),
                  itemCount: history.length,
                  separatorBuilder: (a, b) => const Divider(height: 1, indent: 72),
                  itemBuilder: (_, i) =>
                      _buildHistoryTile(history[i], textPrimary, textTertiary),
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
                color: _kPrimary.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.compare_arrows_rounded,
                  size: 40, color: _kPrimary.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 20),
            Text(
              'Henuz karsilastirma yapmadiniz',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 18, fontWeight: FontWeight.w700, color: textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              'Abonelik karsilastirmasi yaptiktan sonra sonuclar burada listelenir.',
              style: GoogleFonts.inter(fontSize: 14, color: textTertiary, height: 1.5),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.compare_arrows_rounded, size: 18),
              label: const Text('Ilk karsilastirmayi yap'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _kPrimary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryTile(
      Map<String, dynamic> entry, Color textPrimary, Color textTertiary) {
    final services = (entry['services'] as List?)?.cast<String>() ?? <String>[];
    final winner = entry['winner'] as String?;
    final date = _formatDate(entry['timestamp'] as String?);
    final analysisResult = entry['analysisResult'] as String?;
    final hasFullResult = analysisResult != null && analysisResult.isNotEmpty;

    final rawScores = entry['scores'];
    Map<String, double> scores = {};
    if (rawScores is Map) {
      scores = rawScores.map((k, v) => MapEntry(k.toString(), (v as num).toDouble()));
    }

    double? winnerScore = winner != null ? scores[winner] : null;
    final scoreColor = winnerScore != null
        ? (winnerScore >= 80
            ? AppTheme.green500
            : winnerScore >= 60 ? AppTheme.amber500 : AppTheme.rose500)
        : _kPrimary;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [_kPrimary.withValues(alpha: 0.15), _kAccent.withValues(alpha: 0.1)],
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.compare_arrows_rounded, color: _kPrimary, size: 22),
      ),
      title: Text(
        services.join(' vs '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600, color: textPrimary),
      ),
      subtitle: Text(
        [
          if (winner != null && winner.isNotEmpty) '🏆 $winner',
          if (date.isNotEmpty) date,
        ].join(' • '),
        style: GoogleFonts.inter(fontSize: 11, color: textTertiary),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (winnerScore != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: scoreColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                '${winnerScore.toStringAsFixed(0)}%',
                style: GoogleFonts.inter(
                    fontSize: 12, fontWeight: FontWeight.w700, color: scoreColor),
              ),
            ),
          const SizedBox(width: 6),
          Icon(
            hasFullResult ? Icons.arrow_forward_ios_rounded : Icons.replay_rounded,
            size: 14,
            color: textTertiary,
          ),
        ],
      ),
      onTap: () => _openEntry(entry),
    );
  }
}