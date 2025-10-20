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

  const apps = await loadApps();
  if (apps[subaccountApiKey]) {
    return res.json(apps[subaccountApiKey]);
  }

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
    const appInfo = {
      applicationId: response.data.id,
      privateKeyName,
    };
    apps[subaccountApiKey] = appInfo;
    await saveApps(apps);
    console.log("Saved apps:", apps);
    res.json(appInfo);
  } catch (err) {
    console.error(
      "Error creating subaccount app:",
      err.response?.data || err.message
    );
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Cancel/Release a number (LVN) for a subaccount
app.post("/api/cancel-number", async (req, res) => {
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
    console.log(
      `Cancelling number ${msisdn} for subaccount: ${subaccountApiKey}`
    );

    // Use the subaccount credentials to cancel the number
    const basicAuth = Buffer.from(
      `${subaccountApiKey}:${subaccountSecret}`
    ).toString("base64");

    // Prepare form data for the cancel request
    const formData = new URLSearchParams();
    formData.append("country", country);
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

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
