const { importResources } = require("../aws-importer/importer");

let pcfUsername = process.env.PCF_USERNAME;
let pcfPassword = process.env.PCF_PASSWORD;
let pcfApis = [
    "https://api.system.np1.fuseapps.io",
    "https://api.system.sb1.fuseapps.io",
    "https://api.system.fuseapps.io",
]; //process.env.PCF_APIS.split(",");
let pcfEnvs = pcfApis.map((a) => ({ username: pcfUsername, password: pcfPassword, url: a }));

importResources(pcfEnvs)
    .then(() => {
        console.log("import complete");
    })
    .catch((err) => {
        console.error(`Error running import process: ${err.message}`);
    })
    .finally(() => {
        process.nextTick(() => {
            process.exit(0);
        });
    });
