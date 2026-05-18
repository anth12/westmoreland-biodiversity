using System.Text.Json.Serialization;

namespace Backend.Models;

public record EstimateRequest(
    [property: JsonPropertyName("parcels")] Parcel[] Parcels,
    [property: JsonPropertyName("enquiry")] EnquiryRequest Enquiry
);

public record Parcel(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("area_m2")] decimal AreaM2,
    [property: JsonPropertyName("area_ha")] decimal AreaHa,
    [property: JsonPropertyName("notes")] string Notes,
    [property: JsonPropertyName("coordinates")] Coordinate[] Coordinates,
    [property: JsonPropertyName("satellite_image_base64")] string? SatelliteImageBase64,
    [property: JsonPropertyName("agreement_length_years")] string? TerrainImageBase64
);

public record Coordinate(
    [property: JsonPropertyName("lat")] decimal Lat,
    [property: JsonPropertyName("lng")] decimal Lng
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