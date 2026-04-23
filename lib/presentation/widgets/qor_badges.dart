import 'package:qor_ai/core/constants.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class QorAmountBadge extends StatelessWidget {
  final int? amount;
  final bool unlimited;
  final Color color;
  final double fontSize;
  final EdgeInsetsGeometry padding;

  const QorAmountBadge({
    super.key,
    this.amount,
    this.unlimited = false,
    required this.color,
    this.fontSize = 11,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
  });

  @override
  Widget build(BuildContext context) {
    final label = unlimited ? '∞' : '${amount ?? 0}';

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _QCoinIcon(size: fontSize + 5, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class QorBalanceBadge extends StatelessWidget {
  final int remaining;
  final int total;
  final bool unlimited;
  final Color color;
  final double fontSize;
  final EdgeInsetsGeometry padding;

  const QorBalanceBadge({
    super.key,
    required this.remaining,
    required this.total,
    required this.unlimited,
    required this.color,
    this.fontSize = 11,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
  });

  @override
  Widget build(BuildContext context) {
    final label = unlimited ? '∞' : '$remaining/$total';

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _QCoinIcon(size: fontSize + 5, color: color),
          const SizedBox(width: 5),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _QCoinIcon extends StatelessWidget {
  final double size;
  final Color color;

  const _QCoinIcon({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [
            color.withValues(alpha: 0.95),
            color.withValues(alpha: 0.65),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.18),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.all(size * 0.18),
        child: CustomPaint(
          painter: _QGlyphPainter(),
        ),
      ),
    );
  }
}

class _QGlyphPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.16;
    final center = Offset(size.width * 0.48, size.height * 0.48);
    final radius = (size.shortestSide - stroke) * 0.38;

    final ringPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, ringPaint);

    final tailPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke * 0.9
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(
      Offset(center.dx + radius * 0.28, center.dy + radius * 0.34),
      Offset(size.width * 0.9, size.height * 0.9),
      tailPaint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}