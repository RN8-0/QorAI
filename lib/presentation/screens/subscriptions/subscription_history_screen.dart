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

class SubscriptionHistoryScreen extends ConsumerWidget {
  const SubscriptionHistoryScreen({super.key});

  String _formatDate(String? ts) {
    if (ts == null) return '';
    final dt = DateTime.tryParse(ts);
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Az önce';
    if (diff.inHours < 1) return '${diff.inMinutes}dk önce';
    if (diff.inDays < 1) return '${diff.inHours}sa önce';
    if (diff.inDays < 7) return '${diff.inDays}g önce';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final textTertiary = context.textTertiaryColor;
    final historyAsync = ref.watch(subscriptionHistoryProvider);

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
                    colors: [_kPrimary, _kAccent]),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.history_rounded,
                  color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Text(
              'Geçmiş Karşılaştırmalar',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: textPrimary),
            ),
          ],
        ),
      ),
      body: historyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, s) => _buildEmptyState(
            context, textPrimary, textTertiary,
            errorMsg: 'Geçmiş yüklenemedi'),
        data: (history) => history.isEmpty
            ? _buildEmptyState(context, textPrimary, textTertiary)
            : ListView.separated(
                padding: EdgeInsets.only(
                    top: 8,
                    bottom: AppTheme.navBarTotalClearance +
                        MediaQuery.of(context).padding.bottom +
                        24),
                itemCount: history.length,
                separatorBuilder: (a, b) =>
                    const Divider(height: 1, indent: 72),
                itemBuilder: (_, i) => _buildHistoryTile(
                    context, ref, history[i], textPrimary, textTertiary),
              ),
      ),
    );
  }

  Widget _buildEmptyState(
      BuildContext context, Color textPrimary, Color textTertiary,
      {String? errorMsg}) {
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
                  size: 40,
                  color: _kPrimary.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 20),
            Text(
              errorMsg ?? 'Henüz karşılaştırma yapmadınız',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              errorMsg != null
                  ? 'Bir sorun oluştu. Lütfen tekrar deneyin.'
                  : 'Abonelik karşılaştırması yaptıktan sonra '
                      'sonuçlar burada listelenir.',
              style: GoogleFonts.inter(
                  fontSize: 14,
                  color: textTertiary,
                  height: 1.5),
              textAlign: TextAlign.center,
            ),
            if (errorMsg == null) ...[
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.compare_arrows_rounded, size: 18),
                label: const Text('İlk karşılaştırmayı yap'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kPrimary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildHistoryTile(
      BuildContext context,
      WidgetRef ref,
      Map<String, dynamic> entry,
      Color textPrimary,
      Color textTertiary) {
    final services =
        (entry['services'] as List?)?.cast<String>() ?? <String>[];
    final winner = entry['winner'] as String?;
    final date = _formatDate(entry['timestamp'] as String?);
    final analysisResult = entry['analysisResult'] as String?;
    final structured =
        entry['structured'] as Map<String, dynamic>?;
    final rawScores = entry['scores'];
    final Map<String, double> scores;
    if (rawScores is Map) {
      scores = rawScores.map(
          (k, v) => MapEntry(k.toString(), (v as num).toDouble()));
    } else {
      scores = {};
    }

    final hasFullResult =
        analysisResult != null && analysisResult.isNotEmpty;

    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              _kPrimary.withValues(alpha: 0.15),
              _kAccent.withValues(alpha: 0.1),
            ],
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.compare_arrows_rounded,
            color: _kPrimary, size: 22),
      ),
      title: Text(
        services.join(' vs '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: textPrimary),
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
          Icon(
            hasFullResult
                ? Icons.arrow_forward_ios_rounded
                : Icons.replay_rounded,
            size: 14,
            color: textTertiary,
          ),
        ],
      ),
      onTap: () {
        if (services.isEmpty) return;
        if (hasFullResult) {
          ref.read(subQuizProvider.notifier).restoreFromHistory(
                services: services,
                analysisResult: analysisResult,
                scores: scores,
                structured: structured,
              );
        } else {
          // Fallback: re-run analysis with same services
          ref.read(subQuizProvider.notifier).reset();
          // Just populate services so the screen shows them
          ref.read(subQuizProvider.notifier).restoreFromHistory(
                services: services,
                analysisResult: 'Analiz verisi bulunamadı. Lütfen yeniden karşılaştırın.',
                scores: scores,
                structured: structured,
              );
        }
        Navigator.of(context).pop();
      },
    );
  }
}
