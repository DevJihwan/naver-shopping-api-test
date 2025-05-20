const axios = require('axios');

class NaverShoppingApi {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = 'https://openapi.naver.com/v1/search/shop.json';
  }

  /**
   * Search for products using the Naver Shopping API
   * @param {Object} params - Search parameters
   * @param {string} params.query - Search query term (required)
   * @param {number} [params.display=10] - Number of results to display (default: 10, max: 100)
   * @param {number} [params.start=1] - Starting position (default: 1, max: 1000)
   * @param {string} [params.sort='sim'] - Sort method (sim: similarity, date: date, asc: ascending price, dsc: descending price)
   * @returns {Promise<Object>} - API response
   */
  async search(params) {
    try {
      if (!params.query) {
        throw new Error('Query parameter is required');
      }

      const response = await axios.get(this.baseUrl, {
        params,
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret
        }
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response:', {
          status: error.response.status,
          data: error.response.data
        });
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // The request was made but no response was received
        console.error('Error request:', error.request);
        throw new Error('No response received from API');
      } else {
        // Something happened in setting up the request
        console.error('Error:', error.message);
        throw error;
      }
    }
  }
}

module.exports = NaverShoppingApi;