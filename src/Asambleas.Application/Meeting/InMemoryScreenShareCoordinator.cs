namespace Asambleas.Application.Meeting;

using System.Collections.Concurrent;
using Asambleas.Application.Abstractions;
using Asambleas.Contracts.Meetings;

public sealed class InMemoryScreenShareCoordinator : IScreenShareCoordinator
{
    private readonly ConcurrentDictionary<Guid, Entry> _byAssembly = new();

    public ScreenShareStateDto? TryGet(Guid assemblyId) =>
        _byAssembly.TryGetValue(assemblyId, out var entry) ? ToDto(assemblyId, entry) : null;

    public bool TryClaim(
        Guid assemblyId,
        Guid presenterUserId,
        string presenterDisplayName,
        out ScreenShareStateDto state,
        out ScreenShareStateDto? conflict)
    {
        while (true)
        {
            if (_byAssembly.TryGetValue(assemblyId, out var existing))
            {
                if (existing.PresenterUserId == presenterUserId)
                {
                    state = ToDto(assemblyId, existing);
                    conflict = null;
                    return true;
                }

                state = ToDto(assemblyId, existing);
                conflict = state;
                return false;
            }

            var created = new Entry(presenterUserId, presenterDisplayName, DateTimeOffset.UtcNow);
            if (_byAssembly.TryAdd(assemblyId, created))
            {
                state = ToDto(assemblyId, created);
                conflict = null;
                return true;
            }
        }
    }

    public bool TryRelease(Guid assemblyId, Guid actorUserId, bool force, out ScreenShareStateDto state)
    {
        if (!_byAssembly.TryGetValue(assemblyId, out var existing))
        {
            state = Inactive(assemblyId);
            return true;
        }

        if (!force && existing.PresenterUserId != actorUserId)
        {
            state = ToDto(assemblyId, existing);
            return false;
        }

        _byAssembly.TryRemove(assemblyId, out _);
        state = Inactive(assemblyId);
        return true;
    }

    public void Clear(Guid assemblyId) => _byAssembly.TryRemove(assemblyId, out _);

    private static ScreenShareStateDto ToDto(Guid assemblyId, Entry entry) =>
        new(
            assemblyId,
            IsActive: true,
            entry.PresenterUserId,
            entry.PresenterDisplayName,
            entry.StartedAtUtc,
            CurrentUserCanStart: false,
            CurrentUserIsPresenter: false,
            CurrentUserCanForceStop: false);

    private static ScreenShareStateDto Inactive(Guid assemblyId) =>
        new(
            assemblyId,
            IsActive: false,
            PresenterUserId: null,
            PresenterDisplayName: null,
            StartedAtUtc: null,
            CurrentUserCanStart: false,
            CurrentUserIsPresenter: false,
            CurrentUserCanForceStop: false);

    private sealed record Entry(Guid PresenterUserId, string PresenterDisplayName, DateTimeOffset StartedAtUtc);
}
