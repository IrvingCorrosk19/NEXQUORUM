class PasswordPolicy {
  static String? validate(String value) {
    if (value.length < 12) return 'Usa al menos 12 caracteres.';
    if (!value.contains(RegExp(r'[A-Z]'))) return 'Incluye una mayúscula.';
    if (!value.contains(RegExp(r'[a-z]'))) return 'Incluye una minúscula.';
    if (!value.contains(RegExp(r'[0-9]'))) return 'Incluye un número.';
    if (!value.contains(RegExp(r'[^A-Za-z0-9]'))) return 'Incluye un símbolo.';
    return null;
  }
}
