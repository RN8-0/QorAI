import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  static const List<String> _genderValues = <String>[
    'Male',
    'Female',
    'Non-binary',
    'Prefer not to say',
  ];

  final TextEditingController _nameController = TextEditingController();
  DateTime? _birthDate;
  String? _gender;
  bool _saving = false;
  bool _didSeedInitialData = false;
  bool _isOAuthUser = false;

  @override
  void initState() {
    super.initState();
    final authRecord = pb.authStore.record;
    _nameController.text = _resolveDisplayName(null, authRecord);
    _gender = _normalizeGender(null);
    _didSeedInitialData = true;
    _checkOAuthStatus();
  }

  Future<void> _checkOAuthStatus() async {
    final uid = pb.authStore.record?.id;
    if (uid == null) return;
    // Fast local check: Google sign-in stores googleEmail on the record
    final googleEmail =
        pb.authStore.record?.data['googleEmail'] as String? ?? '';
    if (googleEmail.isNotEmpty) {
      if (mounted) setState(() => _isOAuthUser = true);
      return;
    }
    // Server check via REST: any linked external auth (Google, Apple, etc.)
    try {
      final result = await pb.send(
        '/api/collections/users/records/$uid/external-auths',
      );
      final list = result is List ? result : (result as Map?)?.values.toList();
      if ((list?.isNotEmpty ?? false) && mounted) {
        setState(() => _isOAuthUser = true);
      }
    } catch (_) {
      // Ignore — fall back to allowing edits
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(userProfileProvider).valueOrNull;
    final authRecord = pb.authStore.record;
    final resolvedName = _resolveDisplayName(user, authRecord);
    final resolvedEmail = _resolveEmail(user, authRecord);
    final resolvedPhotoUrl = _resolvePhotoUrl(user, authRecord);
    final resolvedBirthDate = user?.birthDate;
    final resolvedGender = _normalizeGender(user?.gender);

    if (_didSeedInitialData && user != null) {
      _didSeedInitialData = false;
      _nameController.text = resolvedName;
      _birthDate = resolvedBirthDate;
      _gender = resolvedGender;
    }

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: context.backgroundColor,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back_rounded, color: AppTheme.neonCyan),
        ),
        title: Text(
          context.l10n?.editProfile ?? 'Edit Profile',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: context.textPrimary,
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeroCard(
                name: resolvedName,
                email: resolvedEmail,
                photoUrl: resolvedPhotoUrl,
              ),
              const SizedBox(height: 24),
              _buildSectionLabel(context.l10n?.profile ?? 'Profile'),
              const SizedBox(height: 8),
              _buildFormCard(
                children: [
                  if (_isOAuthUser)
                    _buildReadOnlyField(
                      label: context.l10n?.fullName ?? 'Full Name',
                      value: resolvedName,
                      icon: Icons.person_outline_rounded,
                    )
                  else
                    _buildTextField(
                      controller: _nameController,
                      label: context.l10n?.fullName ?? 'Full Name',
                      hint: context.l10n?.fullName ?? 'Full Name',
                      icon: Icons.person_outline_rounded,
                    ),
                  const SizedBox(height: 14),
                  _buildReadOnlyField(
                    label: context.l10n?.email ?? 'Email',
                    value: resolvedEmail,
                    icon: Icons.alternate_email_rounded,
                  ),
                  const SizedBox(height: 14),
                  _buildDateField(context),
                  const SizedBox(height: 14),
                  _buildGenderField(context),
                ],
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _saving ? null : () => _saveProfile(context),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppTheme.neonCyan,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _saving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          context.l10n?.save ?? 'Save',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeroCard({
    required String name,
    required String email,
    required String photoUrl,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : AppTheme.brandCyan.withValues(alpha: 0.12),
        ),
        boxShadow: isDark ? null : AppTheme.subtleShadow,
      ),
      child: Row(
        children: [
          _AvatarPreview(photoUrl: photoUrl, name: name, size: 72),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  email,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Text(
        label.toUpperCase(),
        style: GoogleFonts.plusJakartaSans(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: context.textTertiaryColor,
          letterSpacing: 0.6,
        ),
      ),
    );
  }

  Widget _buildFormCard({required List<Widget> children}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : AppTheme.brandCyan.withValues(alpha: 0.12),
        ),
        boxShadow: isDark ? null : AppTheme.subtleShadow,
      ),
      child: Column(children: children),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
  }) {
    return TextField(
      controller: controller,
      style: TextStyle(color: context.textPrimary),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, color: context.textSecondary, size: 20),
        filled: true,
        fillColor: Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: 0.04)
            : context.surfaceVariantColor,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }

  Widget _buildReadOnlyField({
    required String label,
    required String value,
    required IconData icon,
  }) {
    return InputDecorator(
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: context.textSecondary, size: 20),
        filled: true,
        fillColor: Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: 0.03)
            : context.surfaceVariantColor.withValues(alpha: 0.9),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
      ),
      child: Text(
        value,
        style: TextStyle(color: context.textSecondary),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _buildDateField(BuildContext context) {
    final formatted = _birthDate == null
        ? (context.l10n?.birthDate ?? 'Birth Date')
        : DateFormat('MMMM d, yyyy').format(_birthDate!);
    return InkWell(
      onTap: _saving ? null : () => _pickBirthDate(context),
      borderRadius: BorderRadius.circular(16),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: context.l10n?.birthDate ?? 'Birth Date',
          prefixIcon: Icon(
            Icons.calendar_today_rounded,
            color: context.textSecondary,
            size: 20,
          ),
          filled: true,
          fillColor: Theme.of(context).brightness == Brightness.dark
              ? Colors.white.withValues(alpha: 0.04)
              : context.surfaceVariantColor,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
        ),
        child: Text(
          formatted,
          style: TextStyle(
            color: _birthDate == null
                ? context.textSecondary
                : context.textPrimary,
          ),
        ),
      ),
    );
  }

  Widget _buildGenderField(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: _gender,
      decoration: InputDecoration(
        labelText: context.l10n?.gender ?? 'Gender',
        prefixIcon: Icon(
          Icons.wc_rounded,
          color: context.textSecondary,
          size: 20,
        ),
        filled: true,
        fillColor: Theme.of(context).brightness == Brightness.dark
            ? Colors.white.withValues(alpha: 0.04)
            : context.surfaceVariantColor,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
      ),
      dropdownColor: context.surfaceElevatedColor,
      items: _genderValues
          .map(
            (value) => DropdownMenuItem<String>(
              value: value,
              child: Text(_localizedGender(context, value)),
            ),
          )
          .toList(),
      onChanged: _saving
          ? null
          : (value) {
              setState(() => _gender = value);
            },
    );
  }

  Future<void> _pickBirthDate(BuildContext context) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate ?? DateTime(2000),
      firstDate: DateTime(1920),
      lastDate: DateTime.now(),
    );
    if (picked == null) return;
    setState(() => _birthDate = picked);
  }

  Future<void> _saveProfile(BuildContext context) async {
    final uid = pb.authStore.record?.id;
    if (uid == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final l10n = context.l10n;

    final newName = _nameController.text.trim();
    if (newName.isEmpty && !_isOAuthUser) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Display name cannot be empty.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final body = <String, dynamic>{
        // Only update name fields if not an OAuth user
        if (!_isOAuthUser) 'displayName': newName,
        if (!_isOAuthUser) 'name': newName,
        'gender': _gender,
        if (_birthDate != null) 'birthDate': _birthDate!.toIso8601String(),
      };
      await ref.read(pbDataSourceProvider).updateUser(uid, body);
      _syncAuthStore(body);
      ref.invalidate(userProfileProvider);
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Profile updated.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      router.pop();
    } catch (error) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            l10n?.failedToSaveProfile(error.toString()) ??
                'Failed to save profile: $error',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  void _syncAuthStore(Map<String, dynamic> updates) {
    final record = pb.authStore.record;
    if (record == null) return;

    final json = Map<String, dynamic>.from(record.toJson())..addAll(updates);
    pb.authStore.save(pb.authStore.token, RecordModel.fromJson(json));
  }

  String _resolveDisplayName(UserEntity? user, RecordModel? authRecord) {
    final userName = user?.displayName.trim() ?? '';
    if (userName.isNotEmpty) return userName;

    final displayName = authRecord?.getStringValue('displayName').trim() ?? '';
    if (displayName.isNotEmpty) return displayName;

    final name = authRecord?.getStringValue('name').trim() ?? '';
    if (name.isNotEmpty) return name;

    final email = _resolveEmail(user, authRecord);
    if (email.isNotEmpty) return email.split('@').first;

    return context.l10n?.user ?? 'User';
  }

  String _resolveEmail(UserEntity? user, RecordModel? authRecord) {
    final userEmail = user?.email.trim() ?? '';
    if (userEmail.isNotEmpty) return userEmail;

    return authRecord?.getStringValue('email').trim() ?? '';
  }

  String _resolvePhotoUrl(UserEntity? user, RecordModel? authRecord) {
    final userPhoto = (user?.photoURL ?? '').trim();
    if (userPhoto.isNotEmpty && !_isGeneratedAvatarUrl(userPhoto)) {
      return userPhoto;
    }

    final authPhoto = authRecord?.getStringValue('photoURL').trim() ?? '';
    if (authPhoto.isNotEmpty && !_isGeneratedAvatarUrl(authPhoto)) {
      return authPhoto;
    }

    return '';
  }

  String? _normalizeGender(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) return null;
    for (final item in _genderValues) {
      if (item.toLowerCase() == trimmed.toLowerCase()) {
        return item;
      }
    }
    return null;
  }

  String _localizedGender(BuildContext context, String gender) {
    switch (gender) {
      case 'Male':
        return context.l10n?.male ?? gender;
      case 'Female':
        return context.l10n?.female ?? gender;
      case 'Non-binary':
        return context.l10n?.nonBinary ?? gender;
      case 'Prefer not to say':
        return context.l10n?.preferNotToSay ?? gender;
      default:
        return gender;
    }
  }

  bool _isGeneratedAvatarUrl(String photoUrl) {
    return photoUrl.trim().toLowerCase().contains('ui-avatars.com');
  }
}

class _AvatarPreview extends StatelessWidget {
  final String photoUrl;
  final String name;
  final double size;

  const _AvatarPreview({
    required this.photoUrl,
    required this.name,
    required this.size,
  });

  @override
  Widget build(BuildContext context) {
    final radius = size / 2;
    if (photoUrl.isNotEmpty) {
      return CircleAvatar(
        radius: radius,
        backgroundColor: Colors.transparent,
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: photoUrl,
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) => _fallback(radius),
          ),
        ),
      );
    }
    return _fallback(radius);
  }

  Widget _fallback(double radius) {
    return _GeneratedAvatar(name: name, radius: radius);
  }
}

class _GeneratedAvatar extends StatelessWidget {
  final String name;
  final double radius;

  const _GeneratedAvatar({required this.name, required this.radius});

  static const List<List<Color>> _avatarPalettes = [
    [Color(0xFF0EA5E9), Color(0xFF2563EB)],
    [Color(0xFF06B6D4), Color(0xFF0F766E)],
    [Color(0xFF8B5CF6), Color(0xFF4F46E5)],
    [Color(0xFFF97316), Color(0xFFEA580C)],
    [Color(0xFF10B981), Color(0xFF059669)],
  ];

  @override
  Widget build(BuildContext context) {
    final palette = _avatarPalettes[_avatarSeed(name) % _avatarPalettes.length];
    final initials = _avatarInitials(name);
    return Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: palette,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: palette.last.withValues(alpha: 0.22),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Stack(
        children: [
          Center(
            child: Text(
              initials,
              style: GoogleFonts.plusJakartaSans(
                color: Colors.white,
                fontSize: radius * 0.62,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.8,
              ),
            ),
          ),
        ],
      ),
    );
  }

  int _avatarSeed(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return 0;
    return trimmed.codeUnits.fold<int>(0, (sum, unit) => sum + unit);
  }

  String _avatarInitials(String value) {
    final parts = value
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) return 'Q';
    if (parts.length == 1) {
      final part = parts.first;
      return part.substring(0, part.length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}
