exports.handler = function (event, context, cb) {
  console.log(`event: ${JSON.stringify(event)}`);
  console.log(`context: ${JSON.stringify(context)}`);
  require("./importer.js").processInstances(cb);
};
