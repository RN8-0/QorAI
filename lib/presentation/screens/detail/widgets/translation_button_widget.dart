part of '../product_detail_screen.dart';

// ── See Translation Button (Instagram-style per-review translation) ──
class _SeeTranslationButton extends StatefulWidget {
  final String text;
  const _SeeTranslationButton({required this.text});

  @override
  State<_SeeTranslationButton> createState() => _SeeTranslationButtonState();
}

class _SeeTranslationButtonState extends State<_SeeTranslationButton> {
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
      final dio = Dio();
      final resp = await dio.get(
        'https://translate.googleapis.com/translate_a/single',
        queryParameters: {
          'client': 'gtx',
          'sl': 'auto',
          'tl': locale,
          'dt': 't',
          'q': widget.text,
        },
      ).timeout(const Duration(seconds: 8));

      final data = resp.data;
      if (data is List && data.isNotEmpty && data[0] is List) {
        final sb = StringBuffer();
        for (final segment in data[0]) {
          if (segment is List && segment.isNotEmpty) {
            sb.write(segment[0]);
          }
        }
        if (mounted) {
          setState(() {
            _translated = sb.toString();
            _showOriginal = false;
            _loading = false;
          });
        }
      } else {
        if (mounted) setState(() => _loading = false);
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
