namespace Asambleas.Domain.Common;

/// <summary>
/// Domain rule violation. Optional <see cref="Code"/> is a stable machine-readable eligibility/integrity code.
/// </summary>
public class DomainException : Exception
{
    public DomainException(string message)
        : base(message)
    {
    }

    public DomainException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public DomainException(string code, string message)
        : base(message)
    {
        Code = code;
    }

    public DomainException(string code, string message, Exception innerException)
        : base(message, innerException)
    {
        Code = code;
    }

    /// <summary>Stable code (e.g. ALREADY_VOTED). Null for legacy throw sites.</summary>
    public string? Code { get; }
}
