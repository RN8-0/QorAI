/// Compair - Privacy Policy & Terms of Service Screen
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';

enum LegalDocType { privacyPolicy, termsOfService, faq }

class LegalScreen extends StatelessWidget {
  final LegalDocType docType;

  const LegalScreen({super.key, required this.docType});

  @override
  Widget build(BuildContext context) {
    final title = switch (docType) {
      LegalDocType.privacyPolicy => context.l10n?.privacyPolicyTitle ?? 'Privacy Policy',
      LegalDocType.termsOfService => context.l10n?.termsOfServiceTitle ?? 'Terms of Service',
      LegalDocType.faq => context.l10n?.faqTitle ?? 'FAQ',
    };
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.backgroundColor,
        elevation: 0,
        leading: Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: context.surfaceVariantColor,
            border: Border.all(
              color: context.dividerColor,
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.white.withValues(alpha: 0.06),
                blurRadius: 12,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => Navigator.pop(context),
              borderRadius: BorderRadius.circular(20),
              child: Icon(
                Icons.arrow_back_rounded,
                color: context.textPrimary,
                size: 20,
              ),
            ),
          ),
        ),
        title: Text(
          title,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: context.textPrimary,
            letterSpacing: -0.3,
          ),
        ),
        centerTitle: true,
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 800),
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: switch (docType) {
              LegalDocType.privacyPolicy => const _PrivacyPolicyContent(),
              LegalDocType.termsOfService => const _TermsContent(),
              LegalDocType.faq => const _FaqContent(),
            },
          ),
        ),
      ),
    );
  }
}

// ─── Section widget ───────────────────────────────────────────

class _Section extends StatelessWidget {
  final String title;
  final String body;

  const _Section({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppTheme.primaryBlue,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            body,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 15,
              height: 1.72,
              color: context.textSecondary,
              fontWeight: FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Privacy Policy ──────────────────────────────────────────

class _PrivacyPolicyContent extends StatelessWidget {
  const _PrivacyPolicyContent();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Last updated: April 2026',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            height: 1.72,
            color: context.textTertiaryColor,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'Effective date: April 2026',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            height: 1.72,
            color: context.textTertiaryColor,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 32),
        const _Section(
          title: '1. Introduction',
          body:
              'Welcome to Compair ("we", "our", or "us"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application. Please read this policy carefully. If you disagree with its terms, please discontinue use of the application.',
        ),
        const _Section(
          title: '2. Information We Collect',
          body:
              'We may collect the following types of information:\n\n'
              '• Account information: email address, display name, and profile photo when you sign in with Google or Apple.\n'
              '• Usage data: features you use, products you compare, searches you make, and how you interact with the app.\n'
              '• Device information: device type, operating system, unique device identifiers, and crash reports.\n'
              '• Analytics data: aggregated, anonymized usage statistics to improve our service.',
        ),
        const _Section(
          title: '3. How We Use Your Information',
          body:
              'We use the information we collect to:\n\n'
              '• Provide, maintain, and improve the Compair service.\n'
              '• Personalize your product recommendations and comparisons.\n'
              '• Process subscription payments via RevenueCat.\n'
              '• Send you service-related communications.\n'
              '• Monitor and analyze usage patterns to improve user experience.\n'
              '• Detect and prevent fraudulent activity.',
        ),
        const _Section(
          title: '4. AI-Generated Content',
          body:
              'Compair uses artificial intelligence (powered by DeepSeek) to generate product review summaries and analysis. '
              'These summaries are automatically generated and may not reflect the views of any specific individual. '
              'AI-generated content is clearly labeled within the app. We recommend verifying important information from additional sources.',
        ),
        const _Section(
          title: '5. Third-Party Services',
          body:
              'Our application uses the following third-party services, each with their own privacy policies:\n\n'
              '• Google Sign-In: Optional account authentication.\n'
              '• PocketBase: Authentication and application database.\n'
              '• RevenueCat: Subscription management and payment processing.\n'
              '• Gemini / DeepSeek AI: AI-powered product analysis.\n'
              '• YouTube: Product review videos (subject to YouTube\'s Terms of Service).\n\n'
              'We do not sell your personal data to third parties.',
        ),
        const _Section(
          title: '6. Data Retention',
          body:
              'We retain your personal data for as long as your account is active or as needed to provide services. '
              'You may request deletion of your account and associated data at any time by contacting us at the address below.',
        ),
        const _Section(
          title: '7. Children\'s Privacy',
          body:
              'Compair is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13. '
              'If we discover we have collected information from a child under 13, we will delete it immediately.',
        ),
        const _Section(
          title: '8. Your Rights (GDPR / CCPA)',
          body:
              'Depending on your location, you may have the right to:\n\n'
              '• Access the personal data we hold about you.\n'
              '• Correct inaccurate data.\n'
              '• Request deletion of your data ("right to be forgotten").\n'
              '• Object to or restrict processing of your data.\n'
              '• Data portability.\n\n'
              'To exercise any of these rights, contact us at privacy@compairapp.com.',
        ),
        const _Section(
          title: '9. Security',
          body:
              'We implement industry-standard security measures to protect your information. '
              'However, no method of transmission over the internet or electronic storage is 100% secure. '
              'We cannot guarantee absolute security.',
        ),
        const _Section(
          title: '10. Changes to This Policy',
          body:
              'We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date. '
              'Continued use of the app after changes constitutes acceptance of the revised policy.',
        ),
        const _Section(
          title: '11. Contact Us',
          body:
              'If you have questions about this Privacy Policy, please contact us:\n\n'
              'Email: privacy@compairapp.com\n'
              'Compair App — Product Comparison Platform',
        ),
        const SizedBox(height: 40),
      ],
    );
  }
}

// ─── Terms of Service ─────────────────────────────────────────

class _TermsContent extends StatelessWidget {
  const _TermsContent();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Last updated: April 2026',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            height: 1.72,
            color: context.textTertiaryColor,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 32),
        const _Section(
          title: '1. Acceptance of Terms',
          body:
              'By downloading, installing, or using Compair, you agree to be bound by these Terms of Service. '
              'If you do not agree, do not use the application.',
        ),
        const _Section(
          title: '2. Use of the Service',
          body:
              'Compair provides a product comparison platform for personal, non-commercial use. You agree not to:\n\n'
              '• Use the service for any unlawful purpose.\n'
              '• Attempt to gain unauthorized access to any part of the service.\n'
              '• Reproduce, duplicate, or resell any part of the service without written permission.\n'
              '• Interfere with or disrupt the integrity of the service.',
        ),
        const _Section(
          title: '3. Subscriptions',
          body:
              'Compair offers free and premium subscription tiers. Premium subscriptions are billed through Apple App Store or Google Play Store. '
              'Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. '
              'You can manage or cancel subscriptions in your device\'s App Store / Play Store account settings.',
        ),
        const _Section(
          title: '4. Content Accuracy',
          body:
              'Product specifications, prices, and AI-generated summaries are provided for informational purposes only. '
              'We do not guarantee the accuracy, completeness, or timeliness of any information. '
              'Always verify specifications directly with the manufacturer before making purchase decisions.',
        ),
        const _Section(
          title: '5. Intellectual Property',
          body:
              'All content within Compair (design, code, text, graphics) is the property of Compair or its licensors. '
              'Product images and specifications are the property of their respective owners.',
        ),
        const _Section(
          title: '6. Disclaimer of Warranties',
          body:
              'THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. '
              'WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES.',
        ),
        const _Section(
          title: '7. Limitation of Liability',
          body:
              'TO THE MAXIMUM EXTENT PERMITTED BY LAW, COMPAIR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, '
              'SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE.',
        ),
        const _Section(
          title: '8. Changes to Terms',
          body:
              'We reserve the right to modify these Terms at any time. Continued use after changes constitutes acceptance.',
        ),
        const _Section(
          title: '9. Contact',
          body:
              'Questions about these Terms? Contact us at:\n\nEmail: legal@compairapp.com',
        ),
        const SizedBox(height: 40),
      ],
    );
  }
}

// ─── FAQ Content ─────────────────────────────────────────────

class _FaqContent extends StatelessWidget {
  const _FaqContent();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Frequently Asked Questions',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Everything you need to know about Compair',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            color: context.textSecondary,
          ),
        ),
        const SizedBox(height: 32),
        const _FaqItem(
          question: 'What is Compair?',
          answer:
              'Compair is an AI-powered product comparison platform that helps you find the perfect tech product. '
              'We use advanced algorithms to analyze products, compare specifications, and provide personalized '
              'recommendations based on your unique preferences and needs.',
        ),
        const _FaqItem(
          question: 'How does the AI compatibility score work?',
          answer:
              'Our compatibility score is calculated using a multi-dimensional algorithm that considers your personal '
              'preferences (40%), community ratings (25%), expert reviews (20%), and price-value ratio (15%). '
              'The more you use Compair, the more accurate your scores become as the system learns your preferences.',
        ),
        const _FaqItem(
          question: 'What is the Link Analysis feature?',
          answer:
              'Link Analysis lets you paste any product URL from popular e-commerce sites. Our AI analyzes the product, '
              'generates a quiz to understand your specific needs, and then calculates a personalized compatibility score. '
              'You can also compare multiple links side-by-side to find the best match for you.',
        ),
        const _FaqItem(
          question: 'Which product categories are supported?',
          answer:
              'We support over 40 product categories including smartphones, laptops, tablets, GPUs, CPUs, monitors, '
              'headphones, cameras, smartwatches, TVs, gaming consoles, and many more. We\'re constantly adding new categories.',
        ),
        const _FaqItem(
          question: 'How does the subscription comparison work?',
          answer:
              'Our subscription comparison feature lets you compare digital services like Spotify, Netflix, YouTube Premium, '
              'and more. AI analyzes each service\'s plans, features, and pricing to help you find the best value based on your usage patterns.',
        ),
        const _FaqItem(
          question: 'Is my data safe?',
          answer:
              'Yes. We use PocketBase-backed infrastructure with industry-standard encryption. Your personal data is never sold to third parties. '
              'We collect usage data only to improve your recommendations. You can request data deletion at any time.',
        ),
        const _FaqItem(
          question: 'Can I use Compair for free?',
          answer:
              'Yes! Compair offers a generous free tier with access to product comparisons, basic AI analysis, and personalized '
              'recommendations. Premium features include unlimited link analyses, advanced AI insights, and priority support.',
        ),
        const _FaqItem(
          question: 'How do I delete my account?',
          answer:
              'You can delete your account from Settings > Account > Delete Account. This will permanently remove '
              'all your data including preferences, comparisons, and saved products. This action cannot be undone.',
        ),
        const _FaqItem(
          question: 'What AI technology does Compair use?',
          answer:
              'Compair uses Gemini 2.5 Flash for real-time product analysis, link parsing, and conversational AI features. '
              'Our proprietary algorithm combines AI insights with collaborative filtering to deliver accurate recommendations.',
        ),
        const _FaqItem(
          question: 'How do I contact support?',
          answer:
              'You can reach us at support@compairapp.com or use the AI Chat feature within the app for instant help. '
              'We typically respond to emails within 24 hours.',
        ),
        const SizedBox(height: 40),
      ],
    );
  }
}

class _FaqItem extends StatefulWidget {
  final String question;
  final String answer;
  const _FaqItem({required this.question, required this.answer});

  @override
  State<_FaqItem> createState() => _FaqItemState();
}

class _FaqItemState extends State<_FaqItem> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: _expanded ? AppTheme.primaryBlue.withValues(alpha: 0.04) : context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _expanded ? AppTheme.primaryBlue.withValues(alpha: 0.2) : context.dividerColor,
        ),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.question,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: _expanded ? AppTheme.primaryBlue : context.textPrimary,
                        ),
                      ),
                    ),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: _expanded ? AppTheme.primaryBlue : AppTheme.slate400,
                      ),
                    ),
                  ],
                ),
                AnimatedCrossFade(
                  firstChild: const SizedBox.shrink(),
                  secondChild: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      widget.answer,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        height: 1.65,
                        color: context.textSecondary,
                      ),
                    ),
                  ),
                  crossFadeState: _expanded
                      ? CrossFadeState.showSecond
                      : CrossFadeState.showFirst,
                  duration: const Duration(milliseconds: 200),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
