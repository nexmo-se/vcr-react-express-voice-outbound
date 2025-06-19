# Vonage Subaccount LVN Outbound Call Demo

This app demonstrates how to use the Vonage API to make outbound voice calls from a subaccount’s LVN (Long Virtual Number).

## Features

- Enter a subaccount API key and secret.
- Fetch and select available LVNs for the subaccount.
- Create or reuse a Vonage Voice Application for the subaccount.
- Make outbound calls using the selected LVN as the caller ID.
- View API responses and errors in the UI.
- **View real-time call status updates in the UI (via webhook events).**

## Debug or Deploy VCR App

The ReactJS `/frontend` folder and ExpressJS `/backend` folder should be run separately. They each have their own `vcr.yml` file that needs to be configured.

You should run `vcr init` in both folders. This will allow you to create Vonage Applications and help generate Application IDs that generate `vcr.yml` files. You can then use the examples as reference: `vcr-frontend-sample.yml` and `vcr-backend-sample.yml`.

To run Locally (vcr debug):

1. Run the Backend: In another terminal, `cd backend` and `vcr debug -y`
2. Run the Frontend: In terminal, `cd frontend` and `npm start`

To deploy (vcr deploy):

1. Deploy the Backend: `cd backend` and then `vcr deploy`

2. Deploy the Frontend:
   1. Update in /frontend/App.js `BACKEND_URL` to your VCR Backend URL.
   2. Update in /backend/vcr.yml `FRONTEND_URL` to your VCR Frontend URL. You can deploy frontend twice to retrieve it. There's probably a smarter way to do this.
   3. Then `cd frontend` and `vcr deploy`

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
   - The backend creates a new Vonage Application for the subaccount (if one does not exist) and stores the private key using the VCR State Provider.
   - The Application ID is displayed in the UI.

4. **Make a Call**

   - The user enters the destination ("To") number and clicks **"Call"**.
   - The app uses the selected LVN as the "from" number and the provided "to" number.
   - The backend uses the subaccount’s Application ID and Private Key to authenticate and send the outbound call via the Vonage Voice API.
   - All errors (invalid credentials, no LVNs, call errors) and success responses are displayed in the UI.

5. **View Call Status (Webhook Events)**
   - After a call is initiated, the backend receives real-time call status updates from Vonage via the event webhook.
   - The backend stores the latest status for each call.
   - The frontend polls for status updates and displays them in the UI (e.g., "started", "ringing", "answered", "completed").

---

## How Webhook Event Status Works

When a call is made using the Vonage Voice API, Vonage sends HTTP POST requests to your application's `event_url` webhook with status updates about the call. These events include statuses such as:

- `started`: The call has started.
- `ringing`: The destination is ringing.
- `answered`: The call was answered.
- `completed`: The call has ended.
- `failed`: The call could not be completed.

Your backend receives these events at the `/webhooks/event` endpoint, stores the latest status for each call, and provides an API (`/api/call-status?uuid=...`) for the frontend to poll and display the current status in real time.

**Example event payload:**

```json
{
  "uuid": "ed4a16e5-e14e-470c-9595-ea86d5d2abc",
  "status": "answered",
  "from": "XXXXXXXXXX",
  "to": "XXXXXXXXXX",
  "timestamp": "2025-06-18T23:37:10.994Z"
}
```

---

## Implementation Notes

- **All API requests** (including `/account/numbers`) are authenticated with the **subaccount API key and secret**.
- **All errors** (invalid credentials, no LVNs, call errors) are shown in the UI.
- **Outbound calls** can only be made by a subaccount’s Vonage Application ID and Private Key.
- **LVN selection**: The first available LVN is selected by default after fetching.
- **Application persistence**: The backend stores subaccount application info and private key for reuse using the VCR State Provider.
- **Webhook events**: The backend receives and stores call status updates, and the frontend displays them in real time.
