import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

class PcBuilderHistoryScreen extends ConsumerStatefulWidget {
  const PcBuilderHistoryScreen({super.key});

  @override
  ConsumerState<PcBuilderHistoryScreen> createState() =>
      _PcBuilderHistoryScreenState();
}

class _PcBuilderHistoryScreenState
    extends ConsumerState<PcBuilderHistoryScreen> {
  List<Map<String, dynamic>> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    final uid = ref.read(authStateProvider).valueOrNull;
    if (uid == null) {
      setState(() => _loading = false);
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getStringList('pc_build_history_$uid') ?? [];

    setState(() {
      _history = data
          .map((entry) => jsonDecode(entry) as Map<String, dynamic>)
          .toList()
          .reversed
          .toList();
      _loading = false;
    });
  }

  Future<void> _clearHistory() async {
    final uid = ref.read(authStateProvider).valueOrNull;
    if (uid == null) return;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('pc_build_history_$uid');
    setState(() => _history = []);
  }

  String _pcText(
    BuildContext context, {
    required String tr,
    required String en,
  }) {
    final isTurkish = Localizations.localeOf(context).languageCode == 'tr';
    return isTurkish ? tr : en;
  }

  String _formatDate(DateTime value) {
    final day = value.day.toString().padLeft(2, '0');
    final month = value.month.toString().padLeft(2, '0');
    final year = value.year.toString();
    final hour = value.hour.toString().padLeft(2, '0');
    final minute = value.minute.toString().padLeft(2, '0');
    return '$day/$month/$year · $hour:$minute';
  }

  String _componentLabel(BuildContext context, String key) {
    return switch (key) {
      'cpu' => _pcText(context, tr: 'İşlemci', en: 'CPU'),
      'motherboard' => _pcText(context, tr: 'Anakart', en: 'Motherboard'),
      'ram' => _pcText(context, tr: 'RAM', en: 'RAM'),
      'gpu' => _pcText(context, tr: 'Ekran Kartı', en: 'GPU'),
      'storage' => _pcText(context, tr: 'Depolama', en: 'Storage'),
      'psu' => _pcText(context, tr: 'Güç Kaynağı', en: 'PSU'),
      'cooler' => _pcText(context, tr: 'Soğutucu', en: 'Cooler'),
      'pcCase' => _pcText(context, tr: 'Kasa', en: 'Case'),
      'monitor' => _pcText(context, tr: 'Monitör', en: 'Monitor'),
      'keyboard' => _pcText(context, tr: 'Klavye', en: 'Keyboard'),
      'mouse' => _pcText(context, tr: 'Mouse', en: 'Mouse'),
      'headset' => _pcText(context, tr: 'Kulaklık', en: 'Headset'),
      _ => key.toUpperCase(),
    };
  }

  Color _scoreColor(num score) {
    if (score >= 90) return AppTheme.success;
    if (score >= 75) return AppTheme.brandBlue;
    if (score >= 60) return AppTheme.amber500;
    return AppTheme.rose500;
  }

  Future<void> _copyAnalysis(BuildContext context, String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          _pcText(
            context,
            tr: 'AI analizi panoya kopyalandı.',
            en: 'AI analysis copied to clipboard.',
          ),
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w600),
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _showBuildDetails(Map<String, dynamic> item) {
    final date = DateTime.tryParse(item['date']?.toString() ?? '') ?? DateTime.now();
    final components =
        (item['components'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final aiComment = item['ai_analysis']?.toString() ?? '';
    final totalScore = ((item['total_score'] as num?) ?? 0).toDouble();
    final estimatedPower = (item['estimated_power'] as num?)?.round();
    final psuWattage = (item['psu_wattage'] as num?)?.round();
    final powerHeadroom = (item['power_headroom'] as num?)?.round();
    final selectedSocket = item['socket']?.toString();
    final memoryType = item['memory_type']?.toString();
    final upgradeFocus = item['upgrade_focus']?.toString();
    final compatibilityIssues =
        (item['compatibility_issues'] as List?)?.whereType<Map>().toList() ??
        const <Map>[];
    final scoreColor = _scoreColor(totalScore);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.92,
          minChildSize: 0.55,
          maxChildSize: 0.98,
          expand: false,
          builder: (context, controller) {
            return Container(
              decoration: BoxDecoration(
                color: ctx.surfaceElevatedColor,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(30),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.28),
                    blurRadius: 30,
                    offset: const Offset(0, -12),
                  ),
                ],
              ),
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                children: [
                  Center(
                    child: Container(
                      width: 46,
                      height: 5,
                      decoration: BoxDecoration(
                        color: ctx.dividerColor,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      gradient: LinearGradient(
                        colors: [
                          AppTheme.brandDeepBlue.withValues(alpha: 0.16),
                          scoreColor.withValues(alpha: 0.12),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      border: Border.all(
                        color: scoreColor.withValues(alpha: 0.20),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _pcText(
                                      ctx,
                                      tr: 'Kaydedilen Build',
                                      en: 'Saved Build',
                                    ),
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: scoreColor,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    _formatDate(date),
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w800,
                                      color: ctx.textPrimary,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    _pcText(
                                      ctx,
                                      tr: 'Kaydedilen tüm bileşenler, analiz ve sistem metrikleri aşağıda.',
                                      en: 'All saved components, analysis, and system metrics are shown below.',
                                    ),
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      color: ctx.textSecondary,
                                      height: 1.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            Container(
                              width: 76,
                              height: 76,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: scoreColor.withValues(alpha: 0.12),
                                border: Border.all(
                                  color: scoreColor.withValues(alpha: 0.30),
                                  width: 3,
                                ),
                              ),
                              child: Center(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      totalScore.round().toString(),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 24,
                                        fontWeight: FontWeight.w800,
                                        color: scoreColor,
                                      ),
                                    ),
                                    Text(
                                      _pcText(ctx, tr: 'Skor', en: 'Score'),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: ctx.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _detailChip(
                              ctx,
                              icon: Icons.developer_board_rounded,
                              label:
                                  '${components.length} ${_pcText(ctx, tr: 'bileşen', en: 'components')}',
                              color: AppTheme.brandBlue,
                            ),
                            if (estimatedPower != null)
                              _detailChip(
                                ctx,
                                icon: Icons.bolt_rounded,
                                label: '$estimatedPower W',
                                color: PcComponentColor.psu,
                              ),
                            if (psuWattage != null)
                              _detailChip(
                                ctx,
                                icon: Icons.power_rounded,
                                label: 'PSU $psuWattage W',
                                color: AppTheme.success,
                              ),
                            if (powerHeadroom != null)
                              _detailChip(
                                ctx,
                                icon: Icons.stacked_line_chart_rounded,
                                label:
                                    '${_pcText(ctx, tr: 'Pay', en: 'Headroom')} $powerHeadroom W',
                                color: AppTheme.brandCyan,
                              ),
                            if (selectedSocket != null && selectedSocket.isNotEmpty)
                              _detailChip(
                                ctx,
                                icon: Icons.memory_rounded,
                                label: selectedSocket,
                                color: AppTheme.brandDeepBlue,
                              ),
                            if (memoryType != null && memoryType.isNotEmpty)
                              _detailChip(
                                ctx,
                                icon: Icons.sd_storage_rounded,
                                label: memoryType,
                                color: AppTheme.amber500,
                              ),
                            if (upgradeFocus != null && upgradeFocus.isNotEmpty)
                              _detailChip(
                                ctx,
                                icon: Icons.auto_fix_high_rounded,
                                label: upgradeFocus.toUpperCase(),
                                color: AppTheme.rose500,
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (compatibilityIssues.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    _detailSectionTitle(
                      ctx,
                      icon: Icons.warning_amber_rounded,
                      title: _pcText(
                        ctx,
                        tr: 'Uyumluluk Notları',
                        en: 'Compatibility Notes',
                      ),
                      color: AppTheme.rose500,
                    ),
                    const SizedBox(height: 10),
                    ...compatibilityIssues.map(
                      (issue) => Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppTheme.rose500.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: AppTheme.rose500.withValues(alpha: 0.16),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              issue['title']?.toString() ??
                                  _pcText(
                                    ctx,
                                    tr: 'Uyumluluk uyarısı',
                                    en: 'Compatibility warning',
                                  ),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.rose500,
                              ),
                            ),
                            if ((issue['detail']?.toString() ?? '').isNotEmpty) ...[
                              const SizedBox(height: 6),
                              Text(
                                issue['detail'].toString(),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  color: ctx.textSecondary,
                                  height: 1.55,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  _detailSectionTitle(
                    ctx,
                    icon: Icons.widgets_rounded,
                    title: _pcText(ctx, tr: 'Bileşenler', en: 'Components'),
                    color: AppTheme.brandBlue,
                  ),
                  const SizedBox(height: 10),
                  ...components.entries.map(
                    (entry) => Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: ctx.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: ctx.dividerColor),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: AppTheme.brandBlue.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.memory_rounded,
                              color: AppTheme.brandBlue,
                              size: 20,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _componentLabel(ctx, entry.key),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                    color: ctx.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  entry.value.toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: ctx.textSecondary,
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (aiComment.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _detailSectionTitle(
                            ctx,
                            icon: Icons.auto_awesome_rounded,
                            title: _pcText(
                              ctx,
                              tr: 'Kaydedilen AI Analizi',
                              en: 'Saved AI Analysis',
                            ),
                            color: AppTheme.brandCyan,
                          ),
                        ),
                        TextButton.icon(
                          onPressed: () => _copyAnalysis(ctx, aiComment),
                          icon: const Icon(Icons.copy_rounded, size: 16),
                          label: Text(
                            _pcText(ctx, tr: 'Kopyala', en: 'Copy'),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: ctx.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: ctx.dividerColor),
                      ),
                      child: SelectableText(
                        aiComment,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: ctx.textSecondary,
                          height: 1.7,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _detailChip(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailSectionTitle(
    BuildContext context, {
    required IconData icon,
    required String title,
    required Color color,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Text(
          title,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final bestScore = _history.isEmpty
        ? 0.0
        : _history
                .map((item) => ((item['total_score'] as num?) ?? 0).toDouble())
                .reduce((a, b) => a > b ? a : b);
    final avgScore = _history.isEmpty
        ? 0.0
        : _history
                .map((item) => ((item['total_score'] as num?) ?? 0).toDouble())
                .reduce((a, b) => a + b) /
            _history.length;

    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new_rounded,
            color: Colors.white,
            size: 20,
          ),
          onPressed: () => context.pop(),
        ),
        title: Text(
          _pcText(context, tr: 'PC Build Geçmişi', en: 'PC Build History'),
          style: GoogleFonts.plusJakartaSans(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (_history.isNotEmpty)
            IconButton(
              icon: const Icon(
                Icons.delete_outline_rounded,
                color: AppTheme.rose500,
              ),
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: AppTheme.surfaceDark,
                    title: Text(
                      _pcText(context, tr: 'Geçmişi Sil', en: 'Clear History'),
                      style: GoogleFonts.plusJakartaSans(color: Colors.white),
                    ),
                    content: Text(
                      _pcText(
                        context,
                        tr: 'Tüm PC Build geçmişinizi silmek istediğinize emin misiniz?',
                        en: 'Are you sure you want to clear all PC Build history?',
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        color: Colors.white.withValues(alpha: 0.7),
                      ),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: Text(
                          _pcText(context, tr: 'İptal', en: 'Cancel'),
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _clearHistory();
                        },
                        child: Text(
                          _pcText(context, tr: 'Sil', en: 'Clear'),
                          style: const TextStyle(color: AppTheme.rose500),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.brandBlue),
            )
          : _history.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 86,
                      height: 86,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [
                            AppTheme.brandDeepBlue.withValues(alpha: 0.28),
                            AppTheme.brandCyan.withValues(alpha: 0.18),
                          ],
                        ),
                      ),
                      child: const Icon(
                        Icons.history_toggle_off_rounded,
                        color: Colors.white,
                        size: 42,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      _pcText(
                        context,
                        tr: 'Henüz kaydedilmiş bir build bulunmuyor.',
                        en: 'No saved builds found yet.',
                      ),
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _pcText(
                        context,
                        tr: 'AI analizi yaptığınız buildler burada modern kartlar halinde listelenecek.',
                        en: 'Builds you analyze with AI will appear here as modern cards.',
                      ),
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.68),
                        height: 1.6,
                      ),
                    ),
                  ],
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh: _loadHistory,
              color: AppTheme.brandBlue,
              child: ListView(
                physics: const BouncingScrollPhysics(
                  parent: AlwaysScrollableScrollPhysics(),
                ),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
                children: [
                  Container(
                    margin: const EdgeInsets.only(bottom: 18),
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      gradient: LinearGradient(
                        colors: [
                          AppTheme.brandDeepBlue.withValues(alpha: 0.20),
                          AppTheme.brandCyan.withValues(alpha: 0.10),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _pcText(
                            context,
                            tr: 'Kaydedilen Sistemler',
                            en: 'Saved Systems',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _pcText(
                            context,
                            tr: 'Her karta dokunarak tüm kayıt detaylarını, AI yorumunu ve sistem metriklerini açabilirsiniz.',
                            en: 'Tap any card to open full saved details, AI commentary, and system metrics.',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: Colors.white.withValues(alpha: 0.72),
                            height: 1.6,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: _statsCard(
                                context,
                                label: _pcText(
                                  context,
                                  tr: 'Toplam',
                                  en: 'Total',
                                ),
                                value: _history.length.toString(),
                                color: AppTheme.brandBlue,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _statsCard(
                                context,
                                label: _pcText(
                                  context,
                                  tr: 'En İyi',
                                  en: 'Best',
                                ),
                                value: bestScore.round().toString(),
                                color: AppTheme.success,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: _statsCard(
                                context,
                                label: _pcText(
                                  context,
                                  tr: 'Ortalama',
                                  en: 'Average',
                                ),
                                value: avgScore.round().toString(),
                                color: AppTheme.brandCyan,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  ..._history.asMap().entries.map((entry) {
                    final index = entry.key;
                    final item = entry.value;
                    final date =
                        DateTime.tryParse(item['date']?.toString() ?? '') ??
                        DateTime.now();
                    final components =
                        (item['components'] as Map<String, dynamic>?) ??
                        <String, dynamic>{};
                    final analysis = item['ai_analysis']?.toString() ?? '';
                    final score = ((item['total_score'] as num?) ?? 0).toDouble();
                    final scoreColor = _scoreColor(score);
                    final previewEntries = components.entries.take(4).toList();

                    return Padding(
                      padding: EdgeInsets.only(bottom: index == _history.length - 1 ? 0 : 16),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(24),
                          onTap: () => _showBuildDetails(item),
                          child: Ink(
                            padding: const EdgeInsets.all(18),
                            decoration: BoxDecoration(
                              color: AppTheme.surfaceDark,
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.06),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.14),
                                  blurRadius: 22,
                                  offset: const Offset(0, 10),
                                ),
                              ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            _formatDate(date),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 12,
                                              color: Colors.white.withValues(alpha: 0.56),
                                            ),
                                          ),
                                          const SizedBox(height: 6),
                                          Text(
                                            _pcText(
                                              context,
                                              tr: '${components.length} bileşenli sistem kaydı',
                                              en: '${components.length}-component saved system',
                                            ),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 17,
                                              fontWeight: FontWeight.w800,
                                              color: Colors.white,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 8,
                                      ),
                                      decoration: BoxDecoration(
                                        color: scoreColor.withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(14),
                                        border: Border.all(
                                          color: scoreColor.withValues(alpha: 0.20),
                                        ),
                                      ),
                                      child: Column(
                                        children: [
                                          Text(
                                            score.round().toString(),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 18,
                                              fontWeight: FontWeight.w800,
                                              color: scoreColor,
                                            ),
                                          ),
                                          Text(
                                            _pcText(context, tr: 'Skor', en: 'Score'),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w700,
                                              color: Colors.white.withValues(alpha: 0.62),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 14),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: previewEntries
                                      .map(
                                        (component) => Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 7,
                                          ),
                                          decoration: BoxDecoration(
                                            color: AppTheme.brandBlue.withValues(alpha: 0.08),
                                            borderRadius: BorderRadius.circular(999),
                                            border: Border.all(
                                              color: AppTheme.brandBlue.withValues(alpha: 0.14),
                                            ),
                                          ),
                                          child: Text(
                                            _componentLabel(context, component.key),
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: AppTheme.brandBlue,
                                            ),
                                          ),
                                        ),
                                      )
                                      .toList(),
                                ),
                                const SizedBox(height: 14),
                                Container(
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.03),
                                    borderRadius: BorderRadius.circular(18),
                                  ),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Icon(
                                        Icons.auto_awesome_rounded,
                                        color: AppTheme.brandCyan,
                                        size: 18,
                                      ),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Text(
                                          analysis.isEmpty
                                              ? _pcText(
                                                  context,
                                                  tr: 'Bu kayıtta AI analizi bulunmuyor.',
                                                  en: 'No AI analysis is stored for this build.',
                                                )
                                              : analysis.length > 155
                                              ? '${analysis.substring(0, 155)}...'
                                              : analysis,
                                          maxLines: 4,
                                          overflow: TextOverflow.ellipsis,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 12,
                                            color: Colors.white.withValues(alpha: 0.76),
                                            height: 1.6,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Row(
                                  children: [
                                    Text(
                                      _pcText(
                                        context,
                                        tr: 'Tüm detayları aç',
                                        en: 'Open full details',
                                      ),
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppTheme.brandCyan,
                                      ),
                                    ),
                                    const Spacer(),
                                    const Icon(
                                      Icons.arrow_forward_rounded,
                                      color: AppTheme.brandCyan,
                                      size: 18,
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
    );
  }

  Widget _statsCard(
    BuildContext context, {
    required String label,
    required String value,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.66),
            ),
          ),
        ],
      ),
    );
  }
}

abstract final class PcComponentColor {
  static const psu = Color(0xFFFFB547);
}
