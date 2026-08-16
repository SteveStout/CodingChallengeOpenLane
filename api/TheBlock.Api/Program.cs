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

// The 200-record seed dataset is deterministically expanded to TargetCount
// synthetic records (default 100,000) — scale testing without a giant file.
int targetCount = builder.Configuration.GetValue("Inventory:TargetCount", 100_000);
builder.Services.AddSingleton<IVehicleSource>(
    new SyntheticVehicleSource(new JsonFileVehicleSource(dataPath), targetCount));
builder.Services.AddSingleton<IPhotoManifestSource>(new JsonFilePhotoManifestSource(manifestPath));
builder.Services.AddSingleton<InventoryService>();

var app = builder.Build();

// Materialize the inventory now so a bad dataset fails the process at
// startup, visibly — not as a 500 on the first request.
app.Services.GetRequiredService<InventoryService>().GetAll();

// The dataset is snake_case; keep the wire shape identical to the source file.
var wireFormat = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

// All filters, sorting, and paging are optional GET parameters, applied
// server-side. The default page is the top 100 by auction time (live and
// ending soonest first). Responses are an envelope: { total, vehicles }.
// e.g. /api/vehicles?make=Ford&status=live&sort=price-asc&limit=100
app.MapGet("/api/vehicles", (InventoryService inventory, [AsParameters] VehicleQueryParams query) =>
{
    if (!query.TryBuildFilter(out var filter, out var clock, out var sort, out var error))
    {
        return Results.BadRequest(new { error });
    }
    var result = inventory.Search(filter, clock, sort, query.EffectiveLimit);
    return Results.Json(new { total = result.Total, vehicles = result.Vehicles }, wireFormat);
});

// Dropdown values, computed from the full dataset (the page only ever holds a slice).
app.MapGet("/api/facets", (InventoryService inventory) =>
    Results.Json(inventory.Facets(), wireFormat));

app.MapGet("/api/vehicles/{id}", (InventoryService inventory, string id) =>
    inventory.GetById(id) is { } vehicle
        ? Results.Json(vehicle, wireFormat)
        : Results.NotFound());

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(imagesRoot),
    RequestPath = "/api/images",
    // The photo set is content-stable; let the browser's HTTP cache keep it
    // for a day instead of re-fetching 50 JPEGs per session.
    OnPrepareResponse = ctx =>
        ctx.Context.Response.Headers.CacheControl = "public, max-age=86400",
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
