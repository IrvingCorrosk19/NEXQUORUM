import 'package:flutter/material.dart';

import '../state/session_controller.dart';
import '../theme.dart';
import '../widgets.dart';

class UnitsScreen extends StatelessWidget {
  const UnitsScreen({super.key, required this.session});
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    final units = session.units;
    if (units.isEmpty) {
      return const EmptyPanel(
        title: 'No hay unidades vinculadas',
        body: 'Solo aparecen las unidades que el servidor asocia a tu cuenta. Esta consulta es de solo lectura.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      itemCount: units.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final unit = units[index];
        return Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            title: Text(unit['unitCode']?.toString() ?? 'Unidad', style: Theme.of(context).textTheme.titleMedium),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '${unit['propertyHorizontalName'] ?? ''}\n'
                'Coeficiente en el PH: ${unit['unitCoefficientPercent'] ?? '—'} %\n'
                'Titularidad de la unidad: ${unit['sharePercent'] ?? '—'} %',
                style: const TextStyle(fontSize: 16, height: 1.4, color: AsambleasTheme.muted),
              ),
            ),
            isThreeLine: true,
          ),
        );
      },
    );
  }
}
