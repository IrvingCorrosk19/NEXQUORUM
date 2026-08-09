namespace Asambleas.Infrastructure.Communications;

using Asambleas.Application.Abstractions.Communications;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Hosting;

public sealed class DataProtectionSecretProtector : ISecretProtector
{
    private readonly IDataProtector _protector;

    public DataProtectionSecretProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector("Asambleas.CommunicationSecrets.v1");
    }

    public string Protect(string plaintext) => _protector.Protect(plaintext);

    public string Unprotect(string ciphertext) => _protector.Unprotect(ciphertext);
}

public sealed class HostCommunicationEnvironment : ICommunicationEnvironment
{
    private readonly IHostEnvironment _env;

    public HostCommunicationEnvironment(IHostEnvironment env)
    {
        _env = env;
    }

    public bool IsNonProduction => !_env.IsProduction();

    public string EnvironmentLabel => _env.EnvironmentName;
}
