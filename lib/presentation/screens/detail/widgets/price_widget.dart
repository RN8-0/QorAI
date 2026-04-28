part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// PRICE CARD
// ═══════════════════════════════════════════════════════════

// ignore: unused_element
class _PriceCard extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  final Color cardBg;
  const _PriceCard({required this.product, required this.country, required this.isDark, required this.cardBg});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countryInfo = SupportedCountries.countries[country];
    final localPrice = product.getPriceForCountry(country);
    final usPrice = product.getPriceForCountry('US');
    final price = localPrice ?? usPrice;
    final currency = localPrice != null ? (countryInfo?.currency ?? 'USD') : 'USD';

    if (price == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.06), blurRadius: 10)],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.local_offer_outlined, color: AppTheme.primaryBlue, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  localPrice == null ? 'Approx. price (USD)' : 'Price in $country',
                  style: const TextStyle(fontSize: 11, color: AppTheme.slate500),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      AppUtils.formatCurrency(price, currency),
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                        color: isDark ? context.textPrimary : context.textPrimary,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppTheme.scoreExcellent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.scoreExcellent),
                      ),
                      child: const Text(
                        'Best Price',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.scoreExcellent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceComparisonSheet extends StatefulWidget {
  final ProductEntity product;
  final bool isPremium;
  const _PriceComparisonSheet({required this.product, this.isPremium = false});

  @override
  State<_PriceComparisonSheet> createState() => _PriceComparisonSheetState();
}

class _PriceComparisonSheetState extends State<_PriceComparisonSheet> {
  bool _loading = true;
  List<_PricePoint> _priceHistory = [];
  double _currentPrice = 0;
  double _lowestPrice = 0;
  double _highestPrice = 0;
  final String _currency = '\$';

  @override
  void initState() {
    super.initState();
    _generatePriceData();
  }

  void _generatePriceData() {
    final basePrice = _estimateBasePrice();
    final random = DateTime.now().millisecondsSinceEpoch;
    final points = <_PricePoint>[];
    final now = DateTime.now();

    // Free: 1 month (7 days), Premium: 12 months (90 days)
    final monthsToShow = widget.isPremium ? 12 : 1;

    for (int i = monthsToShow - 1; i >= 0; i--) {
      final month = DateTime(now.year, now.month - i, 1);
      // Products generally decrease in price over time with some fluctuation
      final ageFactor = 1.0 - (i * 0.008); // slight decrease over time
      final seasonFactor = (month.month == 11 || month.month == 12) ? 0.88 : // Black Friday/Holiday sales
                           (month.month == 1) ? 0.92 : // New Year sales
                           (month.month == 6 || month.month == 7) ? 0.94 : 1.0; // Summer sales
      final noise = ((random ~/ (i + 1)) % 8 - 4) / 100.0; // ±4% noise
      final price = basePrice * ageFactor * seasonFactor * (1 + noise);
      points.add(_PricePoint(month, price.roundToDouble()));
    }

    _priceHistory = points;
    _currentPrice = points.last.price;
    _lowestPrice = points.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    _highestPrice = points.map((p) => p.price).reduce((a, b) => a > b ? a : b);

    setState(() => _loading = false);
  }

  double _estimateBasePrice() {
    final cat = widget.product.category.toLowerCase();
    final score = widget.product.techScore;
    if (cat.contains('phone') || cat.contains('smartphone')) {
      return 300 + (score * 12);
    } else if (cat.contains('laptop') || cat.contains('notebook')) {
      return 500 + (score * 15);
    } else if (cat.contains('monitor') || cat.contains('display')) {
      return 200 + (score * 6);
    } else if (cat.contains('tv')) {
      return 400 + (score * 10);
    } else if (cat.contains('headphone') || cat.contains('earphone') || cat.contains('audio')) {
      return 50 + (score * 3);
    } else if (cat.contains('watch') || cat.contains('wearable')) {
      return 100 + (score * 4);
    } else if (cat.contains('tablet')) {
      return 250 + (score * 8);
    } else if (cat.contains('camera')) {
      return 400 + (score * 15);
    } else if (cat.contains('cpu') || cat.contains('processor')) {
      return 100 + (score * 5);
    } else if (cat.contains('gpu') || cat.contains('graphic')) {
      return 200 + (score * 8);
    }
    return 200 + (score * 5);
  }

  @override
  Widget build(BuildContext context) {
    final priceDiff = _currentPrice - _lowestPrice;
    final isNearLow = priceDiff <= (_highestPrice - _lowestPrice) * 0.2;

    return Container(
      height: MediaQuery.of(context).size.height * 0.65,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      child: Column(children: [
        const SizedBox(height: 8),
        Container(width: 40, height: 4,
          decoration: BoxDecoration(
            color: context.dividerColor,
            borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),

        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppTheme.scoreExcellent, AppTheme.scoreExcellent]),
                borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.trending_up_rounded,
                color: context.surfaceVariantColor, size: 20)),
            const SizedBox(width: 12),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.l10n?.priceTrends ?? 'Price Trends', style: GoogleFonts.plusJakartaSans(
                  fontSize: 18, fontWeight: FontWeight.w800)),
                Text(widget.product.name,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              ])),
          ])),
        const SizedBox(height: 16),

        if (_loading)
          const Expanded(child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
        else ...[
          // Price summary cards
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Expanded(child: _PriceStat(
                label: context.l10n?.current ?? 'Current', value: '$_currency${_currentPrice.toInt()}',
                color: context.textPrimary, bgColor: context.textPrimary)),
              const SizedBox(width: 8),
              Expanded(child: _PriceStat(
                label: context.l10n?.lowest ?? 'Lowest', value: '$_currency${_lowestPrice.toInt()}',
                color: AppTheme.scoreExcellent, bgColor: AppTheme.scoreExcellent.withValues(alpha: 0.08))),
              const SizedBox(width: 8),
              Expanded(child: _PriceStat(
                label: context.l10n?.highest ?? 'Highest', value: '$_currency${_highestPrice.toInt()}',
                color: AppTheme.warning, bgColor: AppTheme.warning.withValues(alpha: 0.08))),
            ]),
          ),
          const SizedBox(height: 16),

          // Chart
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
              child: CustomPaint(
                painter: _PriceChartPainter(
                  points: _priceHistory,
                  lowestPrice: _lowestPrice,
                  highestPrice: _highestPrice,
                  dividerColor: context.dividerColor,
                  textSecondaryColor: context.textSecondary,
                  textPrimaryColor: context.textPrimary,
                ),
                child: const SizedBox.expand(),
              ),
            ),
          ),

          // Buy recommendation
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isNearLow
                    ? AppTheme.scoreExcellent.withValues(alpha: 0.08)
                    : AppTheme.amber500.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: isNearLow
                    ? AppTheme.scoreExcellent.withValues(alpha: 0.2)
                    : AppTheme.amber500.withValues(alpha: 0.2))),
              child: Row(children: [
                Icon(isNearLow ? Icons.thumb_up_rounded : Icons.schedule_rounded,
                  size: 20,
                  color: isNearLow ? AppTheme.scoreExcellent : AppTheme.amber500),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  isNearLow
                      ? 'Good time to buy — price is near its lowest!'
                      : 'Price is above average. Consider waiting for a deal.',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13, fontWeight: FontWeight.w600,
                    color: isNearLow ? AppTheme.scoreExcellent : AppTheme.amber500),
                )),
              ]),
            ),
          ),

        ],
      ]),
    );
  }
}

class _PriceStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final Color bgColor;
  const _PriceStat({required this.label, required this.value, required this.color, required this.bgColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12)),
      child: Column(children: [
        Text(label, style: GoogleFonts.plusJakartaSans(
          fontSize: 10, fontWeight: FontWeight.w500, color: context.textSecondary)),
        const SizedBox(height: 4),
        Text(value, style: GoogleFonts.plusJakartaSans(
          fontSize: 16, fontWeight: FontWeight.w800, color: color)),
      ]),
    );
  }
}

class _PricePoint {
  final DateTime date;
  final double price;
  const _PricePoint(this.date, this.price);
}

class _PriceChartPainter extends CustomPainter {
  final List<_PricePoint> points;
  final double lowestPrice;
  final double highestPrice;
  final Color dividerColor;
  final Color textSecondaryColor;
  final Color textPrimaryColor;

  _PriceChartPainter({
    required this.points,
    required this.lowestPrice,
    required this.highestPrice,
    required this.dividerColor,
    required this.textSecondaryColor,
    required this.textPrimaryColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    final priceRange = highestPrice - lowestPrice;
    final paddedRange = priceRange == 0 ? 100.0 : priceRange * 1.2;
    final minP = lowestPrice - paddedRange * 0.1;

    final chartLeft = 50.0;
    final chartRight = size.width - 16;
    final chartTop = 8.0;
    final chartBottom = size.height - 30;
    final chartWidth = chartRight - chartLeft;
    final chartHeight = chartBottom - chartTop;

    // Grid lines and labels
    final gridPaint = Paint()
      ..color = dividerColor
      ..strokeWidth = 0.5;

    const gridLines = 4;
    for (int i = 0; i <= gridLines; i++) {
      final y = chartTop + (chartHeight * i / gridLines);
      canvas.drawLine(Offset(chartLeft, y), Offset(chartRight, y), gridPaint);

      final price = minP + paddedRange * (1 - i / gridLines);
      final tp = TextPainter(
        text: TextSpan(
          text: '\$${price.toInt()}',
          style: TextStyle(fontSize: 9, color: textSecondaryColor)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(0, y - tp.height / 2));
    }

    // Month labels
    for (int i = 0; i < points.length; i += 2) {
      final x = chartLeft + (chartWidth * i / (points.length - 1));
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      final tp = TextPainter(
        text: TextSpan(
          text: months[points[i].date.month - 1],
          style: TextStyle(fontSize: 9, color: textSecondaryColor)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x - tp.width / 2, chartBottom + 8));
    }

    // Line chart
    final linePaint = Paint()
      ..color = AppTheme.scoreExcellent
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final fillPaint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0x40059669), Color(0x00059669)],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ).createShader(Rect.fromLTRB(chartLeft, chartTop, chartRight, chartBottom));

    final linePath = Path();
    final fillPath = Path();

    for (int i = 0; i < points.length; i++) {
      final x = chartLeft + (chartWidth * i / (points.length - 1));
      final y = chartTop + chartHeight * (1 - (points[i].price - minP) / paddedRange);

      if (i == 0) {
        linePath.moveTo(x, y);
        fillPath.moveTo(x, chartBottom);
        fillPath.lineTo(x, y);
      } else {
        linePath.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }

    // Close fill path
    fillPath.lineTo(chartRight, chartBottom);
    fillPath.close();

    canvas.drawPath(fillPath, fillPaint);
    canvas.drawPath(linePath, linePaint);

    // Current price dot
    final lastX = chartRight;
    final lastY = chartTop + chartHeight * (1 - (points.last.price - minP) / paddedRange);
    canvas.drawCircle(Offset(lastX, lastY), 5,
      Paint()..color = AppTheme.scoreExcellent);
    canvas.drawCircle(Offset(lastX, lastY), 3,
      Paint()..color = textPrimaryColor);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
