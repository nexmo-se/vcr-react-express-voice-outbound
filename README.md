# Vonage Subaccount LVN Outbound Call Demo (v2)

This app demonstrates how to use the Vonage API to make outbound voice calls from a subaccount's LVN (Long Virtual Number) using proper subaccount credentials.

## Features

- **Master Account Authentication**: Authenticate using the master API key for account admin access.
- **Subaccount Selection**: View and select from a list of available subaccounts.
- **Subaccount Credential Input**: Enter subaccount API secret for secure access.
- **LVN Management**: Fetch LVNs using subaccount's own credentials (following Vonage API best practices).
- **LVN Cancel/Release**: Cancel or release LVNs that are no longer needed (with confirmation dialog).
- **LVN Purchase**: Search for and buy new phone numbers for the subaccount with cost preview.
- **Voice Application Management**: Create Vonage Voice Applications using subaccount credentials.
- **Outbound Calling**: Make outbound calls using the selected LVN as the caller ID.
- **Real-time Call Status**: View real-time call status updates in the UI (via webhook events).
- **Response History**: Track and review previous API responses with collapsible history panel.
- **Error Handling**: View API responses and errors in the UI.

## Debug or Deploy VCR App

The ReactJS `/frontend` folder and ExpressJS `/backend` folder should be run separately. They each need to have their own `vcr-*.yml` files that needs to be configured.

You should run in terminals `vcr init` in both folders. This will allow you to create Vonage Applications and help generate Application IDs that generate `vcr.yml` files.

## macOS Setup & VCR Commands

Copy, Paste, and Rename VCR YML Sample Files (macOS)

Open your terminal and run:

```zsh
cp backend/vcr-backend-sample.yml backend/vcr-backend.yml
cp frontend/vcr-frontend-sample.yml frontend/vcr-frontend.yml
```

You can then use the examples files as reference: `vcr-frontend-sample.yml` and `vcr-backend-sample.yml`.

**Important Configuration:**

In `backend/vcr-backend.yml`, update the following environment variables:

- `MASTER_API_KEY`: Your Vonage master account API key
- `MASTER_API_SECRET_KEY`: Your Vonage master account API secret
- `region` and `application-id` accordingly

Install NPM dependencies in both /backend and /frontend folders:

```js
// Run in both folders /backend and /frontend
npm install
```

### To run Locally (vcr debug)

1. Run the Frontend: In terminal, `cd frontend` and `npm start`

2. Run the Backend: In the file ``vcr-frontend.yml` update the `FRONTEND_URL` value, example `http://localhost:3000/`. In another terminal, `cd backend` and `vcr debug -y -f vcr-backend.yml`

### To deploy (vcr deploy)

1. Deploy the Backend: `cd backend` and then `vcr deploy -f vcr-backend.yml`

2. Deploy the Frontend:
   1. Update in /frontend/App.js `BACKEND_URL` to your VCR Backend URL.
   2. Update in /backend/vcr.yml `FRONTEND_URL` to your VCR Frontend URL. You can deploy frontend twice to retrieve it. There's probably a smarter way to do this.
   3. Then `cd frontend` and `vcr deploy -f vcr-frontend.yml`

## Application Flow (v2)

1. **Master Account Authentication**

   - The user enters the **Master API Key** for account admin access.
   - The app validates the master API key against the configured `MASTER_API_KEY` in the backend environment.
   - If authentication is successful, the app automatically fetches the list of available subaccounts.

2. **Subaccount Selection**

   - After successful authentication, the app displays a dropdown list of all available subaccounts (master account excluded).
   - The user selects the desired subaccount from the dropdown.
   - The first subaccount is selected by default.

3. **Subaccount Credential Input**

   - The user enters the **Subaccount API Secret** in a secure password field.
   - This credential is required to access the subaccount's LVNs and create applications.
   - The secret is validated when making API requests.

4. **Fetch LVNs (Owned Numbers)**

   - The user clicks **"Get Subaccount LVNs"** after providing the subaccount secret.
   - The app uses the **subaccount's own credentials** (API key + secret) to fetch LVNs directly.
   - This follows Vonage API best practices for subaccount access.
   - If valid, available LVNs are fetched and the dropdown is populated. The first LVN is selected by default.
   - A success message is displayed showing how many LVNs were found and which numbers are available.

   **Sample Success Response:**

   ```json
   {
     "success": true,
     "message": "Successfully fetched 2 LVNs for this subaccount",
     "data": {
       "count": 2,
       "numbers": ["12089908002", "525588967943"]
     }
   }
   ```

5. **Buy LVN (Optional)**

   - If a user needs a new phone number, they can click **"BUY LVN"**.
   - The app prompts for a 2-letter country code (e.g., US, GB, DE) to search for available numbers.
   - The app automatically searches for and purchases the first available number in the specified country.
   - Uses the **subaccount's own credentials** for both search and purchase operations.
   - After successful purchase, the LVN list is refreshed and the newly purchased number is automatically selected.
   - **Note**: Purchasing a number will incur monthly charges. The cost will be shown in the response data.

6. **Create or Get Subaccount Application and LVN Assignment**

   - The user clicks **"CREATE OR GET SUBACCOUNT APPLICATION"**.
   - The backend uses the **subaccount's own credentials** to create a new Vonage Application (if one doesn't exist) or retrieve an existing one.
   - **Critical Requirement**: The selected LVN is automatically assigned to the application during this process.
   - The Application ID is displayed in the UI with a message indicating whether it was "Created" or "Retrieved".
   - **LVN Linking**: This step links the currently selected LVN to the Voice application, enabling it for outbound calling.

7. **LVN Selection Workflow**

   - **Initial Selection**: After selecting an LVN and creating/getting the application, calls can be made normally.
   - **Changing LVN**: If a user selects a different LVN from the dropdown:
     - The **Call button becomes disabled** ⚠️
     - A warning message appears: "You selected a different LVN. Click 'CREATE OR GET SUBACCOUNT APPLICATION' to link this LVN before making calls."
     - The user **must** click "CREATE OR GET SUBACCOUNT APPLICATION" again to link the new LVN.
     - This ensures every LVN is properly assigned to the application before calling.

8. **Make a Call**

   - The user enters the destination ("To") number and clicks **"Call"**.
   - **Prerequisite**: The selected LVN must be linked to the application (see step 7).
   - The app uses the selected LVN as the "from" number and the provided "to" number.
   - The backend uses the subaccount's Application ID and Private Key to authenticate and send the outbound call via the Vonage Voice API.
   - All errors (authentication, no LVNs, call errors) and success responses are displayed in the UI.

9. **View Call Status (Webhook Events)**
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

---

## Version 2 Improvements

### **Security Enhancements**

- **Direct Credential Usage**: Uses subaccount's own API credentials instead of trying to retrieve secrets via master account
- **Manual Secret Input**: Users must explicitly provide subaccount secrets, improving security awareness
- **No Credential Storage**: Subaccount secrets are not stored or cached

### **API Compliance**

- **Vonage Best Practices**: Follows official Vonage API documentation for subaccount access
- **Proper Authentication**: Each subaccount operation uses its own credentials
- **Error Handling**: Clear feedback when subaccount credentials are invalid

### **User Experience**

- **Explicit Flow**: Users understand exactly which credentials are being used
- **Manual Control**: LVN fetching requires explicit user action with proper credentials
- **Clear Validation**: Immediate feedback for authentication issues

---

## New Workflow Requirements (v2.1)

### **LVN-Application Linking Enforcement**

The application now enforces a critical workflow requirement: **every LVN must be explicitly linked to the Voice application before making calls**.

#### **Key Behaviors:**

1. **Initial Flow**: Select LVN → Create/Get App → LVN automatically linked → Call enabled ✅
2. **LVN Change Flow**:
   - Select different LVN → **Call button disabled** ❌
   - Warning displayed: "⚠️ You selected a different LVN. Click 'CREATE OR GET SUBACCOUNT APPLICATION' to link this LVN before making calls."
   - User must click "CREATE OR GET SUBACCOUNT APPLICATION" → LVN re-linked → Call enabled ✅

#### **Technical Implementation:**

- **One Application Per Subaccount**: Each subaccount uses a single Voice application for all its LVNs
- **Individual LVN Assignment**: Each LVN is individually assigned to the application using Vonage's `/number/update` API
- **State Tracking**: Frontend tracks which LVN is currently linked and validates before enabling calls
- **Automatic Re-assignment**: When different LVN selected, clicking "CREATE OR GET SUBACCOUNT APPLICATION" assigns the new LVN to the existing application

#### **Benefits:**

- **Prevents Call Failures**: Ensures LVNs are properly configured before attempting calls
- **Clear User Guidance**: Explicit workflow prevents user confusion
- **API Compliance**: Follows Vonage best practices for number-to-application assignment
- **Flexible Management**: Users can switch between LVNs while maintaining proper configuration

### **Simplified LVN Management**

- **Single "BUY LVN" Button**: Replaces separate Cancel/Release and Buy LVN functions
- **Automatic Purchase Flow**: Searches for and buys the first available number in specified country
- **Streamlined UI**: Cleaner interface with focus on essential operations

---

## Implementation Notes (v2)

- **Master Account Authentication**: The UI requires authentication with the master API key before accessing any functionality.
- **Subaccount Credential Security**: Users must provide subaccount API secrets manually for secure access to subaccount resources.
- **Direct Subaccount API Access**: All subaccount operations (LVNs, applications, calls) use the subaccount's own credentials following Vonage API best practices.
- **No Automatic LVN Fetching**: LVNs are fetched only when the user explicitly provides subaccount credentials and clicks "Get Subaccount LVNs".
- **Credential Validation**: Subaccount credentials are validated during API requests, providing immediate feedback for invalid secrets.
- **LVN-Application Linking Requirement**: **Critical workflow requirement** - users must click "CREATE OR GET SUBACCOUNT APPLICATION" whenever they select a different LVN to ensure proper assignment before calling.
- **Call Button Validation**: The Call button is automatically disabled when an LVN is selected that hasn't been linked to the application, with clear warning messages.
- **Streamlined LVN Management**: Single "BUY LVN" button replaces separate Cancel/Release and Buy buttons, automatically purchasing and assigning numbers.
- **Enhanced Response Feedback**: Application creation/retrieval responses clearly indicate whether an app was "Created" or "Retrieved" with specific application IDs.
- **All errors** (authentication, invalid credentials, no LVNs, call errors) are shown in the UI.
- **Response History**: The UI maintains a history of the last 10 API responses with timestamps and operation labels. Users can expand the history panel to review previous operations and clear the history if needed.
- **Outbound calls** can only be made by a subaccount's Vonage Application ID and Private Key.
- **LVN selection**: The first available LVN is selected by default after fetching.
- **Application persistence**: The backend stores subaccount application info and private key for reuse using the VCR State Provider.
- **Webhook events**: The backend receives and stores call status updates, and the frontend displays them in real time with improved formatting.

## VCR State Storage

The application uses Vonage Cloud Runtime (VCR) State Provider to persist critical application data across sessions. This ensures that applications don't need to be recreated every time and that private keys are securely stored.

### **What is Stored in VCR State:**

#### 1. **Application Information**

- **Key:** `"subaccount_apps"`
- **Type:** JSON Object
- **Purpose:** Maps subaccount API keys to their Voice application metadata
- **Structure:**

  ```javascript
  {
    "subaccount_api_key_1": {
      "applicationId": "12345678-abcd-1234-efgh-567890123456",
      "privateKeyName": "private_key_12345678-abcd-1234-efgh-567890123456"
    },
    "subaccount_api_key_2": {
      "applicationId": "87654321-dcba-4321-hgfe-098765432109",
      "privateKeyName": "private_key_87654321-dcba-4321-hgfe-098765432109"
    }
  }
  ```

#### 2. **Private Keys**

- **Key Pattern:** `"private_key_{applicationId}"`
- **Type:** String (PEM format)
- **Purpose:** Stores the private keys for JWT authentication with Vonage Voice API
- **Example Keys:**
  - `"private_key_12345678-abcd-1234-efgh-567890123456"`
  - `"private_key_87654321-dcba-4321-hgfe-098765432109"`
- **Security:** Keys are encrypted and securely stored by VCR State Provider

### **What is NOT Stored in VCR State:**

For security and best practice reasons, the following sensitive information is **not** persisted:

- ❌ **Subaccount Secrets** - Must be entered by users each session
- ❌ **Master API Key** - Stored only in environment variables and frontend session
- ❌ **Subaccount Details** - Fetched fresh from Vonage API each time
- ❌ **Call Status Data** - Temporary webhook data, not persisted long-term

### **Benefits of VCR State Storage:**

1. **Application Reuse** - Vonage Voice applications are created once per subaccount and reused
2. **Private Key Security** - Private keys are securely encrypted and stored by VCR
3. **Performance** - Avoids recreating applications unnecessarily
4. **Persistence** - Data survives application restarts and deployments
5. **Scalability** - Supports multiple subaccounts with individual applications

### **State Management Functions:**

The backend includes helper functions for VCR State operations:

```javascript
// Load and save application mappings
async function loadApps()           // Retrieves subaccount_apps from state
async function saveApps(apps)       // Stores subaccount_apps to state

// Private key management
async function savePrivateKey(keyName, privateKey)  // Stores encrypted private key
async function loadPrivateKey(keyName)              // Retrieves private key for JWT auth
```

This architecture ensures secure, efficient management of Vonage Voice applications while maintaining proper separation of sensitive credentials.

## Work History

1. Requires 2 VCR application ID's first for frontend and second for backend.
2. Created two directories: `backend` and `frontend`.
3. In the `frontend` directory:
   - Ran `npx create-react-app .` to create a new ReactJS project in the empty directory.
   - Ran `vcr init` and created a new app named `vcr-react-frontend`.
4. In the `backend` directory:
   - Ran `vcr init` and created a new app named `vcr-react-backend`.
   - Chose "Starter App" as the VCR application template.
