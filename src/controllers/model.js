const mongoose = require('mongoose');
const mongooseLegacyPluralize = require('mongoose-legacy-pluralize');
const fnHelper = require('../helpers/functions');

module.exports.getModels = (req, res) => {
  let models = [];
  global._amConfig.models.forEach(model => {
    const currentModel = typeof model === 'function' ? model : model.model;
    const modelObject = {
      name: currentModel.collection.name,
      properties: fnHelper.getModelProperties(currentModel),
      // subSections: []
    };
    // // Add subsections if present
    // if (typeof model !== 'function' && model.subSections && model.subSections.length) {
    //   modelObject.subSections = model.subSections.map(section => {
    //     return {
    //       label: section.label,
    //       code: section.code
    //     };
    //   });
    // }
    // Add smart actions if present
    if (typeof model !== 'function' && model.smartActions) {
      modelObject.smartActions = model.smartActions;
    }
    models.push(modelObject);
  });
  res.json({ models });
};

module.exports.getModelConfig = (req, res) => {
  const currentModel = global._amConfig.models.find(m => m.collection.name === req.params.model);
  if (!currentModel) {
    return res.status(403).json({ message: 'Invalid request' });
  }

  const keys = fnHelper.getModelProperties(currentModel);

  res.json({
    keys,
    name: currentModel.collection.name
  });
};

module.exports.get = async (req, res) => {
  const modelName = req.params.model;
  const segment = req.body.segment;
  const search = (req.body.search || '').trim();
  const filters = req.body.filters;
  const refFields = req.body.refFields;
  const page = parseInt(req.body.page || 1);
  const nbItemPerPage = 10;

  let currentModel = global._amConfig.models.find(m => (typeof m === 'function' ? m.collection.name : m.model.collection.name) === modelName);
  if (!currentModel) {
    return res.status(403).json({ message: 'Invalid request' });
  }
  currentModel = typeof currentModel === 'function' ? currentModel : currentModel.model;

  const keys = fnHelper.getModelProperties(currentModel);
  const defaultFieldsToFetch = keys.filter(key => !key.path.includes('.')).map(key => key.path);
  const fieldsToFetch = /*['_id', 'email', 'firstname', 'lastname', 'client_id'] ||*/ defaultFieldsToFetch;

  const defaultFieldsToSearchIn = keys.filter(key => ['String'].includes(key.type)).map(key => key.path);
  const fieldsToSearchIn = /*['email', 'firstname', 'lastname'] ||*/ defaultFieldsToSearchIn;
  const sortingFields = { _id: 'desc' };

  // Build ref fields for the model (for mongoose population purpose)
  const refFieldsForModel = {};
  keys.forEach(prop => {
    if (prop.type === 'ObjectID' && (prop.ref || prop.refPath)) {
      if (prop.ref) {
        const currentRefModelName = prop.ref.toLowerCase();
        const currentRefModelNamePlural = mongooseLegacyPluralize(currentRefModelName);
        if (refFields[currentRefModelName] || refFields[currentRefModelNamePlural]) {
          refFieldsForModel[prop.path] = refFields[currentRefModelName] || refFields[currentRefModelNamePlural];
        }
      }
      else if (prop.refPath) {
        const refPathField = keys.find(k => k.path === prop.refPath);
        if (refPathField && refPathField.enum) {
          const currentRefModelName = refPathField.enum[0].toLowerCase();
          const currentRefModelNamePlural = mongooseLegacyPluralize(currentRefModelName);
          if (refFields[currentRefModelName] || refFields[currentRefModelNamePlural]) {
            refFieldsForModel[prop.path] = refFields[currentRefModelName] || refFields[currentRefModelNamePlural];
          }
        }
      }
    }
  });

  // Create query populate config
  let fieldsToPopulate = [];
  fieldsToFetch.forEach(field => {
    const matchingField = keys.find(k => k.path === field);
    if (matchingField && matchingField.type === 'ObjectID' && (matchingField.ref || matchingField.refPath)) {
      fieldsToPopulate.push({
        path: field,
        select: refFieldsForModel[field] ? refFieldsForModel[field] : '_id'
      });
    }
  });

  let params = {};

  // If there is a text search query
  if (search) {
    params = { $or: [] };

    fieldsToSearchIn.map(field => {
      params.$or.push({ [field]: { '$regex': `${search}`, '$options': 'i' } });
    });

    // If the search is a valid mongodb _id
    // An object id's only defining feature is that its 12 bytes long
    if (mongoose.Types.ObjectId.isValid(search)) {
      params.$or.push({ _id: search });
      fieldsToPopulate.map(field => {
        params.$or.push({ [field.path]: search });
      });
    }

    // If the search terms contains multiple words and there is multiple fields to search in
    if (/\s/.test(search) && fieldsToSearchIn.length > 1) {
      // Create all search combinaisons for $regexMatch
      const searchPieces = search.split(' ');
      const searchCombinaisons = fnHelper
        .permutations(searchPieces)
        .map(comb => fnHelper.cleanString(comb.join('')))
        .join('|');
      const concatFields = fieldsToSearchIn.map(field => `$${field}`);

      params.$or.push({
        $expr: {
          $regexMatch: {
            input: {
              $concat: concatFields
            },
            regex: new RegExp(searchCombinaisons),
            options: 'i'
          }
        }
      });
    }
  }
  if (filters && filters.length) {
    const filter = filters[0];
    params[filter.attr] = filter.value;
  }

  // Segment
  if (segment) {
    console.log('===segment', segment);
    const segmentQuery = fnHelper.constructQuery(segment.data);
    console.log('===segmentQuery', JSON.stringify(segmentQuery), segmentQuery['$and']);
    if (segmentQuery) {
      params = {$and: [params, segmentQuery] };
    }
  }

  console.log('=========fieldsToPopulate', fieldsToPopulate);

  let data = await currentModel
    .find(params)
    .select(fieldsToFetch)
    .populate(fieldsToPopulate)
    .sort(sortingFields)
    .skip(nbItemPerPage * (page - 1))
    .limit(nbItemPerPage)
    .lean()
    .catch(e => {
      res.status(403).json({ message: e.message });
    });

  if (!data) {
    return res.status(403).json();
  }

  const dataCount = await currentModel.countDocuments(params);
  const nbPage = Math.ceil(dataCount / nbItemPerPage);

  // Make ref fields appeared as link in the dashboard
  data = data.map(item => {
    return fnHelper.refFields(item, fieldsToPopulate);
  });

  res.json({
    data,
    count: dataCount,
    pagination: {
      current: page,
      count: nbPage
    }
  });
};

module.exports.getOne = async (req, res) => {
  const modelName = req.params.model;
  const modelItemId = req.params.id;

  let currentModel = global._amConfig.models.find(m => (typeof m === 'function' ? m.collection.name : m.model.collection.name) === modelName);
  if (!currentModel) {
    return res.status(403).json({ message: 'Invalid request' });
  }
  currentModel = typeof currentModel === 'function' ? currentModel : currentModel.model;

  const keys = fnHelper.getModelProperties(currentModel);
  const defaultFieldsToFetch = keys.map(key => key.path);
  const fieldsToFetch = /*['_id', 'email', 'firstname', 'lastname', 'client_id'] ||*/ defaultFieldsToFetch;

  let data = await currentModel
    .findById(modelItemId)
    .select(fieldsToFetch)
    .lean();

  res.json({
    data
  });
};

module.exports.putOne = async (req, res) => {
  const modelName = req.params.model;
  const modelItemId = req.params.id;
  const data = req.body.data;

  let currentModel = global._amConfig.models.find(m => (typeof m === 'function' ? m.collection.name : m.model.collection.name) === modelName);
  if (!currentModel) {
    return res.status(403).json({ message: 'Invalid request' });
  }
  currentModel = typeof currentModel === 'function' ? currentModel : currentModel.model;

  // const { model, itemEditableKeys } = models[modelName];

  // // Only keep authorized keys
  // const cleanData = {};
  // for (key in data) {
  //   if (itemEditableKeys.includes(key)) {
  //     cleanData[key] = data[key]
  //   }
  // }

  const cleanData = data;

  if (Object.keys(cleanData).length) {
    const updatedModel = await currentModel.findByIdAndUpdate(modelItemId, cleanData).catch(e => {
      return res.status(403).json({ message: 'Unable to update the model' });
    });

    if (updatedModel) {
      return res.json({ data: cleanData });
    }
  }

  res.json({});
};

module.exports.customQuery = async (req, res) => {
  const data = req.body.data;
  const modelName = data.model;

  let currentModel = global._amConfig.models.find(m => (typeof m === 'function' ? m.collection.name : m.model.collection.name) === modelName);
  if (!currentModel) {
    return res.status(403).json({ message: 'Invalid request' });
  }
  currentModel = typeof currentModel === 'function' ? currentModel : currentModel.model;

  if (data.type === 'pie') {
    let sum = 1;
    if (data.field && data.operation === 'sum') {
      sum = `$${data.field}`;
    }

    const repartitionData = await currentModel
      .aggregate([
        {
          $group: {
            _id: `$${data.group_by}`,
            count: { $sum: sum },
          }
        },
        {
          $project: {
            key: '$_id',
            value: '$count',
            _id: false
          }
        }
      ])
      .sort({ key: 1 });

    res.json({ data: repartitionData });
  }
  else if (data.type === 'single_value') {
    if (data.operation === 'sum') {
      const sumData = await currentModel
        .aggregate([{
          $group: {
            _id: `$${data.group_by}`,
            count: { $sum: `$${data.field}` },
          }
        }]);

      if (!sumData || !sumData[0] || typeof sumData[0].count !== 'number') {
        return res.status(403).json();
      }

      res.json({ data: sumData[0].count });
    }
    else {
      const dataCount = await currentModel.countDocuments({});
      res.json({ data: dataCount });
    }
  }
  else {
    res.json({ data: null });
  }
};