using Asambleas.Application.Attendance;
using FluentAssertions;
using Microsoft.Extensions.Caching.Memory;

namespace Asambleas.UnitTests.Attendance;

public sealed class VerifiedJoinProofServiceTests
{
    private static VerifiedJoinProofService Create() =>
        new(new MemoryCache(new MemoryCacheOptions()));

    [Fact]
    public void Consume_is_scoped_to_assembly_and_user_and_single_use()
    {
        var svc = Create();
        var tenant = Guid.NewGuid();
        var ph = Guid.NewGuid();
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();
        var userA = Guid.NewGuid();
        var userB = Guid.NewGuid();
        var link = Guid.NewGuid();

        svc.Issue(tenant, ph, a, userA, link);
        svc.Peek(tenant, a, userA).Should().BeTrue();
        svc.Peek(tenant, b, userA).Should().BeFalse();
        svc.Peek(tenant, a, userB).Should().BeFalse();

        svc.TryConsume(tenant, b, userA, out _).Should().BeFalse();
        svc.TryConsume(tenant, a, userB, out _).Should().BeFalse();
        svc.TryConsume(tenant, a, userA, out var consumed).Should().BeTrue();
        consumed.Should().Be(link);
        svc.TryConsume(tenant, a, userA, out _).Should().BeFalse();
    }

    [Fact]
    public void Logout_invalidates_all_proofs_for_user()
    {
        var svc = Create();
        var tenant = Guid.NewGuid();
        var ph = Guid.NewGuid();
        var a = Guid.NewGuid();
        var user = Guid.NewGuid();
        svc.Issue(tenant, ph, a, user, Guid.NewGuid());
        svc.InvalidateUser(user);
        svc.TryConsume(tenant, a, user, out _).Should().BeFalse();
    }

    [Fact]
    public void Revoke_assembly_user_invalidates_proof()
    {
        var svc = Create();
        var tenant = Guid.NewGuid();
        var ph = Guid.NewGuid();
        var a = Guid.NewGuid();
        var user = Guid.NewGuid();
        svc.Issue(tenant, ph, a, user, Guid.NewGuid());
        svc.InvalidateAssemblyUser(a, user);
        svc.Peek(tenant, a, user).Should().BeFalse();
    }
}