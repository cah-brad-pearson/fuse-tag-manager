const SimpleNodeLogger = require("simple-node-logger");

const LOG_LEVELS = {
    DEBUG: "debug",
    INFO: "info",
};

let logger;
const timestampFormat = "YYYY-MM-DD[T]HH:mm:ss.SSS";

const init = () => {
    //Singleton logger creation
    if (!logger) {
        let manager = new SimpleNodeLogger();
        const opts = {
            logDirectory: "logs", // NOTE: folder must exist and be writable...
            fileNamePattern: "fuse-tag-manager-<DATE>.log",
            dateFormat: "YYYY.MM.DD",
            timestampFormat,
        };

        manager.createConsoleAppender({ timestampFormat });
        manager.createRollingFileAppender(opts);
        logger = manager.createLogger();
    }
    return logger;
};

module.exports = { init, logLevels: LOG_LEVELS };
