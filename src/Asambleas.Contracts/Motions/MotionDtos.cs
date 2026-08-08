namespace Asambleas.Contracts.Motions;

public sealed record MotionDto(
    Guid Id,
    Guid AssemblyId,
    Guid AgendaItemId,
    string Code,
    string Title,
    string Body,
    string Status);

public sealed record CreateMotionRequest(
    Guid AgendaItemId,
    string Code,
    string Title,
    string Body);

public sealed record PresentMotionRequest(Guid MotionId);

public sealed record MotionResultDto(
    Guid MotionId,
    string Status,
    decimal InFavorCoefficient,
    decimal AgainstCoefficient,
    decimal AbstentionCoefficient);
