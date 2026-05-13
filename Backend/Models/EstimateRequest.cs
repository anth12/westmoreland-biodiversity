
namespace Backend.Models;

public record EstimateRequest(
    Parcel[] Parcels,
    EnquiryRequest Enquiry
);

public record Parcel(
    string ParcelId,
    string Location,
    string Notes
);

