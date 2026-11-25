import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class AssembliesScreen extends StatelessWidget {
  const AssembliesScreen({super.key, required this.session});
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final upcoming = <Map<String, dynamic>>[];
    final past = <Map<String, dynamic>>[];
    final rows = [...session.events];
    final next = session.nextAssembly;
    if (next != null && !rows.any((event) => event['assemblyId']?.toString() == next['assemblyId']?.toString())) {
      rows.insert(0, next);
    }
    for (final event in rows) {
      final status = event['status']?.toString();
      final done = status == 'Completed' || status == 'Cancelled';
      (done ? past : upcoming).add(event);
    }
    if (session.events.isEmpty) {
      return const EmptyPanel(title: 'Sin asambleas', body: 'No hay asambleas autorizadas para el PH actual.');
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        const SectionLabel('Próximas'),
        if (upcoming.isEmpty) const Text('No hay próximas asambleas.'),
        for (final event in upcoming) _tile(context, event),
        const SectionLabel('Anteriores'),
        if (past.isEmpty) const Text('No hay asambleas anteriores.'),
        for (final event in past) _tile(context, event),
      ],
    );
  }

  Widget _tile(BuildContext context, Map<String, dynamic> event) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: ListTile(
          contentPadding: const EdgeInsets.all(12),
          title: Text(event['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.titleMedium),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(formatWhen(event['scheduledAtUtc']), style: const TextStyle(fontSize: 16, color: AsambleasTheme.ink)),
                const SizedBox(height: 6),
                StatusChip(label: assemblyStatusLabel(event['status']?.toString())),
              ],
            ),
          ),
          isThreeLine: true,
          onTap: () => context.push('/assembly/${event['assemblyId']}'),
        ),
      ),
    );
  }
}
