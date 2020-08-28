const { importResources: processResources } = require("../aws-importer/importer");

processResources()
    .then(() => {
        console.log("import complete");
        process.exit(0);
    })
    .catch((err) => {
        console.error(`Error running process resources: ${err.message}`);
    });
