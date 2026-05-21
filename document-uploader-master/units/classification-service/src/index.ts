import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { newDynamoDocumentClient, workspaces } from "@docuploader/data-access";
import { fileTypeFromBuffer } from "file-type";
import pino from "pino";
import { classify } from "./handler.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "classification-service", environment: process.env.ENVIRONMENT ?? "sandbox" },
});

const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const ddb = newDynamoDocumentClient(region);
const workspacesClient = new workspaces.Client(ddb);

const QUEUE_URL = required("CLASSIFICATION_QUEUE_URL");
const ROUTE_QUEUE_URLS: Record<string, string> = {
  "convert/office": required("CONVERT_OFFICE_QUEUE_URL"),
  "convert/html": required("CONVERT_HTML_QUEUE_URL"),
  "convert/image": required("CONVERT_IMAGE_QUEUE_URL"),
  "convert/tiff": required("TIFF_COG_QUEUE_URL"),
  "ocr-direct": required("OCR_DIRECT_QUEUE_URL"),
  "email": required("EMAIL_QUEUE_URL"),
  "archive": required("ARCHIVE_QUEUE_URL"),
  "media": required("MEDIA_QUEUE_URL"),
  "slipsheet": required("SLIPSHEET_QUEUE_URL"),
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`required env var ${name}`);
  return v;
}

async function run() {
  logger.info({ queueUrl: QUEUE_URL }, "starting worker loop");
  let running = true;
  process.on("SIGINT", () => (running = false));
  process.on("SIGTERM", () => (running = false));

  while (running) {
    const res = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
      }),
    );
    for (const m of res.Messages ?? []) {
      try {
        await handleMessage(m.Body ?? "{}");
        await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: m.ReceiptHandle }));
      } catch (err) {
        logger.warn({ err, messageId: m.MessageId }, "message handling failed; visibility timeout will redrive");
      }
    }
  }
  logger.info("worker loop exited");
}

async function handleMessage(body: string) {
  const msg = JSON.parse(body) as { documentId: string; tenantId: string; workspaceId: string; s3Bucket: string; s3Key: string };
  const ws = await workspacesClient.get(msg.workspaceId);
  const obj = await s3.send(new GetObjectCommand({ Bucket: msg.s3Bucket, Key: msg.s3Key, Range: "bytes=0-4095" }));
  const head = Buffer.from(await obj.Body!.transformToByteArray());

  const route = await classify(head, msg.s3Key, ws);
  logger.info({ documentId: msg.documentId, route }, "classified");
  const target = ROUTE_QUEUE_URLS[route] ?? ROUTE_QUEUE_URLS["slipsheet"];
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: target,
      MessageBody: JSON.stringify({ ...msg, route, schemaVersion: 1 }),
    }),
  );
}

run().catch((err) => {
  logger.fatal({ err }, "fatal");
  process.exit(1);
});

export { fileTypeFromBuffer };
