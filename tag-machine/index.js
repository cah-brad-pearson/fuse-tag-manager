// Entry point for tag manager
const { clearAndLoadConfig } = require("./config/load-config");
const { importResources } = require("./aws-importer/importer");
const { analyzeTagInfo } = require("./tag-analyzer/tag-analyzer");
const { enforceTagsFromAnalysis } = require("./tag-enforcer/tag-enforcer");
const logger = require("./util/logger").init();
const logLevels = require("./util/logger").logLevels;

logger.info("Loading config...");

const args = process.argv;
if (args.length > 2 && args[2].toLowerCase() === logLevels.DEBUG) {
    logger.info(`logging set to ${logLevels.DEBUG}`);
    logger.setLevel(logLevels.DEBUG);
} else {
    logger.info(`logging set to ${logLevels.INFO}`);
    logger.setLevel(logLevels.INFO);
}

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
