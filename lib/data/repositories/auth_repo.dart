/// Compair - Auth Repository
library;

import 'package:pocketbase/pocketbase.dart';
import 'package:google_sign_in/google_sign_in.dart';
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
      yield event.model?.id as String?;
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

  Future<Result<UserEntity>> signInWithGoogle() async {
    try {
      // Native Google Sign-In → get auth code → PB code exchange.
      // This avoids browser redirect (PB HTTPS not configured for OAuth redirect).
      final googleUser = await _googleSignIn.signIn();
      if (googleUser == null) {
        return const Failure(AuthException(message: 'Google login cancelled'));
      }

      final serverAuthCode = googleUser.serverAuthCode;
      if (serverAuthCode == null) {
        await _googleSignIn.signOut();
        return const Failure(
            AuthException(message: 'Failed to get Google auth code'));
      }

      // Exchange the mobile auth code with PocketBase.
      // Empty redirectURL + codeVerifier for mobile-sourced codes.
      final authData = await _pb.collection('users').authWithOAuth2Code(
        'google',
        serverAuthCode,
        '', // no PKCE for mobile codes
        '', // empty redirect for mobile auth codes
        createData: {
          'name': googleUser.displayName ?? googleUser.email.split('@').first,
        },
      );

      await _googleSignIn.signOut(); // Clear Google session (PB manages auth)
      return Success(UserModel.fromPb(authData.record!));
    } on ClientException catch (e) {
      await _googleSignIn.signOut();
      if (e.originalError.toString().contains('missing provider')) {
        return const Failure(
            AuthException(message: 'Google login is not configured yet'));
      }
      return Failure(AuthException(message: _getPbErrorMsg(e), originalError: e));
    } catch (e) {
      await _googleSignIn.signOut();
      return Failure(
          AuthException(message: 'Google login failed: ${e.toString()}', originalError: e));
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
      email: 'guest_${ts}@compair.local',
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
    if (e.statusCode == 400) {
      if (data['email'] != null) return 'This email address is already in use';
      if (data['password'] != null) return 'Password is too short (min 8 chars)';
      return 'Invalid data provided';
    }
    if (e.statusCode == 401) return 'Incorrect email or password';
    if (e.statusCode == 403) return 'This action is not allowed';
    if (e.statusCode == 404) return 'No account found for this email';
    return 'An error occurred (${e.statusCode})';
  }
}
