import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../domain/vote_policy.dart';

class VoteSheet extends StatefulWidget {
  const VoteSheet({super.key, required this.api, required this.assemblyId, required this.session});
  final ApiClient api;
  final String assemblyId;
  final Map<String, dynamic> session;

  @override
  State<VoteSheet> createState() => _VoteSheetState();
}

class _VoteSheetState extends State<VoteSheet> {
  static const _choices = [
    ('InFavor', 'A favor'),
    ('Against', 'En contra'),
    ('Abstention', 'Abstención'),
  ];
  String? _choice;
  String? _requestId;
  Map<String, dynamic>? _receipt;
  String? _error;
  var _sending = false;

  String get _sessionId => widget.session['id']?.toString() ?? widget.session['votingSessionId']?.toString() ?? '';

  @override
  void initState() {
    super.initState();
    _loadReceipt();
  }

  Future<void> _loadReceipt() async {
    try {
      final status = await widget.api.getJson('/api/assemblies/${widget.assemblyId}/voting/$_sessionId/my-status');
      if (status['evidenceId'] != null) {
        setState(() => _receipt = status);
      }
    } on ApiException {
      return;
    }
  }

  Future<void> _confirm() async {
    final choice = _choice;
    if (choice == null || _sending) return;
    final label = _choices.firstWhere((item) => item.$1 == choice).$2;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmar voto'),
        content: Text('Vas a votar: $label. Esta acción se envía una sola vez.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Volver')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Enviar voto')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    _requestId ??= const Uuid().v4();
    try {
      final receipt = await widget.api.postJson(
        '/api/assemblies/${widget.assemblyId}/voting/$_sessionId/cast',
        body: {'choice': choice, 'clientRequestId': _requestId},
      );
      if (receipt['evidenceId'] == null) {
        throw ApiException('El servidor no confirmó el voto.');
      }
      setState(() => _receipt = receipt);
    } on ApiException catch (error) {
      if (VotePolicy.isUncertain(error.status)) {
        await _loadReceipt();
        if (_receipt != null) return;
      }
      setState(() => _error = VotePolicy.explain(error.code, error.message, error.status));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.session['motionTitle']?.toString() ?? widget.session['title']?.toString() ?? 'Pregunta activa';
    if (_receipt != null) {
      return _card(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Voto registrado'),
            Text('Comprobante ${ _receipt!['evidenceId']}'),
            Text('Hora ${ _receipt!['castAtUtc'] ?? ''}'),
          ],
        ),
      );
    }
    return _card(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          RadioGroup<String>(
            groupValue: _choice,
            onChanged: _sending ? (_) {} : (value) => setState(() => _choice = value),
            child: Column(
              children: [
                for (final choice in _choices) RadioListTile<String>(value: choice.$1, title: Text(choice.$2)),
              ],
            ),
          ),
          if (_error != null) Text(_error!, style: const TextStyle(color: Color(0xFFFECACA))),
          FilledButton(onPressed: _choice == null || _sending ? null : _confirm, child: Text(_sending ? 'Enviando…' : 'Continuar')),
        ],
      ),
    );
  }

  Widget _card(Widget child) {
    return Material(
      color: const Color(0xFF122033),
      borderRadius: BorderRadius.circular(16),
      child: Padding(padding: const EdgeInsets.all(16), child: child),
    );
  }
}
