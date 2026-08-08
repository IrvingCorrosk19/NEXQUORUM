namespace Asambleas.Contracts.Agenda;

public sealed record AgendaItemDto(
    Guid Id,
    Guid AssemblyId,
    int Ordinal,
    string Code,
    string Title,
    bool IsActive);

public sealed record CreateAgendaItemRequest(
    int Ordinal,
    string Code,
    string Title);

public sealed record ActivateAgendaItemRequest(Guid AgendaItemId);

public sealed record AgendaListResponse(
    Guid AssemblyId,
    Guid? ActiveAgendaItemId,
    IReadOnlyList<AgendaItemDto> Items);
