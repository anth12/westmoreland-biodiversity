
namespace Backend.Models;

public record EnquiryRequest(
    string FullName,
    string EmailAddress,
    string PhoneNumber,
    string StreetAddress,
    string County,
    string Postcode,
    string? Message = null
);