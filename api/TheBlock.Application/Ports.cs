using TheBlock.Domain;

namespace TheBlock.Application;

/// <summary>Port: where the vehicle dataset comes from.</summary>
public interface IVehicleSource
{
    IReadOnlyList<Vehicle> Load();
}

/// <summary>Port: where the photo manifest comes from.</summary>
public interface IPhotoManifestSource
{
    IReadOnlyList<PhotoEntry> Load();
}
