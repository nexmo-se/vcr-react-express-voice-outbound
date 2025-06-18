import { Vonage } from "@vonage/server-sdk";
import { Auth } from "@vonage/auth";
import express from "express";
import axios from "axios";
import fs from "fs";
import path from "path";

const app = express();
const port = process.env.VCR_PORT;
const APPS_FILE = path.join(process.cwd(), "subaccount_apps.json");

// Get the VCR instance service name from the environment
const instanceServiceName = process.env.INSTANCE_SERVICE_NAME;
let VCR_URL = "";
if (instanceServiceName) {
  // For debug: neru-4f2ff53x-debug-debug
  // For deploy: neru-4f2ff53x-epic-call-app-backend-dev
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

// Create or get a subaccount application and store private key
app.post("/api/subaccount-app", async (req, res) => {
  const { subaccountApiKey, subaccountApiSecret } = req.body;
  if (!subaccountApiKey || !subaccountApiSecret) {
    return res
      .status(400)
      .json({ error: "Subaccount API key and secret required" });
  }
  const apps = loadApps();
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
                address: "https://example.com/webhooks/answer",
                http_method: "POST",
              },
              event_url: {
                address: "https://example.com/webhooks/event",
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
    const privateKeyPath = path.join(
      process.cwd(),
      `private_key_${response.data.id}.key`
    );
    fs.writeFileSync(privateKeyPath, response.data.keys.private_key);
    const appInfo = {
      applicationId: response.data.id,
      privateKeyPath,
    };
    apps[subaccountApiKey] = appInfo;
    saveApps(apps);
    res.json(appInfo);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Make a voice call from subaccount LVN
app.post("/api/call", async (req, res) => {
  const { subaccountApiKey, from, to, text } = req.body;
  if (!subaccountApiKey || !from || !to) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const apps = loadApps();
  const appInfo = apps[subaccountApiKey];
  if (!appInfo) {
    return res.status(400).json({
      error:
        "No application found for this subaccount. Please create one first.",
    });
  }
  try {
    const vonage = new Vonage({
      applicationId: appInfo.applicationId,
      privateKey: fs.readFileSync(appInfo.privateKeyPath),
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

function loadApps() {
  if (!fs.existsSync(APPS_FILE)) return {};
  return JSON.parse(fs.readFileSync(APPS_FILE, "utf8"));
}

function saveApps(apps) {
  fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2));
}

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
