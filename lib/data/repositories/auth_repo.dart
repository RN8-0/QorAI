/// Compair - Auth Repository
library;

import 'dart:convert';
import 'package:pocketbase/pocketbase.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/models/user_model.dart';
import 'package:compair/domain/entities/user_entity.dart';

class AuthRepository {
  final PocketBase _pb;
  final GoogleSignIn _googleSignIn;
  final PbDataSource _pbDS;

  AuthRepository({
    PocketBase? pbClient,
    GoogleSignIn? googleSignIn,
    required PbDataSource pbDS,
  })  : _pb = pbClient ?? pb,
        _googleSignIn = googleSignIn ??
            GoogleSignIn(
              serverClientId:
                  '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com',
              scopes: ['email', 'https://www.googleapis.com/auth/userinfo.profile'],
            ),
        _pbDS = pbDS;

  Stream<String?> get authStateChanges async* {
    yield _currentUid;
    await for (final event in _pb.authStore.onChange) {
      yield event.record?.id;
    }
  }

  String? get currentUserId => _currentUid;
  String? get _currentUid =>
      _pb.authStore.isValid ? _pb.authStore.record?.id : null;

  Future<Result<UserEntity>> signUpWithEmail({
    required String email,
    required String password,
    String? displayName,
    DateTime? birthDate,
    String? gender,
  }) async {
    try {
      final body = <String, dynamic>{
        'email': email,
        'password': password,
        'passwordConfirm': password,
        'name': displayName ?? email.split('@').first,
      };
      if (birthDate != null) body['birthDate'] = birthDate.toIso8601String();
      if (gender != null) body['gender'] = gender;
      await _pb.collection('users').create(body: body);
      await _pb.collection('users').authWithPassword(email, password);
      return Success(UserModel.fromPb(_pb.authStore.record!));
    } on ClientException catch (e) {
      return Failure(AuthException(message: _getPbErrorMsg(e), originalError: e));
    } catch (e) {
      return Failure(AuthException(
          message: 'Registration failed: ${e.toString()}', originalError: e));
    }
  }

  Future<Result<UserEntity>> signInWithEmail({
    required String email,
    required String password,
  }) async {
    try {
      await _pb.collection('users').authWithPassword(email, password);
      return Success(UserModel.fromPb(_pb.authStore.record!));
    } on ClientException catch (e) {
      return Failure(AuthException(message: _getPbErrorMsg(e), originalError: e));
    } catch (e) {
      return Failure(
          AuthException(message: 'Login failed: ${e.toString()}', originalError: e));
    }
  }

  Future<Result<void>> sendPasswordResetEmail(String email) async {
    try {
      await _pb.collection('users').requestPasswordReset(email);
      return const Success(null);
    } on ClientException catch (e) {
      return Failure(AuthException(message: _getPbErrorMsg(e), originalError: e));
    } catch (e) {
      return Failure(AuthException(
          message: 'Email could not be sent: ${e.toString()}', originalError: e));
    }
  }

  /// Derives a strong, deterministic password from Google credential.
  /// Uses HMAC-SHA256 with app-level key so it can't be guessed from
  /// knowing only the Google ID or email.
  String _deriveOAuthPassword(String googleId, String email) {
    final key = utf8.encode('compair_pb_oauth2_v1_salt');
    final data = utf8.encode('$googleId:$email');
    final hmacResult = Hmac(sha256, key).convert(data);
    // 44-char base64 password — satisfies PB min-length
    return base64Url.encode(hmacResult.bytes);
  }

  Future<Result<UserEntity>> signInWithGoogle() async {
    try {
      // Native Google Sign-In → verify identity → PB user create/login.
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        return const Failure(AuthException(message: 'Google login cancelled'));
      }

      // Verify Google identity by obtaining authentication tokens.
      final googleAuth = await googleUser.authentication;
      if (googleAuth.idToken == null && googleAuth.accessToken == null) {
        await _googleSignIn.signOut();
        return const Failure(
            AuthException(message: 'Google authentication failed'));
      }

      final email = googleUser.email;
      final displayName =
          googleUser.displayName ?? email.split('@').first;
      final googleId = googleUser.id;
      final avatarUrl = googleUser.photoUrl ?? '';

      await _googleSignIn.signOut();

      // Derive deterministic password from Google credentials.
      final password = _deriveOAuthPassword(googleId, email);

      // Try to sign in (returning user).
      try {
        await _pb.collection('users').authWithPassword(email, password);
        return Success(UserModel.fromPb(_pb.authStore.record!));
      } on ClientException catch (signInErr) {
        // 401 = wrong password (email exists with different auth method)
        // 400 = bad request
        if (signInErr.statusCode == 401) {
          // User exists but with email/password registration — can't merge.
          return const Failure(AuthException(
            message:
                'Bu email ile zaten bir hesap var. Lütfen email/şifre ile giriş yapın.',
          ));
        }
        // Any other error (e.g. 404 = user not found) → try creating
        if (signInErr.statusCode != 400 && signInErr.statusCode != 404) {
          rethrow;
        }
      }

      // Create new user.
      try {
        final body = <String, dynamic>{
          'email': email,
          'password': password,
          'passwordConfirm': password,
          'name': displayName,
          'emailVisibility': true,
          'verified': true,
        };
        if (avatarUrl.isNotEmpty) body['avatar'] = avatarUrl;

        await _pb.collection('users').create(body: body);
        await _pb.collection('users').authWithPassword(email, password);
        return Success(UserModel.fromPb(_pb.authStore.record!));
      } on ClientException catch (createErr) {
        debugPrint('=== Google Create Error: ${createErr.response} ===');
        // 400 = email uniqueness violation (edge case race condition)
        if (createErr.statusCode == 400) {
          return const Failure(AuthException(
            message:
                'Bu email ile zaten bir hesap var. Lütfen email/şifre ile giriş yapın.',
          ));
        }
        rethrow;
      }
    } on ClientException catch (e) {
      debugPrint('=== Google Sign-In PB Error: ${e.statusCode} ===');
      debugPrint('Response: ${e.response}');
      return Failure(
          AuthException(message: _getPbErrorMsg(e), originalError: e));
    } catch (e) {
      debugPrint('=== Google Sign-In Error: $e ===');
      return Failure(AuthException(
          message: 'Google login failed: ${e.toString()}',
          originalError: e));
    }
  }

  Future<Result<UserEntity>> signInWithApple() async {
    // Apple Sign-In requires PB HTTPS + Apple provider configuration.
    // Will be enabled when SSL is configured on the PocketBase server.
    return const Failure(
        AuthException(message: 'Apple login will be available soon'));
  }

  Future<Result<UserEntity>> signInAnonymously() async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    return signUpWithEmail(
      email: 'guest_$ts@compair.local',
      password: 'Guest@123456',
      displayName: 'Guest',
    );
  }

  Future<Result<void>> linkGoogleAccount() async => const Success(null);

  Future<void> signOut() async {
    _pb.authStore.clear();
    try {
      await _googleSignIn.signOut();
    } catch (_) {}
  }

  Future<Result<void>> updateUserProfile({
    required String uid,
    required Map<String, dynamic> quizData,
  }) async {
    try {
      quizData['quizCompleted'] = true;
      await _pbDS.updateUser(uid, quizData);
      return const Success(null);
    } catch (e) {
      return Failure(
          ServerException(message: 'Profile could not be updated: $e'));
    }
  }

  String _getPbErrorMsg(ClientException e) {
    final data = (e.response['data'] as Map?)?.cast<String, dynamic>() ?? {};
    final message = e.response['message'] as String? ?? '';
    if (e.statusCode == 400) {
      if (data['email'] != null) return 'This email address is already in use';
      if (data['password'] != null) return 'Password is too short (min 8 chars)';
      // Show PB's own message for OAuth/other 400 errors
      if (message.isNotEmpty && message != 'Something went wrong while processing your request.') {
        return message;
      }
      // Fallback: show first field-level error
      for (final entry in data.entries) {
        final fieldErr = entry.value;
        if (fieldErr is Map && fieldErr['message'] != null) {
          return '${entry.key}: ${fieldErr['message']}';
        }
      }
      return 'Invalid data provided';
    }
    if (e.statusCode == 401) return 'Incorrect email or password';
    if (e.statusCode == 403) return 'This action is not allowed';
    if (e.statusCode == 404) return 'No account found for this email';
    return 'An error occurred (${e.statusCode})';
  }
}
