import fs from "fs";

// Read the .env file as text
const envText = fs.readFileSync("./.env", "utf8");

// Extract the VCR_PRIVATE_KEY value using a regex
const match = envText.match(/VCR_PRIVATE_KEY:\s*'((?:.|\n)*?)',\n/);
if (!match) {
  throw new Error("VCR_PRIVATE_KEY not found in .env");
}
let pemKey = match[1];
// Remove ' +' at line ends
pemKey = pemKey.replace(/\\n'\s*\+\s*'/g, "");
// Replace all '\n' with real newlines
pemKey = pemKey.replace(/\\n/g, "\n");

const { Vonage } = require("@vonage/server-sdk");
const to = "15754947093";
const from = "525588967943";
const VCR_API_APPLICATION_ID = "6ac0cddd-bb54-47aa-9ebe-4bdbb891873c";

const vonage = new Vonage({
  applicationId: VCR_API_APPLICATION_ID,
  privateKey: pemKey,
});

vonage.voice
  .createOutboundCall({
    to: [{ type: "phone", number: to }],
    from: { type: "phone", number: from },
    ncco: [
      {
        action: "talk",
        text: "You are listening to a test text-to-speech call made with the Vonage Voice API",
      },
    ],
  })
  .then((resp) => console.log(resp))
  .catch((err) => console.error(err));
