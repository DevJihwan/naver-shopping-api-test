# Naver Shopping API Test

Node.js implementation for testing the Naver Shopping API.

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- Naver Developer API credentials (Client ID and Client Secret)

## Setup

1. Clone this repository:
   ```
   git clone https://github.com/DevJihwan/naver-shopping-api-test.git
   cd naver-shopping-api-test
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the `.env.example` template:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file and add your Naver API credentials:
   ```
   NAVER_CLIENT_ID=your_client_id_here
   NAVER_CLIENT_SECRET=your_client_secret_here
   ```

## Usage

Start the application:
```
npm start
```

This will start a server at http://localhost:3000 with the following endpoints:

- GET `/api/shopping/search?query={search_term}`: Search for products
- GET `/api/shopping/search?query={search_term}&display={display}&start={start}&sort={sort}`: Search with additional parameters

## API Parameters

The Naver Shopping API supports the following parameters:

- `query`: The search term (required)
- `display`: Number of results to display (default: 10, max: 100)
- `start`: Starting position (default: 1, max: 1000)
- `sort`: Sort method
  - `sim`: Sort by similarity (default)
  - `date`: Sort by date
  - `asc`: Sort by ascending price
  - `dsc`: Sort by descending price

## Example

Search for "shoes":
```
GET http://localhost:3000/api/shopping/search?query=shoes
```

Search for "shoes" with additional parameters:
```
GET http://localhost:3000/api/shopping/search?query=shoes&display=20&start=1&sort=date
```

## License

MIT