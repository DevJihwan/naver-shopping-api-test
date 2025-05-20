const NaverShoppingApi = require('../services/naverShoppingApi');

class ShoppingController {
  constructor(clientId, clientSecret) {
    this.shoppingApi = new NaverShoppingApi(clientId, clientSecret);
  }

  /**
   * Handle shopping search request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async searchProducts(req, res) {
    try {
      const { query, display, start, sort } = req.query;

      if (!query) {
        return res.status(400).json({ 
          error: 'Query parameter is required' 
        });
      }

      // Build request parameters
      const params = { query };
      
      // Add optional parameters if provided
      if (display) params.display = display;
      if (start) params.start = start;
      if (sort) params.sort = sort;

      const result = await this.shoppingApi.search(params);
      res.json(result);
    } catch (error) {
      console.error('Error in searchProducts:', error);
      res.status(500).json({ 
        error: 'Failed to fetch shopping data', 
        message: error.message 
      });
    }
  }
}

module.exports = ShoppingController;