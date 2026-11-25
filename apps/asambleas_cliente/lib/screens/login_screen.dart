import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../state/session_controller.dart';
import '../theme.dart';

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
      body: SafeArea(
        child: ListView(
          padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottom),
          children: [
            const BrandLockup(),
            const SizedBox(height: 28),
            Text('Entra a tu asamblea', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text('Para participantes. La mesa sigue en la web.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AsambleasTheme.muted)),
            const SizedBox(height: 20),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Contraseña'), icon: Icon(Icons.lock_outline)),
                ButtonSegment(value: true, label: Text('Código'), icon: Icon(Icons.mail_outline)),
              ],
              selected: {_otp},
              onSelectionChanged: widget.session.busy
                  ? null
                  : (value) => setState(() {
                        _otp = value.first;
                        _error = null;
                        _notice = null;
                      }),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
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
                onSubmitted: (_) => _run(() => widget.session.login(_email.text, _password.text)),
              ),
            if (_otp)
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Código de 6 dígitos'),
              ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(fontSize: 16, color: AsambleasTheme.danger)),
            ],
            if (_notice != null) ...[
              const SizedBox(height: 12),
              Text(_notice!, style: Theme.of(context).textTheme.bodyMedium),
            ],
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
              child: Text(widget.session.busy ? 'Comprobando…' : (_otp ? 'Verificar código' : 'Entrar')),
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
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _recover = !_recover),
                child: const Text('¿Olvidaste tu contraseña?'),
              ),
            ),
            if (_recover)
              OutlinedButton(
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
