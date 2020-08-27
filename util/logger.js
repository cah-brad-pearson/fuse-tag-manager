const SimpleNodeLogger = require("simple-node-logger");
const manager = new SimpleNodeLogger();
const opts = {
    logDirectory: "output/logs", // NOTE: folder must exist and be writable...
    fileNamePattern: "fuse-tag-manager-<DATE>.log",
    dateFormat: "YYYY.MM.DD",
};
manager.createConsoleAppender();
manager.createRollingFileAppender(opts);
const logger = manager.createLogger();
module.exports.logger = logger;
