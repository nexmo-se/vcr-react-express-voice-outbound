import React, { useRef, useEffect, useState } from "react";
import axios from "axios";
import {
  Container,
  Typography,
  TextField,
  Select,
  MenuItem,
  Button,
  Box,
  FormControl,
  InputLabel,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SettingsIcon from "@mui/icons-material/Settings";
import "./App.css";

const BACKEND_URL =
  process.env.NODE_ENV === "production"
    ? "https://neru-4f2ff535-epic-call-app-backend-dev.use1.runtime.vonage.cloud"
    : "";

function App() {
  const [masterApiKey, setMasterApiKey] = useState("");
  const [targetSubaccountApiKey, setTargetSubaccountApiKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [subaccounts, setSubaccounts] = useState([]);
  const [selectedSubaccount, setSelectedSubaccount] = useState("");
  const [subaccountSecret, setSubaccountSecret] = useState("");
  const [secretCache, setSecretCache] = useState({}); // Cache secrets per subaccount to avoid rotation on every switch
  const [secretLoading, setSecretLoading] = useState(false);
  const [lvns, setLvns] = useState([]);
  const [selectedLvn, setSelectedLvn] = useState("");
  const [to, setTo] = useState("");
  const [response, setResponse] = useState(null);
  const [responseHistory, setResponseHistory] = useState([]);
  const [appInfo, setAppInfo] = useState(null);
  const [lvnLinkedToApp, setLvnLinkedToApp] = useState(false);
  const [linkedLvn, setLinkedLvn] = useState(""); // Track which LVN is currently linked to the app
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [callUuid, setCallUuid] = useState("");
  const [callStatus, setCallStatus] = useState(null);
  const pollActiveRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vcrState, setVcrState] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [clearingState, setClearingState] = useState(false);
  const [vonageApps, setVonageApps] = useState(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [deletingApps, setDeletingApps] = useState(false);

  // Helper function to add response to history and set current response
  const addResponseToHistory = (newResponse, operation = "API Operation") => {
    if (response) {
      // Add current response to history before setting new one
      const historyEntry = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        operation: operation,
        response: response,
      };
      setResponseHistory((prev) => [historyEntry, ...prev].slice(0, 10)); // Keep only last 10 responses
    }
    setResponse(newResponse);
  };

  // Manage subaccount secret automatically
  const handleManageSecret = async (subaccountApiKey) => {
    // Check if we already have a cached secret for this subaccount
    if (secretCache[subaccountApiKey]) {
      console.log(`Using cached secret for subaccount: ${subaccountApiKey}`);
      setSubaccountSecret(secretCache[subaccountApiKey]);
      return secretCache[subaccountApiKey];
    }

    setSecretLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/manage-secret`, {
        masterApiKey,
        subaccountApiKey,
      });

      // Store the generated secret
      setSubaccountSecret(res.data.secret);

      // Cache the secret for this subaccount
      setSecretCache((prev) => ({
        ...prev,
        [subaccountApiKey]: res.data.secret,
      }));

      addResponseToHistory(
        {
          success: true,
          message: res.data.message,
          secretId: res.data.secretId,
        },
        "Manage Secret"
      );

      return res.data.secret;
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Manage Secret"
      );
      return null;
    } finally {
      setSecretLoading(false);
    }
  }; // Authenticate with master API key
  const handleAuthenticate = async () => {
    setAuthLoading(true);
    setResponse(null);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/authenticate`, {
        masterApiKey,
      });
      setIsAuthenticated(true);

      // Add success response to history
      addResponseToHistory(
        {
          success: true,
          message: "Successfully authenticated as Account Admin",
          data: res.data,
        },
        "Authentication"
      );

      // Automatically fetch subaccounts after successful authentication
      await handleGetSubaccounts();
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Authentication"
      );
      setIsAuthenticated(false);
    }
    setAuthLoading(false);
  };

  // Fetch subaccounts
  const handleGetSubaccounts = async () => {
    setSubaccounts([]);
    setSelectedSubaccount("");
    setLvns([]);
    setSelectedLvn("");
    setAppInfo(null);
    setLvnLinkedToApp(false);
    setLinkedLvn("");
    try {
      const res = await axios.post(`${BACKEND_URL}/api/subaccounts`, {
        masterApiKey,
      });

      // Handle the actual Vonage API response structure
      const embedded = res.data._embedded || {};
      const subaccounts = embedded.subaccounts || [];

      // Only show subaccounts in the dropdown (exclude primary account)
      const formattedSubaccounts = subaccounts.map((sub) => ({
        ...sub,
        name: sub.name || `Subaccount (${sub.api_key})`,
      }));

      setSubaccounts(formattedSubaccounts);

      // Select the first subaccount by default
      let defaultAccount = null;
      if (formattedSubaccounts.length > 0) {
        defaultAccount = formattedSubaccounts[0].api_key;
      }

      if (defaultAccount) {
        setSelectedSubaccount(defaultAccount);
        // Automatically manage secret for the default subaccount
        const secret = await handleManageSecret(defaultAccount);
        if (secret) {
          // Fetch LVNs with automatic retry on 401
          await fetchLvnsForAccount(defaultAccount, secret);
        }
      }

      addResponseToHistory(
        {
          message: `Successfully fetched ${formattedSubaccounts.length} subaccounts`,
        },
        "Fetch Subaccounts"
      );
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Fetch Subaccounts"
      );
    }
  };

  // Fetch LVNs for a specific account with provided secret
  const fetchLvnsForAccount = async (
    accountApiKey,
    accountSecret,
    retryCount = 0
  ) => {
    if (!accountSecret) {
      addResponseToHistory(
        { error: "Subaccount secret is required to fetch LVNs." },
        "Fetch LVNs"
      );
      return;
    }

    setLvns([]);
    setSelectedLvn("");
    setResponse(null);
    setAppInfo(null);
    setLvnLinkedToApp(false);
    setLinkedLvn("");
    try {
      const res = await axios.post(`${BACKEND_URL}/api/lvns`, {
        masterApiKey,
        subaccountApiKey: accountApiKey,
        subaccountSecret: accountSecret,
      });
      const numbers = res.data.numbers || [];
      setLvns(numbers);
      if (numbers.length > 0) {
        setSelectedLvn(numbers[0].msisdn);
        addResponseToHistory(
          {
            success: true,
            message: `Successfully fetched ${numbers.length} LVN${
              numbers.length > 1 ? "s" : ""
            } for this subaccount`,
            data: {
              count: numbers.length,
              numbers: numbers.map((n) => n.msisdn),
            },
          },
          "Fetch LVNs"
        );
      } else {
        addResponseToHistory(
          { error: "No LVNs found for this account." },
          "Fetch LVNs"
        );
      }
    } catch (err) {
      // If 401 error (secret not propagated yet) and we haven't exceeded retry limit
      if (err.response?.status === 401 && retryCount < 3) {
        const delay = (retryCount + 1) * 3000; // 3s, 6s, 9s
        addResponseToHistory(
          {
            message: `Secret still propagating, retrying in ${
              delay / 1000
            } seconds... (attempt ${retryCount + 1}/3)`,
          },
          "Fetch LVNs"
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchLvnsForAccount(
          accountApiKey,
          accountSecret,
          retryCount + 1
        );
      }

      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Fetch LVNs"
      );
    }
  };

  // Transfer LVN from master account to target subaccount
  const handleTransferLvn = async () => {
    if (!selectedLvn) {
      addResponseToHistory(
        {
          error: "Please select an LVN to transfer",
        },
        "Transfer LVN"
      );
      return;
    }

    if (!targetSubaccountApiKey) {
      addResponseToHistory(
        {
          error: "Please provide target subaccount API key",
        },
        "Transfer LVN"
      );
      return;
    }

    setPurchaseLoading(true);
    setResponse(null);

    try {
      const res = await axios.post(`${BACKEND_URL}/api/transfer-lvn`, {
        masterApiKey,
        sourceSubaccountApiKey: selectedSubaccount,
        targetSubaccountApiKey,
        selectedLvn,
        applicationId: appInfo?.application_id,
      });

      const successMessage = {
        success: true,
        message: res.data.message,
        data: res.data,
      };

      // Clear the transferred LVN from current selection
      setSelectedLvn("");
      setLvnLinkedToApp(false);
      setLinkedLvn("");

      // Refresh the LVNs list for current subaccount to remove transferred number
      if (selectedSubaccount && subaccountSecret) {
        try {
          const lvnRes = await axios.post(`${BACKEND_URL}/api/lvns`, {
            masterApiKey,
            subaccountApiKey: selectedSubaccount,
            subaccountSecret: subaccountSecret,
          });
          setLvns(lvnRes.data.numbers || []);
        } catch (refreshErr) {
          console.log("Error refreshing LVNs after transfer:", refreshErr);
        }
      }

      addResponseToHistory(successMessage, "Transfer LVN");
    } catch (err) {
      addResponseToHistory(
        {
          error: err.response?.data?.error || err.message,
          details: err.response?.data?.details || "Transfer failed",
        },
        "Transfer LVN"
      );
    }

    setPurchaseLoading(false);
  };

  // Create or get subaccount application (no LVN linking needed)
  const handleGetOrCreateApp = async () => {
    setAppInfo(null);
    setResponse(null);
    setAppLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/subaccount-app`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        subaccountSecret: subaccountSecret,
      });
      setAppInfo(res.data);

      // LVN linking not required for outbound calls
      setLvnLinkedToApp(true);
      setLinkedLvn(selectedLvn);

      addResponseToHistory(
        {
          success: true,
          message:
            res.data.message ||
            "Successfully created/retrieved Voice API application",
          action: res.data.action,
          applicationId: res.data.applicationId,
          data: res.data,
        },
        "Create Application"
      );
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Create Application"
      );
    }
    setAppLoading(false);
  };

  // Make a call
  const handleCall = async () => {
    setResponse(null);
    setCallStatus(null);
    setCallUuid("");
    setLoading(true);
    try {
      if (!appInfo) {
        addResponseToHistory(
          {
            error: "No application info. Please create the application first.",
          },
          "Make Call"
        );
        setLoading(false);
        return;
      }
      const res = await axios.post(`${BACKEND_URL}/api/call`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        from: selectedLvn,
        to,
        text: "This is a call from your subaccount LVN!",
      });
      addResponseToHistory(res.data, "Make Call");
      const uuid = res.data?.data?.uuid;
      console.log("Set callUuid:", uuid);
      setCallUuid(uuid);
      // DO NOT start polling here!
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Make Call"
      );
    }
    setLoading(false);
  };

  // Only useEffect for polling!
  useEffect(() => {
    if (!callUuid) return;

    pollActiveRef.current = true;
    const intervalId = setInterval(async () => {
      if (!pollActiveRef.current) return;
      try {
        const statusRes = await axios.get(`${BACKEND_URL}/api/call-status`, {
          params: { uuid: callUuid },
        });
        setCallStatus(statusRes.data);
        console.log("Polled call status:", statusRes.data);
        if (
          statusRes.data &&
          (statusRes.data.status === "completed" ||
            statusRes.data.status === "failed")
        ) {
          pollActiveRef.current = false;
          clearInterval(intervalId);
          console.log("Stopped polling: call is", statusRes.data.status);
        }
      } catch (e) {
        // Optionally log polling errors
      }
    }, 3000);

    return () => {
      pollActiveRef.current = false;
      clearInterval(intervalId);
    };
  }, [callUuid]);

  // Watch for LVN selection changes and reset linking status
  useEffect(() => {
    if (linkedLvn && selectedLvn && selectedLvn !== linkedLvn) {
      // User selected a different LVN, need to re-link to application
      setLvnLinkedToApp(false);
    }
  }, [selectedLvn, linkedLvn]);

  // Fetch VCR state (all stored apps and private keys)
  const handleFetchVcrState = async () => {
    setStateLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/get-vcr-state`, {
        masterApiKey,
      });
      setVcrState(res.data);
      addResponseToHistory(
        {
          success: true,
          message: "Successfully retrieved VCR state",
          data: res.data,
        },
        "Fetch VCR State"
      );
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Fetch VCR State"
      );
      setVcrState(null);
    }
    setStateLoading(false);
  };

  // Clear all VCR state
  const handleClearVcrState = async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear all VCR state? This will remove all stored applications and private keys."
      )
    ) {
      return;
    }

    setClearingState(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/clear-state`, {
        masterApiKey,
      });
      setVcrState(null);
      setAppInfo(null);
      addResponseToHistory(
        {
          success: true,
          message: res.data.message,
        },
        "Clear VCR State"
      );
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Clear VCR State"
      );
    }
    setClearingState(false);
  };

  // Fetch all Vonage applications for selected subaccount
  const handleFetchVonageApps = async () => {
    if (!selectedSubaccount || !subaccountSecret) {
      addResponseToHistory(
        { error: "Please select a subaccount first" },
        "Fetch Applications"
      );
      return;
    }

    setAppsLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/list-applications`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        subaccountSecret: subaccountSecret,
      });
      const apps = res.data._embedded?.applications || [];
      setVonageApps(apps);
      addResponseToHistory(
        {
          success: true,
          message: `Found ${apps.length} Vonage application(s)`,
          data: apps,
        },
        "Fetch Applications"
      );
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Fetch Applications"
      );
      setVonageApps(null);
    }
    setAppsLoading(false);
  };

  // Delete all Vonage applications for selected subaccount
  const handleDeleteAllVonageApps = async () => {
    if (!selectedSubaccount || !subaccountSecret) {
      addResponseToHistory(
        { error: "Please select a subaccount first" },
        "Delete Applications"
      );
      return;
    }

    if (
      !window.confirm(
        "Are you sure you want to delete ALL Vonage applications for this subaccount? This action cannot be undone."
      )
    ) {
      return;
    }

    setDeletingApps(true);
    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/delete-all-applications`,
        {
          masterApiKey,
          subaccountApiKey: selectedSubaccount,
          subaccountSecret: subaccountSecret,
        }
      );
      setVonageApps(null);
      setAppInfo(null);
      addResponseToHistory(
        {
          success: true,
          message: res.data.message,
          data: res.data,
        },
        "Delete Applications"
      );
    } catch (err) {
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Delete Applications"
      );
    }
    setDeletingApps(false);
  };

  // Open settings dialog and fetch state
  const handleOpenSettings = async () => {
    setSettingsOpen(true);
    await handleFetchVcrState();
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Typography variant="h4">Vonage Voice LVN Caller</Typography>
          {isAuthenticated && (
            <IconButton
              onClick={handleOpenSettings}
              color="primary"
              aria-label="settings"
              size="large"
            >
              <SettingsIcon />
            </IconButton>
          )}
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {!isAuthenticated ? (
            // Authentication Step
            <>
              <TextField
                label="Master API Key"
                value={masterApiKey}
                onChange={(e) => setMasterApiKey(e.target.value)}
                variant="outlined"
                autoComplete="off"
                type="password"
              />
              <Button
                variant="contained"
                onClick={handleAuthenticate}
                disabled={!masterApiKey || authLoading}
              >
                {authLoading ? "Authenticating..." : "Authenticate"}
              </Button>
            </>
          ) : (
            // Main Application Flow
            <>
              <Typography variant="subtitle1" color="success.main">
                ✓ Authenticated as Account Admin
              </Typography>

              <FormControl fullWidth>
                <InputLabel>Select Subaccount</InputLabel>
                <Select
                  value={selectedSubaccount}
                  label="Select Subaccount"
                  onChange={async (e) => {
                    const newAccount = e.target.value;
                    setSelectedSubaccount(newAccount);
                    // Clear the secret and LVNs when changing subaccount
                    setSubaccountSecret("");
                    setLvns([]);
                    setSelectedLvn("");

                    // Automatically manage secret and fetch LVNs
                    const secret = await handleManageSecret(newAccount);
                    if (secret) {
                      // Fetch LVNs with automatic retry on 401
                      await fetchLvnsForAccount(newAccount, secret);
                    }
                  }}
                  disabled={secretLoading}
                >
                  {subaccounts.map((subaccount) => (
                    <MenuItem
                      key={subaccount.api_key}
                      value={subaccount.api_key}
                    >
                      {subaccount.name || subaccount.api_key}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {secretLoading && (
                <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
                  Managing subaccount secret...
                </Typography>
              )}

              <FormControl fullWidth>
                <InputLabel>LVN</InputLabel>
                <Select
                  value={selectedLvn}
                  label="LVN"
                  onChange={(e) => setSelectedLvn(e.target.value)}
                >
                  {lvns.map((lvn) => (
                    <MenuItem key={lvn.msisdn} value={lvn.msisdn}>
                      {lvn.msisdn}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Transfer LVN Section */}
              <Box
                sx={{
                  mt: 3,
                  p: 2,
                  border: "1px solid #e0e0e0",
                  borderRadius: 1,
                }}
              >
                <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
                  ↗️ Transfer LVN
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ mb: 2, color: "text.secondary" }}
                >
                  Transfer the selected LVN to another subaccount
                </Typography>
                <TextField
                  label="Target Subaccount API Key"
                  value={targetSubaccountApiKey}
                  onChange={(e) => setTargetSubaccountApiKey(e.target.value)}
                  variant="outlined"
                  autoComplete="off"
                  helperText="API key of the subaccount to transfer the LVN to"
                  fullWidth
                  sx={{ mb: 2 }}
                />
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleTransferLvn}
                  disabled={
                    !selectedLvn || !targetSubaccountApiKey || purchaseLoading
                  }
                  sx={{ width: "100%" }}
                >
                  {purchaseLoading ? "Transferring..." : "TRANSFER LVN"}
                </Button>
              </Box>

              <TextField
                label="To"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                variant="outlined"
                autoComplete="off"
              />

              <Button
                variant="contained"
                onClick={handleGetOrCreateApp}
                disabled={
                  !selectedSubaccount ||
                  !subaccountSecret ||
                  appLoading ||
                  lvns.length === 0
                }
              >
                {appLoading
                  ? "Creating App..."
                  : "Create or Get Subaccount Application"}
              </Button>

              {appInfo && (
                <Box>
                  <Typography variant="subtitle1">Application ID:</Typography>
                  <pre>{appInfo.applicationId}</pre>
                </Box>
              )}

              <Button
                variant="contained"
                onClick={handleCall}
                disabled={
                  !selectedLvn ||
                  !to ||
                  !appInfo ||
                  loading ||
                  appLoading ||
                  !lvnLinkedToApp
                }
              >
                {loading ? "Calling..." : "Call"}
              </Button>

              {selectedLvn && appInfo && !lvnLinkedToApp && (
                <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                  ⚠️ You selected a different LVN. Click "CREATE OR GET
                  SUBACCOUNT APPLICATION" to link this LVN before making calls.
                </Typography>
              )}
            </>
          )}

          <Box>
            <Typography variant="subtitle1">Current Response:</Typography>
            {response ? (
              <Paper variant="outlined" sx={{ p: 2, mb: 1 }}>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <Chip
                    label="Latest"
                    size="small"
                    color={response.success ? "success" : "error"}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {new Date().toLocaleString()}
                  </Typography>
                </Box>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    maxWidth: "100%",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(response, null, 2)}
                </pre>
              </Paper>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                No response yet. Perform an action to see results.
              </Typography>
            )}

            {/* Response History */}
            {responseHistory.length > 0 && (
              <Accordion>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls="response-history-content"
                  id="response-history-header"
                >
                  <Typography variant="subtitle2">
                    Response History ({responseHistory.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0 }}>
                  <Box sx={{ maxHeight: 400, overflowY: "auto" }}>
                    {responseHistory.map((historyItem) => (
                      <Paper
                        key={historyItem.id}
                        variant="outlined"
                        sx={{ p: 2, mb: 1, backgroundColor: "grey.50" }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mb: 1,
                          }}
                        >
                          <Chip
                            label={historyItem.operation}
                            size="small"
                            variant="outlined"
                            color={
                              historyItem.response.success ? "success" : "error"
                            }
                          />
                          <Typography variant="caption" color="text.secondary">
                            {historyItem.timestamp}
                          </Typography>
                        </Box>
                        <pre
                          style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            maxWidth: "100%",
                            overflow: "auto",
                          }}
                        >
                          {JSON.stringify(historyItem.response, null, 2)}
                        </pre>
                      </Paper>
                    ))}
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: "flex", justifyContent: "center" }}>
                    <Button
                      size="small"
                      onClick={() => setResponseHistory([])}
                      color="secondary"
                    >
                      Clear History
                    </Button>
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}
          </Box>

          {callUuid && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <Chip
                  label="Call Status"
                  size="small"
                  color={
                    callStatus?.status === "completed"
                      ? "success"
                      : callStatus?.status === "failed"
                      ? "error"
                      : "default"
                  }
                />
                {callStatus && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date().toLocaleString()}
                  </Typography>
                )}
              </Box>
              {callStatus === null ? (
                <Typography variant="body2" color="text.secondary">
                  Waiting for call status updates from Vonage...
                </Typography>
              ) : (
                <pre
                  style={{
                    margin: 0,
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowWrap: "break-word",
                    maxWidth: "100%",
                    overflow: "auto",
                  }}
                >
                  {JSON.stringify(callStatus, null, 2)}
                </pre>
              )}
            </Paper>
          )}
        </Box>
      </Paper>

      {/* Settings Dialog for VCR State Management */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>VCR State Provider Settings</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle1" gutterBottom>
              Stored Applications and Private Keys
            </Typography>

            {stateLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading VCR state...
              </Typography>
            ) : vcrState ? (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  This shows all applications and private keys stored in the VCR
                  State Provider.
                </Alert>

                {vcrState.apps && Object.keys(vcrState.apps).length > 0 ? (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Stored Applications ({Object.keys(vcrState.apps).length})
                    </Typography>
                    <pre
                      style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        maxHeight: "300px",
                        overflowY: "auto",
                        backgroundColor: "#f5f5f5",
                        padding: "8px",
                        borderRadius: "4px",
                      }}
                    >
                      {JSON.stringify(vcrState.apps, null, 2)}
                    </pre>
                  </Paper>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    No applications stored in VCR state.
                  </Typography>
                )}

                {vcrState.privateKeys && vcrState.privateKeys.length > 0 ? (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Stored Private Keys ({vcrState.privateKeys.length})
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                      {vcrState.privateKeys.map((keyName, index) => (
                        <Chip
                          key={index}
                          label={keyName}
                          size="small"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </Paper>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No private keys stored in VCR state.
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No VCR state data available. Click "View All State" to load.
              </Typography>
            )}

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" gutterBottom>
              Vonage Applications for Selected Subaccount
            </Typography>

            {!selectedSubaccount ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Please select a subaccount first to view or manage Vonage
                applications.
              </Alert>
            ) : appsLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading Vonage applications...
              </Typography>
            ) : vonageApps ? (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  These are the actual Vonage applications created in the API
                  (not just cached in VCR state).
                </Alert>
                {vonageApps.length > 0 ? (
                  <Box sx={{ maxHeight: "400px", overflowY: "auto" }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
                      Found {vonageApps.length} Application
                      {vonageApps.length > 1 ? "s" : ""}
                    </Typography>
                    {vonageApps.map((app, index) => (
                      <Paper
                        key={app.id}
                        variant="outlined"
                        sx={{ p: 2, mb: 2 }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            mb: 1,
                          }}
                        >
                          <Chip
                            label={`App ${index + 1}`}
                            size="small"
                            color="primary"
                          />
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: "bold" }}
                          >
                            {app.name}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mb: 0.5 }}
                        >
                          ID: {app.id}
                        </Typography>

                        {app.capabilities?.voice?.webhooks && (
                          <Box sx={{ mt: 1 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block" }}
                            >
                              Answer URL:{" "}
                              {
                                app.capabilities.voice.webhooks.answer_url
                                  ?.address
                              }
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block" }}
                            >
                              Event URL:{" "}
                              {
                                app.capabilities.voice.webhooks.event_url
                                  ?.address
                              }
                            </Typography>
                          </Box>
                        )}
                        <Accordion sx={{ mt: 1 }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="caption">
                              View Full Details
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <pre
                              style={{
                                margin: 0,
                                fontSize: "0.75rem",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                backgroundColor: "#f5f5f5",
                                padding: "8px",
                                borderRadius: "4px",
                              }}
                            >
                              {JSON.stringify(app, null, 2)}
                            </pre>
                          </AccordionDetails>
                        </Accordion>
                      </Paper>
                    ))}
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 2 }}
                  >
                    No Vonage applications found for this subaccount.
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Click "View All Apps" to load applications for the selected
                subaccount.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              width: "100%",
            }}
          >
            <Button
              onClick={handleFetchVcrState}
              disabled={stateLoading}
              variant="outlined"
            >
              {stateLoading ? "Loading..." : "View All State"}
            </Button>
            <Button
              onClick={handleClearVcrState}
              disabled={clearingState}
              color="error"
              variant="outlined"
            >
              {clearingState ? "Deleting..." : "Delete All State"}
            </Button>
            <Button
              onClick={handleFetchVonageApps}
              disabled={appsLoading || !selectedSubaccount}
              variant="outlined"
              color="primary"
            >
              {appsLoading ? "Loading..." : "View All Apps"}
            </Button>
            <Button
              onClick={handleDeleteAllVonageApps}
              disabled={deletingApps || !selectedSubaccount}
              color="error"
              variant="outlined"
            >
              {deletingApps ? "Deleting..." : "Delete All Apps"}
            </Button>
            <Button onClick={() => setSettingsOpen(false)}>Close</Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default App;
