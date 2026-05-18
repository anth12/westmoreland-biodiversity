using System.Text.Json.Serialization;

namespace Backend.Models;
// Root myDeserializedClass = JsonSerializer.Deserialize<Root>(myJsonResponse);
public record CommercialTerms(
    [property: JsonPropertyName("agreement_length_years")] int AgreementLengthYears,
    [property: JsonPropertyName("payment_structure")] string PaymentStructure
);

public record LandParcel(
    [property: JsonPropertyName("parcel_id")] string ParcelId,
    [property: JsonPropertyName("hectares")] double Hectares,
    [property: JsonPropertyName("primary_habitat")] string PrimaryHabitat,
    [property: JsonPropertyName("predicted_condition")] string PredictedCondition,
    [property: JsonPropertyName("bng_unit_contribution")] double BngUnitContribution,
    [property: JsonPropertyName("nn_unit_contribution_p_kg")] double NnUnitContributionPKg
);

public record ProjectSummary(
    [property: JsonPropertyName("reference_file")] string ReferenceFile,
    [property: JsonPropertyName("total_hectares")] double TotalHectares,
    [property: JsonPropertyName("total_estimated_bng_units")] double TotalEstimatedBngUnits,
    [property: JsonPropertyName("total_estimated_nn_p_kg")] double TotalEstimatedNnPKg,
    [property: JsonPropertyName("overall_valuation_gbp")] double OverallValuationGbp
);

public record EstimateResponse(
    [property: JsonPropertyName("project_summary")] ProjectSummary ProjectSummary,
    [property: JsonPropertyName("land_parcels")] IReadOnlyList<LandParcel> LandParcels,
    [property: JsonPropertyName("commercial_terms")] CommercialTerms CommercialTerms,
    [property: JsonPropertyName("generated_at")] DateTime GeneratedAt
);

