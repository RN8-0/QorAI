/// Compair - Auth Repository
library;

import 'package:pocketbase/pocketbase.dart';
import 'package:flutter/foundation.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/models/user_model.dart';
import 'package:compair/domain/entities/user_entity.dart';

class AuthRepository {
  final PocketBase _pb;
  final PbDataSource _pbDS;

  AuthRepository({
    PocketBase? pbClient,
    required PbDataSource pbDS,
  })  : _pb = pbClient ?? pb,
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

  /// Google sign-in is currently disabled — native `google_sign_in` package
  /// was removed to fully detach from Google SDKs. Will be re-enabled via
  /// PocketBase native OAuth2 (`authWithOAuth2`) once the PB server has SSL
  /// and Google OAuth2 provider configured.
  Future<Result<UserEntity>> signInWithGoogle() async {
    debugPrint('[auth] signInWithGoogle called but Google provider is disabled');
    return const Failure(AuthException(
      message: 'Google ile giriş şu anda kullanılamıyor. Lütfen e-posta ile giriş yapın.',
    ));
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
