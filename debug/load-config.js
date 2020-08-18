const configLoader = require("config/load-config");

configLoader()
    .then(() => {
        console.log("config loader complete");
    })
    .catch((err) => {
        console.error("error running config loader");
    });
