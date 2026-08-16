using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace TheBlock.Tests;

/// <summary>
/// End-to-end through the real host: DI wiring, JSON file loading, photo
/// rewriting, endpoint shapes, and static image serving.
/// </summary>
public class ApiIntegrationTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Vehicle_list_returns_all_200_in_snake_case()
    {
        var response = await _client.GetAsync("/api/vehicles");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        string body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"body_style\"", body);
        Assert.Contains("\"odometer_km\"", body);
        Assert.DoesNotContain("\"bodyStyle\"", body);

        using var json = JsonDocument.Parse(body);
        Assert.Equal(200, json.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task Vehicle_images_point_at_the_api_and_are_served_by_it()
    {
        using var json = JsonDocument.Parse(await _client.GetStringAsync("/api/vehicles"));

        var images = json.RootElement[0].GetProperty("images").EnumerateArray()
            .Select(image => image.GetString()!)
            .ToList();
        Assert.NotEmpty(images);
        Assert.All(images, url => Assert.StartsWith("/api/images/", url));

        var image = await _client.GetAsync(images[0]);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/jpeg", image.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Single_vehicle_lookup_round_trips_the_id()
    {
        using var list = JsonDocument.Parse(await _client.GetStringAsync("/api/vehicles"));
        string id = list.RootElement[0].GetProperty("id").GetString()!;

        using var single = JsonDocument.Parse(await _client.GetStringAsync($"/api/vehicles/{id}"));
        Assert.Equal(id, single.RootElement.GetProperty("id").GetString());
    }

    [Fact]
    public async Task Unknown_vehicle_id_returns_404()
    {
        var response = await _client.GetAsync("/api/vehicles/not-a-real-id");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Filters_by_make_via_query_parameter()
    {
        using var json = JsonDocument.Parse(await _client.GetStringAsync("/api/vehicles?make=Ford"));

        var makes = json.RootElement.EnumerateArray()
            .Select(v => v.GetProperty("make").GetString())
            .ToList();
        Assert.NotEmpty(makes);
        Assert.All(makes, make => Assert.Equal("Ford", make));
    }

    [Fact]
    public async Task Combines_multiple_filters()
    {
        using var json = JsonDocument.Parse(
            await _client.GetStringAsync("/api/vehicles?body_style=SUV&price_max=30000&min_condition=3"));

        foreach (var vehicle in json.RootElement.EnumerateArray())
        {
            Assert.Equal("SUV", vehicle.GetProperty("body_style").GetString());
            Assert.True(vehicle.GetProperty("condition_grade").GetDouble() >= 3);
            int price = vehicle.GetProperty("current_bid").ValueKind == JsonValueKind.Null
                ? vehicle.GetProperty("starting_bid").GetInt32()
                : vehicle.GetProperty("current_bid").GetInt32();
            Assert.True(price <= 30000);
        }
    }

    [Fact]
    public async Task Text_search_narrows_the_results()
    {
        using var json = JsonDocument.Parse(await _client.GetStringAsync("/api/vehicles?q=bronco"));

        int count = json.RootElement.GetArrayLength();
        Assert.InRange(count, 1, 199);
        Assert.All(json.RootElement.EnumerateArray(),
            vehicle => Assert.Equal("Bronco", vehicle.GetProperty("model").GetString()));
    }

    [Fact]
    public async Task Status_filter_returns_a_proper_subset()
    {
        using var json = JsonDocument.Parse(await _client.GetStringAsync("/api/vehicles?status=live"));

        // The schedule guarantees a mix, so live is never empty and never everything.
        Assert.InRange(json.RootElement.GetArrayLength(), 1, 199);
    }

    [Theory]
    [InlineData("sideways")]
    [InlineData("9")]
    [InlineData("live,ended")]
    public async Task Invalid_status_values_return_400(string status)
    {
        var response = await _client.GetAsync($"/api/vehicles?status={status}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Status_filter_honours_the_clients_midnight_anchor()
    {
        long anchor = new DateTimeOffset(DateTimeOffset.UtcNow.Date, TimeSpan.Zero).ToUnixTimeMilliseconds();
        using var json = JsonDocument.Parse(
            await _client.GetStringAsync($"/api/vehicles?status=live&anchor_ms={anchor}"));
        Assert.InRange(json.RootElement.GetArrayLength(), 1, 199);
    }

    [Fact]
    public async Task Implausible_anchor_returns_400()
    {
        var response = await _client.GetAsync("/api/vehicles?status=live&anchor_ms=12345");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Decimal_price_bounds_are_accepted_with_integer_semantics()
    {
        using var json = JsonDocument.Parse(
            await _client.GetStringAsync("/api/vehicles?price_max=30000.5"));
        Assert.InRange(json.RootElement.GetArrayLength(), 1, 199);
    }

    [Fact]
    public async Task Unmatched_filters_return_an_empty_array_not_an_error()
    {
        using var json = JsonDocument.Parse(await _client.GetStringAsync("/api/vehicles?make=DeLorean"));
        Assert.Equal(0, json.RootElement.GetArrayLength());
    }
}
