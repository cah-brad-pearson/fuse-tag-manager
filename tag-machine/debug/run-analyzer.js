const { analyzeTagInfo } = require("../tag-analyzer/tag-analyzer");

analyzeTagInfo()
    .then(() => {
        console.log("analyzer complete");
        process.exit(0);
    })
    .catch((err) => {
        console.error("error running analyzer");
    });
