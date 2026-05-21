import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Construct a shared DynamoDB Document Client.
 * IRSA credentials are picked up from the default provider chain; no static
 * keys are read by this module.
 */
export function newDynamoDocumentClient(region: string = "eu-west-1"): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
}
