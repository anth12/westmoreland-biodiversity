
using System.Text.Json.Serialization;

namespace Backend.Models;

public record EnquiryRequest(
    [property: JsonPropertyName("fullname")] string FullName,
    [property: JsonPropertyName("email")] string EmailAddress,
    [property: JsonPropertyName("phone")] string PhoneNumber,
    [property: JsonPropertyName("address")] string StreetAddress,
    [property: JsonPropertyName("county")] string County,
    [property: JsonPropertyName("postcode")] string Postcode,
    [property: JsonPropertyName("message")] string? Message = null
);