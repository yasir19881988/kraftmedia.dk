# Azure Static Web Apps + Communication Services Setup

This project now includes a contact API at `/api/contact` that sends e-mails using Azure Communication Services.

## 1. Required Azure app settings

In your Azure Static Web App, open `Environment variables` and add:

- `ACS_CONNECTION_STRING`: Connection string from your Azure Communication Services resource.
- `ACS_SENDER_ADDRESS`: Verified sender address (for example `DoNotReply@<your-domain>.azurecomm.net` or your verified custom domain sender).
- `CONTACT_RECIPIENT_EMAIL`: Inbox that should receive contact form messages.

Optional spam/rate-limit settings:

- `CONTACT_RATE_LIMIT_MAX`: Max requests per IP in the active window (default `5`).
- `CONTACT_RATE_LIMIT_WINDOW_MS`: Rate-limit window in milliseconds (default `600000`, 10 minutes).
- `CONTACT_MIN_FORM_OPEN_MS`: Minimum time between modal open and submit (default `2000`).
- `CONTACT_RATE_LIMIT_PROVIDER`: `table` (default, persistent) or `memory`.
- `CONTACT_RATE_LIMIT_TABLE_NAME`: Azure Table name for rate-limit counters (default `ContactRateLimit`).
- `CONTACT_RATE_LIMIT_STORAGE_CONNECTION_STRING`: Optional. If omitted, API uses `AzureWebJobsStorage`.

## 2. Verify sender in ACS

Before sending e-mails, ensure your sender is verified in Azure Communication Services Email.

## 3. Deployment

The workflow is updated to deploy API functions from `api/`:

- `.github/workflows/azure-static-web-apps-zealous-mud-07e51b310.yml`
- `api_location: "api"`

On push to `main`, GitHub Actions deploys both the static app and the API.

## 4. Contact endpoint details

- Route: `POST /api/contact`
- Required fields: `name`, `email`, `message`
- Optional fields: `phone`, `website`

The frontend form in `index.html` submits via `fetch('/api/contact')` and shows status feedback to the user.