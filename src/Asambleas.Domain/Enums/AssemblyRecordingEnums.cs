namespace Asambleas.Domain.Enums;

public enum AssemblyRecordingStatus
{
    Starting = 0,
    Recording = 1,
    Processing = 2,
    Ready = 3,
    Failed = 4,
    Deleted = 5
}

public enum AssemblyRecordingMode
{
    Disabled = 0,
    Manual = 1,
    AutomaticOnSessionStart = 2
}

public enum AssemblyRecordingVisibility
{
    AdminOnly = 0,
    BoardOnly = 1,
    AuthorizedParticipants = 2
}
