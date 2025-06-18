# Vonage Subaccount LVN Outbound Call Demo

This app demonstrates how to use the Vonage API to make outbound voice calls from a subaccount’s LVN (Long Virtual Number).

## Features

- Enter a subaccount API key and secret.
- Fetch and select available LVNs for the subaccount.
- Create or reuse a Vonage Voice Application for the subaccount.
- Make outbound calls using the selected LVN as the caller ID.
- View API responses and errors in the UI.

## Debug or Deploy VCR App

To run the frontend: In terminal, cd /frontend and npm start

To run the backend: In another terminal, cd /backend and vcr debug -y

## Application Flow

1. **The user enters Subaccount API Key and Subaccount API Secret**

   - **Example Subaccount:**
     - API Key: `xxxxxx`
     - API Secret: `xxxxxxx`

2. **Fetch LVNs (Owned Numbers)**

   - The user clicks **"Get LVNs"**.
   - The app attempts to fetch LVNs using the provided subaccount API key and secret.
   - If credentials are invalid, an error is shown in the UI.
   - If valid, available LVNs are fetched and the dropdown is populated. The first LVN is selected by default.

   **Sample Response:**

   ```json
   {
     "count": 1,
     "numbers": [
       {
         "country": "US",
         "msisdn": "120190431XX",
         "type": "mobile-lvn",
         "features": ["VOICE", "MMS", "SMS"]
       }
     ]
   }
   ```

3. **Create or Get Subaccount Application and Private Key**

   - The user clicks **"Create or Get Subaccount Application"**.
   - The backend creates a new Vonage Application for the subaccount (if one does not exist) and stores the private key.
   - The Application ID is displayed in the UI.

4. **Make a Call**
   - The user enters the destination ("To") number and clicks **"Call"**.
   - The app uses the selected LVN as the "from" number and the provided "to" number.
   - The backend uses the subaccount’s Application ID and Private Key to authenticate and send the outbound call via the Vonage Voice API.
   - All errors (invalid credentials, no LVNs, call errors) and success responses are displayed in the UI.

---

## Implementation Notes

- **All API requests** (including `/account/numbers`) are authenticated with the **subaccount API key and secret**.
- **All errors** (invalid credentials, no LVNs, call errors) are shown in the UI.
- **Outbound calls** can only be made by a subaccount’s Vonage Application ID and Private Key.
- **LVN selection**: The first available LVN is selected by default after fetching.
- **Application persistence**: The backend stores subaccount application info and private key for reuse.

## To fully reset and try the flow again with a new subaccount application, you should

1. Delete the private key file for the subaccount application (e.g., private*key*<applicationId>.key).

2. Remove the application entry from your subaccount_apps.json file (or wherever you persist the mapping of subaccount API key to application ID/private key path).

3. (Optional but recommended) Delete the application from the Vonage dashboard if you want to clean up unused applications.

You should not only delete the private key file—you must also remove the corresponding entry from your backend’s persistent state (subaccount_apps.json).
Otherwise, your backend will think the application still exists and may try to use a missing private key file, resulting in errors.
