
namespace Backend.Models;

public record EstimateRequest(
    Parcel[] Parcels,
    EnquiryRequest Enquiry
);

public record Parcel(
    string Name,
    string AreaM2,
    string AreaHa,
    string Notes,
    Coordinate[] Coordinates,
    string? SatelliteImageBase64,
    string? TerrainImageBase64
);

public record Coordinate(
    string Lat,
    string Lng
);

public static class ParcelExtensions
{
    public static string ToConsistentHash(this Parcel[] parcels)
    {
        var parcelStrings = parcels
            .Select(p=> p.ToCoordinateString())
            .OrderBy(s => s)
            .ToArray();

        var serialized = System.Text.Json.JsonSerializer.Serialize(parcelStrings);
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        var hashBytes = sha256.ComputeHash(System.Text.Encoding.UTF8.GetBytes(serialized));
        return Convert.ToBase64String(hashBytes).Replace("/", "_").Replace("+", "-").TrimEnd('=');
    }
    
    public static string ToCoordinateString(this Parcel parcel)
    {
        return string.Join(", ", parcel.Coordinates.Select(c => $"{c.Lat},{c.Lng}"));
    }
}