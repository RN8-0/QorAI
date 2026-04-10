import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// A text widget that collapses to [maxLines] with a "Devamını oku" / "Daha az göster" toggle.
class ExpandableText extends StatefulWidget {
  final String text;
  final TextStyle? style;
  final int maxLines;
  final TextAlign textAlign;

  const ExpandableText(
    this.text, {
    super.key,
    this.style,
    this.maxLines = 3,
    this.textAlign = TextAlign.start,
  });

  @override
  State<ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<ExpandableText> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final effectiveStyle = widget.style ??
        GoogleFonts.plusJakartaSans(fontSize: 13, color: Theme.of(context).colorScheme.onSurface);

    return LayoutBuilder(builder: (context, constraints) {
      final tp = TextPainter(
        text: TextSpan(text: widget.text, style: effectiveStyle),
        maxLines: widget.maxLines,
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: constraints.maxWidth);

      final isOverflowing = tp.didExceedMaxLines;

      if (!isOverflowing) {
        return Text(widget.text, style: effectiveStyle, textAlign: widget.textAlign);
      }

      final toggleColor = Theme.of(context).colorScheme.primary;

      return Column(
        crossAxisAlignment: widget.textAlign == TextAlign.center
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.start,
        children: [
          AnimatedCrossFade(
            firstChild: Text(
              widget.text,
              style: effectiveStyle,
              maxLines: widget.maxLines,
              overflow: TextOverflow.ellipsis,
              textAlign: widget.textAlign,
            ),
            secondChild: Text(
              widget.text,
              style: effectiveStyle,
              textAlign: widget.textAlign,
            ),
            crossFadeState: _expanded ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 200),
          ),
          const SizedBox(height: 4),
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _expanded ? 'Daha az göster' : 'Devamını oku',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, fontWeight: FontWeight.w600, color: toggleColor),
                ),
                const SizedBox(width: 2),
                Icon(
                  _expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  size: 16, color: toggleColor,
                ),
              ],
            ),
          ),
        ],
      );
    });
  }
}
