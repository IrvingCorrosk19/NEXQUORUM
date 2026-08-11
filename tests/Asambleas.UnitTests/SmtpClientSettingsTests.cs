using Asambleas.Infrastructure.Communications;
using FluentAssertions;
using Xunit;

namespace Asambleas.UnitTests;

public sealed class SmtpClientSettingsTests
{
    [Fact]
    public void FromJson_accepts_port_as_string_from_ui()
    {
        var json = """{"host":"smtp.gmail.com","port":"587","fromAddress":"a@b.com","username":"a@b.com"}""";
        var settings = SmtpClientSettings.FromJson(json, "app-password");
        settings.Host.Should().Be("smtp.gmail.com");
        settings.Port.Should().Be(587);
        settings.UseSsl.Should().BeTrue();
        settings.Password.Should().Be("app-password");
    }

    [Fact]
    public void FromJson_accepts_port_as_number()
    {
        var json = """{"host":"smtp.gmail.com","port":587,"fromAddress":"a@b.com"}""";
        var settings = SmtpClientSettings.FromJson(json, "x");
        settings.Port.Should().Be(587);
    }
}
