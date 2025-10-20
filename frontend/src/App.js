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
} from "@mui/material";
import "./App.css";

const BACKEND_URL =
  process.env.NODE_ENV === "production"
    ? "https://neru-4f2ff535-epic-call-app-backend-dev.use1.runtime.vonage.cloud"
    : "";

function App() {
  const [masterApiKey, setMasterApiKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [subaccounts, setSubaccounts] = useState([]);
  const [selectedSubaccount, setSelectedSubaccount] = useState("");
  const [subaccountSecret, setSubaccountSecret] = useState("");
  const [lvns, setLvns] = useState([]);
  const [selectedLvn, setSelectedLvn] = useState("");
  const [to, setTo] = useState("");
  const [response, setResponse] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);
  const [callUuid, setCallUuid] = useState("");
  const [callStatus, setCallStatus] = useState(null);
  const pollActiveRef = useRef(false);

  // Authenticate with master API key
  const handleAuthenticate = async () => {
    setAuthLoading(true);
    setResponse(null);
    try {
      await axios.post(`${BACKEND_URL}/api/authenticate`, {
        masterApiKey,
      });
      setIsAuthenticated(true);
      // Automatically fetch subaccounts after successful authentication
      await handleGetSubaccounts();
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
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
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
    }
  };

  // Fetch LVNs for a specific account with provided secret
  const fetchLvnsForAccount = async (accountApiKey, accountSecret) => {
    if (!accountSecret) {
      setResponse({ error: "Subaccount secret is required to fetch LVNs." });
      return;
    }

    setLvns([]);
    setSelectedLvn("");
    setResponse(null);
    setAppInfo(null);
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
        setResponse({
          success: true,
          message: `Successfully fetched ${numbers.length} LVN${
            numbers.length > 1 ? "s" : ""
          } for this subaccount`,
          data: {
            count: numbers.length,
            numbers: numbers.map((n) => n.msisdn),
          },
        });
      } else {
        setResponse({ error: "No LVNs found for this account." });
      }
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
    }
  };

  // Fetch LVNs for selected subaccount with provided secret
  const handleGetLvns = async () => {
    await fetchLvnsForAccount(selectedSubaccount, subaccountSecret);
  };

  // Cancel/Release the selected LVN
  const handleCancelLvn = async () => {
    if (!selectedLvn) {
      setResponse({ error: "Please select an LVN to cancel" });
      return;
    }

    // Add confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to cancel/release the LVN ${selectedLvn}? This action cannot be undone and you will lose this phone number permanently.`
    );

    if (!confirmed) {
      return;
    }

    setCancelLoading(true);
    setResponse(null);

    try {
      // Extract country code from the LVN (first 1-3 digits)
      // This is a simple heuristic - for production, you might want to store country with each LVN
      let country = "";
      if (selectedLvn.startsWith("1")) {
        country = "US"; // North America
      } else if (selectedLvn.startsWith("44")) {
        country = "GB"; // UK
      } else if (selectedLvn.startsWith("49")) {
        country = "DE"; // Germany
      } else if (selectedLvn.startsWith("33")) {
        country = "FR"; // France
      } else if (selectedLvn.startsWith("39")) {
        country = "IT"; // Italy
      } else if (selectedLvn.startsWith("34")) {
        country = "ES"; // Spain
      } else if (selectedLvn.startsWith("31")) {
        country = "NL"; // Netherlands
      } else if (selectedLvn.startsWith("32")) {
        country = "BE"; // Belgium
      } else if (selectedLvn.startsWith("41")) {
        country = "CH"; // Switzerland
      } else if (selectedLvn.startsWith("43")) {
        country = "AT"; // Austria
      } else if (selectedLvn.startsWith("45")) {
        country = "DK"; // Denmark
      } else if (selectedLvn.startsWith("46")) {
        country = "SE"; // Sweden
      } else if (selectedLvn.startsWith("47")) {
        country = "NO"; // Norway
      } else if (selectedLvn.startsWith("358")) {
        country = "FI"; // Finland
      } else if (selectedLvn.startsWith("61")) {
        country = "AU"; // Australia
      } else {
        // Default fallback - ask user to specify
        country = prompt(
          "Please enter the 2-letter country code for this number (e.g., US, GB, DE):"
        );
        if (!country) {
          setCancelLoading(false);
          setResponse({
            error: "Country code is required to cancel the number",
          });
          return;
        }
        country = country.toUpperCase();
      }

      const res = await axios.post(`${BACKEND_URL}/api/cancel-number`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        subaccountSecret: subaccountSecret,
        msisdn: selectedLvn,
        country: country,
      });

      const successMessage = {
        success: true,
        message: `LVN ${selectedLvn} has been cancelled successfully`,
        data: res.data,
      };

      // Refresh the LVNs list to remove the cancelled number
      // But don't let it overwrite our success message
      try {
        const lvnRes = await axios.post(`${BACKEND_URL}/api/lvns`, {
          masterApiKey,
          subaccountApiKey: selectedSubaccount,
          subaccountSecret: subaccountSecret,
        });
        const numbers = lvnRes.data.numbers || [];
        setLvns(numbers);
        if (numbers.length > 0) {
          setSelectedLvn(numbers[0].msisdn);
        } else {
          setSelectedLvn("");
        }
      } catch (refreshErr) {
        console.log("Error refreshing LVNs after cancel:", refreshErr);
        // Don't overwrite the success message even if refresh fails
        setLvns([]);
        setSelectedLvn("");
      }

      // Set the success message after LVN refresh
      setResponse(successMessage);
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
    }

    setCancelLoading(false);
  };

  // Buy/Purchase a new LVN
  const handleBuyLvn = async () => {
    if (!selectedSubaccount || !subaccountSecret) {
      setResponse({
        error: "Please select a subaccount and provide credentials",
      });
      return;
    }

    // Ask user for country code to search for numbers
    const country = prompt(
      "Enter the 2-letter country code to search for numbers (e.g., US, GB, DE):"
    );
    if (!country) {
      return;
    }

    setBuyLoading(true);
    setResponse(null);

    try {
      // First, search for available numbers
      const searchRes = await axios.post(`${BACKEND_URL}/api/search-numbers`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        subaccountSecret: subaccountSecret,
        country: country.toUpperCase(),
        features: "VOICE", // We want numbers that support voice calls
      });

      const availableNumbers = searchRes.data.numbers || [];

      if (availableNumbers.length === 0) {
        setResponse({
          error: `No numbers available for purchase in ${country.toUpperCase()}`,
        });
        setBuyLoading(false);
        return;
      }

      // Show user the first available number and ask for confirmation
      const firstNumber = availableNumbers[0];
      const cost = firstNumber.cost || "unknown";
      const confirmed = window.confirm(
        `Purchase number ${firstNumber.msisdn} for €${cost}/month?\n\nType: ${
          firstNumber.type
        }\nFeatures: ${firstNumber.features?.join(", ") || "N/A"}`
      );

      if (!confirmed) {
        setBuyLoading(false);
        return;
      }

      // Buy the selected number
      const buyRes = await axios.post(`${BACKEND_URL}/api/buy-number`, {
        masterApiKey,
        subaccountApiKey: selectedSubaccount,
        subaccountSecret: subaccountSecret,
        msisdn: firstNumber.msisdn,
        country: country.toUpperCase(),
      });

      const successMessage = {
        success: true,
        message: `LVN ${firstNumber.msisdn} has been purchased successfully`,
        data: buyRes.data,
      };

      // Refresh the LVNs list to include the new number
      try {
        const lvnRes = await axios.post(`${BACKEND_URL}/api/lvns`, {
          masterApiKey,
          subaccountApiKey: selectedSubaccount,
          subaccountSecret: subaccountSecret,
        });
        const numbers = lvnRes.data.numbers || [];
        setLvns(numbers);
        // Select the newly purchased number
        if (numbers.length > 0) {
          const newNumber = numbers.find(
            (n) => n.msisdn === firstNumber.msisdn
          );
          if (newNumber) {
            setSelectedLvn(newNumber.msisdn);
          } else {
            setSelectedLvn(numbers[0].msisdn);
          }
        }
      } catch (refreshErr) {
        console.log("Error refreshing LVNs after purchase:", refreshErr);
        // Don't overwrite the success message even if refresh fails
      }

      // Set the success message after LVN refresh
      setResponse(successMessage);
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
    }

    setBuyLoading(false);
  };

  // Create or get subaccount application
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
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
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
        setResponse({
          error: "No application info. Please create the application first.",
        });
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
      setResponse(res.data);
      const uuid = res.data?.data?.uuid;
      console.log("Set callUuid:", uuid);
      setCallUuid(uuid);
      // DO NOT start polling here!
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
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
                type="password"
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

              <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleCancelLvn}
                  disabled={!selectedLvn || cancelLoading || !subaccountSecret}
                  sx={{ flex: 1 }}
                >
                  {cancelLoading ? "Cancelling..." : "Cancel/Release LVN"}
                </Button>

                <Button
                  variant="outlined"
                  color="success"
                  onClick={handleBuyLvn}
                  disabled={
                    !selectedSubaccount || !subaccountSecret || buyLoading
                  }
                  sx={{ flex: 1 }}
                >
                  {buyLoading ? "Buying..." : "Buy LVN"}
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
                  !selectedLvn || !to || !appInfo || loading || appLoading
                }
              >
                {loading ? "Calling..." : "Call"}
              </Button>
            </>
          )}

          <Box>
            <Typography variant="subtitle1">Response:</Typography>
            <pre>{response && JSON.stringify(response, null, 2)}</pre>
          </Box>

          {callUuid && (
            <Box>
              <Typography variant="subtitle1">Call Status:</Typography>
              {callStatus === null ? (
                <Typography variant="body2" color="text.secondary">
                  Waiting for call status updates from Vonage...
                </Typography>
              ) : (
                <pre>{JSON.stringify(callStatus, null, 2)}</pre>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    </Container>
  );
}

export default App;
