using Npgsql;
var password = args.Length > 0 ? args[0] : "Panama2020$";
var cs = $"Host=127.0.0.1;Port=5432;Database=postgres;Username=postgres;Password={password}";
try
{
    await using var conn = new NpgsqlConnection(cs);
    await conn.OpenAsync();
    Console.WriteLine("CONNECTED");
    await using var check = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname='asambleas'", conn);
    if (await check.ExecuteScalarAsync() is null)
    {
        await using var create = new NpgsqlCommand("CREATE DATABASE asambleas", conn);
        await create.ExecuteNonQueryAsync();
        Console.WriteLine("CREATED_ASAMBLEAS");
    }
    else Console.WriteLine("ASAMBLEAS_EXISTS");
}
catch (Exception ex)
{
    Console.WriteLine("FAIL: " + ex.Message);
    // fallback empty password
    await using var conn2 = new NpgsqlConnection("Host=127.0.0.1;Port=5432;Database=postgres;Username=postgres;Password=");
    await conn2.OpenAsync();
    Console.WriteLine("CONNECTED_EMPTY");
    await using var check2 = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname='asambleas'", conn2);
    if (await check2.ExecuteScalarAsync() is null)
    {
        await using var create2 = new NpgsqlCommand("CREATE DATABASE asambleas", conn2);
        await create2.ExecuteNonQueryAsync();
        Console.WriteLine("CREATED_ASAMBLEAS");
    }
    else Console.WriteLine("ASAMBLEAS_EXISTS");
}
