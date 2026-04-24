/// Qor AI — Subscription Analysis History Screen
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/services/gemini_service.dart';

const _kBlue = AppTheme.brandBlue;
const _kCyan = AppTheme.brandCyan;

bool _isTurkishLocale(BuildContext context) =>
    Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

String _prettySubscriptionName(String raw) =>
    GeminiService.prettySubscriptionName(raw);

String _historyText(
  BuildContext context, {
  required String tr,
  required String en,
}) {
  return _isTurkishLocale(context) ? tr : en;
}

String _historyTitle(BuildContext context, List<String> services) {
  final normalized = services.map(_prettySubscriptionName).toList();
  if (normalized.isEmpty) {
    return _historyText(
      context,
      tr: 'Kayitli abonelik analizi',
      en: 'Saved subscription analysis',
    );
  }
  if (normalized.length <= 2) {
    return normalized.join(' vs ');
  }
  return '${normalized[0]} vs ${normalized[1]} +${normalized.length - 2}';
}

// ─────────────────────────────────────────────────────────────────────────────
// History List Screen
// ─────────────────────────────────────────────────────────────────────────────

class SubscriptionHistoryScreen extends ConsumerStatefulWidget {
  const SubscriptionHistoryScreen({super.key});

  @override
  ConsumerState<SubscriptionHistoryScreen> createState() =>
      _SubscriptionHistoryScreenState();
}

class _SubscriptionHistoryScreenState
    extends ConsumerState<SubscriptionHistoryScreen> {
  List<Map<String, dynamic>>? _history;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    // Önce local pending listesini al (anında görünsün)
    final pending = ref.read(pendingSubscriptionHistoryProvider);
    // Sonra Firebase cache'i kontrol et
    final cached = ref.read(subscriptionHistoryProvider).valueOrNull;
    if (cached != null || pending.isNotEmpty) {
      // Pending + Firebase cache'i birleştir (deduplicate by timestamp)
      final merged = _mergeHistory(pending, cached ?? []);
      _history = merged;
      _isLoading = false;
      // Arka planda tazele
      _refreshSilently();
    } else {
      // Hiç veri yok, hızlı fetch
      _history = List.from(pending);
      _isLoading = pending.isEmpty;
      _fetchFromFirestore();
    }
  }

  List<Map<String, dynamic>> _mergeHistory(
    List<Map<String, dynamic>> pending,
    List<Map<String, dynamic>> firebase,
  ) {
    final seen = <String>{};
    final merged = <Map<String, dynamic>>[];
    for (final item in [...pending, ...firebase]) {
      final timestamp = (item['timestamp'] as String?) ?? '';
      final services = ((item['services'] as List?) ?? const [])
          .map((e) => e.toString().trim().toLowerCase())
          .toList()
        ..sort();
      final winner = item['winner']?.toString().trim().toLowerCase() ?? '';
      final key = '$timestamp|${services.join(',')}|$winner';
      if (seen.add(key)) merged.add(item);
    }
    merged.sort((a, b) => _historyDateOf(b).compareTo(_historyDateOf(a)));
    return merged;
  }

  DateTime _historyDateOf(Map<String, dynamic> item) =>
      DateTime.tryParse(item['timestamp'] as String? ?? '') ??
      DateTime.fromMillisecondsSinceEpoch(0);

  Future<void> _refreshSilently() async {
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth == null) return;
      final result = await ref
          .read(pbDataSourceProvider)
          .getSubscriptionHistory(auth)
          .timeout(const Duration(seconds: 6));
      if (!mounted) return;
      final pending = ref.read(pendingSubscriptionHistoryProvider);
      final merged = _mergeHistory(pending, result);
      setState(() {
        _history = merged;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchFromFirestore() async {
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth == null) {
        if (mounted) setState(() => _isLoading = false);
        return;
      }
      final result = await ref
          .read(pbDataSourceProvider)
          .getSubscriptionHistory(auth)
          .timeout(const Duration(seconds: 6));
      if (!mounted) return;
      final pending = ref.read(pendingSubscriptionHistoryProvider);
      final merged = _mergeHistory(pending, result);
      setState(() {
        _history = merged;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _history ??= [];
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _deleteItem(int index) async {
    final removed = _history![index];
    setState(() => _history!.removeAt(index));

    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        // Get full list from Firestore and remove by timestamp
        final allItems = await ref
            .read(pbDataSourceProvider)
            .getSubscriptionHistory(auth);
        final ts = removed['timestamp'] as String?;
        final filtered = allItems.where((e) => e['timestamp'] != ts).toList();
        await ref
            .read(pbDataSourceProvider)
            .updateSubscriptionHistory(auth, filtered);
        ref.invalidate(subscriptionHistoryProvider);
      }
    } catch (_) {
      // Revert on error
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
          _historyText(context, tr: 'Geçmişi Temizle', en: 'Clear History'),
          style: GoogleFonts.plusJakartaSans(
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
          ),
        ),
        content: Text(
          _historyText(
            context,
            tr: 'Tüm karşılaştırma geçmişi silinecek. Emin misiniz?',
            en: 'All comparison history will be removed. Are you sure?',
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
              _historyText(context, tr: 'İptal', en: 'Cancel'),
              style: GoogleFonts.inter(color: context.textTertiaryColor),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              _historyText(context, tr: 'Temizle', en: 'Clear'),
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
            .updateSubscriptionHistory(auth, []);
        ref.invalidate(subscriptionHistoryProvider);
      }
    } catch (_) {}
  }

  String _formatDate(String? ts) {
    if (ts == null) return '';
    final dt = DateTime.tryParse(ts);
    if (dt == null) return '';
    final months = _isTurkishLocale(context)
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

  String _formatStatDate(String? ts) {
    if (ts == null) return '--';
    final dt = DateTime.tryParse(ts);
    if (dt == null) return '--';
    final months = _isTurkishLocale(context)
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
    return '${dt.day} ${months[dt.month - 1]}';
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
          style: IconButton.styleFrom(
            backgroundColor: context.surfaceElevatedColor,
          ),
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 18,
            color: textPrimary,
          ),
        ),
        title: Text(
          _historyText(context, tr: 'Analiz Geçmişi', en: 'Analysis History'),
          style: GoogleFonts.plusJakartaSans(
            fontSize: 17,
            fontWeight: FontWeight.w800,
            color: textPrimary,
          ),
        ),
        actions: [
          if (history != null && history.isNotEmpty)
            IconButton(
              style: IconButton.styleFrom(
                backgroundColor: AppTheme.error.withValues(alpha: 0.10),
              ),
              onPressed: _clearAll,
              icon: Icon(
                Icons.delete_sweep_rounded,
                size: 22,
                color: AppTheme.error.withValues(alpha: 0.8),
              ),
              tooltip: _historyText(
                context,
                tr: 'Tamamını Sil',
                en: 'Delete All',
              ),
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: _kBlue))
          : (history == null || history.isEmpty)
          ? _buildEmpty(textPrimary, textTertiary)
          : ListView(
              padding: EdgeInsets.only(
                top: 16,
                left: 16,
                right: 16,
                bottom: MediaQuery.of(context).padding.bottom + 24,
              ),
              children: [
                _buildHistoryHero(history, textPrimary, textTertiary),
                const SizedBox(height: 16),
                ...List.generate(
                  history.length,
                  (i) => _buildCard(history[i], i, textPrimary, textTertiary),
                ),
              ],
            ),
    );
  }

  Widget _buildHistoryHero(
    List<Map<String, dynamic>> history,
    Color textPrimary,
    Color textTertiary,
  ) {
    final latestDate = history.isEmpty
        ? '--'
        : _formatStatDate(history.first['timestamp'] as String?);
    final uniqueWinners = history
        .map((entry) => entry['winner'] as String?)
        .whereType<String>()
        .where((winner) => winner.trim().isNotEmpty)
        .toSet()
        .length;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.brandBlue.withValues(alpha: 0.16),
            AppTheme.brandCyan.withValues(alpha: 0.08),
            context.surfaceElevatedColor,
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.14)),
        boxShadow: [
          BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.08),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [_kBlue, _kCyan]),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: _kBlue.withValues(alpha: 0.22),
                      blurRadius: 14,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.history_toggle_off_rounded,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _historyText(
                        context,
                        tr: 'Abonelik analiz geçmişin',
                        en: 'Your subscription archive',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: textPrimary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _historyText(
                        context,
                        tr: 'Eski sonuçlara dokunarak analiz ekranini aninda geri yukleyebilirsin.',
                        en: 'Tap any result to instantly restore it on the subscriptions screen.',
                      ),
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        height: 1.5,
                        color: textTertiary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildHistoryStat(
                  label: _historyText(
                    context,
                    tr: 'Toplam kayıt',
                    en: 'Entries',
                  ),
                  value: '${history.length}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildHistoryStat(
                  label: _historyText(
                    context,
                    tr: 'Farkli kazanan',
                    en: 'Unique winners',
                  ),
                  value: '$uniqueWinners',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildHistoryStat(
                  label: _historyText(context, tr: 'Son analiz', en: 'Latest'),
                  value: latestDate,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryStat({required String label, required String value}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.textTertiaryColor,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmpty(Color textPrimary, Color textTertiary) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    _kBlue.withValues(alpha: 0.18),
                    _kCyan.withValues(alpha: 0.08),
                  ],
                ),
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: _kBlue.withValues(alpha: 0.12),
                    blurRadius: 24,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Icon(
                Icons.compare_arrows_rounded,
                size: 42,
                color: _kCyan,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              _historyText(
                context,
                tr: 'Henüz geçmiş yok',
                en: 'No history yet',
              ),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              _historyText(
                context,
                tr: 'Abonelik karşılaştırması yaptıktan sonra sonuçlar burada görüntülenir.',
                en: 'Your subscription comparison results will appear here.',
              ),
              style: GoogleFonts.inter(
                fontSize: 14,
                color: textTertiary,
                height: 1.6,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 28),
            GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 14,
                ),
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: AppTheme.cardShadow,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.compare_arrows_rounded,
                      size: 18,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _historyText(
                        context,
                        tr: 'Karşılaştırma Yap',
                        en: 'Start Comparison',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(
    Map<String, dynamic> entry,
    int index,
    Color textPrimary,
    Color textTertiary,
  ) {
    final services = (entry['services'] as List?)?.cast<String>() ?? <String>[];
    final winner = entry['winner'] as String?;
    final date = _formatDate(entry['timestamp'] as String?);
    final analysisResult = entry['analysisResult'] as String?;
    final hasFullResult = analysisResult != null && analysisResult.isNotEmpty;
    final title = _historyTitle(context, services);
    final serviceCountLabel = _historyText(
      context,
      tr: '${services.length} servis',
      en: '${services.length} services',
    );

    final rawScores = entry['scores'];
    Map<String, double> scores = {};
    if (rawScores is Map) {
      scores = rawScores.map(
        (k, v) => MapEntry(k.toString(), (v as num).toDouble()),
      );
    }

    double? winnerScore = winner != null ? scores[winner] : null;
    final scoreColor = (winnerScore ?? 0) >= 80
        ? AppTheme.green500
        : (winnerScore ?? 0) >= 60
        ? AppTheme.amber500
        : AppTheme.rose500;

    return Dismissible(
      key: ValueKey(entry['timestamp'] ?? index),
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
          // Analiz sonucunu geri yükle → subscriptions ekranı aynı result UI'ı gösterir
          ref
              .read(subQuizProvider.notifier)
              .restoreFromHistory(
                services: services,
                analysisResult: hasFullResult ? analysisResult : '',
                scores: scores,
                structured: entry['structured'] as Map<String, dynamic>?,
              );
          Navigator.of(context).pop();
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                context.surfaceElevatedColor,
                _kBlue.withValues(alpha: 0.06),
              ],
            ),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: _kCyan.withValues(alpha: 0.14), width: 1),
            boxShadow: [
              ...AppTheme.cardShadow,
              BoxShadow(
                color: _kBlue.withValues(alpha: 0.06),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [_kBlue, _kCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.compare_arrows_rounded,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: textPrimary,
                      ),
                    ),
                    if (services.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        services.map(_prettySubscriptionName).join(' • '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: textTertiary,
                          height: 1.45,
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _buildMetaChip(
                          icon: Icons.layers_rounded,
                          label: serviceCountLabel,
                          textColor: textTertiary,
                        ),
                        if (winner != null && winner.isNotEmpty) ...[
                          _buildMetaChip(
                            icon: Icons.emoji_events_rounded,
                            label: _prettySubscriptionName(winner),
                            textColor: AppTheme.amber500,
                            background: AppTheme.amber500.withValues(
                              alpha: 0.10,
                            ),
                            borderColor: AppTheme.amber500.withValues(
                              alpha: 0.18,
                            ),
                          ),
                        ],
                        if (date.isNotEmpty)
                          _buildMetaChip(
                            icon: Icons.schedule_rounded,
                            label: date,
                            textColor: textTertiary,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (winnerScore != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: scoreColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: scoreColor.withValues(alpha: 0.22),
                        ),
                      ),
                      child: Text(
                        '${winnerScore.toInt()}%',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: scoreColor,
                        ),
                      ),
                    ),
                  const SizedBox(height: 14),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: textTertiary,
                    size: 20,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMetaChip({
    required IconData icon,
    required String label,
    required Color textColor,
    Color? background,
    Color? borderColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: background ?? Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: borderColor ?? Colors.white.withValues(alpha: 0.06),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: textColor),
          const SizedBox(width: 6),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// (Removed: _SubscriptionResultDetailScreen)
// Geçmişten açılınca artık restoreFromHistory + pop kullanılıyor,
// böylece SubscriptionsScreen'in kendi _SubResultView'ı gösteriliyor.
// ─────────────────────────────────────────────────────────────────────────────

// ignore: unused_element
class _SubscriptionResultDetailScreen extends StatelessWidget {
  final List<String> services;
  final Map<String, double> scores;
  final String analysisResult;
  final Map<String, dynamic>? structured;
  final String? winner;
  final String date;

  const _SubscriptionResultDetailScreen({
    required this.services,
    required this.scores,
    required this.analysisResult,
    this.structured,
    this.winner,
    this.date = '',
  });

  Color _scoreColor(double s) {
    if (s >= 80) return AppTheme.green500;
    if (s >= 60) return AppTheme.amber500;
    return AppTheme.rose500;
  }

  // Structured JSON varsa okunabilir markdown ozeti uret
  String _buildAnalysisText(BuildContext context) {
    if (analysisResult.isNotEmpty &&
        !analysisResult.trim().startsWith('{') &&
        !analysisResult.trim().startsWith('[')) {
      return analysisResult;
    }
    // structured'dan ozet olustur
    final subs = (structured?['subscriptions'] as Map<String, dynamic>?) ?? {};
    final winnerData = (structured?['winner'] as Map<String, dynamic>?) ?? {};
    if (subs.isNotEmpty) {
      final buf = StringBuffer();
      for (final e in subs.entries) {
        final d = e.value as Map<String, dynamic>? ?? {};
        buf.writeln('### ${e.key}');
        if (d['compatibility_explanation'] != null) {
          buf.writeln(d['compatibility_explanation']);
        }
        final pros = (d['pros'] as List?)?.cast<String>() ?? [];
        if (pros.isNotEmpty) {
          buf.writeln(
            '\n**${_historyText(context, tr: 'Artıları', en: 'Pros')}**',
          );
          for (final p in pros) {
            buf.writeln('- $p');
          }
        }
        final cons = (d['cons'] as List?)?.cast<String>() ?? [];
        if (cons.isNotEmpty) {
          buf.writeln(
            '\n**${_historyText(context, tr: 'Eksileri', en: 'Cons')}**',
          );
          for (final c in cons) {
            buf.writeln('- $c');
          }
        }
        buf.writeln();
      }
      if (winnerData['recommendation'] != null) {
        buf.writeln(
          '---\n**${_historyText(context, tr: 'Tavsiye', en: 'Recommendation')}**\n\n${winnerData['recommendation']}',
        );
      }
      return buf.toString().trim();
    }
    if (analysisResult.isNotEmpty) return analysisResult;
    return _historyText(
      context,
      tr: 'Detaylı analiz verisi bu kayıt için mevcut değil.',
      en: 'Detailed analysis data is not available for this record.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final textTertiary = context.textTertiaryColor;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final analysisText = _buildAnalysisText(context);

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
        centerTitle: true,
        title: isDark
            ? ShaderMask(
                shaderCallback: (b) => const LinearGradient(
                  colors: [_kBlue, _kCyan],
                ).createShader(b),
                child: Text(
                  services.join(' vs '),
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
              )
            : Text(
                services.join(' vs '),
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: _kBlue,
                  letterSpacing: -0.3,
                ),
              ),
        // Sag uste HICBIR buton yok
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).padding.bottom + 32,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Tarih
            if (date.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    Icon(
                      Icons.access_time_rounded,
                      size: 14,
                      color: textTertiary,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      date,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: textTertiary,
                      ),
                    ),
                  ],
                ),
              ),

            // Kazanan banner
            if (winner != null && winner!.isNotEmpty) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [_kBlue, _kCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.emoji_events_rounded,
                      color: Colors.white,
                      size: 28,
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _historyText(context, tr: 'Kazanan', en: 'Winner'),
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                        Text(
                          winner!,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Skor kartlari
            if (scores.isNotEmpty) ...[
              _buildSectionTitle(
                _historyText(
                  context,
                  tr: 'Uyumluluk Puanları',
                  en: 'Compatibility Scores',
                ),
                textPrimary,
              ),
              const SizedBox(height: 10),
              ...scores.entries.map((e) {
                final sc = e.value;
                final cl = _scoreColor(sc);
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: cl.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                e.key,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: textPrimary,
                                ),
                              ),
                            ),
                            Text(
                              '${sc.toInt()}%',
                              style: GoogleFonts.inter(
                                fontSize: 20,
                                fontWeight: FontWeight.w900,
                                color: cl,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value: sc / 100,
                            backgroundColor: cl.withValues(alpha: 0.12),
                            valueColor: AlwaysStoppedAnimation(cl),
                            minHeight: 8,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 8),
            ],

            // AI Analiz
            if (analysisText.isNotEmpty) ...[
              _buildSectionTitle(
                _historyText(context, tr: 'AI Analiz', en: 'AI Analysis'),
                textPrimary,
              ),
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: context.surfaceElevatedColor,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: MarkdownBody(
                  data: analysisText,
                  selectable: true,
                  styleSheet: MarkdownStyleSheet(
                    p: GoogleFonts.inter(
                      fontSize: 14,
                      color: textPrimary,
                      height: 1.6,
                    ),
                    h3: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: textPrimary,
                    ),
                    strong: GoogleFonts.inter(
                      fontWeight: FontWeight.w700,
                      color: textPrimary,
                    ),
                    listBullet: GoogleFonts.inter(
                      fontSize: 14,
                      color: textTertiary,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title, Color textPrimary) {
    return Text(
      title,
      style: GoogleFonts.plusJakartaSans(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        color: textPrimary,
      ),
    );
  }
}
