import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../api/api_endpoints.dart';
import '../storage/secure_storage.dart';
import 'auth_models.dart';

class AuthRepository {
  const AuthRepository(this._dio);

  final Dio _dio;

  Future<AuthUser> login(String email, String password) async {
    try {
      final res = await _dio.post(
        ApiEndpoints.login,
        data: {'username': email, 'password': password},
        options: Options(contentType: 'application/x-www-form-urlencoded'),
      );
      await _saveTokens(res.data as Map<String, dynamic>);
      return getMe();
    } on DioException catch (e) {
      throw apiError(e);
    }
  }

  Future<AuthUser> loginWithGoogle(String idToken) async {
    try {
      final res = await _dio.post(
        ApiEndpoints.googleAuth,
        data: {'token': idToken},
      );
      await _saveTokens(res.data as Map<String, dynamic>);
      return getMe();
    } on DioException catch (e) {
      throw apiError(e);
    }
  }

  Future<void> _saveTokens(Map<String, dynamic> data) async {
    final accessToken = data['access_token'] as String;
    final refreshToken = data['refresh_token'] as String? ?? accessToken;
    await SecureStorage.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
  }

  Future<AuthUser> getMe() async {
    try {
      final res = await _dio.get(ApiEndpoints.me);
      return AuthUser.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw apiError(e);
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post(ApiEndpoints.logout);
    } catch (_) {
      // best-effort
    } finally {
      await SecureStorage.clear();
    }
  }
}
