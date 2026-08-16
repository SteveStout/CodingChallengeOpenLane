using TheBlock.Domain;

namespace TheBlock.Application;

/// <summary>
/// The read-only inventory use case: loads the dataset once, rewrites each
/// vehicle's images to gallery picks served under <paramref name="imagePathPrefix"/>,
/// and answers list and by-id lookups. Vehicles whose body style has no photo
/// pool keep the images the dataset carries.
/// </summary>
public sealed class InventoryService(
    IVehicleSource vehicleSource,
    IPhotoManifestSource manifestSource,
    string imagePathPrefix = "/api/images")
{
    private readonly Lazy<(IReadOnlyList<Vehicle> All, IReadOnlyDictionary<string, Vehicle> ById)> _inventory =
        new(() => Build(vehicleSource, manifestSource, imagePathPrefix));

    public IReadOnlyList<Vehicle> GetAll() => _inventory.Value.All;

    /// <summary>Vehicles matching <paramref name="filter"/>, with statuses derived from <paramref name="clock"/>.</summary>
    public IReadOnlyList<Vehicle> Search(VehicleFilter filter, AuctionClock clock) =>
        GetAll().Where(vehicle => filter.Matches(vehicle, clock)).ToList();

    public Vehicle? GetById(string id) =>
        _inventory.Value.ById.TryGetValue(id, out var vehicle) ? vehicle : null;

    private static (IReadOnlyList<Vehicle>, IReadOnlyDictionary<string, Vehicle>) Build(
        IVehicleSource vehicleSource,
        IPhotoManifestSource manifestSource,
        string imagePathPrefix)
    {
        // Key pools by lowercase style — PhotoGallery looks them up lowercased,
        // so a capitalized style in the manifest must not silently miss.
        var pools = manifestSource
            .Load()
            .GroupBy(photo => photo.Style.ToLowerInvariant())
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<PhotoEntry>)group.ToList());

        var vehicles = vehicleSource
            .Load()
            .Select(vehicle =>
            {
                var photos = PhotoGallery.SelectPhotos(vehicle.Id, vehicle.Make, vehicle.BodyStyle, pools);
                return photos.Count == 0
                    ? vehicle
                    : vehicle with { Images = photos.Select(file => $"{imagePathPrefix}/{file}").ToList() };
            })
            .ToList();

        return (vehicles, vehicles.ToDictionary(vehicle => vehicle.Id));
    }
}
