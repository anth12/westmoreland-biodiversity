using Azure;
using Azure.AI.OpenAI;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services.AddTransient(s =>
{
    var endpoint = new Uri(GetConfigValue("AI_ENDPOINT")
                           ?? throw new InvalidOperationException("AI_ENDPOINT environment variable is not set."));

    var deploymentName = GetConfigValue("AI_MODEL", "gpt-5.4");
    var apiKey = GetConfigValue("AI_KEY");
    
    AzureOpenAIClient azureClient = new(endpoint, new AzureKeyCredential(apiKey));
    var chatClient = azureClient.GetChatClient(deploymentName);
    return chatClient;
});

string GetConfigValue(string key, string? defaultValue = null)
{
    return builder.Configuration[key]
           ?? Environment.GetEnvironmentVariable(key)
           ?? defaultValue
            ?? throw new InvalidOperationException($"Missing configuration value for {key}");
}

builder.Build().Run();