import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:compair/presentation/theme/app_theme.dart';
import 'package:compair/core/extensions.dart';
import 'package:compair/presentation/providers/auth_providers.dart';

class PcBuilderHistoryScreen extends ConsumerStatefulWidget {
  const PcBuilderHistoryScreen({super.key});

  @override
  ConsumerState<PcBuilderHistoryScreen> createState() => _PcBuilderHistoryScreenState();
}

class _PcBuilderHistoryScreenState extends ConsumerState<PcBuilderHistoryScreen> {
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
      _history = data.map((e) => jsonDecode(e) as Map<String, dynamic>).toList();
      // Reverse so newest is first
      _history = _history.reversed.toList();
      _loading = false;
    });
  }

  Future<void> _clearHistory() async {
    final uid = ref.read(authStateProvider).valueOrNull;
    if (uid != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('pc_build_history_$uid');
      setState(() {
        _history.clear();
      });
    }
  }

  String _pcText(BuildContext context, {required String tr, required String en}) {
    final isTurkish = Localizations.localeOf(context).languageCode == 'tr';
    return isTurkish ? tr : en;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.backgroundDark,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: AppTheme.white, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(
          _pcText(context, tr: 'PC Build Geçmişi', en: 'PC Build History'),
          style: GoogleFonts.plusJakartaSans(
            color: AppTheme.white,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          if (_history.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded, color: AppTheme.rose500),
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    backgroundColor: AppTheme.surfaceDark,
                    title: Text(
                      _pcText(context, tr: 'Geçmişi Sil', en: 'Clear History'),
                      style: GoogleFonts.plusJakartaSans(color: AppTheme.white),
                    ),
                    content: Text(
                      _pcText(
                        context,
                        tr: 'Tüm PC Build geçmişinizi silmek istediğinize emin misiniz?',
                        en: 'Are you sure you want to clear all PC Build history?',
                      ),
                      style: GoogleFonts.plusJakartaSans(color: AppTheme.white.withValues(alpha: 0.7)),
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: Text(_pcText(context, tr: 'İptal', en: 'Cancel'), style: const TextStyle(color: AppTheme.white)),
                      ),
                      TextButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _clearHistory();
                        },
                        child: Text(_pcText(context, tr: 'Sil', en: 'Clear'), style: const TextStyle(color: AppTheme.rose500)),
                      ),
                    ],
                  ),
                );
              },
            )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.brandBlue))
          : _history.isEmpty
              ? Center(
                  child: Text(
                    _pcText(context, tr: 'Henüz kaydedilmiş bir build bulunmuyor.', en: 'No saved builds found.'),
                    style: GoogleFonts.plusJakartaSans(color: AppTheme.white.withValues(alpha: 0.7)),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _history.length,
                  separatorBuilder: (ctx, i) => const SizedBox(height: 16),
                  itemBuilder: (ctx, i) {
                    final item = _history[i];
                    final date = DateTime.tryParse(item['date'] ?? '') ?? DateTime.now();
                    final components = (item['components'] as Map<String, dynamic>?) ?? {};
                    final aiComment = item['ai_analysis'] as String? ?? '';
                    final totalScore = item['total_score'] ?? 0;

                    return Container(
                      decoration: BoxDecoration(
                        color: AppTheme.surfaceDark,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppTheme.white.withValues(alpha: 0.05)),
                      ),
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}',
                                style: GoogleFonts.plusJakartaSans(
                                  color: AppTheme.white.withValues(alpha: 0.5),
                                  fontSize: 12,
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.brandBlue.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  'Score: ${(totalScore as num).round()}',
                                  style: GoogleFonts.plusJakartaSans(
                                    color: AppTheme.brandBlue,
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _pcText(context, tr: 'Bileşenler:', en: 'Components:'),
                            style: GoogleFonts.plusJakartaSans(
                              color: AppTheme.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ...components.entries.map((e) => Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    SizedBox(
                                      width: 40,
                                      child: Text(
                                        e.key.toUpperCase(),
                                        style: GoogleFonts.plusJakartaSans(
                                          color: AppTheme.brandBlue,
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        e.value.toString(),
                                        style: GoogleFonts.plusJakartaSans(
                                          color: AppTheme.white.withValues(alpha: 0.8),
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              )),
                          if (aiComment.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: AppTheme.white.withValues(alpha: 0.03),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      const Icon(Icons.auto_awesome, color: AppTheme.brandBlue, size: 14),
                                      const SizedBox(width: 6),
                                      Text(
                                        'AI Analysis',
                                        style: GoogleFonts.plusJakartaSans(
                                          color: AppTheme.brandBlue,
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    aiComment.length > 300 ? '${aiComment.substring(0, 300)}...' : aiComment,
                                    style: GoogleFonts.plusJakartaSans(
                                      color: AppTheme.white.withValues(alpha: 0.7),
                                      fontSize: 12,
                                      height: 1.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
