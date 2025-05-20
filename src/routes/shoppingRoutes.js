const express = require('express');
const ShoppingController = require('../controllers/shoppingController');

function createShoppingRouter(clientId, clientSecret) {
  const router = express.Router();
  const shoppingController = new ShoppingController(clientId, clientSecret);

  // Define routes
  router.get('/search', (req, res) => shoppingController.searchProducts(req, res));

  return router;
}

module.exports = createShoppingRouter;