import { Vonage } from "@vonage/server-sdk";
import { Assets, vcr, State } from "@vonage/vcr-sdk";
import { Auth } from "@vonage/auth";
import express from "express";
import axios from "axios";
import path from "path";
import cors from "cors";

const app = express();

const frontendUrl = process.env.FRONTEND_URL || "*"; // fallback for local/dev

app.use(
  cors({
    origin: frontendUrl,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

const port = process.env.VCR_PORT;

// VCR Providers
const session = vcr.createSession();
const assets = new Assets(vcr.getGlobalSession());
const state = new State(vcr.getGlobalSession());

// Get the VCR instance service name from the environment
const instanceServiceName = process.env.INSTANCE_SERVICE_NAME;
let VCR_URL = "";
if (instanceServiceName) {
  VCR_URL = `https://${instanceServiceName}.use1.runtime.vonage.cloud`;
  console.log("VCR_URL:", VCR_URL);
} else {
  console.log("INSTANCE_SERVICE_NAME not set in environment.");
}

app.use(express.json());
app.use(express.static("public"));

app.get("/_/health", async (req, res) => {
  res.sendStatus(200);
});

app.get("/_/metrics", async (req, res) => {
  res.sendStatus(200);
});

// Authenticate with master API key
app.post("/api/authenticate", (req, res) => {
  const { masterApiKey } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  if (!masterApiKey) {
    return res.status(400).json({ error: "Master API key required" });
  }

  if (!expectedMasterApiKey) {
    return res
      .status(500)
      .json({ error: "Master API key not configured on server" });
  }

  if (masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid master API key" });
  }

  res.json({ success: true, message: "Authentication successful" });
});

// List subaccounts using master API credentials
app.post("/api/subaccounts", async (req, res) => {
  const { masterApiKey } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;
  const masterApiSecret = process.env.MASTER_API_SECRET_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!masterApiSecret) {
    return res.status(500).json({ error: "Master API secret not configured" });
  }

  try {
    const basicAuth = Buffer.from(
      `${expectedMasterApiKey}:${masterApiSecret}`
    ).toString("base64");

    // First, let's test the credentials by getting account info
    let accountResponse;
    try {
      accountResponse = await axios.get(
        "https://rest.nexmo.com/account/get-balance",
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
          },
        }
      );
      console.log("Account balance check successful:", accountResponse.data);
    } catch (balanceErr) {
      console.error(
        "Account balance check failed:",
        balanceErr.response?.data || balanceErr.message
      );
      return res.status(500).json({
        error: "Invalid master account credentials",
        details: balanceErr.response?.data || balanceErr.message,
      });
    }

    // Now try to get subaccounts using the correct endpoint from Vonage docs
    // https://developer.vonage.com/en/api/subaccounts#retrieveSubaccountsList
    try {
      // Use the correct endpoint with account API key in the path
      const response = await axios.get(
        `https://api.nexmo.com/accounts/${expectedMasterApiKey}/subaccounts`,
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: "application/json",
          },
        }
      );
      console.log("Subaccounts API success:", response.data);
      res.json(response.data);
    } catch (subaccountErr) {
      console.error(
        "Subaccounts API error:",
        subaccountErr.response?.status,
        subaccountErr.response?.data
      );

      // Let's also try the alternative endpoint format
      try {
        console.log("Trying alternative subaccounts endpoint...");
        const altResponse = await axios.get(
          "https://rest.nexmo.com/account/subaccounts",
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
            },
          }
        );
        console.log("Alternative subaccounts API success:", altResponse.data);
        res.json(altResponse.data);
        return;
      } catch (altErr) {
        console.error(
          "Alternative subaccounts API also failed:",
          altErr.response?.status,
          altErr.response?.data
        );
      }

      // If subaccounts endpoint fails, return mock data matching real API structure
      if (subaccountErr.response?.status === 404) {
        console.log(
          "Subaccounts endpoint not found, returning mock data for testing"
        );
        res.json({
          _embedded: {
            primary_account: {
              api_key: expectedMasterApiKey,
              name: "Primary Account (Fallback)",
              balance: accountResponse.data.value || "0.00",
              suspended: false,
              created_at: new Date().toISOString(),
            },
            subaccounts: [],
          },
        });
      } else {
        throw subaccountErr;
      }
    }
  } catch (err) {
    console.error(
      "Error fetching subaccounts:",
      err.response?.data || err.message
    );
    console.error("Full error response:", err.response);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// webhooks/answer
app.post("/webhooks/answer", (req, res) => {
  console.log("Answer webhook received:", req.body);
  const ncco = [
    {
      action: "talk",
      text: "This is a call from your subaccount LVN!",
    },
  ];
  res.json(ncco);
});

const callEvents = {};

// Event webhook to receive call status updates from Vonage
app.post("/webhooks/event", (req, res) => {
  const { uuid } = req.body;
  if (uuid) {
    callEvents[uuid] = req.body;
    console.log("Received event for call:", uuid, req.body);
  }
  res.status(200).end();
});

// Endpoint for frontend to poll call status
app.get("/api/call-status", (req, res) => {
  const { uuid } = req.query;
  if (!uuid) return res.status(400).json({ error: "Missing uuid" });
  res.json(callEvents[uuid] || {});
});

// Generate a random secret that meets Vonage requirements
// Requirements: 8-25 characters, at least 1 lowercase, 1 uppercase, 1 digit
function generateSecret() {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const specialChars = "!@#$%^&*";
  const allChars = lowercase + uppercase + digits + specialChars;

  // Ensure at least one of each required character type
  let secret = "";
  secret += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  secret += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  secret += digits.charAt(Math.floor(Math.random() * digits.length));

  // Fill the rest randomly (total length: 16 characters)
  for (let i = 3; i < 16; i++) {
    secret += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the secret to randomize the position of required characters
  secret = secret
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");

  return secret;
}

// Manage subaccount secrets automatically
app.post("/api/manage-secret", async (req, res) => {
  const { masterApiKey, subaccountApiKey } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;
  const masterApiSecret = process.env.MASTER_API_SECRET_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!masterApiSecret) {
    return res.status(500).json({ error: "Master API secret not configured" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  try {
    const basicAuth = Buffer.from(
      `${expectedMasterApiKey}:${masterApiSecret}`
    ).toString("base64");

    // Step 1: Get all secrets for the subaccount
    console.log(`Fetching secrets for subaccount: ${subaccountApiKey}`);
    const secretsResponse = await axios.get(
      `https://api.nexmo.com/accounts/${subaccountApiKey}/secrets`,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    const secrets = secretsResponse.data._embedded?.secrets || [];
    console.log(
      `Found ${secrets.length} secret(s) for subaccount ${subaccountApiKey}`
    );

    let secret; // The secret to return
    let secretId;
    let message;

    // Step 2: Check the number of secrets
    if (secrets.length >= 2) {
      // If 2 secrets exist, delete the oldest one and create a new one
      const sortedSecrets = secrets.sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
      const oldestSecret = sortedSecrets[0];

      console.log(`Deleting oldest secret: ${oldestSecret.id}`);
      await axios.delete(
        `https://api.nexmo.com/accounts/${subaccountApiKey}/secrets/${oldestSecret.id}`,
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
          },
        }
      );
      console.log(`Successfully deleted secret: ${oldestSecret.id}`);

      // Create a new secret
      secret = generateSecret();
      console.log(`Creating new secret for subaccount: ${subaccountApiKey}`);
      const createResponse = await axios.post(
        `https://api.nexmo.com/accounts/${subaccountApiKey}/secrets`,
        {
          secret: secret,
        },
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
        }
      );
      secretId = createResponse.data.id;
      message = "Rotated secret (deleted oldest, created new)";
      console.log(`Successfully created new secret with ID: ${secretId}`);
    } else if (secrets.length === 1) {
      // If only 1 secret exists, create a new one
      secret = generateSecret();
      console.log(`Creating new secret for subaccount: ${subaccountApiKey}`);
      const createResponse = await axios.post(
        `https://api.nexmo.com/accounts/${subaccountApiKey}/secrets`,
        {
          secret: secret,
        },
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
        }
      );
      secretId = createResponse.data.id;
      message = "Created new secret (now has 2 secrets)";
      console.log(`Successfully created new secret with ID: ${secretId}`);
    } else {
      // If 0 secrets (shouldn't happen, but handle it)
      secret = generateSecret();
      console.log(`Creating first secret for subaccount: ${subaccountApiKey}`);
      const createResponse = await axios.post(
        `https://api.nexmo.com/accounts/${subaccountApiKey}/secrets`,
        {
          secret: secret,
        },
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
        }
      );
      secretId = createResponse.data.id;
      message = "Created first secret";
      console.log(`Successfully created new secret with ID: ${secretId}`);
    }

    // Return the secret info to the frontend
    res.json({
      success: true,
      secret: secret,
      secretId: secretId,
      message: message,
    });
  } catch (err) {
    console.error(
      "Error managing subaccount secret:",
      err.response?.data || err.message
    );
    res.status(500).json({
      error: err.response?.data || err.message,
      details: "Failed to manage subaccount secret",
    });
  }
});

// Get specific LVN details including app link
app.post("/api/get-lvn-details", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret, msisdn } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  if (!msisdn) {
    return res.status(400).json({ error: "Phone number (msisdn) required" });
  }

  try {
    console.log(`Fetching details for LVN: ${msisdn}`);

    const basicAuth = Buffer.from(
      `${subaccountApiKey}:${subaccountSecret}`
    ).toString("base64");

    // Get all numbers and find the specific one
    const lvnResponse = await axios.get(
      "https://rest.nexmo.com/account/numbers",
      {
        headers: { Authorization: `Basic ${basicAuth}` },
      }
    );

    const numbers = lvnResponse.data.numbers || [];
    const lvnDetails = numbers.find((num) => num.msisdn === msisdn);

    if (!lvnDetails) {
      return res.status(404).json({ error: "LVN not found" });
    }

    console.log(`LVN details:`, lvnDetails);
    res.json(lvnDetails);
  } catch (err) {
    console.error(
      "Error fetching LVN details:",
      err.response?.data || err.message
    );
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Link LVN to a specific application
app.post("/api/link-lvn-to-app", async (req, res) => {
  const {
    masterApiKey,
    subaccountApiKey,
    subaccountSecret,
    msisdn,
    applicationId,
  } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey || !subaccountSecret || !msisdn || !applicationId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    console.log(`Linking LVN ${msisdn} to application ${applicationId}`);

    const detectedCountry = detectCountryFromLvn(msisdn);
    const assignFormData = new URLSearchParams();
    assignFormData.append("country", detectedCountry);
    assignFormData.append("msisdn", msisdn);
    assignFormData.append("app_id", applicationId);

    const assignResponse = await axios.post(
      `https://rest.nexmo.com/number/update?api_key=${subaccountApiKey}&api_secret=${subaccountSecret}`,
      assignFormData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("LVN linked successfully:", assignResponse.data);
    res.json({
      success: true,
      message: `LVN ${msisdn} linked to application ${applicationId}`,
      data: assignResponse.data,
    });
  } catch (err) {
    console.error("Error linking LVN:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// List LVNs for a selected subaccount
app.post("/api/lvns", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  try {
    console.log(
      `Fetching LVNs for subaccount: ${subaccountApiKey} using provided secret`
    );

    // Use the provided subaccount credentials to get LVNs
    const basicAuth = Buffer.from(
      `${subaccountApiKey}:${subaccountSecret}`
    ).toString("base64");
    const lvnResponse = await axios.get(
      "https://rest.nexmo.com/account/numbers",
      {
        headers: { Authorization: `Basic ${basicAuth}` },
      }
    );

    console.log(
      `Found ${
        lvnResponse.data.count || 0
      } LVNs for subaccount ${subaccountApiKey}`
    );
    res.json(lvnResponse.data);
  } catch (err) {
    console.error("Error fetching LVNs:", err.response?.data || err.message);
    console.error("Full error:", err);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Refactored loadApps and saveApps using VCR State Provider
async function loadApps() {
  try {
    const apps = await state.get("subaccount_apps");
    return apps ? JSON.parse(apps) : {};
  } catch (e) {
    return {};
  }
}

async function saveApps(apps) {
  await state.set("subaccount_apps", JSON.stringify(apps));
}

// Save and load private key using VCR State Provider
async function savePrivateKey(keyName, privateKey) {
  await state.set(keyName, privateKey);
}

async function loadPrivateKey(keyName) {
  return await state.get(keyName);
}

// Create or get a subaccount application and store private key in State Provider
app.post("/api/subaccount-app", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret, selectedLvn } =
    req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  const apps = await loadApps();
  let appInfo;
  let isExistingApp = false;

  if (apps[subaccountApiKey]) {
    // Use existing application
    appInfo = apps[subaccountApiKey];
    isExistingApp = true;
    console.log(
      `Using existing application: ${appInfo.applicationId} for subaccount: ${subaccountApiKey}`
    );
  } else {
    // Create new application
    try {
      console.log(
        `Creating application for subaccount: ${subaccountApiKey} using provided secret`
      );

      // Use subaccount credentials to create application
      const response = await axios.post(
        "https://api.nexmo.com/v2/applications",
        {
          name: `subaccount-app-${subaccountApiKey}`,
          capabilities: {
            voice: {
              webhooks: {
                answer_url: {
                  address: `${VCR_URL}/webhooks/answer`,
                  http_method: "POST",
                },
                event_url: {
                  address: `${VCR_URL}/webhooks/event`,
                  http_method: "POST",
                },
              },
            },
          },
        },
        {
          auth: {
            username: subaccountApiKey,
            password: subaccountSecret,
          },
        }
      );

      const privateKeyName = `private_key_${response.data.id}`;
      await savePrivateKey(privateKeyName, response.data.keys.private_key);

      appInfo = {
        applicationId: response.data.id,
        privateKeyName,
      };

      console.log("Created new application:", appInfo);
    } catch (err) {
      console.error(
        "Error creating subaccount app:",
        err.response?.data || err.message
      );
      return res.status(500).json({ error: err.response?.data || err.message });
    }
  }

  // Prepare final response (no LVN linking needed for outbound calls)
  const finalAppInfo = {
    ...appInfo,
    action: isExistingApp ? "retrieved" : "created",
    message: isExistingApp
      ? `Retrieved existing Voice API application: ${appInfo.applicationId}`
      : `Created new Voice API application: ${appInfo.applicationId}. Note: LVN linking not required for outbound calls.`,
  };

  // Update stored apps with the latest info
  apps[subaccountApiKey] = finalAppInfo;
  await saveApps(apps);
  console.log("Saved apps:", apps);

  res.json(finalAppInfo);
});

// Helper function to detect country code from phone number
function detectCountryFromLvn(phoneNumber) {
  // Remove any non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, "");

  // US and Canada both use country code +1
  // US/Canada numbers are 11 digits starting with 1, or 10 digits without the 1
  if (cleanNumber.length === 11 && cleanNumber.startsWith("1")) {
    // Check if it's US or Canada based on area code
    const areaCode = cleanNumber.substring(1, 4);
    // Canadian area codes (partial list of common ones)
    const canadianAreaCodes = [
      "204",
      "226",
      "236",
      "249",
      "250",
      "289",
      "306",
      "343",
      "365",
      "403",
      "416",
      "418",
      "431",
      "437",
      "438",
      "450",
      "506",
      "514",
      "519",
      "548",
      "579",
      "581",
      "587",
      "604",
      "613",
      "639",
      "647",
      "672",
      "705",
      "709",
      "742",
      "778",
      "780",
      "782",
      "807",
      "819",
      "825",
      "867",
      "873",
      "902",
      "905",
    ];

    if (canadianAreaCodes.includes(areaCode)) {
      return "CA";
    } else {
      return "US";
    }
  } else if (cleanNumber.length === 10) {
    // Assume US if 10 digits without country code
    return "US";
  }

  // Default to US if we can't determine
  return "US";
}

// Transfer LVN from source subaccount to target subaccount
app.post("/api/transfer-lvn", async (req, res) => {
  const {
    masterApiKey,
    sourceSubaccountApiKey,
    targetSubaccountApiKey,
    selectedLvn,
    applicationId,
  } = req.body;

  console.log("Transfer LVN request:", {
    masterApiKey: masterApiKey ? "***" : "missing",
    sourceSubaccountApiKey: sourceSubaccountApiKey ? "***" : "missing",
    targetSubaccountApiKey: targetSubaccountApiKey ? "***" : "missing",
    selectedLvn,
    applicationId,
  });

  const expectedMasterApiKey = process.env.MASTER_API_KEY;
  const masterApiSecret = process.env.MASTER_API_SECRET_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  // Verify master API secret is configured
  if (!masterApiSecret) {
    return res
      .status(500)
      .json({ error: "Master API secret not configured on server" });
  }

  if (!sourceSubaccountApiKey) {
    return res
      .status(400)
      .json({ error: "Source subaccount API key required" });
  }

  if (!targetSubaccountApiKey) {
    return res
      .status(400)
      .json({ error: "Target subaccount API key required" });
  }

  if (!selectedLvn) {
    return res.status(400).json({ error: "LVN required" });
  }

  try {
    // Detect country code from the LVN
    const detectedCountry = detectCountryFromLvn(selectedLvn);

    console.log(
      `Transferring LVN ${selectedLvn} from subaccount ${sourceSubaccountApiKey} to subaccount: ${targetSubaccountApiKey}, detected country: ${detectedCountry}`
    );

    // Use the master account credentials for authentication
    const transferAuth = Buffer.from(
      `${masterApiKey}:${masterApiSecret}`
    ).toString("base64");

    // Step 1: Transfer the number from source subaccount to target subaccount
    console.log("Step 1: Transferring number between subaccounts...");
    const transferResponse = await axios.post(
      `https://api.nexmo.com/accounts/${masterApiKey}/transfer-number`,
      {
        from: sourceSubaccountApiKey,
        to: targetSubaccountApiKey,
        number: selectedLvn,
        country: detectedCountry,
      },
      {
        headers: {
          Authorization: `Basic ${transferAuth}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Number transferred successfully:", transferResponse.data);

    // Step 2: If application ID is provided, note that it needs to be linked separately
    let responseMessage = `Number ${selectedLvn} successfully transferred to subaccount ${targetSubaccountApiKey}`;
    if (applicationId) {
      responseMessage += `. Note: To link with application ${applicationId}, use the target subaccount credentials to update the number.`;
    }

    res.json({
      success: true,
      message: responseMessage,
      data: {
        transfer_details: {
          number: transferResponse.data.number,
          country: transferResponse.data.country,
          from: transferResponse.data.from,
          to: transferResponse.data.to,
        },
        transfer_response: transferResponse.data,
        application_note: applicationId
          ? `Application linking required for ${applicationId}`
          : null,
      },
    });
  } catch (err) {
    console.error("Error transferring LVN:", err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || err.message,
      details: err.response?.data?.detail || "Transfer failed",
      step: "transfer",
    });
  }
});

// Cancel/Release a number (LVN) for a subaccount
app.post("/api/cancel-number", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret, msisdn } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  if (!msisdn) {
    return res.status(400).json({ error: "Phone number (msisdn) required" });
  }

  try {
    // Detect country code from the LVN
    const detectedCountry = detectCountryFromLvn(msisdn);
    console.log(
      `Cancelling number ${msisdn} for subaccount: ${subaccountApiKey}, detected country: ${detectedCountry}`
    );

    // Use the subaccount credentials to cancel the number
    const basicAuth = Buffer.from(
      `${subaccountApiKey}:${subaccountSecret}`
    ).toString("base64");

    // Prepare form data for the cancel request
    const formData = new URLSearchParams();
    formData.append("country", detectedCountry);
    formData.append("msisdn", msisdn);
    // Do NOT include target_api_key when using subaccount credentials directly

    const cancelResponse = await axios.post(
      "https://rest.nexmo.com/number/cancel",
      formData,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log(
      `Successfully cancelled number ${msisdn}:`,
      cancelResponse.data
    );
    res.json({
      success: true,
      message: `Number ${msisdn} has been cancelled successfully`,
      data: cancelResponse.data,
    });
  } catch (err) {
    console.error(
      "Error cancelling number:",
      err.response?.data || err.message
    );
    console.error("Full error:", err);
    res.status(500).json({
      error: err.response?.data?.error || err.response?.data || err.message,
      details: err.response?.data,
    });
  }
});

// Search available numbers for purchase
app.post("/api/search-numbers", async (req, res) => {
  const {
    masterApiKey,
    subaccountApiKey,
    subaccountSecret,
    country,
    type,
    features,
  } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  if (!country) {
    return res.status(400).json({ error: "Country code required" });
  }

  try {
    console.log(
      `Searching available numbers in ${country} for subaccount: ${subaccountApiKey}`
    );

    // Use the subaccount credentials to search for available numbers
    const basicAuth = Buffer.from(
      `${subaccountApiKey}:${subaccountSecret}`
    ).toString("base64");

    // Build query parameters
    const params = new URLSearchParams();
    params.append("country", country);
    if (type) params.append("type", type);
    if (features) params.append("features", features);
    params.append("size", "10"); // Limit to 10 results

    const searchResponse = await axios.get(
      `https://rest.nexmo.com/number/search?${params}`,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
      }
    );

    console.log(
      `Found ${searchResponse.data.count || 0} available numbers in ${country}`
    );
    res.json(searchResponse.data);
  } catch (err) {
    console.error(
      "Error searching numbers:",
      err.response?.data || err.message
    );
    console.error("Full error:", err);
    res.status(500).json({
      error: err.response?.data?.error || err.response?.data || err.message,
      details: err.response?.data,
    });
  }
});

// Buy/Purchase a number for a subaccount
app.post("/api/buy-number", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret, msisdn, country } =
    req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  if (!msisdn) {
    return res.status(400).json({ error: "Phone number (msisdn) required" });
  }

  if (!country) {
    return res.status(400).json({ error: "Country code required" });
  }

  try {
    console.log(`Buying number ${msisdn} for subaccount: ${subaccountApiKey}`);

    // Use the subaccount credentials to buy the number
    const basicAuth = Buffer.from(
      `${subaccountApiKey}:${subaccountSecret}`
    ).toString("base64");

    // Prepare form data for the buy request
    const formData = new URLSearchParams();
    formData.append("country", country);
    formData.append("msisdn", msisdn);
    // Do NOT include target_api_key when using subaccount credentials directly

    const buyResponse = await axios.post(
      "https://rest.nexmo.com/number/buy",
      formData,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log(`Successfully bought number ${msisdn}:`, buyResponse.data);
    res.json({
      success: true,
      message: `Number ${msisdn} has been purchased successfully`,
      data: buyResponse.data,
    });
  } catch (err) {
    console.error("Error buying number:", err.response?.data || err.message);
    console.error("Full error:", err);
    res.status(500).json({
      error: err.response?.data?.error || err.response?.data || err.message,
      details: err.response?.data,
    });
  }
});

// Make a voice call from subaccount LVN using private key from State Provider
app.post("/api/call", async (req, res) => {
  const { masterApiKey, subaccountApiKey, from, to, text } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey || !from || !to) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const apps = await loadApps();
  console.log("Loaded apps:", apps, "Looking for:", subaccountApiKey);
  const appInfo = apps[subaccountApiKey];
  if (!appInfo) {
    return res.status(400).json({
      error:
        "No application found for this subaccount. Please create one first.",
    });
  }

  try {
    const privateKey = await loadPrivateKey(appInfo.privateKeyName);
    const vonage = new Vonage({
      applicationId: appInfo.applicationId,
      privateKey,
    });
    const ncco = [
      {
        action: "talk",
        text: text || "This is a call from your subaccount LVN!",
      },
    ];
    const response = await vonage.voice.createOutboundCall({
      to: [{ type: "phone", number: to }],
      from: { type: "phone", number: from },
      ncco,
    });
    res.json({ success: true, data: response });
  } catch (err) {
    console.error("Error making call:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// List all Vonage applications for a subaccount
app.post("/api/list-applications", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  try {
    console.log(
      `Fetching all applications for subaccount: ${subaccountApiKey}`
    );

    const response = await axios.get("https://api.nexmo.com/v2/applications", {
      auth: {
        username: subaccountApiKey,
        password: subaccountSecret,
      },
    });

    console.log(
      `Found ${response.data._embedded?.applications?.length || 0} applications`
    );

    // Log the first application to see available fields
    if (response.data._embedded?.applications?.length > 0) {
      console.log(
        "Sample application fields:",
        Object.keys(response.data._embedded.applications[0])
      );
      console.log(
        "First application:",
        JSON.stringify(response.data._embedded.applications[0], null, 2)
      );
    }

    res.json(response.data);
  } catch (err) {
    console.error(
      "Error fetching applications:",
      err.response?.data || err.message
    );
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Delete all Vonage applications for a subaccount
app.post("/api/delete-all-applications", async (req, res) => {
  const { masterApiKey, subaccountApiKey, subaccountSecret } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  if (!subaccountApiKey) {
    return res.status(400).json({ error: "Subaccount API key required" });
  }

  if (!subaccountSecret) {
    return res.status(400).json({ error: "Subaccount secret required" });
  }

  try {
    console.log(
      `Deleting all applications for subaccount: ${subaccountApiKey}`
    );

    // First, list all applications
    const listResponse = await axios.get(
      "https://api.nexmo.com/v2/applications",
      {
        auth: {
          username: subaccountApiKey,
          password: subaccountSecret,
        },
      }
    );

    const applications = listResponse.data._embedded?.applications || [];
    console.log(`Found ${applications.length} applications total`);

    // Filter applications to only include those matching the naming convention
    const expectedAppName = `subaccount-app-${subaccountApiKey}`;
    const applicationsToDelete = applications.filter(
      (app) => app.name === expectedAppName
    );

    console.log(
      `Found ${applicationsToDelete.length} applications matching naming convention "${expectedAppName}"`
    );

    if (applicationsToDelete.length === 0) {
      return res.json({
        success: true,
        message: `No applications found with name "${expectedAppName}"`,
        deleted: 0,
        skipped: applications.length,
      });
    }

    // Delete each matching application
    const deletePromises = applicationsToDelete.map((app) =>
      axios
        .delete(`https://api.nexmo.com/v2/applications/${app.id}`, {
          auth: {
            username: subaccountApiKey,
            password: subaccountSecret,
          },
        })
        .then(() => {
          console.log(`Deleted application: ${app.id} (${app.name})`);
          return { id: app.id, name: app.name, success: true };
        })
        .catch((err) => {
          console.error(
            `Failed to delete application ${app.id} (${app.name}):`,
            err.message
          );
          return {
            id: app.id,
            name: app.name,
            success: false,
            error: err.message,
          };
        })
    );

    const results = await Promise.all(deletePromises);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    const skippedCount = applications.length - applicationsToDelete.length;

    console.log(
      `Deleted ${successCount} applications, ${failCount} failed, ${skippedCount} skipped (wrong name)`
    );

    // If apps were successfully deleted, also clear VCR state for this subaccount
    if (successCount > 0) {
      try {
        console.log(`Clearing VCR state for subaccount: ${subaccountApiKey}`);
        const apps = await loadApps();

        // Get the app info for this subaccount
        const subaccountApp = apps[subaccountApiKey];

        if (subaccountApp) {
          // Clear the private key if it exists
          if (subaccountApp.privateKeyName) {
            await state.set(subaccountApp.privateKeyName, null);
            console.log(`Cleared private key: ${subaccountApp.privateKeyName}`);
          }

          // Remove this subaccount from stored apps
          delete apps[subaccountApiKey];
          await saveApps(apps);
          console.log(`Cleared VCR state for subaccount: ${subaccountApiKey}`);
        }
      } catch (stateErr) {
        console.error("Error clearing VCR state:", stateErr);
        // Don't fail the request if state clearing fails
      }
    }

    res.json({
      success: true,
      message: `Deleted ${successCount} application(s) matching "${expectedAppName}" and cleared VCR state`,
      deleted: successCount,
      failed: failCount,
      skipped: skippedCount,
      results: results,
      stateCleared: successCount > 0,
    });
  } catch (err) {
    console.error(
      "Error deleting applications:",
      err.response?.data || err.message
    );
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Get VCR state - retrieve all stored apps and private keys
app.post("/api/get-vcr-state", async (req, res) => {
  const { masterApiKey } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  try {
    console.log("Fetching VCR state...");

    // Get all stored apps
    const apps = await loadApps();

    // Get list of all private key names stored
    const privateKeyNames = [];
    for (const [subaccountApiKey, appData] of Object.entries(apps)) {
      if (appData.privateKeyName) {
        privateKeyNames.push(appData.privateKeyName);
      }
    }

    const stateData = {
      apps: apps,
      privateKeys: privateKeyNames,
      count: {
        applications: Object.keys(apps).length,
        privateKeys: privateKeyNames.length,
      },
    };

    console.log("VCR state retrieved successfully:", stateData.count);
    res.json(stateData);
  } catch (error) {
    console.error("Error fetching VCR state:", error);
    res.status(500).json({
      error: "Failed to fetch VCR state",
      details: error.message,
    });
  }
});

// Clear all VCR state - reset application to clean slate
app.post("/api/clear-state", async (req, res) => {
  const { masterApiKey } = req.body;
  const expectedMasterApiKey = process.env.MASTER_API_KEY;

  // Verify master API key
  if (!masterApiKey || masterApiKey !== expectedMasterApiKey) {
    return res.status(401).json({ error: "Invalid or missing master API key" });
  }

  try {
    console.log("Clearing all VCR state...");

    // Clear subaccount apps
    await state.set("subaccount_apps", JSON.stringify({}));

    // Get all stored apps to find private key names to clear
    const apps = await loadApps();
    const privateKeyPromises = [];

    // Clear all private keys stored for subaccounts
    for (const [subaccountApiKey, appData] of Object.entries(apps)) {
      if (appData && appData.applicationId) {
        const keyName = `private_key_${subaccountApiKey}_${appData.applicationId}`;
        privateKeyPromises.push(state.set(keyName, null));
        console.log(`Clearing private key: ${keyName}`);
      }
    }

    // Wait for all private key clearing operations to complete
    await Promise.all(privateKeyPromises);

    console.log("VCR state cleared successfully");
    res.json({
      success: true,
      message:
        "All VCR state cleared successfully. Application reset to clean slate.",
    });
  } catch (error) {
    console.error("Error clearing VCR state:", error);
    res.status(500).json({
      error: "Failed to clear VCR state",
      details: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
