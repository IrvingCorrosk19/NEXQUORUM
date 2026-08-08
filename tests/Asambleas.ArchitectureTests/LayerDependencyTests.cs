using System.Reflection;
using Asambleas.Domain.Common;
using FluentAssertions;

namespace Asambleas.ArchitectureTests;

public sealed class LayerDependencyTests
{
    [Fact]
    public void Domain_must_not_reference_Infrastructure_or_Web()
    {
        var refs = GetReferencedAssemblyNames(typeof(Entity).Assembly);
        refs.Should().NotContain("Asambleas.Infrastructure");
        refs.Should().NotContain("Asambleas.Web");
    }

    [Fact]
    public void Application_must_not_reference_Infrastructure_or_Web()
    {
        var refs = GetReferencedAssemblyNames(typeof(Asambleas.Application.DependencyInjection).Assembly);
        refs.Should().NotContain("Asambleas.Infrastructure");
        refs.Should().NotContain("Asambleas.Web");
    }

    [Fact]
    public void Controllers_exist_as_sealed_classes_in_Web()
    {
        var controllers = typeof(Program).Assembly.GetTypes()
            .Where(t => t.IsClass
                        && t.Namespace == "Asambleas.Web.Controllers"
                        && t.Name.EndsWith("Controller", StringComparison.Ordinal))
            .ToList();

        controllers.Should().NotBeEmpty();
        controllers.Should().OnlyContain(t => t.IsSealed);
    }

    private static IReadOnlyCollection<string> GetReferencedAssemblyNames(Assembly assembly) =>
        assembly.GetReferencedAssemblies().Select(a => a.Name!).ToArray();
}
