class VotePolicy {
  static const alreadyVoted =
      'Tu voto ya fue registrado y esta votación no permite cambiarlo.';

  static String explain(Object? code, String? message, int? status) {
    final raw = '${code ?? ''} ${message ?? ''}'.toLowerCase();
    if (raw.contains('already_voted') ||
        raw.contains('vote_choice_conflict') ||
        raw.contains('no permite cambiarlo') ||
        raw.contains('double vote') ||
        status == 409) {
      return alreadyVoted;
    }
    if (raw.contains('voting_closed') || raw.contains('ya no está abierta') || raw.contains('cerrad')) {
      return 'La votación ya no está abierta. Tu selección no se envió.';
    }
    if (raw.contains('not_present') || raw.contains('not_accredited')) {
      return 'Debes estar presente en la asamblea para votar.';
    }
    if (raw.contains('not_eligible') || status == 403) {
      return 'No tienes derecho a voto para esta pregunta.';
    }
    if (message != null && message.trim().isNotEmpty) return message.trim();
    return 'No se pudo registrar el voto.';
  }

  static bool isUncertain(int? status) => status == null || status == 0;
}
