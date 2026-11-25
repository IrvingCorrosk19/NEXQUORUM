import 'package:asambleas_cliente/domain/password_policy.dart';
import 'package:asambleas_cliente/domain/vote_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('un voto distinto explica que el original se conserva', () {
    expect(VotePolicy.explain('ALREADY_VOTED', 'Double vote is not allowed', 400), VotePolicy.alreadyVoted);
  });

  test('una respuesta incierta no se trata como rechazo definitivo', () {
    expect(VotePolicy.isUncertain(null), isTrue);
    expect(VotePolicy.isUncertain(400), isFalse);
  });

  test('la contraseña nueva exige la misma política del servidor', () {
    expect(PasswordPolicy.validate('corta'), isNotNull);
    expect(PasswordPolicy.validate('ClaveSegura1!'), isNull);
  });
}
