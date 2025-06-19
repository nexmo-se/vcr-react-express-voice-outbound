import { Vonage } from "@vonage/server-sdk";
import { Assets, vcr, State } from "@vonage/vcr-sdk";
import { Auth } from "@vonage/auth";
import express from "express";
import axios from "axios";
import path from "path";

const app = express();
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

// List LVNs for a subaccount
app.post("/api/lvns", async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: "API key and secret required" });
  }
  try {
    const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const response = await axios.get("https://rest.nexmo.com/account/numbers", {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    res.json(response.data);
  } catch (err) {
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
  const { subaccountApiKey, subaccountApiSecret } = req.body;
  if (!subaccountApiKey || !subaccountApiSecret) {
    return res
      .status(400)
      .json({ error: "Subaccount API key and secret required" });
  }
  const apps = await loadApps();
  if (apps[subaccountApiKey]) {
    return res.json(apps[subaccountApiKey]);
  }
  try {
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
          password: subaccountApiSecret,
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
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Make a voice call from subaccount LVN using private key from State Provider
app.post("/api/call", async (req, res) => {
  const { subaccountApiKey, from, to, text } = req.body;
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
