const { EmailClient } = require("@azure/communication-email");
const { TableClient } = require("@azure/data-tables");
const crypto = require("crypto");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_LOG = new Map();
const RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.CONTACT_RATE_LIMIT_MAX || 5);
const RATE_LIMIT_PROVIDER = (process.env.CONTACT_RATE_LIMIT_PROVIDER || "table").toLowerCase();
const RATE_LIMIT_TABLE_NAME = process.env.CONTACT_RATE_LIMIT_TABLE_NAME || "ContactRateLimit";
const RATE_LIMIT_STORAGE_CONNECTION_STRING = process.env.CONTACT_RATE_LIMIT_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
const MIN_FORM_OPEN_MS = Number(process.env.CONTACT_MIN_FORM_OPEN_MS || 2000);

let tableClient = null;
let tableInitPromise = null;

function getRequestBody(req) {
  if (!req || req.body == null) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }

  if (typeof req.body === "object") {
    return req.body;
  }

  return {};
}

function sanitize(value) {
  return String(value || "").trim();
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

async function getTableClient() {
  if (tableClient) {
    return tableClient;
  }

  if (!RATE_LIMIT_STORAGE_CONNECTION_STRING) {
    return null;
  }

  if (!tableInitPromise) {
    tableInitPromise = (async () => {
      const client = TableClient.fromConnectionString(RATE_LIMIT_STORAGE_CONNECTION_STRING, RATE_LIMIT_TABLE_NAME);
      await client.createTable();
      tableClient = client;
      return client;
    })();
  }

  try {
    return await tableInitPromise;
  } catch (error) {
    tableInitPromise = null;
    return null;
  }
}

function getClientIp(req) {
  const forwardedFor = req && req.headers && req.headers["x-forwarded-for"];
  if (forwardedFor) {
    return String(forwardedFor).split(",")[0].trim();
  }

  const clientIp = req && req.headers && req.headers["x-client-ip"];
  if (clientIp) {
    return String(clientIp).trim();
  }

  return "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const existingTimestamps = REQUEST_LOG.get(ip) || [];
  const freshTimestamps = existingTimestamps.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (freshTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    REQUEST_LOG.set(ip, freshTimestamps);
    return true;
  }

  freshTimestamps.push(now);
  REQUEST_LOG.set(ip, freshTimestamps);
  return false;
}

async function isRateLimitedWithTable(ip, context) {
  const client = await getTableClient();
  if (!client) {
    context.log.warn("Table rate-limit unavailable. Falling back to in-memory rate-limit.");
    return isRateLimited(ip);
  }

  const now = Date.now();
  const rowKey = hashIp(ip);

  try {
    let entity;
    try {
      entity = await client.getEntity("contact", rowKey);
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }

    if (!entity) {
      await client.createEntity({
        partitionKey: "contact",
        rowKey,
        windowStart: now,
        requestCount: 1,
        updatedAt: new Date(now).toISOString()
      });
      return false;
    }

    const windowStart = Number(entity.windowStart || now);
    const requestCount = Number(entity.requestCount || 0);
    const inWindow = (now - windowStart) < RATE_LIMIT_WINDOW_MS;

    if (!inWindow) {
      entity.windowStart = now;
      entity.requestCount = 1;
      entity.updatedAt = new Date(now).toISOString();
      await client.updateEntity(entity, "Replace");
      return false;
    }

    if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
      return true;
    }

    entity.requestCount = requestCount + 1;
    entity.updatedAt = new Date(now).toISOString();
    await client.updateEntity(entity, "Replace");
    return false;
  } catch (error) {
    context.log.error("Persistent rate-limit error. Falling back to in-memory:", error.message || error);
    return isRateLimited(ip);
  }
}

module.exports = async function (context, req) {
  const body = getRequestBody(req);

  const name = sanitize(body.name);
  const email = sanitize(body.email);
  const phone = sanitize(body.phone);
  const website = sanitize(body.website);
  const message = sanitize(body.message);
  const companyName = sanitize(body.company_name);
  const openedAt = Number(sanitize(body.opened_at) || 0);
  const ip = getClientIp(req);

  if (companyName) {
    context.log.warn("Honeypot triggered for contact form submission.");
    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { message: "Thanks! Your message was sent successfully." }
    };
  }

  if (!openedAt || Number.isNaN(openedAt) || (Date.now() - openedAt) < MIN_FORM_OPEN_MS) {
    return {
      status: 429,
      headers: { "Content-Type": "application/json" },
      body: { message: "Please wait a moment before sending the form." }
    };
  }

  const rateLimited = RATE_LIMIT_PROVIDER === "memory"
    ? isRateLimited(ip)
    : await isRateLimitedWithTable(ip, context);

  if (rateLimited) {
    return {
      status: 429,
      headers: { "Content-Type": "application/json" },
      body: { message: "Too many requests. Please try again in a few minutes." }
    };
  }

  if (!name || !email || !message) {
    return {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { message: "Name, e-mail and message are required." }
    };
  }

  if (!EMAIL_REGEX.test(email)) {
    return {
      status: 400,
      headers: { "Content-Type": "application/json" },
      body: { message: "Please provide a valid e-mail address." }
    };
  }

  const connectionString = process.env.ACS_CONNECTION_STRING;
  const senderAddress = process.env.ACS_SENDER_ADDRESS;
  const recipientAddress = process.env.CONTACT_RECIPIENT_EMAIL || senderAddress;

  if (!connectionString || !senderAddress || !recipientAddress) {
    context.log.error("Missing ACS environment variables.");
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { message: "Service is not configured yet." }
    };
  }

  const subject = `New contact request from ${name}`;
  const plainText = [
    `Name: ${name}`,
    `E-mail: ${email}`,
    `Phone: ${phone || "Not provided"}`,
    `Website: ${website || "Not provided"}`,
    "",
    "Message:",
    message
  ].join("\n");

  const html = `
    <h2>New contact request</h2>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>E-mail:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
    <p><strong>Website:</strong> ${website || "Not provided"}</p>
    <p><strong>Message:</strong></p>
    <p>${message.replace(/\n/g, "<br>")}</p>
  `;

  try {
    const emailClient = new EmailClient(connectionString);
    const poller = await emailClient.beginSend({
      senderAddress,
      recipients: {
        to: [{ address: recipientAddress }]
      },
      content: {
        subject,
        plainText,
        html
      },
      replyTo: [{ address: email }]
    });

    const result = await poller.pollUntilDone();
    if (!result || result.status !== "Succeeded") {
      throw new Error("ACS email send failed.");
    }

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { message: "Thanks! Your message was sent successfully." }
    };
  } catch (error) {
    context.log.error("Failed to send contact form e-mail:", error);
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { message: "Unable to send your message right now. Please try again." }
    };
  }
};