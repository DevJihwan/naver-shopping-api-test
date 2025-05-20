require('dotenv').config();
const axios = require('axios');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// Check if required API credentials are provided
if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.error('Error: Naver API credentials are not provided. Please check your .env file.');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
let query, display, start, sort;

// Extract parameters from command line arguments
args.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key === '--query' || key === '-q') query = value;
  if (key === '--display' || key === '-d') display = value;
  if (key === '--start' || key === '-s') start = value;
  if (key === '--sort') sort = value;
});

// Check if query parameter is provided
if (!query) {
  console.error('Error: Query parameter is required.');
  console.log('Usage: node test-api.js --query="검색어" [--display=10] [--start=1] [--sort=sim]');
  process.exit(1);
}

// Build request URL
const url = 'https://openapi.naver.com/v1/search/shop.json';
const params = { query };

if (display) params.display = display;
if (start) params.start = start;
if (sort) params.sort = sort;

console.log('Sending request to Naver Shopping API...');
console.log('Query parameters:', params);

// Send request to Naver Shopping API
axios.get(url, {
  params,
  headers: {
    'X-Naver-Client-Id': NAVER_CLIENT_ID,
    'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
  }
})
  .then(response => {
    const data = response.data;
    
    // Display the overall results
    console.log('\n===== Naver Shopping API Response =====');
    console.log(`Total results: ${data.total}`);
    console.log(`Display: ${data.display}`);
    console.log(`Start: ${data.start}`);
    console.log(`Last build date: ${data.lastBuildDate}`);
    
    // Display each product
    console.log('\n===== Products =====');
    if (data.items && data.items.length > 0) {
      data.items.forEach((item, index) => {
        console.log(`\n[Product ${index + 1}]`);
        console.log(`Title: ${item.title.replace(/<\/?b>/g, '')}`);
        console.log(`Link: ${item.link}`);
        console.log(`Image: ${item.image}`);
        console.log(`Lowest price: ${item.lprice}원`);
        console.log(`Highest price: ${item.hprice || 'N/A'}원`);
        console.log(`Mall name: ${item.mallName}`);
        console.log(`Product ID: ${item.productId}`);
        console.log(`Product type: ${item.productType}`);
        console.log(`Brand: ${item.brand || 'N/A'}`);
        console.log(`Maker: ${item.maker || 'N/A'}`);
        console.log(`Category1: ${item.category1 || 'N/A'}`);
        console.log(`Category2: ${item.category2 || 'N/A'}`);
        console.log(`Category3: ${item.category3 || 'N/A'}`);
        console.log(`Category4: ${item.category4 || 'N/A'}`);
      });
    } else {
      console.log('No products found.');
    }
  })
  .catch(error => {
    console.error('\n===== Error =====');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error('Headers:', error.response.headers);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('Error:', error.message);
    }
    console.error('Config:', error.config);
  });