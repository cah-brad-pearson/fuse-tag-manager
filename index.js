// Entry point for tag manager
const { clearAndLoadConfig } = require("./config/load-config");
const { importResources } = require("./aws-importer/importer");
const { analyzeTagInfo } = require("./tag-analyzer/tag-analyzer");
const { enforceTagsFromAnalysis } = require("./tag-enforcer/tag-enforcer");
const logger = require("./util/logger").init();

logger.info("Loading config...");
clearAndLoadConfig()
    .then(() => {
        logger.info("Config loading complete!");
        logger.info("Importing AWS resources...");
        return importResources();
    })
    .then(() => {
        logger.info("Importing AWS resources complete!");
        logger.info("Analyzing imported resources...");
        return analyzeTagInfo();
    })
    .then(() => {
        logger.info("Analysis complete!");
        logger.info("Enforcing resource tags...");
        return enforceTagsFromAnalysis();
    })
    .then(() => {
        logger.info("Successfully processed tags");
        process.exit(0);
    })
    .catch((err) => {
        logger.error(`error processing tags: ${err}`);
    });
