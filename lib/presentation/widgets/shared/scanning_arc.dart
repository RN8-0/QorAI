import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Sürekli dönen, kuyruğu solan "tarama" arkı.
///
/// Analiz/yükleme orb'larının çevresine yerleştirilir. Belirleyici ilerleme
/// halkası bir aşamada (örn. %17'de) beklerken DONMUŞ görünüyordu; bu ark HİÇ
/// durmadan döner → kullanıcı işlemin devam ettiğini her an görür.
///
/// Kendi `AnimationController`'ını taşır (self-contained) — orb Stack'ine tek
/// satırla eklenir. Yalnızca yükleme ekranı görünürken canlıdır; ekran
/// kapandığında dispose ile durur, sürekli-frame perf sorunu yaratmaz.
class ScanningArc extends StatefulWidget {
  final double size;
  final Color color;
  final double strokeWidth;

  /// Bir tam turun süresi. Daha kısa → daha hızlı/enerjik dönüş.
  final Duration period;

  const ScanningArc({
    super.key,
    required this.size,
    required this.color,
    this.strokeWidth = 6,
    this.period = const Duration(milliseconds: 1150),
  });

  @override
  State<ScanningArc> createState() => _ScanningArcState();
}

class _ScanningArcState extends State<ScanningArc>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: widget.period,
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: RotationTransition(
        turns: _c,
        child: CustomPaint(
          painter: _SweepArcPainter(widget.color, widget.strokeWidth),
        ),
      ),
    );
  }
}

class _SweepArcPainter extends CustomPainter {
  final Color color;
  final double strokeWidth;
  const _SweepArcPainter(this.color, this.strokeWidth);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - strokeWidth / 2;
    const sweep = math.pi * 0.72; // ~130° görünür kuyruk
    const start = -math.pi / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..shader = SweepGradient(
        startAngle: start,
        endAngle: start + sweep,
        colors: [color.withValues(alpha: 0.0), color.withValues(alpha: 0.95)],
        transform: const GradientRotation(-math.pi / 2),
      ).createShader(rect);
    canvas.drawArc(rect, start, sweep, false, paint);
  }

  @override
  bool shouldRepaint(covariant _SweepArcPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.strokeWidth != strokeWidth;
}
