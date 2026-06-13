const { EmailClient } = require("@azure/communication-email");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

module.exports = async function (context, req) {
  const body = getRequestBody(req);

  const name = sanitize(body.name);
  const email = sanitize(body.email);
  const phone = sanitize(body.phone);
  const website = sanitize(body.website);
  const message = sanitize(body.message);

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