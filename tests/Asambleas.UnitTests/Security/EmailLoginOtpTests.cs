using Asambleas.Infrastructure.Identity;
using FluentAssertions;

namespace Asambleas.UnitTests.Security;

public sealed class EmailLoginOtpSuggestTests
{
    [Theory]
    [InlineData("owner@gmail.com", "Google")]
    [InlineData("a@googlemail.com", "Google")]
    [InlineData("me@outlook.com", "Microsoft")]
    [InlineData("me@hotmail.com", "Microsoft")]
    [InlineData("me@live.com", "Microsoft")]
    [InlineData("user@contoso.onmicrosoft.com", "Microsoft")]
    [InlineData("someone@yahoo.com", null)]
    [InlineData("a@icloud.com", null)]
    [InlineData("ops@empresa.com.pa", null)]
    public void SuggestProvider_matches_common_domains(string email, string? expected)
    {
        EmailLoginOtpService.SuggestProvider(email).Should().Be(expected);
    }
}
