using System.Text.Json;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Backend.Endpoints;

public class EnquiryEndpoint(ILogger<EnquiryEndpoint> logger, NotificationService notificationService)
{
    [Function("Enquiry")]
    public async Task<IActionResult> Run([HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequest req)
    {
        logger.LogInformation("Enquiry function processed a request.");

        try
        {
            var enquiryRequest = await JsonSerializer.DeserializeAsync<EnquiryRequest>(req.Body);
            if (enquiryRequest is null)
                return new BadRequestObjectResult("Invalid request payload.");

            await notificationService.NotifyEnquiry(enquiryRequest);

            return new OkObjectResult(new { message = "Enquiry received. We will be in touch soon.", enquiry = enquiryRequest });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing enquiry");
            return new ObjectResult("An error occurred processing your enquiry.") { StatusCode = 500 };
        }
    }

}