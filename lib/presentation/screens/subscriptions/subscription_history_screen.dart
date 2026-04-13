/// Compair — Subscription Analysis History Screen
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/providers/providers.dart';

const _kBlue = AppTheme.brandBlue;
const _kCyan = AppTheme.brandCyan;

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
      List<Map<String, dynamic>> firebase) {
    final seen = <String>{};
    final merged = <Map<String, dynamic>>[];
    for (final item in [...pending, ...firebase]) {
      final key = (item['timestamp'] as String?) ?? '';
      if (seen.add(key)) merged.add(item);
    }
    return merged;
  }

  Future<void> _refreshSilently() async {
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth == null) return;
      final result = await ref
          .read(firebaseDataSourceProvider)
          .getSubscriptionHistory(auth)
          .timeout(const Duration(seconds: 6));
      if (!mounted) return;
      final pending = ref.read(pendingSubscriptionHistoryProvider);
      final merged = _mergeHistory(pending, result);
      setState(() { _history = merged; _isLoading = false; });
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _fetchFromFirestore() async {
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth == null) { if (mounted) setState(() => _isLoading = false); return; }
      final result = await ref
          .read(firebaseDataSourceProvider)
          .getSubscriptionHistory(auth)
          .timeout(const Duration(seconds: 6));
      if (!mounted) return;
      final pending = ref.read(pendingSubscriptionHistoryProvider);
      final merged = _mergeHistory(pending, result);
      setState(() { _history = merged; _isLoading = false; });
    } catch (_) {
      if (mounted) setState(() { _history ??= []; _isLoading = false; });
    }
  }

  Future<void> _deleteItem(int index) async {
    final removed = _history![index];
    setState(() => _history!.removeAt(index));

    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        // Get full list from Firestore and remove by timestamp
        final allItems = await ref.read(firebaseDataSourceProvider)
            .getSubscriptionHistory(auth);
        final ts = removed['timestamp'] as String?;
        final filtered = allItems
            .where((e) => e['timestamp'] != ts)
            .toList();
        await ref.read(firebaseDataSourceProvider)
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
        title: Text('Geçmişi Temizle',
            style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w800, color: context.textPrimary)),
        content: Text('Tüm karşılaştırma geçmişi silinecek. Emin misiniz?',
            style: GoogleFonts.inter(
                color: context.textTertiaryColor, height: 1.5)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('İptal',
                  style: GoogleFonts.inter(color: context.textTertiaryColor))),
          TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text('Temizle',
                  style: GoogleFonts.inter(
                      color: AppTheme.error, fontWeight: FontWeight.w700))),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _history = []);
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        await ref.read(firebaseDataSourceProvider)
            .updateSubscriptionHistory(auth, []);
        ref.invalidate(subscriptionHistoryProvider);
      }
    } catch (_) {}
  }

  String _formatDate(String? ts) {
    if (ts == null) return '';
    final dt = DateTime.tryParse(ts);
    if (dt == null) return '';
    const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    final month = months[dt.month - 1];
    final hour = dt.hour.toString().padLeft(2, '0');
    final min = dt.minute.toString().padLeft(2, '0');
    return '${dt.day} $month ${dt.year}, $hour:$min';
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
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              size: 20, color: textPrimary),
        ),
        title: Text(
          'Geçmiş Karşılaştırmalar',
          style: GoogleFonts.plusJakartaSans(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: textPrimary),
        ),
        actions: [
          if (history != null && history.isNotEmpty)
            IconButton(
              onPressed: _clearAll,
              icon: Icon(Icons.delete_sweep_rounded,
                  size: 22, color: AppTheme.error.withValues(alpha: 0.8)),
              tooltip: 'Tamamını Sil',
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: _kBlue))
          : (history == null || history.isEmpty)
              ? _buildEmpty(textPrimary, textTertiary)
              : ListView.builder(
                  padding: EdgeInsets.only(
                      top: 12,
                      left: 16,
                      right: 16,
                      bottom: MediaQuery.of(context).padding.bottom + 24),
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
                    _kBlue.withValues(alpha: 0.12),
                    _kCyan.withValues(alpha: 0.06),
                  ],
                ),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.compare_arrows_rounded,
                  size: 42, color: _kBlue.withValues(alpha: 0.5)),
            ),
            const SizedBox(height: 24),
            Text(
              'Henüz geçmiş yok',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: textPrimary),
            ),
            const SizedBox(height: 10),
            Text(
              'Abonelik karşılaştırması yaptıktan sonra sonuçlar burada görüntülenir.',
              style: GoogleFonts.inter(
                  fontSize: 14, color: textTertiary, height: 1.6),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 28),
            FilledButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.compare_arrows_rounded, size: 18),
              label: const Text('Karşılaştırma Yap'),
              style: FilledButton.styleFrom(
                backgroundColor: _kBlue,
                padding: const EdgeInsets.symmetric(
                    horizontal: 28, vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
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
      Color textTertiary) {
    final services =
        (entry['services'] as List?)?.cast<String>() ?? <String>[];
    final winner = entry['winner'] as String?;
    final date = _formatDate(entry['timestamp'] as String?);
    final analysisResult = entry['analysisResult'] as String?;
    final hasFullResult =
        analysisResult != null && analysisResult.isNotEmpty;

    final rawScores = entry['scores'];
    Map<String, double> scores = {};
    if (rawScores is Map) {
      scores = rawScores.map(
          (k, v) => MapEntry(k.toString(), (v as num).toDouble()));
    }

    double? winnerScore =
        winner != null ? scores[winner] : null;
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
        child: const Icon(Icons.delete_rounded,
            color: AppTheme.error, size: 24),
      ),
      onDismissed: (_) {
        HapticFeedback.mediumImpact();
        _deleteItem(index);
      },
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          // Analiz sonucunu geri yükle → subscriptions ekranı aynı result UI'ı gösterir
          ref.read(subQuizProvider.notifier).restoreFromHistory(
            services: services,
            analysisResult: hasFullResult ? analysisResult! : '',
            scores: scores,
            structured: entry['structured'] as Map<String, dynamic>?,
          );
          Navigator.of(context).pop();
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: _kBlue.withValues(alpha: 0.08),
              width: 1,
            ),
          ),
          child: Row(
            children: [
              // Icon
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [_kBlue, _kCyan],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.compare_arrows_rounded,
                    color: Colors.white, size: 22),
              ),
              const SizedBox(width: 14),
              // Info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      services.join(' vs '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: textPrimary),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (winner != null && winner.isNotEmpty) ...[
                          Icon(Icons.emoji_events_rounded,
                              size: 13,
                              color: AppTheme.amber500),
                          const SizedBox(width: 3),
                          Text(winner,
                              style: GoogleFonts.inter(
                                  fontSize: 12,
                                  color: AppTheme.amber500,
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(width: 8),
                        ],
                        if (date.isNotEmpty)
                          Text(date,
                              style: GoogleFonts.inter(
                                  fontSize: 11,
                                  color: textTertiary)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Score badge
              if (winnerScore != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: scoreColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: scoreColor.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    '${winnerScore.toInt()}%',
                    style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: scoreColor),
                  ),
                )
              else
                Icon(Icons.chevron_right_rounded,
                    color: textTertiary, size: 20),
            ],
          ),
        ),
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
  String _buildAnalysisText() {
    if (analysisResult.isNotEmpty &&
        !analysisResult.trim().startsWith('{') &&
        !analysisResult.trim().startsWith('[')) {
      return analysisResult;
    }
    // structured'dan ozet olustur
    final subs = (structured?['subscriptions'] as Map<String, dynamic>?) ?? {};
    final winnerData =
        (structured?['winner'] as Map<String, dynamic>?) ?? {};
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
          buf.writeln('\n**Artıları**');
          for (final p in pros) { buf.writeln('- $p'); }
        }
        final cons = (d['cons'] as List?)?.cast<String>() ?? [];
        if (cons.isNotEmpty) {
          buf.writeln('\n**Eksileri**');
          for (final c in cons) { buf.writeln('- $c'); }
        }
        buf.writeln();
      }
      if (winnerData['recommendation'] != null) {
        buf.writeln('---\n**Tavsiye**\n\n${winnerData['recommendation']}');
      }
      return buf.toString().trim();
    }
    if (analysisResult.isNotEmpty) return analysisResult;
    return 'Detaylı analiz verisi bu kayıt için mevcut değil.';
  }

  @override
  Widget build(BuildContext context) {
    final bg = context.backgroundColor;
    final textPrimary = context.textPrimary;
    final textTertiary = context.textTertiaryColor;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final analysisText = _buildAnalysisText();

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              size: 20, color: textPrimary),
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
                      letterSpacing: -0.3),
                ),
              )
            : Text(
                services.join(' vs '),
                style: GoogleFonts.inter(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: _kBlue,
                    letterSpacing: -0.3),
              ),
        // Sag uste HICBIR buton yok
      ),
      body: SingleChildScrollView(
        padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(context).padding.bottom + 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Tarih
            if (date.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    Icon(Icons.access_time_rounded,
                        size: 14, color: textTertiary),
                    const SizedBox(width: 5),
                    Text(date,
                        style: GoogleFonts.inter(
                            fontSize: 12, color: textTertiary)),
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
                    const Icon(Icons.emoji_events_rounded,
                        color: Colors.white, size: 28),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Kazanan',
                            style: GoogleFonts.inter(
                                fontSize: 12,
                                color: Colors.white70)),
                        Text(winner!,
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                color: Colors.white)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Skor kartlari
            if (scores.isNotEmpty) ...[
              _buildSectionTitle('Uyumluluk Puanları', textPrimary),
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
                      border: Border.all(
                          color: cl.withValues(alpha: 0.2)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(
                            child: Text(e.key,
                                style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: textPrimary)),
                          ),
                          Text('${sc.toInt()}%',
                              style: GoogleFonts.inter(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                  color: cl)),
                        ]),
                        const SizedBox(height: 10),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value: sc / 100,
                            backgroundColor:
                                cl.withValues(alpha: 0.12),
                            valueColor:
                                AlwaysStoppedAnimation(cl),
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
              _buildSectionTitle('AI Analiz', textPrimary),
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
                        height: 1.6),
                    h3: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: textPrimary),
                    strong: GoogleFonts.inter(
                        fontWeight: FontWeight.w700,
                        color: textPrimary),
                    listBullet: GoogleFonts.inter(
                        fontSize: 14, color: textTertiary),
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
          color: textPrimary),
    );
  }
}