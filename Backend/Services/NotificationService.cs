using Backend.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Mailjet.Client;
using Mailjet.Client.TransactionalEmails;

namespace Backend.Services;

public class NotificationService(IConfiguration configuration, ILogger<NotificationService> logger)
{

    public async Task NotifyEnquiry(EnquiryRequest enquiry)
    {
        var emailBody = $"""
            <h2>New Enquiry Submitted</h2>
            <p><strong>Name:</strong> {enquiry.FullName}</p>
            <p><strong>Email:</strong> {enquiry.EmailAddress}</p>
            <p><strong>Phone:</strong> {enquiry.PhoneNumber}</p>
            <p><strong>Address:</strong> {enquiry.StreetAddress}, {enquiry.Postcode}, {enquiry.County}</p>
            <p><strong>Message:</strong></p>
            <p>{enquiry.Message ?? "(No message provided)"}</p>
            """;

        await SendEmail("New Enquiry Received", emailBody);
    }

    public async Task NotifyEstimate(EstimateRequest estimateRequest, EstimateResponse? response)
    {
        var parcelsHtml = string.Join("\n", estimateRequest.Parcels.Select(p => $"""
            <li><strong>{p.Name}</strong> - {p.AreaHa}ha - {p.Notes ?? "No notes"}</li>
            """));

        var responseHtml = response != null ? BuildEstimateResultsHtml(response) : "<p>Estimate processing...</p>";

        var emailBody = $"""
            <h2>Land Estimate Submitted</h2>
            <p><strong>Submitted By:</strong> {estimateRequest.Enquiry.FullName}</p>
            <p><strong>Email:</strong> {estimateRequest.Enquiry.EmailAddress}</p>
            <p><strong>Phone:</strong> {estimateRequest.Enquiry.PhoneNumber}</p>
            <p><strong>Location:</strong> {estimateRequest.Enquiry.StreetAddress}, {estimateRequest.Enquiry.Postcode}, {estimateRequest.Enquiry.County}</p>
            
            <h3>Parcels</h3>
            <ul>
            {parcelsHtml}
            </ul>
            
            {responseHtml}
            """;

        await SendEmail("Land Estimate Submitted", emailBody);
    }

    private string BuildEstimateResultsHtml(EstimateResponse response)
    {
        var summary = response.ProjectSummary;
        var terms = response.CommercialTerms;

        var parcelsTable = string.Join("\n", response.LandParcels.Select(p => $"""
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">{p.ParcelId}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{p.Hectares:F2}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{p.PrimaryHabitat}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{p.PredictedCondition}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{p.BngUnitContribution:F2}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">{p.NnUnitContributionPKg:F2}</td>
            </tr>
            """));

        return $"""
            <h3>📊 Estimate Results</h3>
            <p><strong>Reference:</strong> {summary.ReferenceFile}</p>
            
            <h4>Project Summary</h4>
            <table style="border-collapse: collapse; width: 100%;">
                <tr style="background-color: #f2f2f2;">
                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total Hectares</strong></td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{summary.TotalHectares:F2}</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total BNG Units</strong></td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{summary.TotalEstimatedBngUnits:F2}</td>
                </tr>
                <tr style="background-color: #f2f2f2;">
                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Total NN (Phosphorus)</strong></td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{summary.TotalEstimatedNnPKg:F2} kg/year</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Overall Valuation (GBP)</strong></td>
                    <td style="border: 1px solid #ddd; padding: 8px;">£{summary.OverallValuationGbp:N2}</td>
                </tr>
            </table>
            
            <h4>Land Parcels Details</h4>
            <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
                <tr style="background-color: #f2f2f2;">
                    <th style="border: 1px solid #ddd; padding: 8px;">Parcel ID</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">Hectares</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">Primary Habitat</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">Condition</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">BNG Units</th>
                    <th style="border: 1px solid #ddd; padding: 8px;">NN P (kg)</th>
                </tr>
                {parcelsTable}
            </table>
            
            <h4>Commercial Terms</h4>
            <table style="border-collapse: collapse; width: 100%; margin-top: 10px;">
                <tr style="background-color: #f2f2f2;">
                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Agreement Length</strong></td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{terms.AgreementLengthYears} years</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;"><strong>Payment Structure</strong></td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{terms.PaymentStructure}</td>
                </tr>
            </table>
            
            <p style="margin-top: 20px; color: #666; font-size: 12px;"><em>Disclaimer: These figures are initial indications and require a formal Statutory Biodiversity Metric review for planning purposes.</em></p>
            """;
    }

    private async Task SendEmail(string subject, string htmlContent)
    {
        var mailjetKey = configuration["MAILJET_APIKEY"];
        var recipientEmails = configuration["NOTIFICATION_RECIPIENTS"];
        var fromEmail = configuration["NOTIFICATION_SENDER"];
        
        if (string.IsNullOrEmpty(mailjetKey))
        {
            logger.LogWarning("MailJet API key not configured.");
            return;
        }
        
        try
        {
            MailjetClient client = new MailjetClient(
                Environment.GetEnvironmentVariable("MAILJET_APIKEY"), 
                Environment.GetEnvironmentVariable("MAILJET_SECRET"));

            // construct your email with builder
            var email = new TransactionalEmailBuilder()
                .WithFrom(new SendContact(fromEmail))
                .WithSubject(subject)
                .WithHtmlPart(htmlContent)
                .WithTo(recipientEmails!.Split(';').Select( e=> new SendContact(e.Trim())))
                .Build();

            // invoke API to send email
            var response = await client.SendTransactionalEmailAsync(email);

            foreach (var responseMessage in response.Messages)
            {
                logger.LogInformation("Email sent status {Status} {@Errors}", responseMessage.Status, responseMessage.Errors);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Exception sending email to {Email}", recipientEmails);
        }
    }
}