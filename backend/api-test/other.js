require("dotenv").config();
var jwt = require("jsonwebtoken");
var axios = require("axios");
const to = "15754947093";
const from = "525588967943";
// console.log(process.env);

var privateKey = process.env.PRIVATE_KEY;
var date = Date.now();

(() => {
  var data = JSON.stringify({
    to: [
      {
        type: "phone",
        number: to,
      },
    ],
    from: {
      type: "phone",
      number: from,
    },
    ncco: [
      {
        action: "talk",
        text: "Your call was successful. Thank you for using Vonage.",
      },
    ],
  });

  jwt.sign(
    {
      application_id: process.env.VCR_API_APPLICATION_ID,
      iat: date,
      jti: "" + date,
    },
    privateKey,
    { algorithm: "RS256" },
    function (err, token) {
      if (token) {
        console.log("\n✅ Received token\n", token);
      } else {
        console.log("\n💀 Unable to fetch token, error:", err);
      }
      var config = {
        method: "post",
        url: "https://api.nexmo.com/v1/calls",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        data: data,
      };

      axios(config)
        .then(function (response) {
          console.log("✅ ", JSON.stringify(response.data));
        })
        .catch(function (error) {
          console.log(error);
        });
    }
  );
})();
