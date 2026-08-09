# ASAMBLEAS production image (linux)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Asambleas.sln ./
COPY src/Asambleas.Domain/Asambleas.Domain.csproj src/Asambleas.Domain/
COPY src/Asambleas.Contracts/Asambleas.Contracts.csproj src/Asambleas.Contracts/
COPY src/Asambleas.Application/Asambleas.Application.csproj src/Asambleas.Application/
COPY src/Asambleas.Infrastructure/Asambleas.Infrastructure.csproj src/Asambleas.Infrastructure/
COPY src/Asambleas.Web/Asambleas.Web.csproj src/Asambleas.Web/
COPY src/Asambleas.Workers/Asambleas.Workers.csproj src/Asambleas.Workers/
RUN dotnet restore src/Asambleas.Web/Asambleas.Web.csproj
COPY src/ ./src/
RUN dotnet publish src/Asambleas.Web/Asambleas.Web.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8080/health/live || exit 1
ENTRYPOINT ["dotnet", "Asambleas.Web.dll"]
