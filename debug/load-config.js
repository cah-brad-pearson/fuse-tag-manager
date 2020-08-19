const { clearAndLoadConfig } = require("../config/load-config");

clearAndLoadConfig()
    .then(() => {
        console.log("config loader complete");
        process.exit(0);
    })
    .catch((err) => {
        console.error("error running config loader");
    });
