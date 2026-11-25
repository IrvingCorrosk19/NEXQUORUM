import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../api/api_exception.dart';
import '../domain/password_policy.dart';
import '../state/session_controller.dart';
import '../widgets.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.session});
  final SessionController session;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  String? _passwordError;
  String? _photoError;
  String? _notice;
  File? _preview;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null) return;
    final dir = await getTemporaryDirectory();
    final target = '${dir.path}/avatar.jpg';
    final compressed = await FlutterImageCompress.compressAndGetFile(
      picked.path,
      target,
      quality: 80,
      minWidth: 512,
      minHeight: 512,
      format: CompressFormat.jpeg,
      keepExif: false,
    );
    if (compressed == null) {
      setState(() => _photoError = 'No se pudo preparar la foto.');
      return;
    }
    final file = File(compressed.path);
    if (await file.length() > 2 * 1024 * 1024) {
      setState(() => _photoError = 'La foto sigue siendo demasiado grande.');
      return;
    }
    setState(() {
      _preview = file;
      _photoError = null;
    });
  }

  Future<void> _savePhoto() async {
    final file = _preview;
    if (file == null) return;
    try {
      await widget.session.api.postFile('/api/auth/me/avatar', file, 'avatar.jpg');
      await widget.session.refresh();
      setState(() => _notice = 'La foto quedó guardada en el servidor.');
    } on ApiException catch (error) {
      setState(() => _photoError = error.message);
    }
  }

  Future<void> _password() async {
    final policy = PasswordPolicy.validate(_next.text);
    if (policy != null) {
      setState(() => _passwordError = policy);
      return;
    }
    if (_next.text != _confirm.text) {
      setState(() => _passwordError = 'La confirmación no coincide.');
      return;
    }
    try {
      final result = await widget.session.api.postJson('/api/auth/change-password', body: {
        'currentPassword': _current.text,
        'newPassword': _next.text,
      });
      _current.clear();
      _next.clear();
      _confirm.clear();
      setState(() {
        _passwordError = null;
        _notice = result['message']?.toString() ?? 'Contraseña actualizada.';
      });
    } on ApiException catch (error) {
      setState(() => _passwordError = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.session;
    final hasPassword = session.me?['hasLocalPassword'] == true;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(session.displayName, style: Theme.of(context).textTheme.headlineSmall),
        Text(session.me?['email']?.toString() ?? ''),
        const SizedBox(height: 12),
        Text('Propiedades', style: Theme.of(context).textTheme.titleMedium),
        for (final property in session.properties)
          ListTile(
            title: Text(property['name']?.toString() ?? 'PH'),
            subtitle: Text(property['isCurrent'] == true ? 'PH actual' : 'Cambiar a esta propiedad'),
            onTap: property['isCurrent'] == true
                ? null
                : () => session.switchPh(property['propertyHorizontalId'].toString()),
          ),
        const SizedBox(height: 12),
        Text('Foto', style: Theme.of(context).textTheme.titleMedium),
        if (_preview != null) Image.file(_preview!, height: 160),
        if (_photoError != null) Text(_photoError!, style: const TextStyle(color: Color(0xFF7F1D1D))),
        FilledButton.tonal(onPressed: _pick, child: const Text('Elegir foto')),
        FilledButton(onPressed: _preview == null ? null : _savePhoto, child: const Text('Guardar foto')),
        const SizedBox(height: 16),
        Text('Contraseña', style: Theme.of(context).textTheme.titleMedium),
        if (!hasPassword)
          const Text('Esta cuenta no usa contraseña local. La recuperación se hace desde el acceso.')
        else ...[
          TextField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Contraseña actual')),
          const SizedBox(height: 8),
          TextField(controller: _next, obscureText: true, decoration: const InputDecoration(labelText: 'Nueva contraseña')),
          const SizedBox(height: 8),
          TextField(controller: _confirm, obscureText: true, decoration: const InputDecoration(labelText: 'Confirmar nueva contraseña')),
          if (_passwordError != null) Text(_passwordError!, style: const TextStyle(color: Color(0xFF7F1D1D))),
          const SizedBox(height: 8),
          FilledButton(onPressed: _password, child: const Text('Cambiar contraseña')),
        ],
        if (_notice != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_notice!)),
        const SizedBox(height: 16),
        OutlinedButton(onPressed: session.logout, child: const Text('Cerrar sesión')),
        if (session.error != null) ErrorPanel(message: session.error!),
      ],
    );
  }
}
