using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using TheBlock.Api;
using TheBlock.Application;
using TheBlock.Infrastructure;

// Read-only inventory API, composed onion-style: Domain (entities, photo
// selection, auction schedule, filter rules) <- Application (InventoryService
// use case) <- Infrastructure (JSON file adapters) <- this host. The React
// app consumes it through Vite's /api proxy, so no CORS is needed.

var builder = WebApplication.CreateBuilder(args);

string contentRoot = builder.Environment.ContentRootPath;
// Walk up to the repo root rather than assuming a fixed depth — keeps
// `dotnet run`, tests, and published output all working from one line.
string dataPath = FindUpward(contentRoot, Path.Combine("data", "vehicles.json"));
string manifestPath = Path.Combine(contentRoot, "photo-manifest.json");
string imagesRoot = Path.Combine(contentRoot, "wwwroot", "images");

builder.Services.AddSingleton<IVehicleSource>(new JsonFileVehicleSource(dataPath));
builder.Services.AddSingleton<IPhotoManifestSource>(new JsonFilePhotoManifestSource(manifestPath));
builder.Services.AddSingleton<InventoryService>();

var app = builder.Build();

// Materialize the inventory now so a bad dataset fails the process at
// startup, visibly — not as a 500 on the first request.
app.Services.GetRequiredService<InventoryService>().GetAll();

// The dataset is snake_case; keep the wire shape identical to the source file.
var wireFormat = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

// All filters are optional GET parameters; filtering happens server-side.
// e.g. /api/vehicles?make=Ford&body_style=SUV&status=live&price_max=30000&q=bronco
app.MapGet("/api/vehicles", (InventoryService inventory, [AsParameters] VehicleQueryParams query) =>
    query.TryBuildFilter(out var filter, out var clock, out var error)
        ? Results.Json(inventory.Search(filter, clock), wireFormat)
        : Results.BadRequest(new { error }));

app.MapGet("/api/vehicles/{id}", (InventoryService inventory, string id) =>
    inventory.GetById(id) is { } vehicle
        ? Results.Json(vehicle, wireFormat)
        : Results.NotFound());

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(imagesRoot),
    RequestPath = "/api/images",
});

app.Run();

static string FindUpward(string startDirectory, string relativePath)
{
    for (var dir = new DirectoryInfo(startDirectory); dir is not null; dir = dir.Parent)
    {
        string candidate = Path.Combine(dir.FullName, relativePath);
        if (File.Exists(candidate))
        {
            return candidate;
        }
    }
    throw new FileNotFoundException($"Could not locate {relativePath} in or above {startDirectory}");
}

// Exposes the entry point to WebApplicationFactory for integration tests.
public partial class Program;
