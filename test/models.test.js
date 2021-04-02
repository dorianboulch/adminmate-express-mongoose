// Hide console.log
global.console = {
  log: jest.fn(),
  // Keep native behaviour for other methods
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
};

const supertest = require('supertest');
const jwt = require('jwt-simple');

// Include the app
const app = require('./app.js');

// Endpoint prefix
const prefix = '/adminmate/api';

// Generate the admin token
const adminToken = jwt.encode({
  exp_date: Date.now() + 1000
}, 'authkey_secret');

// Before all
beforeAll(done => {
  done();
});

// Models
describe('Testing GET /api/models', () => {
  it('should return a 403 http response', async () => {
    // Make request
    const response = await supertest(app)
      .get(prefix + '/models');

    // Check response
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('not_authorized');
  });

  it('should return a 200 http response', async () => {
    // Make request
    const response = await supertest(app)
      .get(prefix + '/models')
      .set('x-access-token', adminToken);

    // Check response
    expect(response.status).toBe(200);
    expect(response.body).toMatchSnapshot();
  });
});

// Models properties
describe('Testing GET /api/models/properties', () => {
  it('should return a 403 http response', async () => {
    // Make request
    const response = await supertest(app)
      .get(prefix + '/models/properties');

    // Check response
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('not_authorized');
  });

  it('should return a 200 http response', async () => {
    // Make request
    const response = await supertest(app)
      .get(prefix + '/models/properties')
      .set('x-access-token', adminToken);

    // Check response
    expect(response.status).toBe(200);
    expect(response.body).toMatchSnapshot();
  });
});

// After all
afterAll(done => {
  done();
})