const { clearAndLoadConfig } = require("../config/load-config");

clearAndLoadConfig()
    .then(() => {
        console.log("config loader complete");
    })
    .catch((err) => {
        console.error("error running config loader");
    })
    .finally(() => {
        setTimeout(() => process.exit(0), 500);
    });
