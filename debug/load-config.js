const { clearAndLoadConfig } = require("../config/load-config");

clearAndLoadConfig()
    .then(() => {
        console.log("config loader complete");
        setTimeout(()=> process.exit(0), 500)
    })
    .catch((err) => {
        console.error("error running config loader");
    });
