using Microsoft.AspNetCore.Mvc;
using TheBlock.Domain;

namespace TheBlock.Api;

/// <summary>
/// GET-parameter binding for /api/vehicles — the wire names mirror the
/// payload's snake_case fields. Translates itself into the domain's
/// VehicleFilter plus the AuctionClock statuses are evaluated against,
/// rejecting unknown status values and implausible anchors.
/// </summary>
public sealed record VehicleQueryParams(
    string? Q,
    string? Make,
    [FromQuery(Name = "body_style")] string? BodyStyle,
    [FromQuery(Name = "title_status")] string? TitleStatus,
    string? Province,
    string? Status,
    [FromQuery(Name = "anchor_ms")] long? AnchorMs,
    [FromQuery(Name = "min_condition")] double? MinCondition,
    [FromQuery(Name = "price_min")] double? PriceMin,
    [FromQuery(Name = "price_max")] double? PriceMax)
{
    /// <summary>A real client's midnight anchor is always within a day or two of now.</summary>
    private const long MaxAnchorDriftMs = 2L * 24 * 60 * 60 * 1000;

    public bool TryBuildFilter(out VehicleFilter filter, out AuctionClock clock, out string? error)
    {
        filter = new VehicleFilter();
        var utcNow = DateTimeOffset.UtcNow;

        // The client sends its own local-midnight anchor so server-side status
        // filtering agrees with the browser's rendering across timezones and
        // DST. Without one, fall back to the server's local midnight.
        if (AnchorMs is { } anchor)
        {
            if (Math.Abs(anchor - utcNow.ToUnixTimeMilliseconds()) > MaxAnchorDriftMs)
            {
                clock = default;
                error = "anchor_ms must be within two days of the current time.";
                return false;
            }
            clock = new AuctionClock(utcNow.ToUnixTimeMilliseconds(), anchor);
        }
        else
        {
            clock = AuctionClock.ServerLocal(utcNow, TimeZoneInfo.Local);
        }

        // Explicit name matching — Enum.TryParse would also accept numeric
        // strings ("9") and comma lists ("live,ended"), which should be 400s.
        AuctionStatus? status = Status?.ToLowerInvariant() switch
        {
            "live" => AuctionStatus.Live,
            "upcoming" => AuctionStatus.Upcoming,
            "ended" => AuctionStatus.Ended,
            _ => null,
        };
        if (!string.IsNullOrEmpty(Status) && status is null)
        {
            error = $"Unknown status '{Status}'. Use live, upcoming, or ended.";
            return false;
        }

        filter = new VehicleFilter
        {
            Query = Q,
            Make = Make,
            BodyStyle = BodyStyle,
            TitleStatus = TitleStatus,
            Province = Province,
            Status = status,
            MinCondition = MinCondition,
            // Prices are whole dollars; accept decimal input but keep integer
            // semantics (min rounds up, max rounds down) and clamp to int range.
            PriceMin = ToIntBound(PriceMin, roundUp: true),
            PriceMax = ToIntBound(PriceMax, roundUp: false),
        };
        error = null;
        return true;
    }

    private static int? ToIntBound(double? value, bool roundUp)
    {
        if (value is not { } bound || !double.IsFinite(bound))
        {
            return null;
        }
        double rounded = roundUp ? Math.Ceiling(bound) : Math.Floor(bound);
        return (int)Math.Clamp(rounded, 0, int.MaxValue);
    }
}
