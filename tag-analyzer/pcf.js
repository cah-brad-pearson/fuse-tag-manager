const CONSTANTS = require("../util/constants.js");
const logger = require("../util/logger").init();

const matchRDSinstancesToPCFOrgs = (RDSTaggedObjects, pcfConfig) => {
    // iterate over the RDS instances and match each one to a PCF org if possible
    let matchedPairs = [];
    let orgs = pcfConfig.orgs;
    RDSTaggedObjects.forEach((rto) => {
        try {
            let orgSpace = "";
            rto.taggedObj.Tags.some((t) => {
                if (t.Key === CONSTANTS.PCF_ORG_SPACE_IDENTIFIER) {
                    orgSpace = t.Value;
                }
            });

            if (orgSpace.length > 0) {
                let pcfOrg = orgSpace.split(" ")[0];
                //let pcfSpace = orgSpace.split("")[1];
                if (orgs[pcfOrg]) {
                    matchedPairs.push({ [CONSTANTS.RDS_OBJECT_TYPE]: rto, [CONSTANTS.PCF_ORG]: orgs[pcfOrg] });
                } else {
                    logger.warn(`PCF org ID '${pcfOrg} not found`);
                }
            }
        } catch (error) {
            logger.error(`error analyzing RDS tagged object: ${error.message}`);
        }
    });

    return matchedPairs;
};

module.exports = {
    matchRDSinstancesToPCFOrgs,
};
