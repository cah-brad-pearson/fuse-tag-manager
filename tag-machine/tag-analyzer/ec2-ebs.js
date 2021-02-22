const CONSTANTS = require("../util/constants.js");
const logger = require("../util/logger").init();

const matchEBSandEC2Instances = (ebsAnalysisObjects, ec2TaggedObjects) => {
    // Filter out the ebs volumes with missing product tags
    let ebsVolumesWithoutProduct = ebsAnalysisObjects.filter((ebo) => {
        let productMatched = Object.keys(ebo.matchedTags).some(
            (key) => key.toLowerCase() === CONSTANTS.PRODUCT_TAG_CATEGORY
        );
        return !productMatched;
    });

    //returns an array of matched objects in the form {EC2:ec2Instance,EBS:ebsVolume}
    let matchedPairs = [];
    ebsVolumesWithoutProduct.forEach((evp) => {
        // get ec2 instanceId from attachment info
        let instanceIdToMatch = evp.taggedObj.Attachments.length > 0 && evp.taggedObj.Attachments[0].InstanceId;
        if (instanceIdToMatch) {
            let ec2MatchedObj = ec2TaggedObjects.filter((eto) => eto.taggedObj.InstanceId === instanceIdToMatch);
            if (ec2MatchedObj.length > 0) {
                const newPair = {
                    [CONSTANTS.EBS_OBJECT_TYPE]: evp,
                    [CONSTANTS.EC2_OBJECT_TYPE]: ec2MatchedObj[0],
                };
                matchedPairs.push(newPair);
            } else {
                // Couldn't find a match for the instance id
                logger.info(
                    `Trying to match EBS volume ${evp.taggedObj.VolumeId} to an EC2 instance, but couldn't find ${instanceIdToMatch}`
                );
            }
        } else {
            // couldn't find an instance id attached to the ebs volume
            logger.info(`EBS volume ${evp.taggedObj.VolumeId} isn't attached to any EC2 instance`);
        }
    });

    return matchedPairs;
};

module.exports = {
    matchEBSandEC2Instances,
};
