part of '../product_detail_screen.dart';

// ── See Translation Button (per-review translation via Google Translate free endpoint) ──
class _SeeTranslationButton extends ConsumerStatefulWidget {
  final String text;
  const _SeeTranslationButton({required this.text});

  @override
  ConsumerState<_SeeTranslationButton> createState() =>
      _SeeTranslationButtonState();
}

class _SeeTranslationButtonState
    extends ConsumerState<_SeeTranslationButton> {
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
      final targetLang = Localizations.localeOf(context).languageCode;
      final dio = ref.read(dioProvider);

      final response = await dio.get(
        'https://translate.googleapis.com/translate_a/single',
        queryParameters: {
          'client': 'gtx',
          'sl': 'auto',
          'tl': targetLang,
          'dt': 't',
          'q': widget.text,
        },
        options: Options(
          receiveTimeout: const Duration(seconds: 15),
          sendTimeout: const Duration(seconds: 10),
        ),
      );

      // Response: [[["translated","original",...]], null, "detectedLang", ...]
      final data = response.data;
      final buffer = StringBuffer();
      if (data is List && data.isNotEmpty && data[0] is List) {
        for (final part in data[0] as List) {
          if (part is List && part.isNotEmpty && part[0] is String) {
            buffer.write(part[0] as String);
          }
        }
      }
      final translated = buffer.toString().trim();

      if (mounted && translated.isNotEmpty) {
        setState(() {
          _translated = translated;
          _showOriginal = false;
          _loading = false;
        });
      } else if (mounted) {
        setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _loading ? null : _translate,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading)
                const SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.5),
                )
              else
                Icon(
                  Icons.translate_rounded,
                  size: 14,
                  color: AppTheme.primaryBlue,
                ),
              const SizedBox(width: 4),
              Text(
                _translated != null
                    ? (_showOriginal
                        ? (isTr ? 'Çeviriyi Gör' : 'See Translation')
                        : (isTr ? 'Orijinali Gör' : 'See Original'))
                    : (isTr ? 'Çeviriyi Gör' : 'See Translation'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.primaryBlue,
                ),
              ),
            ],
          ),
        ),
        if (_translated != null && !_showOriginal) ...[
          const SizedBox(height: 6),
          Text(
            _translated!,
            style: TextStyle(
              fontSize: 14,
              height: 1.4,
              color: context.textPrimary,
            ),
          ),
        ],
      ],
    );
  }
}




// ═══════════════════════════════════════════════════════════
// YOUTUBE PLAYER HELPER
// (Stream URL extraction kaldırıldı — artık youtube_player_iframe kullanılıyor)
