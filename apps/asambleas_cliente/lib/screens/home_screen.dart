import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.session});
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final next = session.nextAssembly;
    return RefreshIndicator(
      onRefresh: session.refresh,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Hola, ${session.displayName}', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(session.activePhName, style: Theme.of(context).textTheme.bodyLarge),
          const SizedBox(height: 20),
          if (session.error != null) ...[
            ErrorPanel(message: session.error!, onRetry: session.refresh),
            const SizedBox(height: 12),
          ],
          if (next == null)
            const EmptyPanel(
              title: 'No hay una próxima asamblea',
              body: 'Cuando haya una convocatoria para tu cuenta, la verás aquí. El historial está en Asambleas.',
            )
          else
            Card(
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusChip(label: assemblyStatusLabel(next['status']?.toString())),
                    const SizedBox(height: 12),
                    Text(next['title']?.toString() ?? 'Asamblea', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(next['propertyHorizontalName']?.toString() ?? '', style: Theme.of(context).textTheme.bodyMedium),
                    const SizedBox(height: 4),
                    Text(formatWhen(next['scheduledAtUtc'], timeZone: next['timeZoneId']?.toString()), style: Theme.of(context).textTheme.bodyLarge),
                    const SizedBox(height: 10),
                    Text(
                      canEnter(next) ? 'La sala ya está disponible.' : 'Aún no puedes entrar. La hora programada no abre la sala.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AsambleasTheme.muted),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        final id = next['assemblyId']?.toString();
                        if (id == null) return;
                        context.push(canEnter(next) ? '/lobby/$id' : '/assembly/$id');
                      },
                      child: Text(primaryAction(next)),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 16),
          TextButton(
            onPressed: () => context.go('/unidades'),
            child: Text('${session.units.length} unidad(es) vinculada(s)'),
          ),
        ],
      ),
    );
  }
}
