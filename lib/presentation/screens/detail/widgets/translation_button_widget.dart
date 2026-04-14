part of '../product_detail_screen.dart';

// ── See Translation Button (Instagram-style per-review translation) ──
class _SeeTranslationButton extends ConsumerStatefulWidget {
  final String text;
  const _SeeTranslationButton({required this.text});

  @override
  ConsumerState<_SeeTranslationButton> createState() => _SeeTranslationButtonState();
}

class _SeeTranslationButtonState extends ConsumerState<_SeeTranslationButton> {
  String? _translated;
  bool _loading = false;
  bool _showOriginal = false;

  Future<void> _translate() async {
    if (_translated != null) {
      setState(() => _showOriginal = !_showOriginal);
      return;
    }

    setState(() => _loading = true);
    try {
      final locale = Localizations.localeOf(context).languageCode;
      final gemini = ref.read(geminiServiceProvider);
      final translated = await gemini.freeTextQuery(
        'Translate the following product review into the user language. '
        'Preserve meaning, tone, product names, and line breaks. '
        'Return only the translated text with no quotes or extra commentary. '
        'If the text is already in the target language, return it unchanged.\n\n'
        '${widget.text}',
        language: locale,
      ).timeout(const Duration(seconds: 20));

      if (mounted) {
        setState(() {
          _translated = translated.trim();
          _showOriginal = false;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _loading ? null : _translate,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading)
                const SizedBox(width: 12, height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.5))
              else
                Icon(Icons.translate_rounded, size: 14, color: AppTheme.primaryBlue),
              const SizedBox(width: 4),
              Text(
                _translated != null
                    ? (_showOriginal ? 'See Translation' : 'See Original')
                    : 'See Translation',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: AppTheme.primaryBlue),
              ),
            ],
          ),
        ),
        if (_translated != null && !_showOriginal) ...[
          const SizedBox(height: 6),
          Text(
            _translated!,
            style: TextStyle(fontSize: 14, height: 1.4, color: context.textPrimary),
          ),
        ],
      ],
    );
  }
}




// ═══════════════════════════════════════════════════════════
// YOUTUBE PLAYER HELPER
// (Stream URL extraction kaldırıldı — artık youtube_player_iframe kullanılıyor)
