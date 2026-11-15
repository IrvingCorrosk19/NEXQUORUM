namespace Asambleas.Application.Abstractions;

public interface IUserAvatarStorage
{
    string RootPath { get; }

    Task<string> SaveAsync(
        Guid userId,
        Stream content,
        string contentType,
        string? previousRelativeUrl,
        CancellationToken cancellationToken = default);

    void DeleteIfExists(string? relativeUrl);
}
