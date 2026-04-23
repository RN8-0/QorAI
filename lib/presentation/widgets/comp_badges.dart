import 'package:compair/core/constants.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class CompAmountBadge extends StatelessWidget {
  final int? amount;
  final bool unlimited;
  final Color color;
  final double fontSize;
  final EdgeInsetsGeometry padding;

  const CompAmountBadge({
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
        ? '∞ ${AppConstants.compCurrencyName}'
        : '${amount ?? 0} ${AppConstants.compCurrencyName}';

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
          Icon(Icons.monetization_on_rounded, size: fontSize + 3, color: color),
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

class CompBalanceBadge extends StatelessWidget {
  final int remaining;
  final int total;
  final bool unlimited;
  final Color color;
  final double fontSize;
  final EdgeInsetsGeometry padding;

  const CompBalanceBadge({
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
        ? '∞ ${AppConstants.compCurrencyName}'
        : '$remaining/$total ${AppConstants.compCurrencyName}';

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
          Icon(Icons.monetization_on_rounded, size: fontSize + 3, color: color),
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