import 'package:flutter/material.dart';

class AsambleasTheme {
  static const navy = Color(0xFF0E2744);
  static const teal = Color(0xFF0F766E);
  static const tealBright = Color(0xFF14B8A6);
  static const mist = Color(0xFFF4F7FB);
  static const ink = Color(0xFF122033);
  static const muted = Color(0xFF3E4C5E);
  static const line = Color(0xFFD5DEE8);
  static const danger = Color(0xFF7F1D1D);
  static const dangerSurface = Color(0xFFFFF1F2);
  static const roomBg = Color(0xFF07111C);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: teal,
      primary: navy,
      onPrimary: Colors.white,
      secondary: teal,
      onSecondary: Colors.white,
      surface: Colors.white,
      onSurface: ink,
    );
    final text = TextTheme(
      headlineSmall: const TextStyle(fontSize: 24, height: 1.25, fontWeight: FontWeight.w700, color: ink),
      titleLarge: const TextStyle(fontSize: 20, height: 1.3, fontWeight: FontWeight.w700, color: ink),
      titleMedium: const TextStyle(fontSize: 18, height: 1.35, fontWeight: FontWeight.w600, color: ink),
      bodyLarge: const TextStyle(fontSize: 17, height: 1.4, color: ink),
      bodyMedium: const TextStyle(fontSize: 16, height: 1.4, color: ink),
      bodySmall: const TextStyle(fontSize: 14, height: 1.35, color: muted),
      labelLarge: const TextStyle(fontSize: 16, height: 1.2, fontWeight: FontWeight.w600),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: mist,
      textTheme: text,
      appBarTheme: const AppBarTheme(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Colors.white),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: line),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xFFD8F3EF),
        labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        height: 72,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: teal,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 52),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: navy,
          minimumSize: const Size(48, 48),
          side: const BorderSide(color: line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: teal, minimumSize: const Size(48, 48)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: line)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: teal, width: 2)),
        errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: danger)),
        labelStyle: const TextStyle(fontSize: 16, color: muted),
      ),
      dividerTheme: const DividerThemeData(color: line, space: 1),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: navy),
      ),
    );
  }

  static ThemeData room() {
    const onDark = Color(0xFFF4F7FB);
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: roomBg,
      colorScheme: const ColorScheme.dark(
        primary: tealBright,
        onPrimary: Color(0xFF042F2C),
        surface: Color(0xFF122033),
        onSurface: onDark,
      ),
      textTheme: const TextTheme(
        titleMedium: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: onDark),
        bodyLarge: TextStyle(fontSize: 17, height: 1.4, color: onDark),
        bodyMedium: TextStyle(fontSize: 16, height: 1.4, color: onDark),
        bodySmall: TextStyle(fontSize: 14, color: Color(0xFFD5DEE8)),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: navy,
        foregroundColor: onDark,
        elevation: 0,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: teal,
          foregroundColor: Colors.white,
          minimumSize: const Size(48, 48),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48), foregroundColor: onDark),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF122033),
        hintStyle: const TextStyle(color: Color(0xFFD5DEE8)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}

class AssemblyMark extends StatelessWidget {
  const AssemblyMark({super.key, this.size = 48, this.monochrome = false});
  final double size;
  final bool monochrome;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Símbolo de Asambleas',
      child: CustomPaint(size: Size.square(size), painter: _MarkPainter(monochrome: monochrome)),
    );
  }
}

class _MarkPainter extends CustomPainter {
  _MarkPainter({required this.monochrome});
  final bool monochrome;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width * 0.30;
    final stroke = size.width * 0.11;
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = monochrome ? Colors.white : const Color(0xFFE7EEF6);
    final accent = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = monochrome ? Colors.white : AsambleasTheme.tealBright;
    final rect = Rect.fromCircle(center: center, radius: radius);
    canvas.drawArc(rect, -1.5708, 4.7124, false, base);
    canvas.drawArc(rect, 3.1416, 1.5708, false, accent);
  }

  @override
  bool shouldRepaint(covariant _MarkPainter oldDelegate) => oldDelegate.monochrome != monochrome;
}

class BrandLockup extends StatelessWidget {
  const BrandLockup({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        DecoratedBox(
          decoration: BoxDecoration(color: AsambleasTheme.navy, borderRadius: BorderRadius.circular(12)),
          child: const Padding(padding: EdgeInsets.all(8), child: AssemblyMark(size: 28)),
        ),
        const SizedBox(width: 12),
        Text('ASAMBLEAS', style: Theme.of(context).textTheme.titleMedium?.copyWith(letterSpacing: 1.2, color: AsambleasTheme.navy)),
      ],
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
