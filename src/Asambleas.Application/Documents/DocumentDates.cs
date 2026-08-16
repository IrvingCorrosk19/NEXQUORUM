namespace Asambleas.Application.Documents;

using System.Globalization;

/// <summary>Human date/time presentation for Panama (America/Panama). Does not alter stored values.</summary>
public static class DocumentDates
{
    private static readonly CultureInfo EsPa = CultureInfo.GetCultureInfo("es-PA");
    private static readonly TimeZoneInfo Panama =
        ResolvePanama();

    private static TimeZoneInfo ResolvePanama()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("America/Panama");
        }
        catch (TimeZoneNotFoundException)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("SA Pacific Standard Time");
            }
            catch
            {
                return TimeZoneInfo.CreateCustomTimeZone("America/Panama", TimeSpan.FromHours(-5), "Panama", "Panama");
            }
        }
    }

    public static DateTimeOffset ToLocal(DateTimeOffset utcOrOffset) =>
        TimeZoneInfo.ConvertTime(utcOrOffset, Panama);

    public static string Long(DateTimeOffset? value)
    {
        if (value is null) return "—";
        var local = ToLocal(value.Value);
        return local.ToString("d 'de' MMMM 'de' yyyy · h:mm tt", EsPa);
    }

    public static string ShortDate(DateTimeOffset? value)
    {
        if (value is null) return "—";
        var local = ToLocal(value.Value);
        return local.ToString("d 'de' MMMM 'de' yyyy", EsPa);
    }

    public static string TimeOnly(DateTimeOffset? value)
    {
        if (value is null) return "—";
        var local = ToLocal(value.Value);
        return local.ToString("h:mm:ss tt", EsPa);
    }

    public static string IsoTechnical(DateTimeOffset? value) =>
        value?.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture) ?? "—";
}
