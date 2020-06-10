const router = require('express').Router();
const cookieParser = require('cookie-parser');
const modelController = require('./src/controllers/model');
const authController = require('./src/controllers/auth');
const installController = require('./src/controllers/install');
const { isAuthorized } = require('./src/middlewares/auth');

class AdminMate {
  constructor({ projectId, secretKey, authKey, masterPassword, models, devMode }) {
    global._amConfig = {};
    global._amConfig.projectId = projectId;
    global._amConfig.secretKey = secretKey;
    global._amConfig.authKey = authKey;
    global._amConfig.masterPassword = masterPassword;
    global._amConfig.models = models;
    global._amConfig.devMode = devMode || false;
  }

  accessControl(req, res, next) {
    const origin = global._amConfig.devMode ? 'http://localhost:3002' : 'https://my.adminmate.app';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-Access-Token');
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', true);
    next();
  }

  createRoutes() {
    router.use(cookieParser());

    // Installation checks
    router.post('/adminmate/api/check_connection', installController.checkConnection);
    router.post('/adminmate/api/check_models', installController.checkModels);

    // Login
    router.post('/adminmate/api/login', authController.login);

    // Get models list
    router.get('/adminmate/api/model', isAuthorized, modelController.getModels);

    // Get model config
    // router.get('/adminmate/api/model/:model/config', isAuthorized,  modelController.getModelConfig);

    // CRUD endpoints
    router.post('/adminmate/api/model/:model', isAuthorized, modelController.get);
    router.get('/adminmate/api/model/:model/:id', isAuthorized, modelController.getOne);
    router.put('/adminmate/api/model/:model/:id', isAuthorized, modelController.putOne);

    // Custom query
    router.post('/adminmate/api/query', isAuthorized, modelController.customQuery);

    return router;
  }
}

module.exports = AdminMate;