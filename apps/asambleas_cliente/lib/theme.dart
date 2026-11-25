import 'package:flutter/material.dart';

class AsambleasTheme {
  static const navy = Color(0xFF0E2744);
  static const teal = Color(0xFF0F766E);
  static const mist = Color(0xFFF4F7FB);
  static const ink = Color(0xFF122033);

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: teal, primary: navy, secondary: teal, surface: Colors.white),
      scaffoldBackgroundColor: mist,
    );
    return base.copyWith(
      appBarTheme: const AppBarTheme(backgroundColor: navy, foregroundColor: Colors.white, centerTitle: false),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(backgroundColor: teal, foregroundColor: Colors.white, minimumSize: const Size(48, 48)),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48))),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: const Size(48, 48))),
      inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    );
  }

  static ThemeData room() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: const Color(0xFF07111C),
      colorScheme: const ColorScheme.dark(primary: teal, surface: Color(0xFF122033)),
    );
  }
}

String assemblyStatusLabel(String? status) {
  switch (status) {
    case 'Draft':
      return 'Borrador';
    case 'Scheduled':
      return 'Programada';
    case 'CheckIn':
      return 'Mesa abierta';
    case 'InProgress':
      return 'En curso';
    case 'Paused':
      return 'En pausa';
    case 'Completed':
      return 'Finalizada';
    case 'Cancelled':
      return 'Cancelada';
    default:
      return status ?? 'Sin estado';
  }
}

String formatWhen(Object? value, {String? timeZone}) {
  final raw = value?.toString();
  if (raw == null || raw.isEmpty) return 'Sin fecha';
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  final local = parsed.toLocal();
  final date = '${local.day.toString().padLeft(2, '0')}/${local.month.toString().padLeft(2, '0')}/${local.year}';
  final time = '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  final zone = (timeZone == null || timeZone.isEmpty) ? '' : ' · $timeZone';
  return '$date $time$zone';
}

bool canEnter(Map<String, dynamic>? assembly) => assembly?['canJoin'] == true;

String primaryAction(Map<String, dynamic>? assembly) {
  if (assembly == null) return 'Ver historial';
  if (canEnter(assembly)) return 'Entrar a la sala';
  final status = assembly['status']?.toString();
  if (status == 'Completed' || status == 'Cancelled') return 'Consultar resultados';
  return 'Ver convocatoria';
}
