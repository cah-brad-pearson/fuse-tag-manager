const SimpleNodeLogger = require("simple-node-logger");

let logger;

const init = () => {
    //Singleton logger creation
    if (!logger) {
        let manager = new SimpleNodeLogger();
        const opts = {
            logDirectory: "output/logs", // NOTE: folder must exist and be writable...
            fileNamePattern: "fuse-tag-manager-<DATE>.log",
            dateFormat: "YYYY.MM.DD",
        };

        manager.createConsoleAppender();
        manager.createRollingFileAppender(opts);
        logger = manager.createLogger();
    }
    return logger;
};

module.exports.init = init;
