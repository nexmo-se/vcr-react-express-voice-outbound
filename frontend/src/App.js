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

function App() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [lvns, setLvns] = useState([]);
  const [selectedLvn, setSelectedLvn] = useState("");
  const [to, setTo] = useState("");
  const [response, setResponse] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(false); // Track app creation
  const [callUuid, setCallUuid] = useState("");
  const [callStatus, setCallStatus] = useState(null);
  const pollActiveRef = useRef(false);

  // Fetch LVNs for subaccount
  const handleGetLvns = async () => {
    setLvns([]);
    setSelectedLvn("");
    setResponse(null);
    setAppInfo(null);
    try {
      const res = await axios.post("/api/lvns", {
        apiKey,
        apiSecret,
      });
      const numbers = res.data.numbers || [];
      setLvns(numbers);
      if (numbers.length > 0) setSelectedLvn(numbers[0].msisdn);
      else setResponse({ error: "No LVNs found for this subaccount." });
    } catch (err) {
      setResponse({ error: err.response?.data?.error || err.message });
    }
  };

  // Create or get subaccount application
  const handleGetOrCreateApp = async () => {
    setAppInfo(null);
    setResponse(null);
    setAppLoading(true);
    try {
      const res = await axios.post("/api/subaccount-app", {
        subaccountApiKey: apiKey,
        subaccountApiSecret: apiSecret,
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
      const res = await axios.post("/api/call", {
        subaccountApiKey: apiKey,
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
        const statusRes = await axios.get("/api/call-status", {
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
          <TextField
            label="Subaccount API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            variant="outlined"
            autoComplete="off"
          />
          <TextField
            label="Subaccount API Secret"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            variant="outlined"
            type="password"
            autoComplete="off"
          />
          <Button
            variant="contained"
            onClick={handleGetLvns}
            disabled={!apiKey || !apiSecret}
          >
            Get LVNs
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
            disabled={!apiKey || !apiSecret || appLoading}
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
            disabled={!selectedLvn || !to || !appInfo || loading || appLoading}
          >
            {loading ? "Calling..." : "Call"}
          </Button>
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
