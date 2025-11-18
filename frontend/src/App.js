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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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

  // Authenticate with master API key
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
        // User will need to provide subaccount secret manually to fetch LVNs
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
  const fetchLvnsForAccount = async (accountApiKey, accountSecret) => {
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
      addResponseToHistory(
        { error: err.response?.data?.error || err.message },
        "Fetch LVNs"
      );
    }
  };

  // Fetch LVNs for selected subaccount with provided secret
  const handleGetLvns = async () => {
    await fetchLvnsForAccount(selectedSubaccount, subaccountSecret);
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

  // Create or get subaccount application and assign LVN
  const handleGetOrCreateApp = async () => {
    setAppInfo(null);
    setResponse(null);
    setAppLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/subaccount-app`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        subaccountSecret: subaccountSecret,
        selectedLvn: selectedLvn, // Pass the selected LVN for assignment
      });
      setAppInfo(res.data);

      // Mark that the current LVN is now linked to the application
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

  return (
    <Container maxWidth="sm" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          Vonage Voice LVN Caller
        </Typography>
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
                  onChange={(e) => {
                    const newAccount = e.target.value;
                    setSelectedSubaccount(newAccount);
                    // Clear the secret and LVNs when changing subaccount
                    setSubaccountSecret("");
                    setLvns([]);
                    setSelectedLvn("");
                  }}
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

              <TextField
                label="Subaccount Secret"
                value={subaccountSecret}
                onChange={(e) => setSubaccountSecret(e.target.value)}
                variant="outlined"
                autoComplete="off"
                helperText="Enter the API secret for the selected subaccount"
              />

              <Button
                variant="contained"
                onClick={handleGetLvns}
                disabled={!selectedSubaccount || !subaccountSecret}
              >
                Get Subaccount LVNs
              </Button>

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
    </Container>
  );
}

export default App;
