const { importResources } = require("../aws-importer/importer");

let pcfUsername = process.env.PCF_USERNAME;
let pcfPassword = process.env.PCF_PASSWORD;
let pcfApis = [
    "https://api.system.np1.fuseapps.io",
    "https://api.system.sb1.fuseapps.io",
    "https://api.system.fuseapps.io",
]; //process.env.PCF_APIS.split(",");
let pcfEnvs = pcfApis.map((a) => ({ username: pcfUsername, password: pcfPassword, url: a }));

if (!(pcfUsername || pcfPassword || pcfApis)) {
    console.error("need to specify the pcf env arguments");
    process.exit(-1);
}

importResources(pcfEnvs)
    .then(() => {
        console.log("import complete");
        process.exit(0);
    })
    .catch((err) => {
        console.error(`Error running process resources: ${err.message}`);
    });
