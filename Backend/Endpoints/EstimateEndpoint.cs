using System.Text.Json;
using System.Text.RegularExpressions;
using Backend.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using OpenAI.Chat;

namespace Backend;

public class EstimateEndpoint(ILogger<EstimateEndpoint> logger, ChatClient chatClient)
{
    private static BinaryData? JsonSchema { get; set; }
    
    [Function("Estimate")]
    public async Task<IActionResult> Run([HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequest req)
    {
        logger.LogInformation("HTTP trigger function processed a request.");

        var estimateRequest = await JsonSerializer.DeserializeAsync<EstimateRequest>(req.Body);
        if (estimateRequest is null)
            return new BadRequestObjectResult("Invalid request payload.");

        var userMessage = $"""
            Location: {estimateRequest.Enquiry.StreetAddress}, {estimateRequest.Enquiry.Postcode}, {estimateRequest.Enquiry.County},
            
            Parcels:
            ```
            {JsonSerializer.Serialize(estimateRequest.Parcels)}
            ```
            """;

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
            new UserChatMessage(userMessage)
        ];

        JsonSchema ??= BinaryData.FromString(NJsonSchema.JsonSchema.FromType<EstimateResponse>().ToJson());
        
        ChatCompletionOptions options = new()
        {
            ResponseFormat = ChatResponseFormat.CreateJsonSchemaFormat("estimate_response", JsonSchema)
        };
        
        var response = await chatClient.CompleteChatAsync(messages, options);

        logger.LogInformation("Chat completed with {InputTokens} and {OutputTokens}",
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

        return new OkObjectResult(estimateResponse);
    }
}