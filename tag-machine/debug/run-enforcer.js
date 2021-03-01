const { enforceTagsFromAnalysis } = require("../tag-enforcer/tag-enforcer");
const logger = require("../util/logger").init();

logger.setLevel("debug");
enforceTagsFromAnalysis()
    .then(() => {
        logger.info("enforcer complete");
        process.exit(0);
    })
    .catch((err) => {
        logger.error("error running enforcer");
    });
