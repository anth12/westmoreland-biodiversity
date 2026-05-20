using System.Text.Json;
using System.Text.RegularExpressions;
using Backend.Models;
using Backend.Services;
using HtmlAgilityPack;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OpenAI.Chat;

namespace Backend.Endpoints;

public class EstimateEndpoint(IConfiguration configuration, ILogger<EstimateEndpoint> logger, ChatClient chatClient, BlobStorageService blobStorageService, NotificationService notificationService)
{
    private static readonly HttpClient HttpClient = new();
    private static BinaryData? JsonSchema { get; set; }

    [Function("Estimate")]
    public async Task<IActionResult> Run([HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequest req)
    {
        logger.LogInformation("HTTP trigger function processed a request.");


        var estimateRequest = await JsonSerializer.DeserializeAsync<EstimateRequest>(req.Body);
        if (estimateRequest is null)
            return new BadRequestObjectResult("Invalid request payload.");

        // Validate request
        var validationError = ValidateEstimateRequest(estimateRequest);
        if (!string.IsNullOrEmpty(validationError))
            return new BadRequestObjectResult(validationError);

        // Generate hash from request (excluding base64 images for consistent hashing)
        var requestHash = estimateRequest.Parcels.ToConsistentHash();
        logger.LogInformation("Request hash: {Hash}", requestHash);

        // Check cache
        var cachedEstimate = await blobStorageService.GetCachedEstimateAsync(requestHash);
        if (cachedEstimate != null)
        {
            logger.LogInformation("Returning cached estimate");
            
            // Send notification email
            try
            {
                await notificationService.NotifyEstimate(estimateRequest, cachedEstimate);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to send notification email for estimate request");
            }
            return new OkObjectResult(cachedEstimate);
        }

        // Track uploaded blob names so we can delete them after the LLM call
        var uploadedBlobs = new List<string>();

        try
        {
            var userMessageContent = new List<ChatMessageContentPart>
            {
                ChatMessageContentPart.CreateTextPart($"""
                    Location: {estimateRequest.Enquiry.StreetAddress}, {estimateRequest.Enquiry.Postcode}, {estimateRequest.Enquiry.County}
                    
                    Parcels:
                    ```
                    {JsonSerializer.Serialize(estimateRequest.Parcels.Select(p => new
                    {
                        p.Name,
                        p.AreaM2,
                        p.AreaHa,
                        p.Notes,
                        //Coordinates = p.Coordinates.Select(c => $"{c.Lat},{c.Lng}")
                    }), new JsonSerializerOptions { WriteIndented = true })}
                    ```
                    """)
            };

            var requestId = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            foreach (var parcel in estimateRequest.Parcels)
            {
                var safeName = Regex.Replace(parcel.Name, @"[^a-z0-9]", "-", RegexOptions.IgnoreCase).ToLower();

                if (parcel.SatelliteImageBase64 is not null)
                {
                    var blobName = $"{requestId}/{safeName}-satellite.png";
                    var upload = await blobStorageService.UploadFromBase64Async(parcel.SatelliteImageBase64, blobName);
                    if (upload.HasValue)
                    {
                        uploadedBlobs.Add(upload.Value.BlobName);
                        userMessageContent.Add(ChatMessageContentPart.CreateTextPart($"**{parcel.Name} — Satellite View:**"));
                        userMessageContent.Add(ChatMessageContentPart.CreateImagePart(upload.Value.SasUrl));
                    }
                }

                if (parcel.TerrainImageBase64 is not null)
                {
                    var blobName = $"{requestId}/{safeName}-terrain.png";
                    var upload = await blobStorageService.UploadFromBase64Async(parcel.TerrainImageBase64, blobName);
                    if (upload.HasValue)
                    {
                        uploadedBlobs.Add(upload.Value.BlobName);
                        userMessageContent.Add(ChatMessageContentPart.CreateTextPart($"**{parcel.Name} — Terrain/Topo View:**"));
                        userMessageContent.Add(ChatMessageContentPart.CreateImagePart(upload.Value.SasUrl));
                    }
                }
            }
            
            var guidanceUrls = configuration["GUIDANCE_URLS"]!.Split(';').Select(u => u.Trim()).ToArray();

            var guidance = await Task.WhenAll(guidanceUrls.Select(FetchGuidance));
            
            List<ChatMessage> messages =
            [
                new SystemChatMessage(
"""
You are an expert UK Environmental Broker and Land Surveyor specialising in Biodiversity Net Gain (BNG) and Nutrient Neutrality (NN). 
Your goal is to provide preliminary, high-level ecological asset valuations based on visual evidence.

Input Context:
For every land parcel, the user will provide two images:

Satellite View: To identify land cover, boundary scale, and proximity to watercourses.
Terrain/Topography View: To identify drainage patterns, slope, and potential for specific habitat creation (e.g., wetlands vs. woodland).

Guidelines & Analysis Protocol:

Hectare Estimation: Use the provided imagery and location context to estimate land area if not provided.
Habitat Classification: Use UKHab (UK Habitat Classification) terminology. Predict the baseline habitat (e.g., Modified Grassland, Lowland Meadow, Riparian Scrub).

BNG Calculation:

Estimate baseline units using a standard multiplier (typically 2.0–6.0 units per hectare depending on distinctiveness).
Identify "Uplift Potential" based on the terrain (e.g., a boggy depression suggests high potential for wetland units).

Nutrient Neutrality (NN):

Identify if the site sits within a protected catchment (e.g., River Eden, The Solent).
Estimate Phosphorus (P) or Nitrogen (N) kg/year credits based on land use change (e.g., ceasing intensive grazing).

Financials: Apply current 2026 UK market rates (e.g., £25k–£40k per BNG unit).

Formatting: Always conclude with a structured JSON payload following the "Multi-Parcel Land Credit Assessment" schema to allow for programmatic data ingestion.

Tone and Style:

Professional, British English, and data-driven.

Include a standard legal disclaimer that figures are "Initial Indications" and require a formal Statutory Biodiversity Metric for planning.

Prioritise scannability using tables and bold headers.

Example Template for User Input
When you use this prompt, you can instruct your LLM to expect the data in this format:

Parcel ID: [Name]
Location: [address]
Satellite Image: [Attached]
Terrain Image: [Attached]
User Notes: [e.g., Currently used for sheep grazing, contains a small stream]
"""),
                new UserChatMessage(userMessageContent),
            ];

            foreach (var guidanceText in guidance)
            {
                messages.Add("Take the following guidance into consideration when generating the estimates:\n" + guidanceText);
            }

            JsonSchema ??= BinaryData.FromString(NJsonSchema.JsonSchema.FromType<EstimateResponse>().ToJson());

            ChatCompletionOptions options = new()
            {
                ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat("estimate_response", JsonSchema)
            };

            var response = await chatClient.CompleteChatAsync(messages, options);

            logger.LogInformation("Chat completed with {InputTokens} input tokens and {OutputTokens} output tokens.",
                response.Value.Usage.InputTokenCount, response.Value.Usage.OutputTokenCount);

            var responseText = response.Value.Content[0].Text;
            Console.WriteLine(responseText);

            // Extract the JSON block from the model's response
            var jsonMatch = Regex.Match(responseText, @"\{[\s\S]*\}");
            if (!jsonMatch.Success)
            {
                logger.LogError("Unable to find JSON response in LLM response {Response}", responseText);
                return new UnprocessableEntityObjectResult("Model did not return a valid JSON payload.");
            }

            var estimateResponse = JsonSerializer.Deserialize<EstimateResponse>(jsonMatch.Value);
            
            if (estimateResponse != null)
            {
                // Set the GeneratedAt timestamp
                estimateResponse = estimateResponse with { GeneratedAt = DateTime.UtcNow };
                
                // Cache the result
                await blobStorageService.SaveCachedEstimateAsync(requestHash, estimateResponse);
                
                // Send notification email
                try
                {
                    await notificationService.NotifyEstimate(estimateRequest, estimateResponse);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Failed to send notification email for estimate request {RequestId}", requestId);
                }

                return new OkObjectResult(estimateResponse);
            }
            
            logger.LogError("Failed to deserialize estimate response");
            return new UnprocessableEntityObjectResult("Failed to process estimate response.");
        }
        finally
        {
            // Always delete uploaded blobs regardless of success or failure
            var deleteTasks = uploadedBlobs.Select(blobStorageService.DeleteAsync);
            await Task.WhenAll(deleteTasks);
            logger.LogInformation("Deleted {Count} temporary blobs", uploadedBlobs.Count);
        }
    }

    private string? ValidateEstimateRequest(EstimateRequest request)
    {
        // Validate parcels
        if (request.Parcels == null || request.Parcels.Length == 0)
            return "Parcels array is required and must contain at least one parcel.";

        // Validate each parcel
        for (int i = 0; i < request.Parcels.Length; i++)
        {
            var parcel = request.Parcels[i];

            if (string.IsNullOrWhiteSpace(parcel.Name))
                return $"Parcel {i + 1}: Name is required and cannot be empty.";

            if (parcel.Coordinates == null || parcel.Coordinates.Length < 3)
                return $"Parcel '{parcel.Name}': Must have at least 3 coordinates (minimum for a valid polygon). Found: {parcel.Coordinates?.Length ?? 0}.";
        }

        // Validate enquiry
        if (request.Enquiry == null)
            return "Enquiry information is required.";

        if (string.IsNullOrWhiteSpace(request.Enquiry.FullName))
            return "Enquiry.FullName is required.";

        if (string.IsNullOrWhiteSpace(request.Enquiry.EmailAddress))
            return "Enquiry.EmailAddress is required.";

        if (string.IsNullOrWhiteSpace(request.Enquiry.PhoneNumber))
            return "Enquiry.PhoneNumber is required.";

        if (string.IsNullOrWhiteSpace(request.Enquiry.StreetAddress))
            return "Enquiry.StreetAddress is required.";

        if (string.IsNullOrWhiteSpace(request.Enquiry.County))
            return "Enquiry.County is required.";

        if (string.IsNullOrWhiteSpace(request.Enquiry.Postcode))
            return "Enquiry.Postcode is required.";

        return null; // Validation passed
    }
    
    private async Task<string> FetchGuidance(string url)
    {
        var response = await HttpClient.GetAsync(url);
        var html = await response.Content.ReadAsStringAsync();
    
        var doc = new HtmlDocument();
        doc.LoadHtml(html);
        var govspeak = doc.DocumentNode.SelectSingleNode("//*[@id='contents']")?.InnerText;
    
        return govspeak ?? string.Empty;
    }
}