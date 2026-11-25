import 'dart:convert';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureCookieJar implements CookieJar {
  SecureCookieJar(this._storage);

  final FlutterSecureStorage _storage;
  final List<_StoredCookie> _items = [];

  @override
  bool get ignoreExpires => false;
  static const _key = 'asambleas.session.cookies';

  Future<void> restore() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return;
    final decoded = jsonDecode(raw);
    if (decoded is! List) return;
    _items.clear();
    for (final row in decoded) {
      if (row is! Map) continue;
      final name = row['name']?.toString() ?? '';
      final value = row['value']?.toString() ?? '';
      if (name.isEmpty) continue;
      final cookie = Cookie(name, value);
      final domain = row['domain']?.toString();
      final path = row['path']?.toString();
      if (domain != null && domain.isNotEmpty) cookie.domain = domain;
      cookie.path = (path == null || path.isEmpty) ? '/' : path;
      final expires = row['expires']?.toString();
      if (expires != null && expires.isNotEmpty) {
        cookie.expires = DateTime.tryParse(expires);
      }
      _items.add(_StoredCookie(Uri.parse(row['uri']?.toString() ?? 'https://local/'), cookie));
    }
  }

  @override
  Future<void> saveFromResponse(Uri uri, List<Cookie> cookies) async {
    for (final cookie in cookies) {
      final host = (cookie.domain == null || cookie.domain!.isEmpty) ? uri.host : cookie.domain!;
      _items.removeWhere((item) => item.cookie.name == cookie.name && _domain(item) == host);
      final expired = cookie.expires != null && cookie.expires!.isBefore(DateTime.now());
      if (!expired) {
        _items.add(_StoredCookie(uri, cookie));
      }
    }
    await _persist();
  }

  @override
  Future<List<Cookie>> loadForRequest(Uri uri) async {
    final now = DateTime.now();
    return [
      for (final item in _items)
        if (item.cookie.expires == null || item.cookie.expires!.isAfter(now))
          if (_matches(uri, item)) item.cookie,
    ];
  }

  @override
  Future<void> delete(Uri uri, [bool withDomainSharedCookie = false]) async {
    _items.removeWhere((item) => item.uri.host == uri.host);
    await _persist();
  }

  @override
  Future<void> deleteAll() async {
    _items.clear();
    await _storage.delete(key: _key);
  }

  Future<String> cookieHeader(Uri uri) async {
    final cookies = await loadForRequest(uri);
    return cookies.map((cookie) => '${cookie.name}=${cookie.value}').join('; ');
  }

  bool _matches(Uri uri, _StoredCookie item) {
    final domain = _domain(item);
    final hostOk = uri.host == domain || uri.host.endsWith('.$domain');
    final path = item.cookie.path ?? '/';
    return hostOk && uri.path.startsWith(path == '/' ? '/' : path);
  }

  String _domain(_StoredCookie item) {
    final domain = item.cookie.domain;
    if (domain == null || domain.isEmpty) return item.uri.host;
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }

  Future<void> _persist() async {
    final payload = [
      for (final item in _items)
        {
          'uri': item.uri.toString(),
          'name': item.cookie.name,
          'value': item.cookie.value,
          'domain': item.cookie.domain,
          'path': item.cookie.path,
          'expires': item.cookie.expires?.toIso8601String(),
        },
    ];
    await _storage.write(key: _key, value: jsonEncode(payload));
  }
}

class _StoredCookie {
  _StoredCookie(this.uri, this.cookie);
  final Uri uri;
  final Cookie cookie;
}
