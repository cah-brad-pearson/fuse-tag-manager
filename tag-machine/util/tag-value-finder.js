const logger = require("./logger").init();
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

// Because tags can match on multiple key names
const keysMatch = (config, tagKey, tagKeyToMatch) => {
    // for the normalized key matching (when the tag key has been translated into the correct config key value)
    if (config[tagKey] && tagKey === tagKeyToMatch) {
        return true;
    } else {
        //find the tagKey in the config list and try to match the keyToMatch to one of the alternate names
        let configOb = config[tagKey];
        let keyFound = false;

        keyFound = configOb[CONSTANTS.VALID_KEY_NAMES].some((vk) => {
            if (vk.toLowerCase() === tagKeyToMatch.toLowerCase()) {
                keyFound = true;
                return true;
            }
        });

        return keyFound;
    }
};

const tagValueFinder = (tagKey, validTags, objectType, objectIdentifier, config) => {
    // TODO: add in functionality to lookup a value from a map as well as an array
    // In order to derive the correct value for the tag, we need to have an instruction on the config
    // tag to tell us what to do. The current instructions are:
    // copyValue: copy the value of the tag from one of the tags in the list. The first match wins
    // lookupValue: lookup the value by using the value of the associated key as the key of this config object's value object
    // alwaysPopulate: always populate the tag with either the given value or an empty string

    let tagValue;

    // Populate the value of the key with the name of the key since it doesn't matter. We just want to have some value
    if (config[tagKey].alwaysPopulate) {
        tagValue = tagKey;
    } else if (config[tagKey].copyValue) {
        let keyToCopyFrom = config[tagKey].copyValue;

        // Only copy it from a valid, matched tag
        let foundCopyFromValue = false;
        Object.keys(validTags).some((t) => {
            if (keysMatch(config, keyToCopyFrom, t)) {
                tagValue = validTags[t];
                foundCopyFromValue = true;
                return true;
            }
        });

        if (!foundCopyFromValue) {
            logger.warn(
                `Invalid copyTo reference of '${keyToCopyFrom}' for key '${tagKey}' on ${objectType} resource ${objectIdentifier}`
            );
        }
    } else if (config[tagKey].lookupValue) {
        // The lookup value needs to be in this objects own list of keys
        // i.e. if we want to lookup the product for the apmid, we need to know what the product
        // is we're looking up. That needs to be in this resources tag keys.

        let lookupValue = config[tagKey].lookupValue;
        let foundRefValue;

        Object.keys(validTags).some((vt) => {
            if (keysMatch(config, lookupValue, vt)) {
                //Prevent empty strings from being written
                if (validTags[vt]) {
                    let lookupValue = validTags[vt];
                    if (config[tagKey].values[lookupValue]) {
                        //Found the matched reference value
                        tagValue = config[tagKey].values[lookupValue];
                        return true;
                    }
                }
            }
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
