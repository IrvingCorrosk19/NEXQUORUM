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
    final now = DateTime.now();
    final upcoming = <Map<String, dynamic>>[];
    final past = <Map<String, dynamic>>[];
    for (final event in session.events) {
      final when = DateTime.tryParse(event['estimatedEndAtUtc']?.toString() ?? '')?.toLocal();
      final done = event['status'] == 'Completed' || event['status'] == 'Cancelled' || (when != null && when.isBefore(now));
      (done ? past : upcoming).add(event);
    }
    if (session.events.isEmpty) {
      return const EmptyPanel(title: 'Sin asambleas', body: 'No hay asambleas autorizadas para el PH actual.');
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Próximas', style: Theme.of(context).textTheme.titleMedium),
        if (upcoming.isEmpty) const Text('No hay próximas asambleas.'),
        for (final event in upcoming) _tile(context, event),
        const SizedBox(height: 16),
        Text('Anteriores', style: Theme.of(context).textTheme.titleMedium),
        if (past.isEmpty) const Text('No hay asambleas anteriores.'),
        for (final event in past) _tile(context, event),
      ],
    );
  }

  Widget _tile(BuildContext context, Map<String, dynamic> event) {
    return Card(
      child: ListTile(
        title: Text(event['title']?.toString() ?? 'Asamblea'),
        subtitle: Text('${event['propertyHorizontalName'] ?? ''}\n${formatWhen(event['scheduledAtUtc'])}\n${assemblyStatusLabel(event['status']?.toString())}'),
        isThreeLine: true,
        onTap: () => context.push('/assembly/${event['assemblyId']}'),
      ),
    );
  }
}
