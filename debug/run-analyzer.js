const { analyzeTagInfo } = require("../tag-analyzer/tag-analyzer");

analyzeTagInfo()
    .then(() => {
        console.log("analyzer complete");
    })
    .catch((err) => {
        console.error("error running analyzer");
    });
