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
    final label = unlimited
        ? '∞ ${AppConstants.qorCurrencyName}'
        : '${amount ?? 0} ${AppConstants.qorCurrencyName}';

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
    final label = unlimited
        ? '∞ ${AppConstants.qorCurrencyName}'
        : '$remaining/$total ${AppConstants.qorCurrencyName}';

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
      child: Center(
        child: Text(
          'Q',
          style: GoogleFonts.plusJakartaSans(
            fontSize: size * 0.54,
            fontWeight: FontWeight.w800,
            color: Colors.white,
            height: 1,
          ),
        ),
      ),
    );
  }
}