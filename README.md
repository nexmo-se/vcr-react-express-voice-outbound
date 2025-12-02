# Vonage Subaccount LVN Outbound Call Demo (v3)

This app demonstrates how to use the Vonage API to make outbound voice calls from a subaccount's LVN (Long Virtual Number) using proper subaccount credentials.

## Features

- **Master Account Authentication**: Authenticate using the master API key for account admin access.
- **Subaccount Selection**: View and select from a list of available subaccounts.
- **Automatic Secret Management**: Automatically manages subaccount API secrets with rotation support.
- **LVN Management**: Fetch LVNs using subaccount's own credentials (following Vonage API best practices).
- **Dual LVN Operations UI**: Separate sections for Release and Transfer operations with clear visual distinction.
- **LVN Transfer Section**: Transfer LVNs from master account to target subaccounts using Vonage Subaccounts Transfer API.
- **Voice Application Management**: Create Vonage Voice Applications using subaccount credentials (LVN linking not required for outbound calls).
- **Outbound Calling**: Make outbound calls using any LVN as the caller ID - no explicit linking needed.
- **Real-time Call Status**: View real-time call status updates in the UI (via webhook events).
- **Response History**: Track and review previous API responses with collapsible history panel.
- **Settings Management**: Advanced settings panel for viewing and managing VCR state and Vonage applications.
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
- `MASTER_API_SECRET_KEY`: Your Vonage master account API secret (required for LVN transfers)
- `region` and `application-id` accordingly

Install NPM dependencies in both /backend and /frontend folders:

```js
// Run in both folders /backend and /frontend
npm install
```

### To run Locally (vcr debug)

1. Run the Backend Server, in terminal, `cd backend` and `vcr debug -y -f vcr-backend.yml`

2. Run the Frontend, in terminal, `cd frontend` and `npm start`

3. In the Backend directory, in the file ``vcr-frontend.yml` update the `FRONTEND_URL` value, example `http://localhost:3003/` and rerun the backend server `vcr debug -y -f vcr-backend.yml`

### To deploy (vcr deploy)

1. Deploy the Backend: `cd backend` and then `vcr deploy -f vcr-backend.yml`

2. Deploy the Frontend:
   1. Update in /frontend/App.js `BACKEND_URL` to your VCR Backend URL.
   2. Update in /backend/vcr.yml `FRONTEND_URL` to your VCR Frontend URL. You can deploy frontend twice to retrieve it. There's probably a smarter way to do this.
   3. Then `cd frontend` and `vcr deploy -f vcr-frontend.yml`

## Application Flow

1. **Master Account Authentication**

   - The user enters the **Master API Key** for account admin access.
   - The app validates the master API key against the configured `MASTER_API_KEY` in the backend environment.
   - If authentication is successful, the app automatically fetches the list of available subaccounts.

2. **Subaccount Selection & Automatic Secret Management**

   - After successful authentication, the app displays a dropdown list of all available subaccounts (master account excluded).
   - The user selects the desired subaccount from the dropdown.
   - The first subaccount is selected by default.
   - **Automatic Secret Rotation**: The app automatically manages API secrets for the selected subaccount, rotating them as needed while maintaining a maximum of 2 secrets.

3. **Fetch LVNs (Owned Numbers)**

   - The app automatically uses the **subaccount's own credentials** (API key + auto-managed secret) to fetch LVNs.
   - This follows Vonage API best practices for subaccount access.
   - Available LVNs are fetched and the dropdown is populated. The first LVN is selected by default.
   - **LVN Link Status**: LVNs linked to applications display a "Linked" badge and show the linked Application ID.
   - A success message is displayed showing how many LVNs were found and which numbers are available.

4. **Buy LVN (Optional)**

   - If a user needs a new phone number, they can click **"BUY LVN"**.
   - The app prompts for a 2-letter country code (e.g., US, GB, DE) to search for available numbers.
   - The app automatically searches for and purchases the first available number in the specified country.
   - Uses the **subaccount's own credentials** for both search and purchase operations.
   - After successful purchase, the LVN list is refreshed and the newly purchased number is automatically selected.
   - **Note**: Purchasing a number will incur monthly charges. The cost will be shown in the response data.

5. **Create or Get Subaccount Application**

   - The user clicks **"CREATE OR GET SUBACCOUNT APPLICATION"**.
   - The backend uses the **subaccount's own credentials** to create a new Vonage Application (if one doesn't exist) or retrieve an existing one.
   - The Application ID is displayed in the UI with a message indicating whether it was "Created" or "Retrieved".
   - **Note**: LVN linking is **not required** for outbound calls. The Voice API uses JWT authentication with the application ID and private key.

6. **Make a Call**

   - The user enters the destination ("To") number and clicks **"Call"**.
   - The app uses the selected LVN as the "from" number and the provided "to" number.
   - Any LVN owned by the subaccount can be used - no explicit linking required.
   - The backend uses the subaccount's Application ID and Private Key to authenticate and send the outbound call via the Vonage Voice API.
   - All errors (authentication, no LVNs, call errors) and success responses are displayed in the UI.

7. **View Call Status (Webhook Events)**
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

## Version 3 New Features

### **Settings Management Panel**

- **Settings Cog Icon**: Accessible from the top-right corner after authentication
- **VCR State Viewer**: View all cached application data and private keys stored in VCR State Provider
- **Vonage Applications Manager**:
  - View all Vonage applications for the selected subaccount
  - Display applications in organized cards with app ID, name, and webhook URLs
  - Delete applications matching the naming convention with automatic state cleanup
- **State Management Actions**:
  - **View All State**: Inspect VCR cached data (applications and private keys)
  - **Delete All State**: Clear VCR cache for fresh start
  - **View All Apps**: Fetch and display actual Vonage applications from API
  - **Delete All Apps**: Remove applications and automatically clear related VCR state

### **Automatic Secret Management**

- **Secret Generation**: Automatically generates secure API secrets for subaccounts
- **Secret Rotation**: Smart rotation system that maintains 2 secrets max, deleting oldest when creating new ones
- **Secret Caching**: Caches secrets per subaccount to avoid unnecessary rotation
- **Seamless UX**: Users no longer need to manually enter subaccount secrets

### **Synchronized State Management**

- **Automatic State Cleanup**: When deleting Vonage applications, VCR state is automatically cleared
- **Consistency Enforcement**: Ensures cached state matches actual Vonage resources
- **No Orphaned Data**: Private keys and application mappings are cleaned up together

---

## Important Notes

### **Outbound Calls Don't Require LVN Linking**

**Key Insight**: LVN-to-application linking is **not required** for outbound calls via the Voice API.

#### **Why:**

- **JWT Authentication**: The Voice API authenticates outbound calls using JWT tokens generated from the application ID and private key
- **Any LVN Works**: You can use any LVN owned by the subaccount as the caller ID without explicit linking
- **Linking Only for Inbound**: LVN-to-app linking is primarily required for receiving inbound calls and SMS

#### **What This Means:**

- **Simplified Workflow**: Select LVN → Create/Get App → Call immediately ✅
- **No Re-linking Needed**: Switch between LVNs freely without additional configuration
- **Fewer API Calls**: No need to call `/number/update` for outbound-only use cases
- **Reduced Errors**: Eliminates authentication issues with number update API

### **Dual LVN Operations UI (v2.3)**

The application now features a reorganized UI with two distinct sections for LVN management operations:

#### **🗑️ Release LVN Section**

- **Purpose**: Permanently cancel/release LVNs from the current subaccount
- **Visual Design**: Red-themed section with error-style coloring for destructive action
- **Requirements**: Selected LVN + current subaccount credentials
- **Confirmation**: Double confirmation (country code + confirmation dialog)
- **Action**: `RELEASE LVN` button removes number from subaccount permanently

#### **↗️ Transfer LVN Section**

- **Purpose**: Transfer LVNs between master account and target subaccounts
- **Visual Design**: Blue-themed section with primary coloring for transfer action
- **Requirements**: Selected LVN + target subaccount API key + master credentials
- **Input Field**: Target Subaccount API Key input within the section
- **Action**: `TRANSFER LVN` button moves number to specified subaccount

#### **UI Benefits**

- **Clear Separation**: Distinct visual sections prevent operational confusion
- **Contextual Inputs**: Each section contains only relevant input fields
- **Color Coding**: Red for destructive (release), Blue for transfer operations
- **Improved UX**: Users understand the difference between release vs transfer
- **Organized Layout**: Boxed sections with headers and descriptions

### **Automatic Country Detection (v2.4)**

The application now automatically detects country codes from phone numbers, eliminating the need for manual country code entry:

#### **Supported Countries**

- **United States (US)**: Numbers starting with +1 and US area codes
- **Canada (CA)**: Numbers starting with +1 and Canadian area codes

#### **Detection Logic**

- **11-digit numbers** starting with "1": Analyzes area code to distinguish US vs Canada
- **10-digit numbers**: Assumes US format
- **Fallback**: Defaults to US if format cannot be determined

#### **Benefits**

- **Streamlined UX**: No more country code prompts for users
- **Automatic Processing**: Backend handles country detection seamlessly
- **Error Reduction**: Eliminates manual country code entry mistakes
- **NANP Support**: Full support for North American Numbering Plan (US/Canada)

### **LVN Transfer Functionality (v2.2)**

- **TRANSFER LVN Button**: Replaces BUY LVN functionality with number transfer capabilities
- **Master-to-Subaccount Transfer**: Transfer existing numbers from master account to target subaccounts
- **Required Credentials**:
  - Master API Key (for authentication)
  - Master API Secret (configured server-side in vcr-backend.yml)
  - Target Subaccount API Key (destination for the transfer)
- **Vonage Subaccounts Transfer API**: Uses the official Vonage `/accounts/{api_key}/transfer-number` endpoint
- **Transfer Workflow**:
  1. Select an LVN from current subaccount
  2. Enter target subaccount API key
  3. Click "TRANSFER LVN" to execute transfer (country auto-detected)
- **Post-Transfer Actions**:
  - Number is removed from source subaccount
  - Number appears in target subaccount
  - Application linking may be required in target subaccount for Voice functionality

#### **Transfer Requirements:**

- **Master Account Credentials**: Master API key for authentication, secret configured server-side
- **LVN Selection**: Must select an existing LVN to transfer
- **Target Specification**: Target subaccount API key must be provided
- **Country Auto-Detection**: Country code automatically detected from LVN format

#### **API Integration:**

```javascript
// Backend endpoint: POST /api/transfer-lvn
{
  "masterApiKey": "your-master-api-key",
  "targetSubaccountApiKey": "target-subaccount-api-key",
  "selectedLvn": "15551234567",
  "applicationId": "optional-app-id"
}
```

---

## Implementation Notes

- **Master Account Authentication**: The UI requires authentication with the master API key before accessing any functionality.
- **Automatic Secret Management**: The app automatically manages subaccount API secrets with rotation, caching, and propagation delay handling.
- **Direct Subaccount API Access**: All subaccount operations (LVNs, applications, calls) use the subaccount's own credentials following Vonage API best practices.
- **Automatic LVN Fetching**: LVNs are fetched automatically when selecting a subaccount, with automatic secret refresh on authentication errors.
- **LVN Link Status Display**: LVNs show their application link status in the dropdown with "Linked" badges and display linked Application IDs.
- **No LVN Linking Required**: Outbound calls work with any owned LVN - linking is only required for inbound calls/SMS.
- **Enhanced Response Feedback**: Application creation/retrieval responses clearly indicate whether an app was "Created" or "Retrieved" with specific application IDs.
- **All errors** (authentication, invalid credentials, no LVNs, call errors) are shown in the UI.
- **Response History**: The UI maintains a history of the last 10 API responses with timestamps and operation labels. Users can expand the history panel to review previous operations and clear the history if needed.
- **Outbound calls** can only be made by a subaccount's Vonage Application ID and Private Key.
- **LVN selection**: The first available LVN is selected by default after fetching.
- **Application persistence**: The backend stores subaccount application info and private key for reuse using the VCR State Provider.
- **Webhook events**: The backend receives and stores call status updates, and the frontend displays them in real time with improved formatting.
- **Settings Management**: Advanced settings panel accessible via cog icon for viewing/managing VCR state and Vonage applications.

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

- ❌ **Subaccount Secrets** - Generated and managed automatically, cached in frontend session only
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
