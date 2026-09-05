namespace Asambleas.Contracts.Motions;

public sealed record MotionImportCatalogsDto(
    IReadOnlyList<MotionImportAgendaItemDto> AgendaItems,
    IReadOnlyList<MotionImportCatalogValueDto> BallotKinds,
    IReadOnlyList<MotionImportCatalogValueDto> CalculationMethods,
    IReadOnlyList<MotionImportCatalogValueDto> DecisionRules,
    IReadOnlyList<MotionImportCatalogValueDto> ResultVisibility,
    IReadOnlyList<MotionImportCatalogValueDto> YesNo,
    IReadOnlyList<MotionImportCatalogValueDto> ImportStates,
    int MaxRows,
    int MaxFileBytes);

public sealed record MotionImportAgendaItemDto(Guid Id, string Code, string Title, int Ordinal);

public sealed record MotionImportCatalogValueDto(string Code, string Label);

public sealed record MotionImportPreviewDto(
    Guid SessionId,
    int Total,
    int Valid,
    int Errors,
    int Warnings,
    IReadOnlyList<MotionImportRowPreviewDto> Rows,
    bool CanCommit);

public sealed record MotionImportRowPreviewDto(
    int RowNumber,
    int? Orden,
    string? PuntoAgenda,
    string? Codigo,
    string? TituloCorto,
    string? Pregunta,
    string? TipoRespuesta,
    string? Metodo,
    string? Mayoria,
    string? EstadoImportacion,
    string Status,
    IReadOnlyList<string> Messages,
    bool Included);

public sealed record MotionImportRowPatchRequest(
    Guid SessionId,
    int RowNumber,
    int? Orden = null,
    string? PuntoAgenda = null,
    string? Codigo = null,
    string? TituloCorto = null,
    string? Pregunta = null,
    string? Instrucciones = null,
    string? TipoRespuesta = null,
    string? Opcion1 = null,
    string? Opcion2 = null,
    string? Opcion3 = null,
    string? Opcion4 = null,
    string? Opcion5 = null,
    string? Metodo = null,
    string? Mayoria = null,
    decimal? UmbralPorcentaje = null,
    string? VisibilidadResultado = null,
    string? VotoSecreto = null,
    string? EstadoImportacion = null,
    bool? Included = null);

public sealed record MotionImportCommitRequest(
    Guid SessionId,
    bool PublishReadyRows = false,
    string? ClientRequestId = null);

public sealed record MotionImportCommitResultDto(
    Guid SessionId,
    int Imported,
    int Published,
    IReadOnlyList<Guid> MotionIds,
    bool IdempotentReplay = false);

public sealed record BulkPublishMotionsRequest(IReadOnlyList<Guid> MotionIds);

public sealed record BulkPublishMotionsResultDto(
    int Requested,
    int Updated,
    int Skipped,
    IReadOnlyList<Guid> UpdatedIds,
    IReadOnlyList<string> SkipReasons);