const { logger } = require("./logger");
const CONSTANTS = require("./constants");

const hasPopulationInstruction = (tagKey, config) => {
    if (!config[tagKey]) {
        let foundKey = false;
        // Find the correct config key name
        Object.keys(config)
            .filter((k) => k != CONSTANTS.PRIMARY_KEY_NAME)
            .some((configKey) => {
                return config[configKey][CONSTANTS.VALID_KEY_NAMES].some((vkv) => {
                    if (vkv === tagKey) {
                        tagKey = configKey;
                        foundKey - true;
                        return true;
                    }
                });
            });
        if (!foundKey) {
            return false;
        }
    }

    let configTagObj = config[tagKey];
    return configTagObj.alwaysPopulate || configTagObj.copyValue || configTagObj.lookupValue;
};

const tagValueFinder = (tagKey, validTags, objectType, objectIdentifier, config) => {
    // In order to derive the correct value for the tag, we need to have an instruction on the config
    // tag to tell us what to do. The current instructions are:
    // copyValue: copy the value of the tag from one of the tags in the list. The first match wins
    // lookupValue: lookup the value by using the value of the associated key as the key of this config object's value object
    // alwaysPopulate: always populate the tag with either the given value or an empty string

    let tagValue = "";

    if (!config[tagKey]) {
        // Find the correct config key name
        Object.keys(config).some((configKey) => {
            return config[configKey][CONSTANTS.VALID_KEY_NAMES].some((vkv) => {
                if (vkv === tagKey) {
                    tagKey = configKey;
                    return true;
                }
            });
        });
    }

    if (config[tagKey].alwaysPopulate) {
        tagValue = "";
    } else if (config[tagKey].copyValue) {
        let keyToCopyFrom = config[tagKey].copyValue;
        let vkvs = config[keyToCopyFrom][CONSTANTS.VALID_KEY_NAMES];

        // Only copy it from a valid, matched tag
        let foundCopyFromValue = false;
        Object.keys(validTags).some((t) => {
            return vkvs.some((v) => {
                if (v.toLowerCase() === t.toLowerCase()) {
                    //tagsToWrite[tagKey] = analysisRecord.matchedTags[t];
                    tagValue = validTags[t];
                    foundCopyFromValue = true;
                    return true;
                }
            });
        });

        if (!foundCopyFromValue) {
            logger.warn(
                `Invalid copyTo reference of '${keyToCopyFrom}' for key '${tagKey}' on ${objectType} resource ${objectIdentifier}`
            );
        }
    } else if (config[tagKey].lookupValue) {
        let lookupValue = config[tagKey].lookupValue;
        let foundRefValue;
        // Only allow a reference to a matched, valid tag
        config[lookupValue][CONSTANTS.VALID_KEY_NAMES].some((t) => {
            return Object.keys(validTags).some((vkv) => {
                if (t === vkv) {
                    //Found the matched reference value
                    foundRefValue = validTags[vkv].toLowerCase();
                    tagValue = config[tagKey].values[foundRefValue];
                    //tagsToWrite[tagKey] = config[tagKey].values[foundRefValue];
                    return true;
                }
            });
        });

        if (!foundRefValue) {
            logger.warn(
                `Could not find a valid 'lookupValue' reference of ${config[tagKey].lookupValue} for ${objectType} resource ${objectIdentifier}`
            );
        }
    } else {
        logger.info(`tag '${tagKey}' for ${objectType} resource ${objectIdentifier} has no population instruction`);
    }

    return tagValue;
};

module.exports = { tagValueFinder, hasPopulationInstruction };
