namespace Asambleas.Domain.Enums;

/// <summary>
/// Teams-like lobby admission gate (complementary to legal accreditation).
/// Does not by itself create quorum or voting rights.
/// </summary>
public enum RoomEntryStatus
{
    None = 0,
    Waiting = 1,
    Admitted = 2,
    Rejected = 3
}
