import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../state/session_controller.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.session});
  final SessionController session;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  var _otp = false;
  var _recover = false;
  String? _notice;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _error = null);
    try {
      await action();
    } on ApiException catch (error) {
      setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Scaffold(
      appBar: AppBar(title: const Text('Asambleas')),
      body: SafeArea(
        child: ListView(
          padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottom),
          children: [
            Text('Entra con tu cuenta de participante', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('La administración de la asamblea se hace en la web.'),
            const SizedBox(height: 20),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Contraseña')),
                ButtonSegment(value: true, label: Text('Código por correo')),
              ],
              selected: {_otp},
              onSelectionChanged: (value) => setState(() {
                _otp = value.first;
                _error = null;
                _notice = null;
              }),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'Correo'),
            ),
            const SizedBox(height: 12),
            if (!_otp)
              TextField(
                controller: _password,
                obscureText: true,
                autofillHints: const [AutofillHints.password],
                decoration: const InputDecoration(labelText: 'Contraseña'),
              ),
            if (_otp)
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Código de 6 dígitos'),
              ),
            if (_error != null) ...[const SizedBox(height: 12), Text(_error!, style: const TextStyle(color: Color(0xFF7F1D1D)))],
            if (_notice != null) ...[const SizedBox(height: 12), Text(_notice!)],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: widget.session.busy
                  ? null
                  : () => _run(() async {
                        if (_otp) {
                          await widget.session.verifyOtp(_email.text, _code.text);
                        } else {
                          await widget.session.login(_email.text, _password.text);
                        }
                      }),
              child: Text(_otp ? 'Verificar código' : 'Entrar'),
            ),
            if (_otp)
              TextButton(
                onPressed: widget.session.busy
                    ? null
                    : () => _run(() async {
                          final message = await widget.session.requestOtp(_email.text);
                          setState(() => _notice = message);
                        }),
                child: const Text('Enviar código'),
              ),
            TextButton(
              onPressed: () => setState(() => _recover = !_recover),
              child: const Text('¿Olvidaste tu contraseña?'),
            ),
            if (_recover)
              FilledButton.tonal(
                onPressed: widget.session.busy
                    ? null
                    : () => _run(() async {
                          final message = await widget.session.forgot(_email.text);
                          setState(() => _notice = message);
                        }),
                child: const Text('Solicitar recuperación'),
              ),
          ],
        ),
      ),
    );
  }
}
