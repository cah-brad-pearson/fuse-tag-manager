const TAG_FILTER_ASSOCIATIONS = { product: ['fuse:product'] };

const tagFilter = (dataItems, tagFilterObj) => {
  const matchAssociations = (tagKey, keyToMatch) => {
    let match = false;
    // First just match the key
    if (tagKey.toLowerCase() === keyToMatch.toLowerCase()) {
      return true;
    }
    if (
      TAG_FILTER_ASSOCIATIONS[tagKey] &&
      Array.isArray(TAG_FILTER_ASSOCIATIONS[tagKey]) &&
      TAG_FILTER_ASSOCIATIONS[tagKey].length > 0
    ) {
      TAG_FILTER_ASSOCIATIONS[tagKey].some((tfa) => {
        if (tfa.toLowerCase === keyToMatch.toLowerCase) {
          match = true;
          return true;
        }
      });
    }
    return match;
  };

  const itemsToReturn = dataItems.filter((di) => {
    let matched = 0;
    Object.keys(tagFilterObj).forEach((tf) => {
      di.Tags.some((t) => {
        let tValue =
          typeof t.Value === 'string' ? t.Value.toLowerCase() : t.Value;
        if (
          matchAssociations(tf, t.Key) &&
          typeof t.Value === 'string' &&
          tValue === tagFilterObj[tf].toLowerCase()
        ) {
          matched++;
          // break out of the loop
          return true;
        }
      });
    });
    if (matched === Object.keys(tagFilterObj).length) {
      return true;
    }
  });

  return itemsToReturn;
};

const dataItems = [
  {
    Name: 'item 1',
    Tags: [
      { Key: 'product', Value: 'outcomes' },
      { Key: 'foo', Value: 'bar' },
    ],
  },
  {
    Name: 'item 2',
    Tags: [
      { Key: 'product', Value: 'outcomes' },
      { Key: 'foo', Value: 'bar' },
    ],
  },
  {
    Name: 'item 3',
    Tags: [
      { Key: 'fuse:product', Value: 'outcomes' },
      { Key: 'foo', Value: 'bar' },
    ],
  },
  {
    Name: 'item 4',
    Tags: [
      { Key: 'costcenter', Value: 12345 },
      { Key: 'foo', Value: 'bar' },
    ],
  },
  {
    Name: 'item 5',
    Tags: [
      { Key: 'costcenter', Value: 12345 },
      { Key: 'foo', Value: 'bar' },
    ],
  },
  {
    Name: 'item 6',
    Tags: [
      { Key: 'foo2', Value: 'bar1' },
      { Key: 'foo', Value: 'bar' },
    ],
  },
];
const filterObj = { product: 'Outcomes' };

const filteredItems = tagFilter(dataItems, filterObj);
console.log(
  `filtered items [${filteredItems.length}]\n ${JSON.stringify(
    filteredItems,
    null,
    2
  )}`
);
