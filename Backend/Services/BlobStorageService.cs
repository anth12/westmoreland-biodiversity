using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using Backend.Models;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Backend.Services;

public class BlobStorageService(BlobContainerClient containerClient, ILogger<BlobStorageService> logger)
{
    /// <summary>
    /// Decodes a base64 image string and uploads it to blob storage,
    /// returning the blob name and a short-lived SAS URL for the LLM to read.
    /// </summary>
    public async Task<(string BlobName, Uri SasUrl)?> UploadFromBase64Async(string base64Image, string blobName)
    {
        try
        {
            await containerClient.CreateIfNotExistsAsync();

            var imageBytes = Convert.FromBase64String(base64Image);

            var blobClient = containerClient.GetBlobClient(blobName);
            using var stream = new MemoryStream(imageBytes);
            await blobClient.UploadAsync(stream, overwrite: true);

            var sasUri = blobClient.GenerateSasUri(BlobSasPermissions.Read, DateTimeOffset.UtcNow.AddHours(24));

            logger.LogInformation("Uploaded blob {BlobName} from base64", blobName);
            return (blobName, sasUri);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to upload blob {BlobName} from base64", blobName);
            return null;
        }
    }

    /// <summary>
    /// Deletes a blob by name. Safe to call even if the blob doesn't exist.
    /// </summary>
    public async Task DeleteAsync(string blobName)
    {
        try
        {
            var blobClient = containerClient.GetBlobClient(blobName);
            await blobClient.DeleteIfExistsAsync();
            logger.LogInformation("Deleted blob {BlobName}", blobName);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to delete blob {BlobName}", blobName);
        }
    }

    /// <summary>
    /// Retrieves a cached estimate from blob storage if it exists and is within 2 days.
    /// </summary>
    public async Task<EstimateResponse?> GetCachedEstimateAsync(string requestHash)
    {
        try
        {
            var blobClient = containerClient.GetBlobClient($"cache/{requestHash}.json");
            
            if (!await blobClient.ExistsAsync())
            {
                logger.LogInformation("Cache miss for request hash {Hash}", requestHash);
                return null;
            }

            var download = await blobClient.DownloadAsync();
            var cached = await JsonSerializer.DeserializeAsync<EstimateResponse>(download.Value.Content);

            if (cached == null)
                return null;

            // Check if cache is still valid (within 2 days)
            var age = DateTime.UtcNow - cached.GeneratedAt;
            if (age.TotalDays > 2)
            {
                logger.LogInformation("Cache expired for request hash {Hash}, age: {AgeDays} days", requestHash, age.TotalDays);
                return null;
            }

            logger.LogInformation("Cache hit for request hash {Hash}, age: {AgeHours} hours", requestHash, age.TotalHours);
            return cached;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to retrieve cached estimate for hash {Hash}", requestHash);
            return null;
        }
    }

    /// <summary>
    /// Saves an estimate response to blob storage cache.
    /// </summary>
    public async Task SaveCachedEstimateAsync(string requestHash, EstimateResponse estimate)
    {
        try
        {
            await containerClient.CreateIfNotExistsAsync();

            var blobClient = containerClient.GetBlobClient($"cache/{requestHash}.json");
            using var stream = new MemoryStream();
            await JsonSerializer.SerializeAsync(stream, estimate);
            stream.Position = 0;

            await blobClient.UploadAsync(stream, overwrite: true);
            logger.LogInformation("Cached estimate for request hash {Hash}", requestHash);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to cache estimate for hash {Hash}", requestHash);
        }
    }
}
