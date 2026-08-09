using Npgsql;
var passwords = new[] { "postgres", "asambleas", "asambleas_dev_only", "admin", "" };
foreach (var p in passwords)
{
    try
    {
        await using var c = new NpgsqlConnection($"Host=127.0.0.1;Port=5432;Database=postgres;Username=postgres;Password={p}");
        await c.OpenAsync();
        Console.WriteLine($"CONNECTED password_len={p.Length}");
        await using var cmd = c.CreateCommand();
        cmd.CommandText = "SELECT 1 FROM pg_database WHERE datname='asambleas_tests'";
        var exists = await cmd.ExecuteScalarAsync();
        if (exists is null)
        {
            await using var create = c.CreateCommand();
            create.CommandText = "CREATE DATABASE asambleas_tests";
            await create.ExecuteNonQueryAsync();
            Console.WriteLine("CREATED asambleas_tests");
        }
        else Console.WriteLine("EXISTS asambleas_tests");
        // also ensure asambleas demo db
        cmd.CommandText = "SELECT 1 FROM pg_database WHERE datname='asambleas'";
        if (await cmd.ExecuteScalarAsync() is null)
        {
            await using var create2 = c.CreateCommand();
            create2.CommandText = "CREATE DATABASE asambleas";
            await create2.ExecuteNonQueryAsync();
            Console.WriteLine("CREATED asambleas");
        }
        Environment.SetEnvironmentVariable("PGPASSWORD", p);
        File.WriteAllText("tools/DbProbe/password.txt", p);
        return;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"FAIL len={p.Length}: {ex.Message}");
    }
}
Console.WriteLine("NO_PASSWORD_WORKED");
