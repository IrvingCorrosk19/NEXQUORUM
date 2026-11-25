import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config.dart';
import 'api_exception.dart';
import 'secure_cookie_jar.dart';

class ApiClient {
  ApiClient({FlutterSecureStorage? storage})
      : jar = SecureCookieJar(storage ?? const FlutterSecureStorage());

  final SecureCookieJar jar;
  late final Dio dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.baseUrl,
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
      validateStatus: (status) => status != null && status < 600,
    ),
  );

  Future<void> init() async {
    await jar.restore();
    dio.interceptors.add(CookieManager(jar));
  }

  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query, int generation = 0, int? expectedGeneration}) async {
    final response = await _send('GET', path, query: query);
    _ensureGeneration(generation, expectedGeneration);
    return _map(response);
  }

  Future<List<dynamic>> getList(String path, {Map<String, dynamic>? query}) async {
    final response = await _send('GET', path, query: query);
    final data = response.data;
    if (data is List) return data;
    throw ApiException('La respuesta no tiene el formato esperado.', status: response.statusCode);
  }

  Future<Map<String, dynamic>> postJson(String path, {Object? body, bool auth = true}) async {
    final response = await _send('POST', path, body: body, auth: auth);
    return _map(response);
  }

  Future<Map<String, dynamic>> postFile(String path, File file, String filename) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: filename),
    });
    final response = await _send('POST', path, body: form);
    return _map(response);
  }

  Future<Response<dynamic>> _send(String method, String path, {Object? body, Map<String, dynamic>? query, bool auth = true}) async {
    try {
      final headers = <String, dynamic>{};
      final unsafe = method != 'GET' && method != 'HEAD';
      if (unsafe && auth) {
        final token = await _antiforgery();
        if (token != null) headers['RequestVerificationToken'] = token;
      }
      final response = await dio.request<dynamic>(
        path,
        data: body,
        queryParameters: query,
        options: Options(method: method, headers: headers),
      );
      if ((response.statusCode ?? 500) >= 400) {
        throw _error(response);
      }
      return response;
    } on DioException catch (error) {
      throw ApiException(
        'No hay conexión con Asambleas. Revisa la red e inténtalo de nuevo.',
        uncertain: true,
        status: error.response?.statusCode,
      );
    }
  }

  Future<String?> _antiforgery() async {
    final response = await dio.get<dynamic>('/api/auth/antiforgery');
    final data = response.data;
    if (data is Map && data['requestToken'] != null) {
      return data['requestToken'].toString();
    }
    return null;
  }

  void _ensureGeneration(int generation, int? expected) {
    if (expected != null && generation != expected) {
      throw ApiException('El PH cambió. Vuelve a abrir esta pantalla.');
    }
  }

  Map<String, dynamic> _map(Response<dynamic> response) {
    final data = response.data;
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.map((key, value) => MapEntry(key.toString(), value));
    return {'ok': true};
  }

  ApiException _error(Response<dynamic> response) {
    final data = response.data;
    String? message;
    String? code;
    if (data is Map) {
      message = data['detail']?.toString() ?? data['title']?.toString() ?? data['message']?.toString();
      code = data['code']?.toString();
      final extensions = data['extensions'];
      if (extensions is Map && code == null) code = extensions['code']?.toString();
    }
    return ApiException(
      message ?? 'No se pudo completar la acción.',
      status: response.statusCode,
      code: code,
    );
  }
}
