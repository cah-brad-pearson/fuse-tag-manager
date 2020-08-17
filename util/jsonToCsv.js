const fs = require("fs");

const jsonOutputFile = require("../output/objectsWithoutValidProductTags.json");

let csvOutput = jsonOutputFile.map((line) => {
    let tagArr = line.tags.map((kv) => `${kv.Key}:${kv.Value}`);
    return `${line.objectType},${line.objectId}, ${tagArr.join(",")}`;
});

fs.writeFileSync("output/objectsWithoutValidProductTags.csv", csvOutput.join("\n"));
// .writeFileSync(
//     "output/objectsWithoutValidProductTags.json",
//     JSON.stringify(mappedInvalidProductsObjects, null, 2)
// );
